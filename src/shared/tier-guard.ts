/**
 * Tier Guard -- MCP-level tier enforcement for tool access.
 *
 * Reads the user's tier from `.rc-engine/tier.json` in the project directory.
 * If no tier file exists, defaults to 'free'.
 *
 * This ensures that even direct MCP callers (bypassing the web server)
 * cannot access paid-tier features without a valid tier file.
 *
 * Tier file format:
 *   { "tier": "free" | "starter" | "pro" | "enterprise" }
 *
 * The web server writes this file when a user authenticates with a paid subscription.
 * MCP-only users can manually create it if they have a valid subscription.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getTier, hasFeature, type TierId } from '../core/pricing/tiers.js';
import { TOOL_FEATURE_REQUIREMENTS } from '../core/pricing/tool-requirements.js';

const TIER_FILE = '.rc-engine/tier.json';

/** Valid tier IDs for validation. */
const VALID_TIERS = new Set<string>(['free', 'starter', 'pro', 'enterprise']);

/**
 * Read the user's tier from the project directory.
 * Returns 'free' if no tier file exists or if it's malformed.
 */
export function readTier(projectPath: string): TierId {
  try {
    const filePath = path.join(projectPath, TIER_FILE);
    if (!fs.existsSync(filePath)) return 'free';
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const tier = content?.tier;
    if (VALID_TIERS.has(tier)) {
      return tier as TierId;
    }
    // Malformed tier value -- default to free (fail-closed)
    return 'free';
  } catch {
    return 'free';
  }
}

/**
 * Check if a tool is accessible at the given tier.
 * Returns null if allowed, or an error message if blocked.
 *
 * Fails CLOSED: unknown tiers are treated as 'free' (blocked from paid features).
 */
export function checkMcpTierAccess(toolName: string, projectPath: string): string | null {
  const requiredFeature = TOOL_FEATURE_REQUIREMENTS[toolName];
  if (!requiredFeature) return null; // Tool available on all tiers

  const tierId = readTier(projectPath);

  if (hasFeature(tierId, requiredFeature)) return null;

  const tierDef = getTier(tierId);
  const featureLabel = requiredFeature
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim();
  return (
    `[Tier Restriction] Your ${tierDef.name} plan does not include ${featureLabel}. ` +
    `This tool requires a paid tier. ` +
    `To upgrade, visit https://rcengine.dev/pricing or create a tier file at ${projectPath}/.rc-engine/tier.json ` +
    `with your subscription tier (e.g., {"tier":"starter"}).`
  );
}
