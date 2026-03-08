import { z } from 'zod';

// ── Design Option Schema ──────────────────────────────────────────────────

export const DesignStyleSchema = z.object({
  name: z.string().describe('Style name, e.g. "Minimal Modern", "Bold Enterprise"'),
  colorPalette: z.object({
    primary: z.string().describe('Primary brand color hex'),
    secondary: z.string().describe('Secondary accent color hex'),
    background: z.string().describe('Background color hex'),
    surface: z.string().describe('Card/surface color hex'),
    text: z.string().describe('Primary text color hex'),
    muted: z.string().describe('Muted/secondary text color hex'),
    semantic: z.object({
      success: z.string().describe('Success/positive state color hex'),
      warning: z.string().describe('Warning/caution state color hex'),
      error: z.string().describe('Error/danger state color hex'),
      info: z.string().describe('Info/neutral state color hex'),
    }).optional().describe('Semantic state colors — auto-generated if not provided by intake'),
  }),
  typography: z.object({
    headingFont: z.string().describe('Heading font family'),
    bodyFont: z.string().describe('Body font family'),
    scale: z.enum(['compact', 'standard', 'spacious']).describe('Type scale density'),
  }),
  layout: z.object({
    maxWidth: z.string().describe('Max container width, e.g. "1200px"'),
    spacing: z.enum(['tight', 'comfortable', 'airy']).describe('Whitespace strategy'),
    borderRadius: z.enum(['none', 'subtle', 'rounded', 'pill']).describe('Corner style'),
  }),
  personality: z.string().describe('1-sentence description of the visual personality'),
});

export const DesignOptionSchema = z.object({
  id: z.string().describe('Option identifier: "A", "B", or "C"'),
  name: z.string().describe('Descriptive option name'),
  style: DesignStyleSchema,
  rationale: z.string().describe('Why this option fits the target users and product'),
  icpAlignment: z.number().min(0).max(100).describe('ICP alignment score 0-100'),
  keyScreens: z.array(
    z.object({
      name: z.string().describe('Screen name, e.g. "Dashboard", "Onboarding"'),
      description: z.string().describe('What this screen shows and key interactions'),
    }),
  ),
  tradeoffs: z.object({
    strengths: z.array(z.string()).describe('What this option does well'),
    weaknesses: z.array(z.string()).describe('Where this option compromises'),
  }),
});

export const DesignSpecSchema = z.object({
  projectName: z.string(),
  icpSummary: z.string().describe('Summary of ideal customer profile used for design decisions'),
  competitorGaps: z.array(z.string()).describe('Design gaps identified in competitor analysis'),
  designTrends: z.array(z.string()).describe('Relevant design trends applied'),
  options: z.array(DesignOptionSchema).min(1).max(3),
  recommendation: z.object({
    optionId: z.string().describe('Recommended option ID'),
    reason: z.string().describe('Why this option is recommended for the ICP'),
  }),
});

// ── TypeScript Types ──────────────────────────────────────────────────────

export type DesignStyle = z.infer<typeof DesignStyleSchema>;
export type DesignOption = z.infer<typeof DesignOptionSchema>;
export type DesignSpec = z.infer<typeof DesignSpecSchema>;

// ── Design Generation Input ───────────────────────────────────────────────

export interface DesignInput {
  projectPath: string;
  optionCount: 1 | 3;
  inspiration?: string; // User-provided design references or preferences
  prdContext: string; // PRD content for product understanding
  icpData?: string; // ICP/persona data from Pre-RC research
  competitorData?: string; // Competitor analysis from Pre-RC research
  brandProfilePath?: string; // Path to BrandProfile JSON (constrains colors/typography/shape)
  copySystemPath?: string; // Path to CopySystem JSON (real copy instead of placeholders)
  designIntakePath?: string; // Path to DesignIntakeAssessment (user preferences + constraints)
  fontEmbedHtml?: string; // Pre-generated <link> tags for Google Fonts (from FontService)
}

// ── Design Iteration Input ───────────────────────────────────────────────

export interface DesignIterateInput {
  projectPath: string;
  feedback: string; // User feedback on the current design
  targetScreens?: string[]; // Specific screens to revise (all if omitted)
  targetOptionId?: string; // Specific option to revise (selected option if omitted)
}

// ── Design Generation Result ──────────────────────────────────────────────

export interface DesignResult {
  spec: DesignSpec;
  wireframes: DesignWireframe[];
  estimatedCost: number; // Estimated USD for the LLM calls
}

export interface DesignWireframe {
  optionId: string;
  screenName: string;
  lofiHtml: string; // Self-contained HTML for lo-fi wireframe
  hifiHtml: string; // Self-contained HTML for hi-fi wireframe
}

// ── Cost Estimation ───────────────────────────────────────────────────────

export function estimateDesignCost(optionCount: 1 | 3): {
  calls: number;
  estimatedTokens: number;
  estimatedUsd: number;
} {
  // Each option: 1 spec call (~4K tokens) + 1 wireframe call (~8K tokens)
  // Plus 1 overall recommendation call (~2K tokens)
  const callsPerOption = 2;
  const tokensPerOption = 12000;
  const overheadTokens = 2000;

  const calls = optionCount * callsPerOption + 1;
  const estimatedTokens = optionCount * tokensPerOption + overheadTokens;
  // Rough Claude pricing: ~$0.003 per 1K input + $0.015 per 1K output
  const estimatedUsd = (estimatedTokens / 1000) * 0.015;

  return { calls, estimatedTokens, estimatedUsd };
}
