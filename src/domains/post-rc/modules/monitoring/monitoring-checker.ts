import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Finding, MonitoringPolicy } from '../../types.js';
import { ValidationModule, Severity } from '../../types.js';

/**
 * Monitoring Readiness module: Validates that observability instrumentation
 * is specified and in place before shipping.
 *
 * Checks against PRD Section 6a (Observability Requirements) and
 * task list [OBSERVABILITY] tasks.
 */
export async function runMonitoringModule(
  projectPath: string,
  codeContext: string | undefined,
  policy: MonitoringPolicy,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  let findingCount = 0;

  const nextId = () => `MON-${String(++findingCount).padStart(3, '0')}`;

  // Load PRD to check for Section 6a
  const prdContent = await loadPrdContent(projectPath);
  const taskContent = await loadTaskContent(projectPath);
  const allContent = [prdContent, taskContent, codeContext].filter(Boolean).join('\n');

  // -------------------------------------------------------
  // Check 1: PRD has observability requirements (Section 6a)
  // -------------------------------------------------------
  if (!prdContent) {
    findings.push({
      id: nextId(),
      module: ValidationModule.Monitoring,
      severity: Severity.High,
      title: 'No PRD found - cannot verify observability spec',
      description:
        'No PRD files found in rc-method/prds/. Cannot verify Section 6a (Observability Requirements) exists.',
      remediation: 'Ensure the RC Method Define phase has been completed and PRD is saved.',
      category: 'monitoring-spec',
    });
  } else {
    const hasObservabilitySection = /observability|6a\.\s*observability/i.test(prdContent);
    if (!hasObservabilitySection) {
      findings.push({
        id: nextId(),
        module: ValidationModule.Monitoring,
        severity: Severity.High,
        title: 'PRD missing Observability Requirements (Section 6a)',
        description:
          'The PRD does not contain an Observability Requirements section. The product will ship without defined monitoring standards.',
        remediation:
          'Add Section 6a to the PRD specifying error tracking, analytics, SLOs, and dashboard requirements.',
        category: 'monitoring-spec',
      });
    }
  }

  // -------------------------------------------------------
  // Check 2: Error tracking tool specified
  // -------------------------------------------------------
  if (policy.requireErrorTracking) {
    const hasErrorTracking = /sentry|datadog|bugsnag|rollbar|error.?track/i.test(allContent);
    if (!hasErrorTracking) {
      findings.push({
        id: nextId(),
        module: ValidationModule.Monitoring,
        severity: Severity.Critical,
        title: 'No error tracking tool specified',
        description:
          'No error tracking tool (Sentry, Datadog, etc.) is referenced in the PRD, tasks, or code. Production errors will be invisible.',
        remediation: 'Add error tracking to PRD Section 6a and create an [OBSERVABILITY] task for SDK integration.',
        category: 'error-tracking',
      });
    }
  }

  // -------------------------------------------------------
  // Check 3: Analytics/behavior tracking
  // -------------------------------------------------------
  if (policy.requireAnalytics) {
    const hasAnalytics = /posthog|hotjar|fullstory|amplitude|mixpanel|analytics|session.?record|heatmap/i.test(
      allContent,
    );
    if (!hasAnalytics) {
      findings.push({
        id: nextId(),
        module: ValidationModule.Monitoring,
        severity: Severity.Medium,
        title: 'No user behavior analytics specified',
        description:
          'No analytics or behavior tracking tool (PostHog, Hotjar, FullStory, etc.) is referenced. User behavior will be unobservable post-launch.',
        remediation:
          'Add analytics requirements to PRD Section 6a. Consider PostHog (product analytics) or Hotjar (session recordings).',
        category: 'analytics',
      });
    }
  }

  // -------------------------------------------------------
  // Check 4: [OBSERVABILITY] tasks exist
  // -------------------------------------------------------
  if (taskContent) {
    const hasObservabilityTasks = /\[OBSERVABILITY\]/i.test(taskContent);
    if (!hasObservabilityTasks) {
      findings.push({
        id: nextId(),
        module: ValidationModule.Monitoring,
        severity: Severity.High,
        title: 'No [OBSERVABILITY] tasks in task list',
        description:
          'The task list contains no [OBSERVABILITY] type tasks. Monitoring instrumentation has not been planned as build work.',
        remediation:
          'Add [OBSERVABILITY] tasks for error tracking SDK, analytics events, dashboard creation, and alert configuration.',
        category: 'task-coverage',
      });
    }

    // Check API endpoints have corresponding monitoring
    const apiTaskMatches = taskContent.match(/\[API\]/gi) || [];
    const obsTaskMatches = taskContent.match(/\[OBSERVABILITY\]/gi) || [];

    if (apiTaskMatches.length > 0 && obsTaskMatches.length === 0) {
      findings.push({
        id: nextId(),
        module: ValidationModule.Monitoring,
        severity: Severity.High,
        title: `${apiTaskMatches.length} API tasks with no observability tasks`,
        description: `Found ${apiTaskMatches.length} [API] tasks but zero [OBSERVABILITY] tasks. API endpoints will ship without error tracking or monitoring.`,
        remediation:
          'Add at least one [OBSERVABILITY] task per critical API endpoint for error tracking and structured logging.',
        category: 'task-coverage',
      });
    }
  }

  // -------------------------------------------------------
  // Check 5: Dashboard requirements
  // -------------------------------------------------------
  if (policy.requireDashboards) {
    const hasDashboard = /dashboard|grafana|datadog.?dashboard|monitoring.?ui/i.test(allContent);
    if (!hasDashboard) {
      findings.push({
        id: nextId(),
        module: ValidationModule.Monitoring,
        severity: Severity.Medium,
        title: 'No monitoring dashboard planned',
        description:
          'No dashboard creation is referenced in PRD, tasks, or code. Ops team will have no visibility into production health.',
        remediation:
          'Add a dashboard creation [OBSERVABILITY] task covering error rates, latency, and key business metrics.',
        category: 'dashboards',
      });
    }
  }

  // -------------------------------------------------------
  // Check 6: Alert configuration
  // -------------------------------------------------------
  if (policy.requireAlerts) {
    const hasAlerts = /alert|pagerduty|opsgenie|slack.?alert|webhook.?alert|notification.?threshold/i.test(allContent);
    if (!hasAlerts) {
      findings.push({
        id: nextId(),
        module: ValidationModule.Monitoring,
        severity: Severity.High,
        title: 'No alerting configuration planned',
        description:
          'No alert rules or escalation paths are defined. Production incidents will be discovered by users, not ops.',
        remediation:
          'Add alert configuration to PRD Section 6a. Define Critical (page) and Warning (notify) thresholds.',
        category: 'alerts',
      });
    }
  }

  // -------------------------------------------------------
  // Check 7: SLO targets
  // -------------------------------------------------------
  const hasSLOs = /slo|service.?level|availability.*%|latency.*p\d{2}|error.*rate.*%|uptime/i.test(allContent);
  if (!hasSLOs) {
    findings.push({
      id: nextId(),
      module: ValidationModule.Monitoring,
      severity: Severity.Medium,
      title: 'No SLO targets defined',
      description:
        'No Service Level Objectives (availability, latency, error rate) are defined. Cannot measure production health objectively.',
      remediation:
        'Define SLO targets in PRD Section 6a: availability (e.g., 99.9%), latency P95 (e.g., <500ms), error rate (e.g., <1%).',
      category: 'slos',
    });
  }

  return findings;
}

async function loadPrdContent(projectPath: string): Promise<string | null> {
  const prdsDir = join(projectPath, 'rc-method', 'prds');
  if (!existsSync(prdsDir)) return null;

  try {
    const { readdir } = await import('fs/promises');
    const files = await readdir(prdsDir);
    const prdFiles = files.filter((f) => f.startsWith('PRD-') && f.endsWith('.md'));

    if (prdFiles.length === 0) return null;

    const contents: string[] = [];
    for (const file of prdFiles) {
      const content = await readFile(join(prdsDir, file), 'utf-8');
      contents.push(content);
    }
    return contents.join('\n\n');
  } catch {
    return null;
  }
}

async function loadTaskContent(projectPath: string): Promise<string | null> {
  const tasksDir = join(projectPath, 'rc-method', 'tasks');
  if (!existsSync(tasksDir)) return null;

  try {
    const { readdir } = await import('fs/promises');
    const files = await readdir(tasksDir);
    const taskFiles = files.filter((f) => f.startsWith('TASKS-') && f.endsWith('.md'));

    if (taskFiles.length === 0) return null;

    const contents: string[] = [];
    for (const file of taskFiles) {
      const content = await readFile(join(tasksDir, file), 'utf-8');
      contents.push(content);
    }
    return contents.join('\n\n');
  } catch {
    return null;
  }
}
