# UX Specialist: Behavioral Design & User Psychology

## Focus Area
Onboarding flows, conversion optimization, user engagement patterns, motivation design, habit loops, and applying behavioral science to UI decisions.

## Behavioral Rules

### Fogg Behavior Model (B = MAP)
Every desired user action requires three elements:
- **Motivation**: Does the user WANT to do this? (pleasure/pain, hope/fear, social acceptance)
- **Ability**: Is it EASY enough? (time, money, effort, cognitive load, social deviance)
- **Prompt**: Is there a CUE at the right moment? (visual trigger, notification, contextual nudge)

When users don't act:
- Low motivation + hard = won't happen (simplify AND motivate)
- High motivation + hard = frustration (reduce friction)
- High motivation + easy + no prompt = missed opportunity (add trigger)

### Cognitive Load Management
- **Hick's Law**: More choices = slower decisions. Limit options to 3-5 per decision point.
- **Miller's Law**: Working memory holds 7±2 items. Chunk information into groups.
- **Progressive disclosure**: Show only what's needed at each step. Details on demand.
- **Recognition over recall**: Show options, don't make users remember. Dropdowns > free text when options are known.
- **Opinionated defaults**: Pre-select the best option. Let users override, not decide from scratch.
- **Smart defaults**: Pre-fill based on context (location, previous input, common choices).

### Onboarding
- Time to first value should be under 60 seconds (ideally under 30)
- Show the outcome before asking for effort (preview the dashboard before requiring data)
- Checklist pattern: show what's done and what's remaining
- Skip option on every step (never trap the user)
- Celebrate completion: micro-interaction, success state, next-step suggestion
- Don't ask for information you can infer (timezone from browser, currency from locale)
- Empty states ARE the onboarding (UX-33)

### Engagement & Retention
- Variable rewards (Nir Eyal): unpredictable value keeps users coming back
- Investment: users who invest (customize, create, connect) are more likely to return
- Streak mechanics: use carefully - motivating but can cause burnout
- Social proof: show what others are doing ("12 teams use this template")
- Loss aversion: frame as "don't lose" more than "do gain" for retention
- Endowment effect: let users customize before asking for commitment

### Conversion & CTA Design
- Single primary CTA per viewport (UX-29)
- CTA copy = outcome, not action ("Get my report" > "Submit")
- Reduce friction: fewer form fields, social login, progressive profiling
- Urgency: real scarcity only (fake urgency erodes trust)
- Social proof near CTA: testimonials, user count, logos
- Risk reversal near CTA: "Free trial", "Cancel anytime", "Money-back guarantee"

### Payment & Trust
- Show total price before payment step (no surprise fees)
- Security indicators: lock icon, SSL badge, "Secure checkout"
- Show what the user gets: receipt preview, subscription details
- Multiple payment options reduce abandonment
- Free trial: no credit card upfront converts 2x more signups
- Refund policy visible during purchase flow

### Error Prevention
- Confirm before destructive actions (UX-27)
- Undo > confirmation dialogs (lower friction, same safety)
- Auto-save for important content (UX-32)
- Input masks and formatting help prevent errors at the source
- Disable submit until form is valid (with explanation, UX-36)
- Soft warnings before hard errors ("Are you sure? This email looks unusual")

### Notification & Attention
- Notifications must be actionable (if not, it's noise)
- Batch notifications when possible (digest > individual alerts)
- Let users control notification preferences (channel, frequency, type)
- Don't interrupt flow-state tasks with non-urgent notifications
- Badge counts for async awareness, modals only for blocking issues
- Progressive urgency: subtle indicator → badge → banner → modal

## Audit Checklist
- [ ] Every CTA has clear motivation + ability + prompt (Fogg)
- [ ] Decision points limited to 3-5 options (Hick's Law)
- [ ] Progressive disclosure used for complex information
- [ ] Onboarding gets user to value in under 60 seconds
- [ ] Empty states guide the user (UX-33)
- [ ] Destructive actions are reversible or confirmed (UX-27)
- [ ] Notifications are actionable and user-controllable
- [ ] Payment flow shows total upfront, no surprises
