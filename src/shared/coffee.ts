/**
 * Coffee Theme - Fun status lines shown during pipeline execution.
 *
 * Each tool prefixes its output with a coffee-themed line to add
 * personality to the pipeline. These are appended to tool output,
 * not logged to console.
 */

const COFFEE_LINES: Record<string, string> = {
  // Entry
  rc_init: 'Grinding the beans...',

  // Pre-RC Research
  prc_start: 'Warming up the espresso machine...',
  prc_classify: 'Checking if this is a single shot or a double...',
  'prc_run_stage:stage-1-meta': 'First pour: getting the blend right...',
  'prc_run_stage:stage-2-user-intelligence': "Second pour: who's drinking this?",
  'prc_run_stage:stage-3-business-market': "Third pour: what's already on the menu...",
  'prc_run_stage:stage-4-technical': 'Fourth pour: picking the right roast...',
  'prc_run_stage:stage-5-ux-cognitive': 'Fifth pour: making sure it tastes good...',
  'prc_run_stage:stage-6-validation': 'Sixth pour: quality control before serving...',
  prc_synthesize: 'Blending all six pours into one smooth cup...',
  prc_stress_test: 'Taste test by the harshest critic in the room...',
  prc_gate: 'Barista checkpoint: does this order look right?',
  prc_status: 'Reading the receipt...',

  // RC Method Build
  rc_start: 'Setting up the brew station...',
  rc_import_prerc: 'Transferring the recipe to the brew station...',
  rc_illuminate: 'Measuring the grounds...',
  rc_define: 'Writing the recipe card...',
  rc_architect: 'Choosing the equipment...',
  rc_sequence: 'Lining up the brew steps...',
  rc_validate: 'Checking the recipe before we brew...',
  rc_forge_task: 'Brewing task by task...',
  rc_forge_all: 'Full pot mode: brewing everything at once...',
  rc_connect: 'Making sure all the flavors work together...',
  rc_compound: 'Final quality check before it leaves the counter...',
  rc_autopilot: "Auto-drip mode: sit back, coffee's brewing itself...",
  rc_gate: 'Barista checkpoint: approve to continue?',
  rc_status: 'Reading the order ticket...',
  rc_save: 'Saving the recipe...',
  rc_reset: 'Dumping the pot. Starting fresh.',

  // UX + Design
  ux_score: 'Scoring the presentation...',
  ux_audit: 'Checking the cup for chips...',
  ux_generate: 'Designing the cup sleeve...',
  ux_design: 'Sketching the latte art...',
  design_challenge: 'The coffee snob has opinions...',
  design_research_brief: 'Studying the latte art trends...',
  design_intake: 'What kind of cup do you want this in?',
  brand_import: 'Bringing your own mug...',
  design_iterate: 'Adjusting the foam...',
  design_select: 'Locking in the art...',
  design_pipeline: 'Running the full latte art workflow...',

  // Copy
  copy_research_brief: 'Finding the right words for the menu board...',
  copy_generate: 'Writing the menu...',
  copy_iterate: 'Tweaking the menu copy...',
  copy_critique: 'Proofreading the menu board...',

  // Export
  playbook_generate: 'Printing the recipe book...',
  pdf_export: 'Laminating the menu...',
  rc_generate_diagrams: 'Drawing the floor plan of the coffee shop...',

  // Post-RC
  postrc_scan: "Checking for anything that shouldn't be in the cup...",
  postrc_configure: 'Setting the quality standards...',
  postrc_override: 'Barista override: noted in the log...',
  postrc_report: 'Writing up the inspection report...',
  postrc_gate: 'Last sip before it goes to the customer...',
  postrc_status: 'Checking the inspection board...',
  postrc_generate_observability_spec: 'Installing the temperature sensors...',

  // Traceability
  trace_enhance_prd: 'Labeling every bean back to the farm...',
  trace_map_findings: 'Making sure every order was filled...',
  trace_status: 'Checking the order board...',

  // Pipeline
  rc_pipeline_status: 'Reading the full receipt...',
};

/**
 * Get the coffee-themed line for a tool.
 * For prc_run_stage, pass the stage name as suffix: getCoffeeLine('prc_run_stage', 'stage-1-meta')
 */
export function getCoffeeLine(toolName: string, stageName?: string): string {
  if (stageName) {
    const key = `${toolName}:${stageName}`;
    if (COFFEE_LINES[key]) return COFFEE_LINES[key];
  }
  return COFFEE_LINES[toolName] ?? '';
}

/** Format a coffee line as a prefix for tool output */
export function coffePrefix(toolName: string, stageName?: string): string {
  const line = getCoffeeLine(toolName, stageName);
  return line ? `*${line}*\n\n` : '';
}
