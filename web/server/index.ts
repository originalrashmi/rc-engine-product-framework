/**
 * RC Engine Web UI -- Express server.
 *
 * Architecture:
 *   - Creates an in-process MCP server with all 31 tools registered
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
  auditLog,
} from './auth.js';
import { getTier, hasFeature, type TierId } from '../../dist/core/pricing/tiers.js';
import { registerBillingRoutes } from './billing.js';
import { sendMagicLinkEmail, getEmailProvider } from './email.js';
import {
  validateFileWithinProject,
  requireValidProjectQuery,
  requireValidProjectBody,
  createToolRateLimiter,
  createProjectReadLimiter,
  createOrgRateLimiter,
  createBillingRateLimiter,
  type RequestWithProject,
  verifyTurnstile,
  isCaptchaEnabled,
  errorHandler,
  asyncHandler,
  correlationIdMiddleware,
  requestLogger,
  csrfProtection,
  validateSecrets,
  logger,
  pseudonymize,
  WS_MAX_MESSAGE_SIZE,
  wsConnectionAllowed,
  wsConnectionClosed,
} from './security.js';

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
// Single source of truth: shared with MCP server via core/pricing/tool-requirements.ts
import { TOOL_FEATURE_REQUIREMENTS } from '../../src/core/pricing/tool-requirements.js';

/** Valid tier IDs for fail-closed validation. */
const VALID_TIERS = new Set<string>(['free', 'starter', 'pro', 'enterprise']);

/**
 * Normalize a tier string to a valid TierId.
 * Unknown tiers are treated as 'free' (fail-closed).
 */
function normalizeTier(userTier: string): TierId {
  return VALID_TIERS.has(userTier) ? (userTier as TierId) : 'free';
}

function checkTierAccess(toolName: string, userTier: string): string | null {
  const requiredFeature = TOOL_FEATURE_REQUIREMENTS[toolName];
  if (!requiredFeature) return null; // Tool available on all tiers
  const tierId = normalizeTier(userTier);
  if (hasFeature(tierId, requiredFeature)) return null;
  const tierDef = getTier(tierId);
  return `Your ${tierDef.name} plan does not include this feature. Upgrade to access ${requiredFeature.replace(/([A-Z])/g, ' $1').toLowerCase()}.`;
}

/**
 * Check if a user's tier includes a specific feature.
 * Returns null if allowed, or an error message string if blocked.
 * Unknown tiers are treated as 'free' (fail-closed).
 */
function checkFeatureAccess(
  userTier: string,
  feature: keyof ReturnType<typeof getTier>['features'],
  label: string,
): string | null {
  const tierId = normalizeTier(userTier);
  if (hasFeature(tierId, feature)) return null;
  const tierDef = getTier(tierId);
  return `Your ${tierDef.name} plan does not include ${label}. Upgrade to access this feature.`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.RC_WEB_PORT || '3100', 10);

// Path validation is now handled by security.ts -- see validateUserProjectPath()

function extractText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('\n');
}

async function main() {
  const app = express();
  const httpServer = createServer(app);

  // Security headers (enterprise-grade)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          frameAncestors: ["'none'"], // Prevent clickjacking
          baseUri: ["'self'"], // Prevent base tag hijacking
          formAction: ["'self'"], // Restrict form submissions
          objectSrc: ["'none'"], // Block Flash/Java embeds
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false, // Allow loading external fonts
    }),
  );

  // Correlation ID + structured request logging
  app.use(correlationIdMiddleware);
  app.use(requestLogger);

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

  // Rate limiters for tool execution and project reads
  const toolLimiter = createToolRateLimiter();
  const projectReadLimiter = createProjectReadLimiter();

  app.use(express.json({ limit: '1mb' }));
  app.use(authMiddleware);
  app.use(csrfProtection);

  // Rate limiters for org and billing endpoints
  const orgLimiter = createOrgRateLimiter();
  const billingLimiter = createBillingRateLimiter();

  // --- Auth Routes ---
  app.post('/auth/login', authLimiter, async (req, res) => {
    const { email, captchaToken } = req.body as { email?: string; captchaToken?: string };
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email required' });
      return;
    }

    // CAPTCHA verification (when configured via TURNSTILE_SECRET_KEY)
    const captchaValid = await verifyTurnstile(captchaToken, req.ip);
    if (!captchaValid) {
      auditLog({
        action: 'login_captcha_failed',
        actorEmail: pseudonymize(email),
        ip: req.ip,
        success: false,
      });
      res.status(403).json({ error: 'CAPTCHA verification failed. Please try again.' });
      return;
    }

    const token = requestMagicLink(email);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    if (isAuthBypassed() && process.env.NODE_ENV !== 'production') {
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
        logger.error('Failed to send magic link', { provider, error: result.error, email: pseudonymize(email) });
        res.status(500).json({ error: 'Failed to send magic link. Please try again later.' });
      }
    }
  });

  // POST endpoint for client-side token verification (token in body, not URL)
  app.post('/auth/verify', (req, res) => {
    const { token } = req.body as { token?: string };
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

  // GET fallback for email link clicks — redirects to SPA with hash fragment
  app.get('/auth/verify', (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }
    // Redirect to SPA with token in hash fragment (not query string)
    // Hash fragments are never sent to the server, protecting the token
    res.redirect(`/#token=${encodeURIComponent(token)}`);
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

  // CAPTCHA config endpoint (frontend uses this to decide whether to show widget)
  app.get('/auth/captcha-config', (_req, res) => {
    res.json({
      enabled: isCaptchaEnabled(),
      siteKey: process.env.TURNSTILE_SITE_KEY || null,
    });
  });

  // --- Team / Organization Routes ---
  app.post('/api/org/create', requireAuth, orgLimiter, (req, res, next) => {
    const { name } = req.body as { name?: string };
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      res.status(400).json({ error: 'Organization name required (2-100 characters)' });
      return;
    }
    try {
      const org = createOrganization(req.user!.id, name.trim(), req.user!.tier);
      res.json({ ok: true, org });
    } catch (err) {
      logger.error('Failed to create organization', { error: (err as Error).message, userId: req.user?.id });
      next(err);
    }
  });

  app.get('/api/org/members', requireAuth, (req, res, next) => {
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
      logger.error('Failed to list org members', { error: (err as Error).message, orgId: req.user?.orgId });
      next(err);
    }
  });

  app.post('/api/org/invite', requireAuth, orgLimiter, (req, res, next) => {
    if (!req.user?.orgId) {
      res.status(400).json({ error: 'You are not in an organization' });
      return;
    }
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Only owners and admins can invite members' });
      return;
    }
    const { email } = req.body as { email?: string };
    if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 254) {
      res.status(400).json({ error: 'Valid email required' });
      return;
    }
    try {
      const inviteId = inviteToOrg(req.user.orgId, req.user.id, email);
      res.json({ ok: true, inviteId });
    } catch (err) {
      const msg = (err as Error).message;
      // Seat limit errors are safe to show — they contain no internals
      if (msg.includes('seat limit')) {
        res.status(400).json({ error: msg });
      } else {
        logger.error('Failed to send org invite', { error: msg, orgId: req.user?.orgId });
        next(err);
      }
    }
  });

  // --- Pricing Info ---
  app.get('/api/pricing', (_req, res) => {
    // Import pricing tiers dynamically
    import('../../src/core/pricing/tiers.js')
      .then(({ TIERS, getTierOrder }) => {
        const order = getTierOrder();
        res.json({
          tiers: order.map((id: 'free' | 'starter' | 'pro' | 'enterprise') => TIERS[id]),
        });
      })
      .catch(() => {
        res.status(500).json({ error: 'Pricing unavailable' });
      });
  });

  // --- Billing Routes (Stripe) ---
  registerBillingRoutes(app, billingLimiter);

  // --- MCP Bridge (in-process tool execution) ---
  const bridge = await createMcpBridge();

  // --- WebSocket for real-time events ---
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws, req) => {
    // Rate limit WebSocket connections per IP
    const clientIp = req.socket.remoteAddress || 'unknown';
    if (!wsConnectionAllowed(clientIp)) {
      logger.warn('WebSocket connection limit exceeded', { ip: clientIp });
      ws.close(1013, 'Too many connections');
      return;
    }

    // Authenticate WebSocket connections via session cookie
    if (!isAuthBypassed()) {
      const cookies = parseCookies(req.headers.cookie);
      const sessionId = cookies.rc_session;
      if (!sessionId || !getUserFromSession(sessionId)) {
        wsConnectionClosed(clientIp);
        ws.close(1008, 'Authentication required');
        return;
      }
    }

    clients.add(ws);

    // Enforce message size limits
    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      const size = Buffer.isBuffer(data) ? data.length : Array.isArray(data) ? data.reduce((s, b) => s + b.length, 0) : (data as ArrayBuffer).byteLength;
      if (size > WS_MAX_MESSAGE_SIZE) {
        logger.warn('WebSocket message too large', { ip: clientIp, size });
        ws.close(1009, 'Message too large');
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      wsConnectionClosed(clientIp);
    });

    ws.send(JSON.stringify({ type: 'connected', tools: bridge.toolNames }));
  });

  function broadcast(event: Record<string, unknown>) {
    const msg = JSON.stringify(event);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  // --- REST API ---

  // Health check — public endpoint, no sensitive details
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      tools: bridge.toolNames.length,
      uptime: process.uptime(),
    });
  });

  // Detailed config info — requires authentication
  app.get('/api/health/details', requireAuth, (_req, res) => {
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
  app.get('/api/tools', asyncHandler(async (_req, res) => {
    const tools = await bridge.listTools();
    res.json({ tools });
  }));

  // Execute a tool by name
  app.post('/api/tools/:name', requireAuth, toolLimiter, async (req, res) => {
    const name = req.params.name as string;
    const args = req.body || {};

    // Tier enforcement (skip in dev bypass mode)
    if (!isAuthBypassed()) {
      const userTier = req.user?.tier || 'free';
      const tierError = checkTierAccess(name, userTier);
      if (tierError) {
        auditLog({
          action: 'tool_blocked_tier',
          actorId: req.user?.id,
          actorEmail: req.user?.email ? pseudonymize(req.user.email) : undefined,
          detail: `tool=${name}, tier=${userTier}`,
          success: false,
        });
        res.status(403).json({ error: tierError });
        return;
      }
    }

    broadcast({ type: 'tool:start', tool: name, args, timestamp: Date.now() });
    auditLog({
      action: 'tool_execute',
      actorId: req.user?.id,
      actorEmail: req.user?.email ? pseudonymize(req.user.email) : undefined,
      targetType: 'tool',
      targetId: name,
      ip: req.ip,
    });

    try {
      const result = await bridge.callTool(name, args);
      broadcast({ type: 'tool:complete', tool: name, timestamp: Date.now() });
      res.json({ result });
    } catch (err) {
      const errorMsg = (err as Error).message;
      logger.error('Tool execution failed', { tool: name, error: errorMsg, userId: req.user?.id });
      broadcast({ type: 'tool:error', tool: name, error: 'Tool execution failed', timestamp: Date.now() });
      res.status(500).json({ error: 'Tool execution failed. Please try again.' });
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
      logger.error('Failed to list projects', { error: (err as Error).message, userId: req.user?.id });
      res.status(500).json({ error: 'Failed to list projects.' });
    }
  });

  // Structured pipeline state -- calls all status tools and returns parsed JSON
  app.get('/api/project/state', requireAuth, projectReadLimiter, requireValidProjectQuery, async (req, res) => {
    const projectPath = (req as RequestWithProject).validatedProjectPath;

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
      logger.error('Failed to load project state', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to load project state.' });
    }
  });

  // List artifacts for a project
  app.get('/api/project/artifacts', requireAuth, projectReadLimiter, requireValidProjectQuery, (req, res) => {
    const projectPath = (req as RequestWithProject).validatedProjectPath;

    try {
      const artifacts = discoverArtifacts(projectPath);
      res.json({ artifacts });
    } catch (err) {
      logger.error('Failed to list artifacts', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to list artifacts.' });
    }
  });

  // Download a specific artifact
  app.get('/api/project/download', requireAuth, requireValidProjectQuery, (req, res) => {
    const projectPath = (req as RequestWithProject).validatedProjectPath;
    const filePath = req.query.file as string;

    const fileResult = validateFileWithinProject(projectPath, filePath);
    if ('error' in fileResult) {
      res.status(fileResult.status).json({ error: fileResult.error });
      return;
    }

    res.download(fileResult.fullPath);
  });

  // PDF export -- generates print-ready HTML from project artifacts
  app.get('/api/project/export', requireAuth, requireValidProjectQuery, (req, res) => {
    if (!isAuthBypassed()) {
      const tierError = checkFeatureAccess(req.user?.tier || 'free', 'pdfExport', 'PDF export');
      if (tierError) {
        res.status(403).json({ error: tierError });
        return;
      }
    }

    const projectPath = (req as RequestWithProject).validatedProjectPath;
    const filesParam = req.query.files as string;
    const title = req.query.title as string | undefined;
    const subtitle = req.query.subtitle as string | undefined;

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
      logger.error('PDF export failed', { error: (err as Error).message });
      res.status(500).json({ error: 'Export failed. Please try again.' });
    }
  });

  // Playbook / ARD generation -- aggregates all pipeline outputs
  app.get('/api/project/playbook', requireAuth, requireValidProjectQuery, (req, res) => {
    if (!isAuthBypassed()) {
      const tierError = checkFeatureAccess(req.user?.tier || 'free', 'playbook', 'playbook export');
      if (tierError) {
        res.status(403).json({ error: tierError });
        return;
      }
    }

    const projectPath = (req as RequestWithProject).validatedProjectPath;
    const format = req.query.format as string | undefined; // 'html' or default 'md'

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
      logger.error('Playbook generation failed', { error: (err as Error).message });
      res.status(500).json({ error: 'Playbook generation failed. Please try again.' });
    }
  });

  // Diagram generation -- creates Mermaid diagrams from task data
  app.get('/api/project/diagrams', requireAuth, requireValidProjectQuery, async (req, res) => {
    if (!isAuthBypassed()) {
      const tierError = checkFeatureAccess(req.user?.tier || 'free', 'diagrams', 'architecture diagrams');
      if (tierError) {
        res.status(403).json({ error: tierError });
        return;
      }
    }

    const projectPath = (req as RequestWithProject).validatedProjectPath;

    try {
      const projectName = path.basename(projectPath);
      const results = await generateDiagrams(projectPath, projectName);
      res.json({
        diagrams: results.map((d: { diagramType: string; htmlPath: string; mermaidSyntax: string }) => ({
          type: d.diagramType,
          htmlPath: d.htmlPath,
          mermaidSyntax: d.mermaidSyntax,
        })),
      });
    } catch (err) {
      logger.error('Diagram generation failed', { error: (err as Error).message });
      res.status(500).json({ error: 'Diagram generation failed. Please try again.' });
    }
  });

  // Save selected design option
  app.post('/api/project/design-select', requireAuth, requireValidProjectBody, async (req, res) => {
    if (!isAuthBypassed()) {
      const tierError = checkFeatureAccess(req.user?.tier || 'free', 'designOptions', 'design options');
      if (tierError) {
        res.status(403).json({ error: tierError });
        return;
      }
    }
    const projectPath = (req as RequestWithProject).validatedProjectPath;
    const { optionId, specPath } = req.body as {
      optionId?: string;
      specPath?: string;
    };
    if (!optionId || !specPath) {
      res.status(400).json({ error: 'Missing optionId or specPath' });
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
      logger.error('Design selection failed', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to save design selection.' });
    }
  });

  // Configure active personas (disable/enable for research)
  app.post('/api/project/configure-personas', requireAuth, requireValidProjectBody, async (req, res) => {
    const projectPath = (req as RequestWithProject).validatedProjectPath;
    const { disabledIds } = req.body as {
      disabledIds?: string[];
    };
    if (!Array.isArray(disabledIds)) {
      res.status(400).json({ error: 'Missing disabledIds array' });
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
      logger.error('Persona configuration failed', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to configure personas.' });
    }
  });

  // Value report for a project (computes human-equivalent savings)
  app.get('/api/project/value', requireAuth, requireValidProjectQuery, async (req, res) => {
    if (!isAuthBypassed()) {
      const tierError = checkFeatureAccess(req.user?.tier || 'free', 'fullPipeline', 'value report');
      if (tierError) {
        res.status(403).json({ error: tierError });
        return;
      }
    }

    const projectPath = (req as RequestWithProject).validatedProjectPath;

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
      logger.error('Value report generation failed', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to generate value report.' });
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

  // --- Centralized Error Handler (MUST be last middleware) ---
  app.use(errorHandler);

  // --- Pre-flight checks ---
  validateSecrets();
  cleanupExpired(); // Clean expired sessions/tokens on boot

  httpServer.listen(PORT, () => {
    logger.info('Server started', {
      port: PORT,
      tools: bridge.toolNames.length,
      wsPath: `/ws`,
      authBypassed: isAuthBypassed(),
    });
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
  logger.error('Fatal startup error', { error: (err as Error).message, stack: (err as Error).stack?.split('\n').slice(0, 3).join(' | ') });
  process.exit(1);
});
