/**
 * Tool Guard - Shared validation middleware for all MCP tool handlers.
 *
 * Validates:
 *   1. project_path is safe (canonicalized, no traversal, no system paths)
 *   2. String inputs are within size limits
 *
 * Wired in src/index.ts by patching both server.tool() and server.registerTool()
 * - all tools get validation automatically without modifying individual handlers.
 */

import { PathValidator } from '../core/sandbox/path-validator.js';
import { checkInputs, DEFAULT_LIMITS } from '../core/sandbox/input-limits.js';
import type { InputLimitConfig } from '../core/sandbox/input-limits.js';
import { recordToolCall } from './usage-meter.js';

// Shared PathValidator instance - root "/" means basic safety checks only.
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
 * Wrap a tool handler with path validation and input size checks.
 *
 * - If `project_path` exists in args, validates it is a safe absolute path.
 * - Validates all known string fields against size limits.
 * - Returns an error result instead of throwing on validation failure.
 */
export function guardedTool(handler: ToolHandler): ToolHandler {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    // 1. Validate project_path if present
    const projectPath = args.project_path;
    if (typeof projectPath === 'string') {
      const pathResult = validatePath(projectPath);
      if (pathResult) {
        return { content: [{ type: 'text', text: pathResult }], isError: true };
      }
    }

    // 2. Validate input sizes
    const sizeErrors = validateInputSizes(args);
    if (sizeErrors) {
      return { content: [{ type: 'text', text: sizeErrors }], isError: true };
    }

    // 3. Record tool call for usage metering
    const pid = typeof projectPath === 'string' ? projectPath : '';
    recordToolCall('operator', pid);

    // 4. Delegate to actual handler
    return handler(args);
  };
}

function validatePath(projectPath: string): string | null {
  // Must be an absolute path: POSIX (/...) or Windows drive-letter (C:/... or C:\...)
  const isPosixAbsolute = projectPath.startsWith('/');
  const isWindowsAbsolute = /^[a-zA-Z]:[\\/]/.test(projectPath);
  if (!isPosixAbsolute && !isWindowsAbsolute) {
    return `Invalid project_path: "${projectPath}" - must be an absolute path (POSIX /... or Windows C:/... / C:\\...).`;
  }

  // Must not point to system directories
  if (validator.isBlocked(projectPath)) {
    return `Invalid project_path: "${projectPath}" - points to a protected system directory.`;
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
