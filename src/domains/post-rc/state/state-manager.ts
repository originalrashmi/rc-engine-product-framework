import { writeFile, rename, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { join } from 'path';
import type { PostRCState } from '../types.js';
import { ValidationModule } from '../types.js';
import { getProjectStore } from '../../../shared/state/store-factory.js';
import { NODE_IDS } from '../../../shared/state/pipeline-id.js';
import { PostRCStateSchema } from './schemas.js';

const STATE_DIR = 'post-rc/state';
const STATE_FILE = 'POSTRC-STATE.md';

export async function ensureDirectories(projectPath: string): Promise<void> {
  const dirs = [
    join(projectPath, 'post-rc'),
    join(projectPath, 'post-rc', 'state'),
    join(projectPath, 'post-rc', 'reports'),
    join(projectPath, 'post-rc', 'overrides'),
  ];
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }
}

export function createDefaultState(projectPath: string, projectName: string): PostRCState {
  return {
    projectPath,
    projectName,
    config: {
      projectPath,
      projectName,
      activeModules: [ValidationModule.Security, ValidationModule.Monitoring],
      securityPolicy: {
        enabled: true,
        blockOnCritical: true,
        blockOnHigh: false,
        suppressedCWEs: [],
        customPatterns: [],
      },
      monitoringPolicy: {
        enabled: true,
        requireErrorTracking: true,
        requireAnalytics: true,
        requireDashboards: true,
        requireAlerts: true,
      },
      legalPolicy: {
        enabled: false,
        claimsAuditEnabled: false,
        productLegalEnabled: true,
        productDomain: 'general',
        jurisdiction: 'both',
        suppressedFindings: [],
        checkLicenses: true,
        checkAccessibility: true,
      },
    },
    scans: [],
    overrides: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function loadState(projectPath: string): Promise<PostRCState> {
  const { store, pipelineId } = getProjectStore(projectPath);
  try {
    const checkpoint = store.load(pipelineId, NODE_IDS.POST_RC_STATE, PostRCStateSchema);
    return checkpoint.state;
  } catch (err) {
    if ((err as Error).message.includes('No checkpoint found')) {
      return migrateFromMarkdown(projectPath);
    }
    // Validation failure -- surface it loudly, do NOT silently return default
    throw new Error(`Post-RC state validation failed: ${(err as Error).message}`, { cause: err });
  }
}

export async function saveState(projectPath: string, state: PostRCState): Promise<void> {
  await ensureDirectories(projectPath);
  state.updatedAt = new Date().toISOString();
  const { store, pipelineId } = getProjectStore(projectPath);
  store.save(pipelineId, NODE_IDS.POST_RC_STATE, state);
  // Best-effort markdown export for human readability
  void writeMarkdownExport(projectPath, state);
}

// ── Migration ──────────────────────────────────────────────────────────────

async function migrateFromMarkdown(projectPath: string): Promise<PostRCState> {
  const statePath = join(projectPath, STATE_DIR, STATE_FILE);

  if (!existsSync(statePath)) {
    return createDefaultState(projectPath, '');
  }

  try {
    const { readFile: read } = await import('fs/promises');
    const content = await read(statePath, 'utf-8');
    const parsed = parseMarkdownLegacy(content, projectPath);
    // Validate before bootstrapping into CheckpointStore
    const validated = PostRCStateSchema.parse(parsed);
    const { store, pipelineId } = getProjectStore(projectPath);
    store.save(pipelineId, NODE_IDS.POST_RC_STATE, validated);
    return validated;
  } catch (err) {
    console.error(
      `[post-rc] WARNING: Failed to migrate state from ${statePath}. ` +
        `Returning default state. Error: ${(err as Error).message}`,
    );
    return createDefaultState(projectPath, '');
  }
}

// ── Markdown export (write-only) ───────────────────────────────────────────

async function writeMarkdownExport(projectPath: string, state: PostRCState): Promise<void> {
  try {
    const statePath = join(projectPath, STATE_DIR, STATE_FILE);
    const tmpPath = `${statePath}.${randomBytes(4).toString('hex')}.tmp`;
    const markdown = serializeState(state);
    await writeFile(tmpPath, markdown, 'utf-8');
    await rename(tmpPath, statePath);
  } catch (err) {
    console.error('[post-rc] Warning: failed to write markdown export:', (err as Error).message);
  }
}

function serializeState(state: PostRCState): string {
  let md = `# Post-RC Method State: ${state.projectName}\n\n`;
  md += `## Metadata\n`;
  md += `- **Project:** ${state.projectName}\n`;
  md += `- **Path:** ${state.projectPath}\n`;
  md += `- **Created:** ${state.createdAt}\n`;
  md += `- **Updated:** ${state.updatedAt}\n\n`;

  md += `## Active Modules\n`;
  for (const mod of state.config.activeModules) {
    md += `- ${mod}\n`;
  }
  md += '\n';

  md += `## Security Policy\n`;
  md += `- Enabled: ${state.config.securityPolicy.enabled}\n`;
  md += `- Block on Critical: ${state.config.securityPolicy.blockOnCritical}\n`;
  md += `- Block on High: ${state.config.securityPolicy.blockOnHigh}\n`;
  md += `- Suppressed CWEs: ${state.config.securityPolicy.suppressedCWEs.join(', ') || 'None'}\n\n`;

  md += `## Monitoring Policy\n`;
  md += `- Enabled: ${state.config.monitoringPolicy.enabled}\n`;
  md += `- Require Error Tracking: ${state.config.monitoringPolicy.requireErrorTracking}\n`;
  md += `- Require Analytics: ${state.config.monitoringPolicy.requireAnalytics}\n`;
  md += `- Require Dashboards: ${state.config.monitoringPolicy.requireDashboards}\n`;
  md += `- Require Alerts: ${state.config.monitoringPolicy.requireAlerts}\n\n`;

  if (state.config.legalPolicy) {
    md += `## Legal Policy\n`;
    md += `- Enabled: ${state.config.legalPolicy.enabled}\n`;
    md += `- Claims Audit: ${state.config.legalPolicy.claimsAuditEnabled}\n`;
    md += `- Product Legal Review: ${state.config.legalPolicy.productLegalEnabled}\n`;
    md += `- Product Domain: ${state.config.legalPolicy.productDomain || 'general'}\n`;
    md += `- Jurisdiction: ${state.config.legalPolicy.jurisdiction || 'both'}\n`;
    md += `- Check Licenses: ${state.config.legalPolicy.checkLicenses}\n`;
    md += `- Check Accessibility: ${state.config.legalPolicy.checkAccessibility}\n`;
    md += `- Suppressed Findings: ${state.config.legalPolicy.suppressedFindings.length > 0 ? state.config.legalPolicy.suppressedFindings.join(', ') : 'None'}\n\n`;
  }

  md += `## Scan History (${state.scans.length} scans)\n`;
  for (const scan of state.scans.slice(-10)) {
    md += `- ${scan.id} | ${scan.timestamp} | ${scan.gateDecision.toUpperCase()} | ${scan.summary.totalFindings} findings | ${scan.duration_ms}ms\n`;
  }
  md += '\n';

  md += `## Active Overrides (${state.overrides.filter((o) => o.status === 'active').length})\n`;
  for (const override of state.overrides.filter((o) => o.status === 'active')) {
    md += `- ${override.id} | ${override.findingId} | ${override.reason} | Expires: ${override.expiresAt}\n`;
  }
  md += '\n';

  if (state.lastScan) {
    md += `## Latest Scan\n`;
    md += `- ID: ${state.lastScan.id}\n`;
    md += `- Date: ${state.lastScan.timestamp}\n`;
    md += `- Gate: ${state.lastScan.gateDecision.toUpperCase()}\n`;
    md += `- Critical: ${state.lastScan.summary.critical} | High: ${state.lastScan.summary.high} | Medium: ${state.lastScan.summary.medium}\n`;
  }

  md += `\n<!-- STATE_JSON\n${JSON.stringify(state, null, 2)}\nSTATE_JSON -->\n`;

  return md;
}

// ── Legacy parser (migration only) ────────────────────────────────────────

function parseMarkdownLegacy(content: string, projectPath: string): PostRCState {
  const jsonMatch = content.match(/<!-- STATE_JSON\n([\s\S]*?)\nSTATE_JSON -->/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]) as PostRCState;
    } catch {
      // Fall through to default
    }
  }

  const nameMatch = content.match(/^# Post-RC Method State: (.+)$/m);
  return createDefaultState(projectPath, nameMatch?.[1] || '');
}
