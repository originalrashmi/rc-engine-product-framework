/**
 * Thin ValueCalculator wrapper for human-equivalent value reports.
 *
 * Quantifies roles replaced, hours saved, cost savings, and speed multiplier.
 */

import { ValueCalculator } from '../core/value/calculator.js';
import type { ValueInput, ValueReport } from '../core/value/calculator.js';

let _calc: ValueCalculator | null = null;

function getCalculator(): ValueCalculator {
  if (!_calc) {
    _calc = new ValueCalculator();
  }
  return _calc;
}

/** Calculate the value report for a pipeline run. Returns null on error. */
export function calculateValue(input: ValueInput): ValueReport | null {
  try {
    return getCalculator().calculate(input);
  } catch {
    return null;
  }
}

/** Format the value report as plain text. Returns '' on error. */
export function formatValueSummary(report: ValueReport): string {
  try {
    return getCalculator().formatSummary(report);
  } catch {
    return '';
  }
}
