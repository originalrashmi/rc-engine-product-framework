# Brand Asset System - Design Agent Skill File

## Purpose
Guide the Design Agent in importing, normalizing, constraining, and validating brand assets. This file is loaded whenever brand-related operations occur.

---

## Two Modes

### Brand-Constrained Mode
Triggered when the user provides existing brand assets (via `brand_import` or discovery questions).

**Rules:**
- Color palette is LOCKED - use brand colors only. Variations limited to tints (lighter), shades (darker), and opacity.
- Typography is LOCKED - use brand fonts only. Variations limited to size, weight, and spacing.
- Shape system is LOCKED - border radius, shadow style, border width from brand.
- Voice/tone is LOCKED - personality traits and NNGroup dimensions are binding.
- Logo rules are ENFORCED - clear space, minimum size, placement, don'ts.
- Design principles are CONSTRAINTS - they guide every layout decision.
- 5 design variations = 5 different LAYOUTS and INTERACTIONS, NOT 5 different brands.
- Generated code must use brand tokens (CSS variables), not hardcoded values.

**What CAN vary in constrained mode:**
- Layout structure (sidebar vs. top-nav, grid vs. list)
- Interaction patterns (wizard vs. inline, tabs vs. accordion)
- Content hierarchy (what's emphasized first)
- Animation approach (within motion.philosophy constraints)
- Component composition (how components are assembled)

### Brand-Generation Mode
Triggered when no brand assets exist. This is the current default behavior.

**Rules:**
- LLM generates brand identity from ICP research + design trends + mood.
- FontService.getPairings() selects fonts based on mood.
- Color palette generated from ICP expectations + competitive gaps.
- All generated assets are saved as a new BrandProfile.
- 5 design variations = 5 distinct visual identities.

---

## Brand Import Flow

### Step 1: Auto-Detection
Scan the project for brand signals:

| Priority | Source | What to Extract |
|----------|--------|----------------|
| P1 | `tailwind.config.{ts,js}` | colors, fontFamily, borderRadius, spacing, screens |
| P1 | `tokens.json` / `tokens.yaml` | Full design token set |
| P1 | `src/**/theme.ts` | Theme object exports |
| P2 | `globals.css` / `theme.css` | CSS custom properties (`:root { --primary: ... }`) |
| P2 | `package.json` | UI framework detection (shadcn, MUI, Chakra, Ant) |
| P2 | `src/lib/constants/` | Hardcoded token files |
| P3 | `public/logo.*` | Logo file exists (describe, don't analyze pixels) |
| P3 | `README.md` | May contain brand description |

### Step 2: URL Scraping (Optional)
If the user provides a website URL:
- Extract dominant colors (from CSS, computed styles)
- Extract font families (from CSS `font-family` declarations)
- Extract layout patterns (header, hero, grid, footer structure)
- Present findings for user confirmation

### Step 3: Normalization
Fill gaps in the detected profile:
- `strict` mode: only use what was detected/provided
- `infer` mode: LLM fills reasonable defaults
  - If primary color exists → infer complementary secondary
  - If heading font exists → use FontService to find a matching body font
  - If no spacing system → default to 4px base unit
  - If no border radius → infer from shape.shadows (hard shadows → sharp corners)

### Step 4: User Review
Present the normalized BrandProfile to the user:
```
Brand Profile Detected:
- Name: {name}
- Colors: Primary {hex}, Secondary {hex}, ...
- Fonts: Heading {family}, Body {family}
- Style: {shape description}
- Voice: {personality traits}

Confidence: {score}%
Detected from: {file list}
Gaps filled by inference: {field list}

Is this correct? (edit / confirm / reject)
```

---

## Brand Compliance Checking

During self-critique (Phase D of design generation), check:

### Color Compliance
- [ ] All colors used are from the brand palette or derived tints/shades
- [ ] Primary color used for primary CTAs
- [ ] Semantic colors (error, success, warning) match brand or are standard
- [ ] No brand-prohibited colors used (check `colors.donts`)
- [ ] Contrast ratios meet WCAG requirements with brand colors

### Typography Compliance
- [ ] Only brand fonts used (heading, body, mono, accent)
- [ ] Font weights are within brand's available weights
- [ ] Type scale is consistent (no arbitrary sizes)
- [ ] No brand-prohibited typography patterns (check `typography.donts`)

### Shape Compliance
- [ ] Border radius matches brand default
- [ ] Shadow style matches brand (soft vs. hard offset vs. none)
- [ ] Border width matches brand specification

### Voice Compliance
- [ ] Copy personality matches brand voice traits
- [ ] NNGroup dimension scores are within range
- [ ] No prohibited vocabulary used (check `voice.vocabulary.prohibited`)
- [ ] Tone shifts are appropriate per context

### Logo Compliance (if rules exist)
- [ ] Clear space maintained
- [ ] Minimum size respected
- [ ] Placement follows brand rules
- [ ] No logo don'ts violated (rotation, stretching, recoloring)

---

## Integration Points

### With Design Agent
```
designAgent.generate() receives:
  - brandProfile (from state.artifacts.brandProfile)
  - brandMode ('constrained' | 'generation')
  - brandStrictness ('strict' | 'evolution' | 'reference')

In constrained mode:
  - Color palette injected into prompt as immutable constraints
  - Font embed HTML generated via FontService
  - Wireframes use brand tokens, not generated colors
  - Self-critique includes brand compliance check
```

### With Copy Agent
```
copyAgent.generate() receives:
  - brandProfile.voice (personality, dimensions, vocabulary)

Voice constraints are binding:
  - Personality traits shape all copy tone
  - Prohibited words filtered from output
  - Context-based tone shifts respect brand rails
```

### With Forge Tasks
```
Each forge task receives:
  - Design tokens derived from BrandProfile
  - Component library from existingSystem
  - Accessibility level from brand a11y requirements
  - Font embed code for HTML templates
```

### With Design Intake
```
designIntake receives:
  - BrandProfile (constrains what "aligned" means)
  - User preferences evaluated against brand, not just ICP
  - Competitor analysis checks for brand differentiation
```
