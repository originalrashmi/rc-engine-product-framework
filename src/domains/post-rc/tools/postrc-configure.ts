import type { z } from 'zod';
import type { PostRCConfigureInputSchema } from '../types.js';
import { loadState, saveState, ensureDirectories, createDefaultState } from '../state/state-manager.js';
import { audit } from '../../../shared/audit.js';

type ConfigureInput = z.infer<typeof PostRCConfigureInputSchema>;

export async function postrcConfigure(args: ConfigureInput): Promise<string> {
  const {
    project_path,
    project_name,
    modules,
    block_on_critical,
    block_on_high,
    suppressed_cwes,
    require_error_tracking,
    require_analytics,
    legal_enabled,
    legal_claims_audit,
    legal_product_audit,
    product_domain,
    jurisdiction,
    check_licenses,
    check_accessibility,
    edge_case_enabled,
    edge_case_block_on_critical,
    edge_case_categories,
  } = args;

  await ensureDirectories(project_path);
  let state = await loadState(project_path);

  // If no state exists, create default
  if (!state.projectPath) {
    state = createDefaultState(project_path, project_name || 'Unnamed Project');
  }

  // Apply updates
  if (project_name !== undefined) state.projectName = project_name;
  if (modules !== undefined) state.config.activeModules = modules;
  if (block_on_critical !== undefined) state.config.securityPolicy.blockOnCritical = block_on_critical;
  if (block_on_high !== undefined) state.config.securityPolicy.blockOnHigh = block_on_high;
  if (suppressed_cwes !== undefined) state.config.securityPolicy.suppressedCWEs = suppressed_cwes;
  if (require_error_tracking !== undefined) state.config.monitoringPolicy.requireErrorTracking = require_error_tracking;
  if (require_analytics !== undefined) state.config.monitoringPolicy.requireAnalytics = require_analytics;

  // Legal policy updates (initialize if missing for backward compat)
  if (
    legal_enabled !== undefined ||
    legal_claims_audit !== undefined ||
    legal_product_audit !== undefined ||
    product_domain !== undefined ||
    jurisdiction !== undefined ||
    check_licenses !== undefined ||
    check_accessibility !== undefined
  ) {
    if (!state.config.legalPolicy) {
      state.config.legalPolicy = {
        enabled: false,
        claimsAuditEnabled: false,
        productLegalEnabled: true,
        productDomain: 'general',
        jurisdiction: 'both',
        suppressedFindings: [],
        checkLicenses: true,
        checkAccessibility: true,
      };
    }
    if (legal_enabled !== undefined) state.config.legalPolicy.enabled = legal_enabled;
    if (legal_claims_audit !== undefined) state.config.legalPolicy.claimsAuditEnabled = legal_claims_audit;
    if (legal_product_audit !== undefined) state.config.legalPolicy.productLegalEnabled = legal_product_audit;
    if (product_domain !== undefined) state.config.legalPolicy.productDomain = product_domain;
    if (jurisdiction !== undefined) state.config.legalPolicy.jurisdiction = jurisdiction;
    if (check_licenses !== undefined) state.config.legalPolicy.checkLicenses = check_licenses;
    if (check_accessibility !== undefined) state.config.legalPolicy.checkAccessibility = check_accessibility;
  }

  // Edge case policy updates (initialize if missing for backward compat)
  if (
    edge_case_enabled !== undefined ||
    edge_case_block_on_critical !== undefined ||
    edge_case_categories !== undefined
  ) {
    if (!state.config.edgeCasePolicy) {
      state.config.edgeCasePolicy = {
        enabled: false,
        suppressedFindings: [],
        blockOnCritical: false,
      };
    }
    if (edge_case_enabled !== undefined) state.config.edgeCasePolicy.enabled = edge_case_enabled;
    if (edge_case_block_on_critical !== undefined)
      state.config.edgeCasePolicy.blockOnCritical = edge_case_block_on_critical;
    if (edge_case_categories !== undefined) state.config.edgeCasePolicy.categories = edge_case_categories;
  }

  state.updatedAt = new Date().toISOString();
  await saveState(project_path, state);
  audit('config.change', 'post-rc', project_path, {
    modules: state.config.activeModules,
    blockOnCritical: state.config.securityPolicy.blockOnCritical,
  });

  return `
===============================================
  POST-RC METHOD: CONFIGURATION UPDATED
===============================================

  Project: ${state.projectName}
  Path: ${state.projectPath}

  ACTIVE MODULES:
    ${state.config.activeModules.map((m) => `Y  ${m}`).join('\n    ')}

  SECURITY POLICY:
    Enabled:           ${state.config.securityPolicy.enabled}
    Block on Critical: ${state.config.securityPolicy.blockOnCritical}
    Block on High:     ${state.config.securityPolicy.blockOnHigh}
    Suppressed CWEs:   ${state.config.securityPolicy.suppressedCWEs.length > 0 ? state.config.securityPolicy.suppressedCWEs.join(', ') : 'None'}

  MONITORING POLICY:
    Enabled:               ${state.config.monitoringPolicy.enabled}
    Require Error Tracking: ${state.config.monitoringPolicy.requireErrorTracking}
    Require Analytics:      ${state.config.monitoringPolicy.requireAnalytics}
    Require Dashboards:     ${state.config.monitoringPolicy.requireDashboards}
    Require Alerts:         ${state.config.monitoringPolicy.requireAlerts}

  LEGAL POLICY (Pro):
    Enabled:              ${state.config.legalPolicy?.enabled ?? false}
    Claims Audit:         ${state.config.legalPolicy?.claimsAuditEnabled ?? false}
    Product Legal Review: ${state.config.legalPolicy?.productLegalEnabled ?? false}
    Product Domain:       ${state.config.legalPolicy?.productDomain ?? 'general'}
    Jurisdiction:         ${state.config.legalPolicy?.jurisdiction ?? 'both'}
    Check Licenses:       ${state.config.legalPolicy?.checkLicenses ?? true}
    Check Accessibility:  ${state.config.legalPolicy?.checkAccessibility ?? true}

  EDGE CASE POLICY (Pro):
    Enabled:          ${state.config.edgeCasePolicy?.enabled ?? false}
    Block Critical:   ${state.config.edgeCasePolicy?.blockOnCritical ?? false}
    Categories:       ${state.config.edgeCasePolicy?.categories?.join(', ') || 'All'}

  State saved to: post-rc/state/POSTRC-STATE.md
===============================================`;
}
