import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { resolveFromRoot } from './config.js';

/**
 * RC Engine Knowledge Loader
 *
 * Detects whether Pro knowledge files are installed and loads them.
 * Without Pro files, RC Engine runs in community mode (passthrough only).
 *
 * Knowledge file resolution order:
 * 1. RC_KNOWLEDGE_PATH environment variable
 * 2. ./knowledge/ directory (relative to package root)
 * 3. ./knowledge-pro/ directory (if cloned separately)
 */

export type KnowledgeMode = 'pro' | 'community';

interface KnowledgeManifest {
  mode: KnowledgeMode;
  basePath: string | null;
  fileCount: number;
  domains: {
    preRc: { personas: number; templates: number; framework: boolean };
    rc: { skills: number; uxSpecialists: number; uxTriggers: boolean };
    postRc: { security: number; monitoring: number };
  };
}

/** Probe a directory for knowledge files and return counts */
function probeDirectory(basePath: string): KnowledgeManifest {
  const manifest: KnowledgeManifest = {
    mode: 'community',
    basePath: null,
    fileCount: 0,
    domains: {
      preRc: { personas: 0, templates: 0, framework: false },
      rc: { skills: 0, uxSpecialists: 0, uxTriggers: false },
      postRc: { security: 0, monitoring: 0 },
    },
  };

  if (!existsSync(basePath)) return manifest;

  // Pre-RC personas
  const personasDir = join(basePath, 'pre-rc', 'personas');
  if (existsSync(personasDir)) {
    manifest.domains.preRc.personas = readdirSync(personasDir).filter((f) => f.endsWith('.md')).length;
  }

  // Pre-RC templates
  const templatesDir = join(basePath, 'pre-rc', 'templates');
  if (existsSync(templatesDir)) {
    manifest.domains.preRc.templates = readdirSync(templatesDir).filter((f) => f.endsWith('.md')).length;
  }

  // Pre-RC complexity framework
  manifest.domains.preRc.framework = existsSync(join(basePath, 'pre-rc', 'complexity-framework.md'));

  // RC skills
  const skillsDir = join(basePath, 'rc', 'skills');
  if (existsSync(skillsDir)) {
    manifest.domains.rc.skills = readdirSync(skillsDir).filter((f) => f.endsWith('.md')).length;
  }

  // RC UX specialists
  const uxDir = join(basePath, 'rc', 'ux', 'specialists');
  if (existsSync(uxDir)) {
    manifest.domains.rc.uxSpecialists = readdirSync(uxDir).filter((f) => f.endsWith('.md')).length;
  }

  // RC UX triggers
  manifest.domains.rc.uxTriggers = existsSync(join(basePath, 'rc', 'ux', 'UX-TRIGGERS.md'));

  // Post-RC security
  const secDir = join(basePath, 'post-rc', 'sec-context');
  if (existsSync(secDir)) {
    manifest.domains.postRc.security = readdirSync(secDir).filter((f) => f.endsWith('.md')).length;
  }

  // Post-RC monitoring
  const monDir = join(basePath, 'post-rc', 'monitoring');
  if (existsSync(monDir)) {
    manifest.domains.postRc.monitoring = readdirSync(monDir).filter((f) => f.endsWith('.md')).length;
  }

  // Calculate totals
  const d = manifest.domains;
  manifest.fileCount =
    d.preRc.personas +
    d.preRc.templates +
    (d.preRc.framework ? 1 : 0) +
    d.rc.skills +
    d.rc.uxSpecialists +
    (d.rc.uxTriggers ? 1 : 0) +
    d.postRc.security +
    d.postRc.monitoring;

  // Pro mode requires minimum viable knowledge (at least personas + skills)
  if (d.preRc.personas >= 10 && d.rc.skills >= 5) {
    manifest.mode = 'pro';
    manifest.basePath = basePath;
  }

  return manifest;
}

/** Resolve the knowledge base path from environment or defaults */
function resolveKnowledgePath(): string | null {
  // 1. Environment variable
  const envPath = process.env.RC_KNOWLEDGE_PATH;
  if (envPath && existsSync(envPath)) return resolve(envPath);

  // 2. Default knowledge/ directory
  const defaultPath = resolveFromRoot('knowledge');
  if (existsSync(join(defaultPath, 'pre-rc', 'personas'))) return defaultPath;

  // 3. knowledge-pro/ directory (cloned separately)
  const proPath = resolveFromRoot('knowledge-pro');
  if (existsSync(proPath)) return proPath;

  return null;
}

/** Load a knowledge file by relative path. Returns null in community mode. */
export function loadKnowledgeFile(relativePath: string): string | null {
  const manifest = getKnowledgeManifest();
  if (manifest.mode === 'community' || !manifest.basePath) return null;

  const fullPath = join(manifest.basePath, relativePath);
  if (!existsSync(fullPath)) return null;

  return readFileSync(fullPath, 'utf-8');
}

// Cached manifest (computed once on first access)
let cachedManifest: KnowledgeManifest | null = null;

/** Get the knowledge manifest (cached after first call) */
export function getKnowledgeManifest(): KnowledgeManifest {
  if (cachedManifest) return cachedManifest;

  const basePath = resolveKnowledgePath();
  if (!basePath) {
    cachedManifest = {
      mode: 'community',
      basePath: null,
      fileCount: 0,
      domains: {
        preRc: { personas: 0, templates: 0, framework: false },
        rc: { skills: 0, uxSpecialists: 0, uxTriggers: false },
        postRc: { security: 0, monitoring: 0 },
      },
    };
    return cachedManifest;
  }

  cachedManifest = probeDirectory(basePath);
  return cachedManifest;
}

/** Log knowledge status to stderr */
export function logKnowledgeStatus(): void {
  const m = getKnowledgeManifest();
  if (m.mode === 'pro') {
    console.error(`[rc-engine] Knowledge: ${m.fileCount} files loaded (pro mode)`);
    console.error(`[rc-engine]   Pre-RC: ${m.domains.preRc.personas} personas, ${m.domains.preRc.templates} templates`);
    console.error(`[rc-engine]   RC:     ${m.domains.rc.skills} skills, ${m.domains.rc.uxSpecialists} UX specialists`);
    console.error(
      `[rc-engine]   Post-RC: ${m.domains.postRc.security} security, ${m.domains.postRc.monitoring} monitoring`,
    );
  } else {
    console.error('[rc-engine] Knowledge: community mode (passthrough only)');
    console.error('[rc-engine]   Install rc-engine-pro for autonomous mode with 52 methodology files');
  }
}
