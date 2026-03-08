/**
 * Role Registry - Maps pipeline phases and personas to human professional equivalents.
 *
 * Each entry represents the human role that RC Engine replaces for that specific
 * pipeline step, with industry-standard time and salary benchmarks (2025 US market).
 *
 * Sources: Glassdoor, Levels.fyi, Bureau of Labor Statistics, consulting rate surveys.
 * Rates are blended averages across US metros, adjusted for contractor/consultant premiums.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type RoleCategory = 'research' | 'design' | 'engineering' | 'security' | 'management';

export interface RoleEquivalent {
  /** Human-readable role title. */
  roleTitle: string;
  /** Hourly rate in USD (contractor/consultant rate, not salaried). */
  hourlyRateUsd: number;
  /** Estimated hours a human would spend on this task for a typical project. */
  estimatedHours: number;
  /** Role category for grouping. */
  category: RoleCategory;
  /** What this role does, in plain language. */
  description: string;
}

export interface RoleSummary extends RoleEquivalent {
  /** The pipeline key (persona ID, phase name, or tool name). */
  pipelineKey: string;
  /** Computed: hourlyRateUsd * estimatedHours. */
  totalCostUsd: number;
}

// ── Pre-RC Persona Role Mappings ────────────────────────────────────────────

const PERSONA_ROLES: Record<string, RoleEquivalent> = {
  'meta-product-architect': {
    roleTitle: 'Product Strategy Consultant',
    hourlyRateUsd: 150,
    estimatedHours: 8,
    category: 'management',
    description: 'Frames the problem space and defines the strategic direction for the product.',
  },
  'research-program-director': {
    roleTitle: 'Research Program Manager',
    hourlyRateUsd: 125,
    estimatedHours: 4,
    category: 'management',
    description: 'Plans and coordinates the research program across all specialist areas.',
  },
  'token-economics-optimizer': {
    roleTitle: 'AI Operations Specialist',
    hourlyRateUsd: 0,
    estimatedHours: 0,
    category: 'engineering',
    description: 'Internal optimization - no direct human equivalent.',
  },
  'primary-user-researcher': {
    roleTitle: 'UX Researcher',
    hourlyRateUsd: 85,
    estimatedHours: 16,
    category: 'research',
    description: 'Studies primary user personas, pain points, and behavioral patterns.',
  },
  'secondary-user-analyst': {
    roleTitle: 'Senior UX Researcher',
    hourlyRateUsd: 95,
    estimatedHours: 12,
    category: 'research',
    description: 'Analyzes edge cases, minority users, and accessibility requirements.',
  },
  'demand-side-theorist': {
    roleTitle: 'Market Research Analyst',
    hourlyRateUsd: 90,
    estimatedHours: 12,
    category: 'research',
    description: 'Analyzes market demand, willingness to pay, and competitive positioning.',
  },
  'accessibility-advocate': {
    roleTitle: 'Accessibility Consultant',
    hourlyRateUsd: 100,
    estimatedHours: 8,
    category: 'design',
    description: 'Ensures the product is usable by people with disabilities (WCAG compliance).',
  },
  'market-landscape-analyst': {
    roleTitle: 'Competitive Intelligence Analyst',
    hourlyRateUsd: 85,
    estimatedHours: 16,
    category: 'research',
    description: 'Maps the competitive landscape, pricing models, and market gaps.',
  },
  'business-model-strategist': {
    roleTitle: 'Business Strategy Consultant',
    hourlyRateUsd: 150,
    estimatedHours: 12,
    category: 'management',
    description: 'Designs the revenue model, pricing strategy, and unit economics.',
  },
  'go-to-market-strategist': {
    roleTitle: 'GTM Marketing Manager',
    hourlyRateUsd: 100,
    estimatedHours: 12,
    category: 'management',
    description: 'Plans launch strategy, distribution channels, and growth tactics.',
  },
  'systems-architect': {
    roleTitle: 'Senior Software Architect',
    hourlyRateUsd: 175,
    estimatedHours: 24,
    category: 'engineering',
    description: 'Designs the technical architecture, system boundaries, and integration patterns.',
  },
  'ai-ml-specialist': {
    roleTitle: 'ML Engineer',
    hourlyRateUsd: 165,
    estimatedHours: 16,
    category: 'engineering',
    description: 'Evaluates AI/ML requirements, model selection, and data pipeline design.',
  },
  'data-strategist': {
    roleTitle: 'Data Analyst',
    hourlyRateUsd: 95,
    estimatedHours: 12,
    category: 'research',
    description: 'Designs data collection, analytics strategy, and success metrics.',
  },
  'security-analyst': {
    roleTitle: 'Security Consultant',
    hourlyRateUsd: 140,
    estimatedHours: 16,
    category: 'security',
    description: 'Identifies security risks, compliance requirements, and threat modeling.',
  },
  'ux-systems-designer': {
    roleTitle: 'Senior UX/UI Designer',
    hourlyRateUsd: 110,
    estimatedHours: 24,
    category: 'design',
    description: 'Designs the interface architecture, component systems, and interaction patterns.',
  },
  'cognitive-load-analyst': {
    roleTitle: 'UX Psychologist',
    hourlyRateUsd: 120,
    estimatedHours: 8,
    category: 'design',
    description: 'Analyzes cognitive load, information architecture, and user mental models.',
  },
  'content-strategist': {
    roleTitle: 'Content Strategist',
    hourlyRateUsd: 85,
    estimatedHours: 8,
    category: 'design',
    description: 'Plans content structure, messaging, and communication tone.',
  },
  'coverage-auditor': {
    roleTitle: 'QA Lead (Review)',
    hourlyRateUsd: 100,
    estimatedHours: 4,
    category: 'management',
    description: 'Audits research coverage and identifies blind spots.',
  },
  'research-synthesizer': {
    roleTitle: 'Senior Analyst (Synthesis)',
    hourlyRateUsd: 125,
    estimatedHours: 8,
    category: 'research',
    description: 'Synthesizes findings from all research streams into a coherent narrative.',
  },
  'prd-translator': {
    roleTitle: 'Technical Writer',
    hourlyRateUsd: 80,
    estimatedHours: 8,
    category: 'management',
    description: 'Translates research findings into a formal requirements document.',
  },
};

// ── RC Phase Role Mappings ──────────────────────────────────────────────────

const PHASE_ROLES: Record<string, RoleEquivalent> = {
  illuminate: {
    roleTitle: 'Product Discovery Lead',
    hourlyRateUsd: 135,
    estimatedHours: 8,
    category: 'management',
    description: 'Leads discovery sessions to deeply understand the problem space.',
  },
  define: {
    roleTitle: 'Product Manager',
    hourlyRateUsd: 125,
    estimatedHours: 24,
    category: 'management',
    description: 'Writes the product requirements document with user stories and acceptance criteria.',
  },
  architect: {
    roleTitle: 'Senior Software Architect',
    hourlyRateUsd: 175,
    estimatedHours: 40,
    category: 'engineering',
    description: 'Designs the technical architecture, data model, API contracts, and infrastructure.',
  },
  sequence: {
    roleTitle: 'Engineering Manager',
    hourlyRateUsd: 145,
    estimatedHours: 16,
    category: 'management',
    description: 'Creates the build plan with task dependencies, effort estimates, and sprint allocation.',
  },
  validate: {
    roleTitle: 'QA Lead + Tech Lead',
    hourlyRateUsd: 130,
    estimatedHours: 16,
    category: 'engineering',
    description: 'Reviews architecture and requirements for anti-patterns, scope drift, and quality.',
  },
  forge: {
    roleTitle: 'Software Developer',
    hourlyRateUsd: 125,
    estimatedHours: 4,
    category: 'engineering',
    description: 'Implements one feature/component with tests and documentation.',
  },
  connect: {
    roleTitle: 'Integration Engineer',
    hourlyRateUsd: 135,
    estimatedHours: 8,
    category: 'engineering',
    description: 'Connects components, resolves integration issues, and verifies end-to-end flows.',
  },
  compound: {
    roleTitle: 'Engineering Manager (Final Review)',
    hourlyRateUsd: 145,
    estimatedHours: 8,
    category: 'management',
    description: 'Final quality review ensuring all components work together as a system.',
  },
};

// ── Post-RC Role Mappings ───────────────────────────────────────────────────

const POSTRC_ROLES: Record<string, RoleEquivalent> = {
  'security-scan': {
    roleTitle: 'Security Engineer / Pen Tester',
    hourlyRateUsd: 160,
    estimatedHours: 40,
    category: 'security',
    description: 'Performs security audit, vulnerability scanning, and penetration testing.',
  },
  'monitoring-check': {
    roleTitle: 'DevOps / SRE',
    hourlyRateUsd: 140,
    estimatedHours: 8,
    category: 'engineering',
    description: 'Sets up monitoring, alerting, and observability infrastructure.',
  },
  traceability: {
    roleTitle: 'QA / Compliance Analyst',
    hourlyRateUsd: 100,
    estimatedHours: 16,
    category: 'management',
    description: 'Traces requirements to implementation and creates coverage reports.',
  },
};

// ── Registry ────────────────────────────────────────────────────────────────

export class RoleRegistry {
  /** Get role equivalent for a Pre-RC persona by its ID. */
  getPersonaRole(personaId: string): RoleEquivalent | null {
    // Normalize: persona names use various formats
    const normalized = personaId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return PERSONA_ROLES[normalized] ?? null;
  }

  /** Get role equivalent for an RC Method phase. */
  getPhaseRole(phaseName: string): RoleEquivalent | null {
    return PHASE_ROLES[phaseName.toLowerCase()] ?? null;
  }

  /** Get role equivalent for a Post-RC tool. */
  getPostRcRole(toolKey: string): RoleEquivalent | null {
    return POSTRC_ROLES[toolKey.toLowerCase()] ?? null;
  }

  /** Get all persona roles (for team display). */
  getAllPersonaRoles(): Array<{ personaId: string; role: RoleEquivalent }> {
    return Object.entries(PERSONA_ROLES)
      .filter(([, role]) => role.estimatedHours > 0)
      .map(([id, role]) => ({ personaId: id, role }));
  }

  /** Get all phase roles. */
  getAllPhaseRoles(): Array<{ phase: string; role: RoleEquivalent }> {
    return Object.entries(PHASE_ROLES).map(([phase, role]) => ({ phase, role }));
  }

  /** Get all Post-RC roles. */
  getAllPostRcRoles(): Array<{ tool: string; role: RoleEquivalent }> {
    return Object.entries(POSTRC_ROLES).map(([tool, role]) => ({ tool, role }));
  }

  /** Calculate total if all roles were activated. */
  getMaximumValue(): { totalHours: number; totalCostUsd: number; roleCount: number } {
    let totalHours = 0;
    let totalCostUsd = 0;
    let roleCount = 0;

    for (const role of Object.values(PERSONA_ROLES)) {
      if (role.estimatedHours > 0) {
        totalHours += role.estimatedHours;
        totalCostUsd += role.hourlyRateUsd * role.estimatedHours;
        roleCount++;
      }
    }
    for (const role of Object.values(PHASE_ROLES)) {
      totalHours += role.estimatedHours;
      totalCostUsd += role.hourlyRateUsd * role.estimatedHours;
      roleCount++;
    }
    for (const role of Object.values(POSTRC_ROLES)) {
      totalHours += role.estimatedHours;
      totalCostUsd += role.hourlyRateUsd * role.estimatedHours;
      roleCount++;
    }

    return { totalHours, totalCostUsd, roleCount };
  }
}

/** Singleton. */
let _registry: RoleRegistry | null = null;

export function getRoleRegistry(): RoleRegistry {
  if (!_registry) {
    _registry = new RoleRegistry();
  }
  return _registry;
}
