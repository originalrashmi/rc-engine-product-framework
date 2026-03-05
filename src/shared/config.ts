import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '..', '..', '.env');

dotenv.config({ path: envPath, override: true });

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  geminiApiKey: process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  perplexityApiKey: process.env.PERPLEXITY_API_KEY || '',

  // Model configuration - override via environment variables
  // Tier 1 (fast/cheap): extraction, classification, summarization
  // Tier 2 (balanced): complex reasoning, multi-step analysis
  // Tier 3 (premium): novel generation, architectural decisions
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  perplexityModel: process.env.PERPLEXITY_MODEL || 'sonar-pro',

  maxTokens: parseInt(process.env.MAX_TOKENS || '16384', 10),
};

export const hasAnthropicKey = !!config.anthropicApiKey;
export const hasOpenAIKey = !!config.openaiApiKey;
export const hasGeminiKey = !!config.geminiApiKey;
export const hasPerplexityKey = !!config.perplexityApiKey;

/** True if at least one LLM API key is configured */
export const hasAnyApiKey = hasAnthropicKey || hasOpenAIKey || hasGeminiKey || hasPerplexityKey;

/** True if Anthropic key is configured (used by RC domain for autonomous mode) */
export const hasApiKey = hasAnthropicKey;

/** Current rc-engine version, read from package.json at startup. */
let _version = '0.0.0';
try {
  const pkg = JSON.parse(readFileSync(resolveFromRoot('package.json'), 'utf-8'));
  _version = pkg.version || '0.0.0';
} catch {
  // Fallback if package.json unreadable (shouldn't happen in normal operation)
}
export const version = _version;

/**
 * Resolve a path relative to the package root (where knowledge/ lives).
 */
export function resolveFromRoot(...segments: string[]): string {
  return resolve(__dirname, '..', '..', ...segments);
}

/**
 * Log startup diagnostics to stderr (never stdout - stdio protocol).
 */
export function logStartupDiagnostics(): void {
  const envExists = existsSync(envPath);
  console.error('[rc-engine] === STARTUP DIAGNOSTICS ===');
  console.error(`[rc-engine] .env path: ${envPath} (exists: ${envExists})`);
  console.error(`[rc-engine]   ANTHROPIC_API_KEY:  ${hasAnthropicKey ? 'configured' : 'NOT SET'}`);
  console.error(`[rc-engine]   OPENAI_API_KEY:     ${hasOpenAIKey ? 'configured' : 'NOT SET'}`);
  console.error(`[rc-engine]   GEMINI_API_KEY:     ${hasGeminiKey ? 'configured' : 'NOT SET'}`);
  console.error(`[rc-engine]   PERPLEXITY_API_KEY: ${hasPerplexityKey ? 'configured' : 'NOT SET'}`);
  console.error(`[rc-engine] hasAnyApiKey: ${hasAnyApiKey}`);
  console.error('[rc-engine] === END DIAGNOSTICS ===');
}
