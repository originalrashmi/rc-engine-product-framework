import { z } from 'zod';

// ── Brand Profile Schema ────────────────────────────────────────────────────

export const BrandLogoSchema = z
  .object({
    description: z.string().describe('Logo description for LLM context'),
    variants: z
      .array(z.enum(['full-color', 'monochrome', 'reversed', 'icon-only', 'wordmark']))
      .optional()
      .describe('Available logo variants'),
    clearSpace: z.string().optional().describe('Minimum clear space rule'),
    minimumSize: z.string().optional().describe('Minimum reproduction size'),
    placement: z.array(z.string()).optional().describe('Placement rules'),
    donts: z.array(z.string()).optional().describe('Logo misuse rules'),
  })
  .optional();

export const BrandColorEntrySchema = z.object({
  hex: z.string().describe('Color hex code'),
  name: z.string().optional().describe('Color name'),
  usage: z.string().optional().describe('When to use this color'),
});

export const BrandColorSystemSchema = z.object({
  primary: BrandColorEntrySchema,
  secondary: BrandColorEntrySchema.optional(),
  accent: z.array(BrandColorEntrySchema).optional().describe('Additional accent colors'),
  neutral: z.object({
    lightest: z.string().describe('Background/surface'),
    light: z.string().optional(),
    medium: z.string().optional(),
    dark: z.string().optional(),
    darkest: z.string().describe('Primary text'),
  }),
  semantic: z
    .object({
      success: z.string().optional(),
      warning: z.string().optional(),
      error: z.string().optional(),
      info: z.string().optional(),
    })
    .optional(),
  gradients: z
    .array(
      z.object({
        name: z.string(),
        value: z.string().describe('CSS gradient value'),
        usage: z.string().optional(),
      }),
    )
    .optional(),
  darkMode: z
    .object({
      background: z.string(),
      surface: z.string(),
      text: z.string(),
      primary: z.string().optional(),
    })
    .optional(),
  donts: z.array(z.string()).optional().describe('Color misuse rules'),
});

export const BrandFontSchema = z.object({
  family: z.string().describe('Font family name'),
  source: z.enum(['google', 'adobe', 'custom', 'system']).optional(),
  weights: z.array(z.number()).optional().describe('Available font weights'),
  usage: z.string().optional().describe('When to use this font'),
});

export const BrandTypographySchema = z.object({
  headingFont: BrandFontSchema,
  bodyFont: BrandFontSchema,
  monoFont: BrandFontSchema.optional(),
  accentFont: BrandFontSchema.optional(),
  scale: z
    .object({
      base: z.string().optional().describe('Base font size, e.g. "16px"'),
      ratio: z.number().optional().describe('Type scale ratio, e.g. 1.25'),
      h1: z.string().optional(),
      h2: z.string().optional(),
      h3: z.string().optional(),
      h4: z.string().optional(),
      body: z.string().optional(),
      small: z.string().optional(),
      caption: z.string().optional(),
    })
    .optional(),
  lineHeight: z
    .object({
      heading: z.number().optional(),
      body: z.number().optional(),
    })
    .optional(),
  donts: z.array(z.string()).optional(),
});

export const BrandShapeSchema = z
  .object({
    borderRadius: z
      .object({
        none: z.string().optional(),
        sm: z.string().optional(),
        md: z.string().optional(),
        lg: z.string().optional(),
        full: z.string().optional(),
        default: z.enum(['none', 'sm', 'md', 'lg', 'full']).optional(),
      })
      .optional(),
    borders: z
      .object({
        width: z.string().optional(),
        style: z.string().optional(),
        color: z.string().optional(),
      })
      .optional(),
    shadows: z
      .object({
        sm: z.string().optional(),
        md: z.string().optional(),
        lg: z.string().optional(),
        style: z.string().optional().describe('e.g. "soft diffused", "hard offset"'),
      })
      .optional(),
  })
  .optional();

export const BrandImagerySchema = z
  .object({
    iconStyle: z
      .enum(['outline', 'filled', 'duotone', 'hand-drawn', 'geometric', 'custom'])
      .optional(),
    iconLibrary: z.string().optional().describe('e.g. "Lucide", "Phosphor"'),
    illustrationStyle: z.string().optional(),
    photographyStyle: z.string().optional(),
    decorativeElements: z.array(z.string()).optional(),
    donts: z.array(z.string()).optional(),
  })
  .optional();

export const BrandMotionSchema = z
  .object({
    philosophy: z.enum(['minimal', 'purposeful', 'expressive', 'playful']).optional(),
    duration: z
      .object({
        fast: z.string().optional(),
        normal: z.string().optional(),
        slow: z.string().optional(),
      })
      .optional(),
    easing: z.string().optional(),
    reducedMotion: z.boolean().optional(),
    donts: z.array(z.string()).optional(),
  })
  .optional();

export const BrandVoiceSchema = z
  .object({
    personality: z.array(z.string()).describe('3-5 brand personality traits'),
    nngroupDimensions: z
      .object({
        funny_serious: z.number().min(1).max(5),
        formal_casual: z.number().min(1).max(5),
        respectful_irreverent: z.number().min(1).max(5),
        enthusiastic_matter_of_fact: z.number().min(1).max(5),
      })
      .optional(),
    vocabulary: z
      .object({
        preferred: z.array(z.string()).optional(),
        prohibited: z.array(z.string()).optional(),
      })
      .optional(),
    donts: z.array(z.string()).optional(),
  })
  .optional();

export const BrandAccessibilitySchema = z
  .object({
    wcagLevel: z.enum(['A', 'AA', 'AAA']).optional(),
    contrastRequirements: z.string().optional(),
    focusStyle: z.string().optional(),
    additionalRequirements: z.array(z.string()).optional(),
  })
  .optional();

export const BrandPrincipleSchema = z.object({
  name: z.string(),
  description: z.string(),
  example: z.string().optional(),
});

export const ExistingSystemSchema = z
  .object({
    framework: z.string().optional().describe('e.g. "Tailwind", "Material UI"'),
    componentLibrary: z.string().optional().describe('e.g. "shadcn/ui", "Radix"'),
    tokenFile: z.string().optional().describe('Path to design tokens'),
    figmaUrl: z.string().optional(),
    documentationUrl: z.string().optional(),
  })
  .optional();

export const BrandProfileSchema = z.object({
  // Identity
  name: z.string().describe('Brand name'),
  tagline: z.string().optional(),

  // Visual
  logo: BrandLogoSchema,
  colors: BrandColorSystemSchema,
  typography: BrandTypographySchema,
  spacing: z
    .object({
      unit: z.number().optional().describe('Base spacing unit in px'),
      scale: z.array(z.number()).optional(),
      containerMaxWidth: z.string().optional(),
      sectionPadding: z.string().optional(),
    })
    .optional(),
  shape: BrandShapeSchema,
  imagery: BrandImagerySchema,
  motion: BrandMotionSchema,

  // Voice (bridge to Copy Agent)
  voice: BrandVoiceSchema,

  // Accessibility
  accessibility: BrandAccessibilitySchema,

  // Principles
  principles: z.array(BrandPrincipleSchema).optional(),

  // Existing system
  existingSystem: ExistingSystemSchema,

  // Metadata
  version: z.string().optional(),
  lastUpdated: z.string().optional(),
  owner: z.string().optional(),
});

export type BrandProfile = z.infer<typeof BrandProfileSchema>;
export type BrandColorEntry = z.infer<typeof BrandColorEntrySchema>;
export type BrandFont = z.infer<typeof BrandFontSchema>;
export type BrandPrinciple = z.infer<typeof BrandPrincipleSchema>;

// ── Brand Constraint Mode ───────────────────────────────────────────────────

export type BrandMode = 'constrained' | 'generation';

export interface BrandConstraintConfig {
  mode: BrandMode;
  strictness: 'strict' | 'evolution' | 'reference';
  profile: BrandProfile;
}

// ── Brand Compliance ────────────────────────────────────────────────────────

export interface BrandComplianceCheck {
  category: 'color' | 'typography' | 'spacing' | 'voice' | 'logo' | 'a11y' | 'shape';
  rule: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  autoFixable: boolean;
}

export interface BrandComplianceResult {
  overall: 'compliant' | 'minor-violations' | 'major-violations';
  checks: BrandComplianceCheck[];
  score: number; // 0-100
}

// ── Brand Asset Loader Input ────────────────────────────────────────────────

export interface BrandImportInput {
  projectPath: string;
  websiteUrl?: string;
  manualInput?: Partial<BrandProfile>;
  mode: 'strict' | 'infer';
}

export interface BrandImportResult {
  profile: BrandProfile;
  source: 'auto-detected' | 'url-scraped' | 'manual' | 'hybrid';
  confidence: number; // 0-100
  detectedFrom: string[]; // files that contributed to the profile
  gaps: string[]; // fields that couldn't be detected and were inferred
}
