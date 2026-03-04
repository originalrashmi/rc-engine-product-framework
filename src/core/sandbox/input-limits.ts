/**
 * Input Limits -- Prevents unbounded inputs from reaching LLM calls or state.
 *
 * Every tool that accepts user text (brief, code_context, operator_inputs, etc.)
 * should validate input size before processing. This prevents:
 * - Memory exhaustion from oversized inputs
 * - Wasted API costs from inputs that exceed LLM context windows
 * - State file bloat from storing oversized artifacts
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface InputLimitConfig {
  /** Maximum string length in characters. */
  maxLength: number;
  /** Human-readable name for error messages. */
  fieldName: string;
}

export interface InputCheckResult {
  valid: boolean;
  /** The (possibly truncated) value. */
  value: string;
  /** True if the value was truncated. */
  truncated: boolean;
  /** Original length before truncation. */
  originalLength: number;
  /** Warning message if truncated. */
  warning?: string;
}

// ── Default Limits ──────────────────────────────────────────────────────────

/**
 * Default limits for common input fields.
 * These are based on typical LLM context windows and practical usage:
 * - Claude Sonnet: ~200K tokens (~800K chars)
 * - GPT-4o: ~128K tokens (~512K chars)
 * - Gemini Flash: ~1M tokens (~4M chars)
 *
 * We use conservative limits well below these to leave room for
 * system prompts, knowledge files, and output tokens.
 */
export const DEFAULT_LIMITS: Record<string, InputLimitConfig> = {
  /** Short text inputs (project name, brief descriptions). */
  brief: { maxLength: 10_000, fieldName: 'brief' },

  /** Medium text inputs (requirements, specifications). */
  requirements: { maxLength: 50_000, fieldName: 'requirements' },

  /** Code context inputs (source code for analysis). */
  codeContext: { maxLength: 100_000, fieldName: 'code_context' },

  /** Operator inputs (free-form user instructions). */
  operatorInputs: { maxLength: 20_000, fieldName: 'operator_inputs' },

  /** Feedback text (gate decisions, review comments). */
  feedback: { maxLength: 5_000, fieldName: 'feedback' },

  /** Generic string field with a generous default. */
  generic: { maxLength: 50_000, fieldName: 'input' },
};

// ── Checker ─────────────────────────────────────────────────────────────────

/**
 * Check an input string against a size limit.
 *
 * @param value - The input string to check.
 * @param config - The limit configuration (or a preset name from DEFAULT_LIMITS).
 * @param truncate - If true, truncate to the limit instead of rejecting. Default: false.
 * @returns The check result with optional truncation.
 */
export function checkInputSize(
  value: string,
  config: InputLimitConfig | keyof typeof DEFAULT_LIMITS,
  truncate = false,
): InputCheckResult {
  const limit = typeof config === 'string' ? DEFAULT_LIMITS[config] : config;

  if (!limit) {
    // Unknown preset -- use generic
    return checkInputSize(value, DEFAULT_LIMITS.generic, truncate);
  }

  if (value.length <= limit.maxLength) {
    return {
      valid: true,
      value,
      truncated: false,
      originalLength: value.length,
    };
  }

  if (truncate) {
    const truncatedValue = value.slice(0, limit.maxLength);
    return {
      valid: true,
      value: truncatedValue,
      truncated: true,
      originalLength: value.length,
      warning: `${limit.fieldName} was truncated from ${value.length} to ${limit.maxLength} characters (${Math.round((limit.maxLength / value.length) * 100)}% of original)`,
    };
  }

  return {
    valid: false,
    value,
    truncated: false,
    originalLength: value.length,
    warning: `${limit.fieldName} exceeds maximum length: ${value.length} characters (limit: ${limit.maxLength})`,
  };
}

/**
 * Validate multiple input fields at once.
 *
 * @param fields - Map of field name to { value, config } pairs.
 * @param truncate - If true, truncate oversized fields instead of rejecting.
 * @returns Map of field name to check results. Overall valid only if all fields are valid.
 */
export function checkInputs(
  fields: Record<string, { value: string; config: InputLimitConfig | keyof typeof DEFAULT_LIMITS }>,
  truncate = false,
): { valid: boolean; results: Record<string, InputCheckResult> } {
  const results: Record<string, InputCheckResult> = {};
  let allValid = true;

  for (const [name, { value, config }] of Object.entries(fields)) {
    results[name] = checkInputSize(value, config, truncate);
    if (!results[name].valid) allValid = false;
  }

  return { valid: allValid, results };
}
