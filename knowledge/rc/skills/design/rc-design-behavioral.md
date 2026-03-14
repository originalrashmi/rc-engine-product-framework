# Behavioral Design Science

## Purpose
Guide the Design Agent in applying behavioral science models to create interfaces that motivate action, reduce friction, and build habits.

---

## Fogg Behavior Model (B = MAP)

Every target behavior requires three simultaneous elements:

### Motivation (M)
Three core motivators (each has two sides):
- **Pleasure / Pain**: immediate sensation (smooth animation = pleasure; error state = pain)
- **Hope / Fear**: anticipated outcome (progress bar = hope; "data will be lost" = fear)
- **Social Acceptance / Rejection**: belonging ("12 teams use this" = acceptance)

Motivation is HARD to change. Design for ability and prompts first.

### Ability (A)
Six simplicity factors (Fogg's Simplicity Chain):
1. **Time**: How long does the action take? → Reduce steps, auto-fill, smart defaults
2. **Money**: Does it cost anything? → Free tier, trial, money-back guarantee
3. **Physical effort**: How many clicks/taps? → Minimize interactions, batch actions
4. **Brain cycles**: How much thinking? → Clear labels, opinionated defaults, recognition > recall
5. **Social deviance**: Is this socially weird? → Social proof, testimonials
6. **Non-routine**: Is this unfamiliar? → Use standard patterns, familiar metaphors

### Prompt (P)
Three types:
- **Spark**: motivates + prompts (for able but unmotivated users) → "Your free trial ends in 3 days"
- **Facilitator**: makes easier + prompts (for motivated but unable users) → "One-click import from Notion"
- **Signal**: just reminds (for motivated and able users) → notification dot, email reminder

**Design application**: Before adding motivation elements, first make the action EASIER. Then ensure the prompt appears at the right moment.

---

## COM-B Model

| Factor | Definition | Design Strategy |
|--------|-----------|-----------------|
| **Capability** | Can the user do this? | Clear instructions, tutorials, progressive disclosure |
| **Opportunity** | Does the environment allow it? | Remove barriers, provide tools, right-time prompts |
| **Motivation** | Does the user want to? | Show benefits, social proof, reduce perceived risk |

When users don't convert, diagnose:
- Can't do it? → Fix Capability (better onboarding, clearer UI)
- Environment blocks it? → Fix Opportunity (mobile support, SSO, integrations)
- Don't want to? → Fix Motivation (value prop, social proof, risk reversal)

---

## Persuasion Principles (Cialdini)

### For UI Design Application

| Principle | UI Pattern | Example |
|-----------|-----------|---------|
| **Reciprocity** | Give before asking | Free tool, free content before signup |
| **Commitment** | Small actions first | Start with email, not full profile |
| **Social Proof** | Show others' behavior | "2,847 teams signed up this week" |
| **Authority** | Expert endorsement | Logo bar, expert quotes, certifications |
| **Liking** | Personable design | Friendly copy, human photos, warm colors |
| **Scarcity** | Limited availability | "3 spots left", "Offer ends Friday" (ONLY if real) |
| **Unity** | In-group identity | "Built for developers", "Join your peers" |

**Warning**: Never fake social proof or scarcity. Users detect dishonesty and trust is permanently damaged.

---

## Nudge Theory

### Choice Architecture
The way options are presented influences decisions:

- **Default effect**: Pre-select the best option (most users keep defaults)
- **Framing**: "95% uptime" vs "5% downtime" (same fact, different perception)
- **Anchoring**: Show the expensive plan first (middle plan looks reasonable)
- **Decoy effect**: Add a clearly inferior option to make the target option shine
- **Peak-end rule**: End experiences on a high note (success celebrations)

### Friction Design
- **Remove friction** for desired actions: one-click signup, auto-save, pre-filled forms
- **Add friction** for risky actions: confirmation dialogs, cooling-off periods, double-opt-in
- The goal is APPROPRIATE friction, not zero friction

---

## Engagement Psychology

### Flow State (Csikszentmihalyi)
Users enter flow when:
- Challenge matches skill level (not too easy, not too hard)
- Clear goals at each step
- Immediate feedback on progress
- Sense of control

Design for flow:
- Progressive difficulty in onboarding
- Clear next steps at every point
- Instant feedback on actions
- No interruptions during focused tasks

### Variable Reward Schedule (Nir Eyal)
Three types of variable rewards:
- **Tribe**: social validation (likes, comments, followers)
- **Hunt**: material resources (deals, new content, search results)
- **Self**: mastery/completion (achievements, streaks, skill badges)

Design application:
- Dashboard data updates (variable - what changed since yesterday?)
- Notification badges (variable - what's new?)
- Progress tracking (self-reward - streak maintained!)

### Loss Aversion (Kahneman)
Losses feel 2x more painful than equivalent gains feel good.

Design application:
- "Don't lose your progress" > "Save your progress"
- "Your trial expires in 3 days" > "Upgrade for more features"
- Show what's at risk when users consider canceling
- Free trial creates endowment effect (they "own" it now)

---

## Application Checklist

For every key action/screen, evaluate:

- [ ] **Fogg B=MAP**: Is there sufficient Motivation + Ability + Prompt?
- [ ] **Friction**: Is friction minimized for desired actions, added for risky ones?
- [ ] **Social proof**: Are others' positive behaviors visible near decision points?
- [ ] **Defaults**: Is the best option pre-selected?
- [ ] **Progressive commitment**: Are we asking for small steps before big ones?
- [ ] **Feedback**: Does every action produce immediate, visible feedback?
- [ ] **Loss framing**: Are we leveraging loss aversion appropriately?
- [ ] **Flow**: Can users enter a focused state without interruption?
