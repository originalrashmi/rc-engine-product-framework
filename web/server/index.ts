/**
 * RC Engine Web UI -- Express server.
 *
 * Architecture:
 *   - Creates an in-process MCP server with all 35 tools registered
 *   - Connects an MCP client via InMemoryTransport
 *   - Exposes tools as REST endpoints: POST /api/tools/:name
 *   - Structured pipeline state via GET /api/project/state
 *   - Artifact listing + download via GET /api/project/artifacts
 *   - WebSocket at /ws for real-time pipeline events
 *   - Serves the Vite-built React frontend from web/dist-client/
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { generatePrintableHtml } from './pdf-export.js';
import { generatePlaybook } from '../../dist/domains/rc/generators/playbook-generator.js';
import { generateDiagrams } from '../../dist/domains/rc/generators/diagram-generator.js';
import { createMcpBridge } from './mcp-bridge.js';
import {
  parsePreRcStatus,
  parseRcStatus,
  parsePostRcStatus,
  parseTraceStatus,
  parseTokenSummary,
  type PipelineState,
  type ArtifactInfo,
} from './state-parser.js';
import {
  authMiddleware,
  requireAuth,
  getUserFromSession,
  requestMagicLink,
  verifyMagicLink,
  destroySession,
  isAuthBypassed,
  cleanupExpired,
  createOrganization,
  getOrganization,
  getOrgMembers,
  inviteToOrg,
} from './auth.js';
import { getTier, hasFeature, type TierId } from '../../dist/core/pricing/tiers.js';
import { registerBillingRoutes } from './billing.js';
import { sendMagicLinkEmail, getEmailProvider } from './email.js';

// Simple cookie parser for WebSocket auth
function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const pair of cookieHeader.split(';')) {
    const [key, ...vals] = pair.trim().split('=');
    if (key) cookies[key.trim()] = vals.join('=').trim();
  }
  return cookies;
}

// ── Tier Enforcement ─────────────────────────────────────────────────────────
// Maps tool names to required tier features. Tools not listed are available on all tiers.
const TOOL_FEATURE_REQUIREMENTS: Record<string, keyof ReturnType<typeof getTier>['features']> = {
  // Build tools require fullPipeline (not available on free tier)
  rc_start: 'fullPipeline',
  rc_import_prerc: 'fullPipeline',
  rc_illuminate: 'fullPipeline',
  rc_define: 'fullPipeline',
  rc_architect: 'fullPipeline',
  rc_sequence: 'fullPipeline',
  rc_validate: 'fullPipeline',
  rc_forge_task: 'fullPipeline',
  rc_gate: 'fullPipeline',
  // Design tools
  ux_design: 'designOptions',
  // Security scanning
  postrc_scan: 'securityScan',
  postrc_report: 'securityScan',
  postrc_override: 'securityScan',
  postrc_gate: 'securityScan',
  postrc_configure: 'securityScan',
  // Stress test (Pro/Enterprise only)
  prc_stress_test: 'playbook',
  // Traceability
  trace_enhance_prd: 'traceability',
  trace_map_findings: 'traceability',
  trace_status: 'traceability',
};

function checkTierAccess(toolName: string, userTier: string): string | null {
  const requiredFeature = TOOL_FEATURE_REQUIREMENTS[toolName];
  if (!requiredFeature) return null; // Tool available on all tiers
  const tierId = userTier as TierId;
  try {
    if (hasFeature(tierId, requiredFeature)) return null;
    const tierDef = getTier(tierId);
    return `Your ${tierDef.name} plan does not include this feature. Upgrade to access ${requiredFeature.replace(/([A-Z])/g, ' $1').toLowerCase()}.`;
  } catch {
    return null; // Unknown tier -- allow (fail-open for dev)
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.RC_WEB_PORT || '3100', 10);

/**
 * Validate that a project path is safe (exists and is a directory).
 * Prevents path traversal attacks on project-scoped endpoints.
 */
function validateProjectPath(projectPath: string): string | null {
  if (!projectPath || typeof projectPath !== 'string') {
    return 'Missing project path';
  }
  const resolved = path.resolve(projectPath);
  // Block obvious traversal patterns
  if (projectPath.includes('..')) {
    return 'Path traversal blocked';
  }
  // Must be an actual directory
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return 'Not a directory';
  } catch {
    return 'Project path not found';
  }
  return null; // valid
}

function extractText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('\n');
}

async function main() {
  const app = express();
  const httpServer = createServer(app);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
        },
      },
    }),
  );

  // CORS -- restrict to same-origin + configurable allowed origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [`http://localhost:${PORT}`];
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('CORS origin not allowed'));
        }
      },
      credentials: true,
    }),
  );

  // Rate limiting on auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per window
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(authMiddleware);

  // --- Auth Routes ---
  app.post('/auth/login', authLimiter, async (req, res) => {
    const { email } = req.body as { email?: string };
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email required' });
      return;
    }
    const token = requestMagicLink(email);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    if (isAuthBypassed()) {
      res.json({ ok: true, token, message: 'Dev mode: token returned directly' });
    } else {
      // Send via configured email provider (console fallback)
      const result = await sendMagicLinkEmail(email, token, baseUrl);
      const provider = getEmailProvider();
      if (result.success) {
        res.json({
          ok: true,
          message:
            provider === 'console'
              ? 'Magic link logged to server console (no email provider configured)'
              : 'Magic link sent to your email',
        });
      } else {
        res.status(500).json({ error: `Failed to send magic link: ${result.error}` });
      }
    }
  });

  app.get('/auth/verify', (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }
    const result = verifyMagicLink(token);
    if (!result) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    // Set session cookie
    res.cookie('rc_session', result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    res.json({ ok: true, user: { email: result.user.email, tier: result.user.tier } });
  });

  app.post('/auth/logout', (req, res) => {
    const sessionId = req.headers.cookie
      ?.split(';')
      .find((c) => c.trim().startsWith('rc_session='))
      ?.split('=')[1];
    if (sessionId) destroySession(sessionId);
    res.clearCookie('rc_session');
    res.json({ ok: true });
  });

  app.get('/auth/me', (req, res) => {
    if (req.user) {
      res.json({
        user: {
          email: req.user.email,
          tier: req.user.tier,
          name: req.user.name,
          orgId: req.user.orgId,
          role: req.user.role,
        },
      });
    } else {
      res.json({ user: null });
    }
  });

  // --- Team / Organization Routes ---
  app.post('/api/org/create', (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: 'Login required' });
      return;
    }
    const { name } = req.body as { name?: string };
    if (!name) {
      res.status(400).json({ error: 'Organization name required' });
      return;
    }
    try {
      const org = createOrganization(req.user.id, name, req.user.tier);
      res.json({ ok: true, org });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/org/members', (req, res) => {
    if (!req.user?.orgId) {
      res.json({ members: [] });
      return;
    }
    try {
      const members = getOrgMembers(req.user.orgId);
      const org = getOrganization(req.user.orgId);
      res.json({
        org: org ? { id: org.id, name: org.name, tier: org.tier, maxSeats: org.maxSeats } : null,
        members: members.map((m) => ({ email: m.email, name: m.name, role: m.role })),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/org/invite', (req, res) => {
    if (!req.user?.orgId) {
      res.status(400).json({ error: 'You are not in an organization' });
      return;
    }
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Only owners and admins can invite members' });
      return;
    }
    const { email } = req.body as { email?: string };
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email required' });
      return;
    }
    try {
      const inviteId = inviteToOrg(req.user.orgId, req.user.id, email);
      res.json({ ok: true, inviteId });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Pricing Info ---
  app.get('/api/pricing', (_req, res) => {
    // Import pricing tiers dynamically
    import('../../src/core/pricing/tiers.js')
      .then(({ TIERS, getTierOrder }) => {
        const order = getTierOrder();
        res.json({ tiers: order.map((id) => TIERS[id]) });
      })
      .catch(() => {
        res.status(500).json({ error: 'Pricing unavailable' });
      });
  });

  // --- Billing Routes (Stripe) ---
  registerBillingRoutes(app);

  // --- MCP Bridge (in-process tool execution) ---
  const bridge = await createMcpBridge();

  // --- WebSocket for real-time events ---
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws, req) => {
    // Authenticate WebSocket connections via session cookie
    if (!isAuthBypassed()) {
      const cookies = parseCookies(req.headers.cookie);
      const sessionId = cookies.rc_session;
      if (!sessionId || !getUserFromSession(sessionId)) {
        ws.close(1008, 'Authentication required');
        return;
      }
    }
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.send(JSON.stringify({ type: 'connected', tools: bridge.toolNames }));
  });

  function broadcast(event: Record<string, unknown>) {
    const msg = JSON.stringify(event);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  // --- REST API ---

  // Health check + configuration info
  app.get('/api/health', (_req, res) => {
    const envKeys = {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      perplexity: !!process.env.PERPLEXITY_API_KEY,
    };
    const knowledgePath = path.resolve(__dirname, '..', '..', 'knowledge');
    let knowledgeFileCount = 0;
    try {
      const countFiles = (dir: string): number => {
        let count = 0;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
          else if (entry.name.endsWith('.md') && entry.name !== 'README.md') count++;
        }
        return count;
      };
      knowledgeFileCount = countFiles(knowledgePath);
    } catch {
      /* ignore */
    }

    res.json({
      status: 'ok',
      tools: bridge.toolNames.length,
      apiKeys: envKeys,
      knowledge: {
        files: knowledgeFileCount,
        mode: knowledgeFileCount >= 15 ? 'pro' : 'community',
      },
      uptime: process.uptime(),
    });
  });

  // List available tools
  app.get('/api/tools', async (_req, res) => {
    try {
      const tools = await bridge.listTools();
      res.json({ tools });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Execute a tool by name
  app.post('/api/tools/:name', requireAuth, async (req, res) => {
    const name = req.params.name as string;
    const args = req.body || {};

    // Tier enforcement (skip in dev bypass mode)
    if (!isAuthBypassed()) {
      const userTier = req.user?.tier || 'free';
      const tierError = checkTierAccess(name, userTier);
      if (tierError) {
        res.status(403).json({ error: tierError });
        return;
      }
    }

    broadcast({ type: 'tool:start', tool: name, args, timestamp: Date.now() });

    try {
      const result = await bridge.callTool(name, args);
      broadcast({ type: 'tool:complete', tool: name, timestamp: Date.now() });
      res.json({ result });
    } catch (err) {
      const errorMsg = (err as Error).message;
      broadcast({ type: 'tool:error', tool: name, error: errorMsg, timestamp: Date.now() });
      res.status(500).json({ error: errorMsg });
    }
  });

  // List projects (scan for known project state directories)
  // Projects are scoped per user: each user gets their own directory under RC_PROJECTS_DIR
  app.get('/api/projects', requireAuth, (req, res) => {
    const baseDir = process.env.RC_PROJECTS_DIR || path.join(process.env.HOME || '/tmp', 'rc-projects');
    const userId = req.user?.id || 'anonymous';
    const userDir = path.join(baseDir, userId);

    // Ensure user directory exists
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    // Allow scanning a subdirectory, but restrict to user's scope
    const scanDir = (req.query.dir as string) || userDir;
    const resolvedScan = path.resolve(scanDir);
    const resolvedUser = path.resolve(userDir);
    if (!resolvedScan.startsWith(resolvedUser)) {
      res.status(403).json({ error: 'Directory access restricted to your projects' });
      return;
    }
    try {
      const projects = discoverProjects(resolvedScan);
      // Also include the user's base dir in the response so the frontend can create projects there
      res.json({ projects, projectsDir: userDir });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Structured pipeline state -- calls all status tools and returns parsed JSON
  app.get('/api/project/state', requireAuth, async (req, res) => {
    const projectPath = req.query.path as string;
    const pathError = validateProjectPath(projectPath);
    if (pathError) {
      res.status(400).json({ error: pathError });
      return;
    }

    try {
      // Call all status tools in parallel
      const [pipelineResult, prcResult, rcResult, postrcResult, traceResult] = await Promise.allSettled([
        bridge.callTool('rc_pipeline_status', { project_path: projectPath }),
        bridge.callTool('prc_status', { project_path: projectPath }),
        bridge.callTool('rc_status', { project_path: projectPath }),
        bridge.callTool('postrc_status', { project_path: projectPath }),
        bridge.callTool('trace_status', { project_path: projectPath }),
      ]);

      const getText = (r: PromiseSettledResult<{ content: Array<{ type: string; text?: string }> }>): string => {
        if (r.status === 'fulfilled') return extractText(r.value);
        return '';
      };

      const pipelineText = getText(pipelineResult);
      const state: PipelineState = {
        preRc: parsePreRcStatus(getText(prcResult)),
        rc: parseRcStatus(getText(rcResult)),
        postRc: parsePostRcStatus(getText(postrcResult)),
        traceability: parseTraceStatus(getText(traceResult)),
        tokens: parseTokenSummary(pipelineText),
      };

      res.json({ state });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // List artifacts for a project
  app.get('/api/project/artifacts', requireAuth, (req, res) => {
    const projectPath = req.query.path as string;
    const pathError = validateProjectPath(projectPath);
    if (pathError) {
      res.status(400).json({ error: pathError });
      return;
    }

    try {
      const artifacts = discoverArtifacts(projectPath);
      res.json({ artifacts });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Download a specific artifact
  app.get('/api/project/download', requireAuth, (req, res) => {
    const projectPath = req.query.path as string;
    const filePath = req.query.file as string;
    if (!projectPath || !filePath) {
      res.status(400).json({ error: 'Missing ?path= or ?file= parameter' });
      return;
    }

    // Security: resolve and validate the full path
    const fullPath = path.resolve(projectPath, filePath);
    const resolvedProject = path.resolve(projectPath);
    if (!fullPath.startsWith(resolvedProject)) {
      res.status(403).json({ error: 'Path traversal blocked' });
      return;
    }

    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.download(fullPath);
  });

  // PDF export -- generates print-ready HTML from project artifacts
  app.get('/api/project/export', requireAuth, (req, res) => {
    const projectPath = req.query.path as string;
    const filesParam = req.query.files as string;
    const title = req.query.title as string | undefined;
    const subtitle = req.query.subtitle as string | undefined;

    const pathError = validateProjectPath(projectPath);
    if (pathError) {
      res.status(400).json({ error: pathError });
      return;
    }

    // Default: export all discoverable artifacts
    let files: string[];
    if (filesParam) {
      files = filesParam.split(',').map((f) => f.trim());
    } else {
      const arts = discoverArtifacts(projectPath);
      files = arts.filter((a) => a.type === 'MD' || a.type === 'HTML').map((a) => a.path);
    }

    try {
      const html = generatePrintableHtml({ projectPath, files, title, subtitle });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Playbook / ARD generation -- aggregates all pipeline outputs
  app.get('/api/project/playbook', requireAuth, (req, res) => {
    const projectPath = req.query.path as string;
    const format = req.query.format as string | undefined; // 'html' or default 'md'

    const pathError = validateProjectPath(projectPath);
    if (pathError) {
      res.status(400).json({ error: pathError });
      return;
    }

    try {
      const projectName = path.basename(projectPath);
      const result = generatePlaybook({ projectPath, projectName });

      if (format === 'html') {
        // Generate printable HTML version of the playbook
        const html = generatePrintableHtml({
          projectPath,
          files: [result.savedPath],
          title: projectName,
          subtitle: 'Project Playbook & Architecture Decision Record',
        });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      } else {
        res.json({ markdown: result.markdown, savedPath: result.savedPath });
      }
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Diagram generation -- creates Mermaid diagrams from task data
  app.get('/api/project/diagrams', requireAuth, async (req, res) => {
    const projectPath = req.query.path as string;
    const pathError = validateProjectPath(projectPath);
    if (pathError) {
      res.status(400).json({ error: pathError });
      return;
    }

    try {
      const projectName = path.basename(projectPath);
      const results = await generateDiagrams(projectPath, projectName);
      res.json({
        diagrams: results.map((d) => ({
          type: d.diagramType,
          htmlPath: d.htmlPath,
          mermaidSyntax: d.mermaidSyntax,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Save selected design option
  app.post('/api/project/design-select', requireAuth, async (req, res) => {
    const { projectPath, optionId, specPath } = req.body as {
      projectPath?: string;
      optionId?: string;
      specPath?: string;
    };
    if (!projectPath || !optionId || !specPath) {
      res.status(400).json({ error: 'Missing projectPath, optionId, or specPath' });
      return;
    }

    try {
      await bridge.callTool('rc_status', { project_path: projectPath });
      // Write selected-design.json directly
      const designDir = path.join(projectPath, 'rc-method', 'design');
      fs.mkdirSync(designDir, { recursive: true });
      fs.writeFileSync(
        path.join(designDir, 'selected-design.json'),
        JSON.stringify({ optionId, specPath, selectedAt: new Date().toISOString() }, null, 2),
        'utf-8',
      );
      res.json({ ok: true, optionId });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Configure active personas (disable/enable for research)
  app.post('/api/project/configure-personas', requireAuth, async (req, res) => {
    const { projectPath, disabledIds } = req.body as {
      projectPath?: string;
      disabledIds?: string[];
    };
    if (!projectPath || !Array.isArray(disabledIds)) {
      res.status(400).json({ error: 'Missing projectPath or disabledIds array' });
      return;
    }

    try {
      // Read current Pre-RC state and update persona selection
      const stateDir = path.join(projectPath, 'pre-rc-research');
      const stateFile = path.join(stateDir, '.state.json');
      if (!fs.existsSync(stateFile)) {
        res.status(404).json({ error: 'Pre-RC state not found. Run prc_start first.' });
        return;
      }

      const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      if (state.personaSelection) {
        // Filter out disabled personas from active list
        state.personaSelection.activePersonas = state.personaSelection.activePersonas.filter(
          (id: string) => !disabledIds.includes(id),
        );
        // Record skipped personas
        for (const id of disabledIds) {
          if (!state.personaSelection.skippedPersonas.some((s: { id: string }) => s.id === id)) {
            state.personaSelection.skippedPersonas.push({ id, reason: 'Disabled by user' });
          }
        }
        state.personaSelection.totalActive = state.personaSelection.activePersonas.length;
        state.personaSelection.totalSkipped = state.personaSelection.skippedPersonas.length;
      }

      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
      res.json({ ok: true, activeCount: state.personaSelection?.totalActive ?? 0 });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Value report for a project (computes human-equivalent savings)
  app.get('/api/project/value', requireAuth, async (req, res) => {
    const projectPath = req.query.path as string;
    const pathError = validateProjectPath(projectPath);
    if (pathError) {
      res.status(400).json({ error: pathError });
      return;
    }

    try {
      // Gather state from all domains in parallel
      const [prcResult, rcResult, postrcResult] = await Promise.allSettled([
        bridge.callTool('prc_status', { project_path: projectPath }),
        bridge.callTool('rc_status', { project_path: projectPath }),
        bridge.callTool('postrc_status', { project_path: projectPath }),
      ]);

      const getText = (r: PromiseSettledResult<{ content: Array<{ type: string; text?: string }> }>): string => {
        if (r.status === 'fulfilled') return extractText(r.value);
        return '';
      };

      const prcText = getText(prcResult);
      const rcText = getText(rcResult);
      const postrcText = getText(postrcResult);

      // Parse activated personas from Pre-RC status
      const personaMatches = prcText.match(/[a-z]+-[a-z]+-[a-z]+(?:-[a-z]+)*/g) || [];
      const knownPersonas = [
        'meta-product-architect',
        'research-program-director',
        'primary-user-researcher',
        'secondary-user-analyst',
        'demand-side-theorist',
        'accessibility-advocate',
        'market-landscape-analyst',
        'business-model-strategist',
        'go-to-market-strategist',
        'systems-architect',
        'ai-ml-specialist',
        'data-strategist',
        'security-analyst',
        'ux-systems-designer',
        'cognitive-load-analyst',
        'content-strategist',
        'coverage-auditor',
        'research-synthesizer',
        'prd-translator',
      ];
      const activatedPersonas = personaMatches.filter((p) => knownPersonas.includes(p));
      // If we found personas, use them; otherwise assume all active if Pre-RC ran
      const personas =
        activatedPersonas.length > 0 ? [...new Set(activatedPersonas)] : prcText.length > 50 ? knownPersonas : [];

      // Parse completed phases from RC status
      const phaseNames = ['illuminate', 'define', 'architect', 'sequence', 'validate', 'forge', 'connect', 'compound'];
      const completedPhases = phaseNames.filter(
        (p) => rcText.toLowerCase().includes(p) && (rcText.includes('complete') || rcText.includes('done')),
      );
      // If RC ran at all, include at least illuminate + define
      if (rcText.length > 50 && completedPhases.length === 0) {
        completedPhases.push('illuminate', 'define', 'architect');
      }

      // Parse forge task count
      const taskMatches = rcText.match(/TASK-\d+/g) || [];
      const forgeTaskCount = Math.max(1, new Set(taskMatches).size);

      // Post-RC tools
      const postRcTools: string[] = [];
      if (postrcText.length > 50) {
        postRcTools.push('security-scan');
        if (postrcText.includes('monitor')) postRcTools.push('monitoring-check');
      }

      // Compute value using the role registry and calculator
      // Import dynamically to avoid bundling issues
      const { ValueCalculator } = await import('../../src/core/value/calculator.js');
      const calc = new ValueCalculator();

      const report = calc.calculate({
        projectName: projectPath.split('/').pop() || 'Project',
        activatedPersonas: personas,
        completedPhases,
        forgeTaskCount,
        postRcTools,
        aiCostUsd: 10, // Estimate if no real data
        aiDurationMinutes: 30,
      });

      res.json({ report });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // --- Serve static frontend ---
  const clientDist = path.resolve(__dirname, '..', 'dist-client');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // SPA fallback (Express v5 requires named wildcard)
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // --- Start ---
  cleanupExpired(); // Clean expired sessions/tokens on boot
  httpServer.listen(PORT, () => {
    console.log(`[rc-engine-web] Server running at http://localhost:${PORT}`);
    console.log(`[rc-engine-web] ${bridge.toolNames.length} tools available`);
    console.log(`[rc-engine-web] WebSocket at ws://localhost:${PORT}/ws`);
  });
}

/**
 * Discover RC Engine projects by scanning for state directories.
 */
function discoverProjects(baseDir: string): Array<{ path: string; name: string; domains: string[] }> {
  const projects: Array<{ path: string; name: string; domains: string[] }> = [];

  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(baseDir, entry.name);
      const domains: string[] = [];

      if (fs.existsSync(path.join(fullPath, 'pre-rc-research'))) domains.push('pre-rc');
      if (fs.existsSync(path.join(fullPath, '.rc-method'))) domains.push('rc');
      if (fs.existsSync(path.join(fullPath, 'post-rc'))) domains.push('post-rc');
      if (fs.existsSync(path.join(fullPath, 'rc-traceability'))) domains.push('traceability');

      if (domains.length > 0) {
        projects.push({ path: fullPath, name: entry.name, domains });
      }
    }
  } catch {
    // Silently skip unreadable directories
  }

  return projects;
}

/**
 * Discover downloadable artifacts within a project directory.
 */
function discoverArtifacts(projectPath: string): ArtifactInfo[] {
  const artifacts: ArtifactInfo[] = [];
  const resolvedBase = path.resolve(projectPath);

  const artifactDirs: Array<{ dir: string; domain: string }> = [
    { dir: 'pre-rc-research', domain: 'Pre-RC' },
    { dir: 'pre-rc-research/prds', domain: 'Pre-RC' },
    { dir: 'pre-rc-research/decks', domain: 'Pre-RC' },
    { dir: 'pre-rc-research/tasks', domain: 'Pre-RC' },
    { dir: 'rc-method/prds', domain: 'RC' },
    { dir: 'rc-method/tasks', domain: 'RC' },
    { dir: 'rc-method/artifacts', domain: 'RC' },
    { dir: 'rc-method/design', domain: 'Design' },
    { dir: 'rc-method/design/option-a', domain: 'Design' },
    { dir: 'rc-method/design/option-b', domain: 'Design' },
    { dir: 'rc-method/design/option-c', domain: 'Design' },
    { dir: 'rc-method/diagrams', domain: 'Diagrams' },
    { dir: 'post-rc/reports', domain: 'Post-RC' },
    { dir: 'post-rc', domain: 'Post-RC' },
    { dir: 'rc-traceability', domain: 'Traceability' },
  ];

  const artifactExtensions = new Set(['.md', '.html', '.json', '.docx', '.pdf']);

  for (const { dir, domain } of artifactDirs) {
    const fullDir = path.join(resolvedBase, dir);
    if (!fs.existsSync(fullDir)) continue;

    try {
      const entries = fs.readdirSync(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!artifactExtensions.has(ext)) continue;
        // Skip state files
        if (entry.name.includes('STATE') || entry.name === 'config.json') continue;

        const filePath = path.join(dir, entry.name);
        const stat = fs.statSync(path.join(resolvedBase, filePath));
        artifacts.push({
          name: entry.name,
          path: filePath,
          domain,
          type: ext.slice(1).toUpperCase(),
          size: stat.size,
        });
      }
    } catch {
      // Skip unreadable directories
    }
  }

  return artifacts;
}

main().catch((err) => {
  console.error('[rc-engine-web] Fatal error:', err);
  process.exit(1);
});
