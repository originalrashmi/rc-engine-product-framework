# Design Self-Critique Rubric

## Purpose
Guide the Design Agent in evaluating its own output before presenting to the user. This rubric runs in Phase D (Refine) after initial generation.

---

## Critique Process

For each generated design variation:
1. Score against each category below (1-5 scale)
2. Flag any category scoring below 3 as "needs revision"
3. If total score < 60% of maximum, regenerate the variation
4. Document the critique rationale for each score

---

## Scoring Categories

### 1. ICP Alignment (Weight: 25%)
Does this design serve the target user?

| Score | Criteria |
|-------|----------|
| 5 | Design directly reflects ICP expectations, tools they use, and their visual vocabulary |
| 4 | Strong alignment with minor adjustments needed |
| 3 | Adequate but generic - could be for any audience |
| 2 | Mismatched patterns (enterprise design for consumer ICP, or vice versa) |
| 1 | Completely wrong audience signal |

Check:
- [ ] Color palette matches ICP industry expectations
- [ ] Information density matches ICP expertise level
- [ ] Typography signals the right tone for this audience
- [ ] Interaction patterns match ICP's tool experience
- [ ] Layout complexity matches product type

### 2. Visual Hierarchy (Weight: 15%)
Is the content prioritized correctly?

| Score | Criteria |
|-------|----------|
| 5 | Crystal clear priority: user knows exactly where to look and what to do first |
| 4 | Strong hierarchy with minor competing elements |
| 3 | Hierarchy present but multiple elements compete for attention |
| 2 | Flat - everything feels equally important |
| 1 | Confusing - secondary content dominates primary |

Check:
- [ ] One clear primary action per viewport
- [ ] Heading hierarchy (h1 > h2 > h3) is visually distinct
- [ ] Eye flow follows F-pattern or Z-pattern as appropriate
- [ ] Whitespace creates intentional grouping (Gestalt proximity)
- [ ] Key metrics/CTAs are above the fold

### 3. Usability (Weight: 20%)
Can users accomplish their goals without friction?

| Score | Criteria |
|-------|----------|
| 5 | Every interaction is intuitive, all states handled, zero confusion points |
| 4 | Highly usable with minor edge cases unaddressed |
| 3 | Usable but some interactions require guessing |
| 2 | Multiple friction points that would cause user errors |
| 1 | Users would get stuck or lost |

Check:
- [ ] All interactive elements look interactive (UX-24)
- [ ] Touch targets are large enough (UX-25)
- [ ] All states designed: default, hover, active, disabled, loading, error, empty, success
- [ ] Error recovery paths exist (UX-34)
- [ ] Navigation is clear and consistent (UX-19, UX-20)

### 4. Accessibility (Weight: 15%)
Is this design inclusive?

| Score | Criteria |
|-------|----------|
| 5 | WCAG AA compliant: contrast, keyboard, screen reader, reduced motion |
| 4 | Mostly compliant with 1-2 minor issues |
| 3 | Major areas compliant but some gaps (e.g., missing focus styles) |
| 2 | Significant accessibility barriers |
| 1 | Not accessible - color-only indicators, no keyboard support |

Check:
- [ ] Color contrast meets 4.5:1 for text (UX-37)
- [ ] Color is not the only indicator (UX-16)
- [ ] Focus indicators are visible (UX-39)
- [ ] Semantic HTML structure implied (UX-42)
- [ ] Reduced motion considered (UX-41)

### 5. Design System Coherence (Weight: 10%)
Is the design internally consistent?

| Score | Criteria |
|-------|----------|
| 5 | Every element follows a clear system: tokens, patterns, spacing all consistent |
| 4 | Mostly systematic with 1-2 inconsistencies |
| 3 | System exists but applied unevenly |
| 2 | Many inconsistencies: different button styles, spacing variations |
| 1 | No system - each element designed ad hoc |

Check:
- [ ] Colors from a consistent palette (no random hex values)
- [ ] Typography uses a defined scale (no arbitrary sizes)
- [ ] Spacing is consistent (follows 4px or 8px grid)
- [ ] Similar components look the same across screens
- [ ] Border radius, shadows, borders are consistent

### 6. Emotional Design (Weight: 10%)
Does the design evoke the right emotions?

| Score | Criteria |
|-------|----------|
| 5 | Design evokes the target emotion at each stage of the user journey |
| 4 | Good emotional design with minor tonal inconsistencies |
| 3 | Emotionally neutral - doesn't offend but doesn't delight |
| 2 | Wrong emotional tone for the product/audience |
| 1 | Creates negative emotions (frustration, confusion, anxiety) |

Check:
- [ ] Visceral: first impression matches brand personality
- [ ] Behavioral: interactions feel smooth and responsive
- [ ] Reflective: users would feel good about using this product
- [ ] Micro-interactions provide appropriate emotional feedback
- [ ] Error/empty states are helpful, not hostile

### 7. Brand Compliance (Weight: 5% - if brand exists)
Does the design follow brand guidelines?

Check:
- [ ] Colors from brand palette only
- [ ] Typography uses brand fonts
- [ ] Shape (corners, shadows, borders) matches brand
- [ ] Voice/tone in copy matches brand personality
- [ ] Logo placement follows brand rules (if applicable)

---

## Revision Protocol

When a category scores below 3:

1. **Identify the specific failures** (which checklist items failed?)
2. **Determine root cause** (wrong pattern choice? missing state? wrong ICP signal?)
3. **Apply targeted fix** (don't regenerate entire variation - fix the specific issue)
4. **Re-score** the fixed version
5. **Document** the change and rationale

When total score < 60%:

1. **Flag for full regeneration**
2. **Identify what went wrong** in the original generation prompt
3. **Adjust constraints** before regenerating
4. **Regenerate** with tighter constraints
5. **Re-critique** the new version

---

## Output Format

```markdown
## Self-Critique: Variation {id}

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| ICP Alignment | {1-5} | 25% | {score * 0.25} |
| Visual Hierarchy | {1-5} | 15% | {score * 0.15} |
| Usability | {1-5} | 20% | {score * 0.20} |
| Accessibility | {1-5} | 15% | {score * 0.15} |
| System Coherence | {1-5} | 10% | {score * 0.10} |
| Emotional Design | {1-5} | 10% | {score * 0.10} |
| Brand Compliance | {1-5} | 5% | {score * 0.05} |
| **Total** | | | **{sum}/5.00** |

### Strengths
- {what works well}

### Issues Found
- [{severity}] {issue}: {description} → {fix}

### Revision Actions
- {action taken or recommended}
```
