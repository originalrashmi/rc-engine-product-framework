/**
 * Tool Guard -- Shared validation middleware for all MCP tool handlers.
 *
 * Validates:
 *   1. project_path is safe (canonicalized, no traversal, no system paths)
 *   2. String inputs are within size limits
 *
 * Wired in src/index.ts by patching both server.tool() and server.registerTool()
 * -- all tools get validation automatically without modifying individual handlers.
 */

import { PathValidator } from '../core/sandbox/path-validator.js';
import { checkInputs, DEFAULT_LIMITS } from '../core/sandbox/input-limits.js';
import type { InputLimitConfig } from '../core/sandbox/input-limits.js';
import { recordToolCall } from './usage-meter.js';
import { checkMcpTierAccess, readTier } from './tier-guard.js';
import { logActivity } from './activity-logger.js';
import { recordTelemetryEvent } from './telemetry.js';
import { TOOL_FEATURE_REQUIREMENTS } from '../core/pricing/tool-requirements.js';

/** Check if a tool requires a paid tier (has an entry in the feature requirements map). */
function isGatedTool(toolName: string): boolean {
  return toolName in TOOL_FEATURE_REQUIREMENTS;
}

// Shared PathValidator instance -- root "/" means basic safety checks only.
// Domain-specific write restrictions are enforced separately.
const validator = new PathValidator('/');

/** Input field names mapped to their limit presets. */
const FIELD_LIMITS: Record<string, InputLimitConfig> = {
  brief: DEFAULT_LIMITS.brief,
  requirements: DEFAULT_LIMITS.requirements,
  code_context: DEFAULT_LIMITS.codeContext,
  operator_inputs: DEFAULT_LIMITS.operatorInputs,
  feedback: DEFAULT_LIMITS.feedback,
  prd_content: DEFAULT_LIMITS.requirements,
  decision: DEFAULT_LIMITS.feedback,
  reason: DEFAULT_LIMITS.feedback,
};

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

/**
 * Wrap a tool handler with path validation, tier enforcement, and input size checks.
 *
 * - If `project_path` exists in args, validates it is a safe absolute path.
 * - Checks tier access if a tool name is provided.
 * - Validates all known string fields against size limits.
 * - Returns an error result instead of throwing on validation failure.
 */
export function guardedTool(handler: ToolHandler, toolName?: string): ToolHandler {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    // 1. Validate project_path if present
    const projectPath = args.project_path;
    if (typeof projectPath === 'string') {
      const pathResult = validatePath(projectPath);
      if (pathResult) {
        return { content: [{ type: 'text', text: pathResult }], isError: true };
      }

      // 1b. Tier enforcement -- check if this tool requires a paid tier
      if (toolName) {
        const tierError = checkMcpTierAccess(toolName, projectPath);
        if (tierError) {
          logActivity(projectPath, { event: 'tier_block', tool: toolName, detail: tierError });
          return { content: [{ type: 'text', text: tierError }], isError: true };
        }
      }
    } else if (toolName && isGatedTool(toolName)) {
      // 1c. Tools that require a paid tier but have no project_path cannot
      // be tier-checked -- block them to prevent bypass.
      return {
        content: [
          { type: 'text', text: `[Tier Restriction] Tool "${toolName}" requires project_path for tier verification.` },
        ],
        isError: true,
      };
    }

    // 2. Validate input sizes
    const sizeErrors = validateInputSizes(args);
    if (sizeErrors) {
      const pid = typeof projectPath === 'string' ? projectPath : '';
      if (pid) logActivity(pid, { event: 'validation_error', tool: toolName, detail: sizeErrors });
      return { content: [{ type: 'text', text: sizeErrors }], isError: true };
    }

    // 3. Record tool call for usage metering, activity log, and telemetry
    const pid = typeof projectPath === 'string' ? projectPath : '';
    recordToolCall('operator', pid);
    if (pid && toolName) logActivity(pid, { event: 'tool_call', tool: toolName });
    if (toolName) {
      const tier = pid ? readTier(pid) : 'free';
      recordTelemetryEvent(toolName, tier);
    }

    // 4. Delegate to actual handler
    return handler(args);
  };
}

function validatePath(projectPath: string): string | null {
  // Must be an absolute path (Unix: /path or Windows: C:\path, D:/path)
  const isAbsolute = projectPath.startsWith('/') || /^[A-Za-z]:[/\\]/.test(projectPath);
  if (!isAbsolute) {
    return `Invalid project_path: "${projectPath}" -- must be an absolute path (e.g., /home/user/project or C:\\Users\\user\\project).`;
  }

  // Must not point to system directories
  if (validator.isBlocked(projectPath)) {
    return `Invalid project_path: "${projectPath}" -- points to a protected system directory.`;
  }

  return null;
}

function validateInputSizes(args: Record<string, unknown>): string | null {
  // Build the fields map matching checkInputs API:
  //   Record<string, { value: string; config: InputLimitConfig }>
  const fields: Record<string, { value: string; config: InputLimitConfig }> = {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== 'string') continue;

    const limit = FIELD_LIMITS[key];
    if (!limit) continue;

    fields[key] = { value, config: limit };
  }

  if (Object.keys(fields).length === 0) return null;

  const result = checkInputs(fields);

  if (!result.valid) {
    const violations = Object.entries(result.results)
      .filter(([, r]) => !r.valid)
      .map(([name, r]) => `  - ${name}: ${r.originalLength} chars (max ${FIELD_LIMITS[name].maxLength})`)
      .join('\n');
    return `Input size limit exceeded:\n${violations}\n\nReduce the size of the flagged fields and retry.`;
  }

  return null;
}
