# Emotional Design Framework

## Purpose
Guide the Design Agent in creating interfaces that evoke the right emotions at the right moments, based on Don Norman's three levels of emotional design.

---

## Don Norman's Three Levels

### Level 1: Visceral (Instinctive)
**"Do I like the look of this?"**
Processed in milliseconds. Pre-conscious. Based on aesthetics.

Design elements that affect visceral response:
- Color palette (warm/cool, vibrant/muted, harmonious/clashing)
- Typography (elegant/utilitarian, large/small, serif/sans)
- Whitespace (spacious = premium, dense = data-rich)
- Image quality (sharp, well-composed, authentic)
- Symmetry and balance
- Visual polish (anti-aliased, pixel-perfect, smooth transitions)

**Goal**: Create a positive first impression in under 50ms.

### Level 2: Behavioral (Functional)
**"Does it work well? Is it easy to use?"**
Experienced through interaction. Based on usability and effectiveness.

Design elements that affect behavioral response:
- Interaction feedback (button responds instantly, form validates clearly)
- Task completion speed (fewer clicks, faster outcomes)
- Error handling (forgiving, helpful, recoverable)
- Predictability (actions do what users expect)
- Efficiency (keyboard shortcuts, batch actions, smart defaults)
- Performance (fast load, smooth scroll, no jank)

**Goal**: Make every interaction feel effortless and confident.

### Level 3: Reflective (Self-Image)
**"What does using this say about me?"**
Processed after the fact. Conscious evaluation. Based on identity and meaning.

Design elements that affect reflective response:
- Brand story (values, mission, personality)
- Social proof (who else uses this?)
- Exclusivity (invite-only, premium tier)
- Personalization (feels made for me)
- Shareability (do I want to show others?)
- Ethical positioning (sustainable, accessible, fair)

**Goal**: Users feel good about choosing this product.

---

## Emotional Journey Mapping

Map emotions across the user flow:

### Landing Page Journey
```
Arrival → First Impression → Understanding → Interest → Confidence → Action
(curious)  (impressed/confused) (informed)    (excited)  (trust)      (committed)
```

Design mapping:
| Stage | Emotion Target | Design Element |
|-------|---------------|----------------|
| Arrival | Curiosity | Bold headline, intriguing visual |
| First Impression | Impressed | Clean layout, professional polish, brand quality |
| Understanding | Clarity | Clear value prop, simple explanation, visual demo |
| Interest | Excitement | Feature highlights, social proof, possibility |
| Confidence | Trust | Testimonials, security badges, transparency |
| Action | Committed | Clear CTA, low risk (free trial), easy signup |

### Onboarding Journey
```
Welcome → Setup → First Task → Achievement → Regular Use
(welcomed) (guided) (supported)  (celebrated)  (empowered)
```

| Stage | Emotion Target | Design Element |
|-------|---------------|----------------|
| Welcome | Belonging | Personal greeting, warm visuals, "you're in" |
| Setup | Guided | Step-by-step, progress bar, skip option |
| First Task | Supported | Inline help, templates, example content |
| Achievement | Celebrated | Success animation, congratulations, share prompt |
| Regular Use | Empowered | Dashboard familiarity, shortcuts, personalization |

### Error/Failure Journey
```
Error Occurs → Recognition → Understanding → Recovery → Reassurance
(frustrated)   (acknowledged)  (informed)     (guided)    (confident)
```

| Stage | Emotion Target | Design Element |
|-------|---------------|----------------|
| Error Occurs | Acknowledged | Immediate feedback, no blame |
| Recognition | Calm | Clear error message, no panic language |
| Understanding | Informed | What went wrong, in human terms |
| Recovery | Guided | Specific fix instructions, action button |
| Reassurance | Confident | "Your data is safe", progress preserved |

---

## Emotion-to-Design Mapping

### Color and Emotion
| Emotion | Colors | Usage |
|---------|--------|-------|
| Trust | Blue, dark navy | Enterprise, finance, healthcare |
| Energy | Orange, yellow, red | Consumer, fitness, food |
| Calm | Green, teal, soft blue | Wellness, productivity, meditation |
| Premium | Black, gold, deep purple | Luxury, exclusive, premium tiers |
| Playful | Pink, bright green, multi-color | Consumer, gaming, creative tools |
| Serious | Navy, charcoal, minimal palette | Legal, government, compliance |

### Typography and Emotion
| Emotion | Typography | Example |
|---------|-----------|---------|
| Authority | Serif headings, strong weight | Playfair Display, Libre Baskerville |
| Approachable | Rounded sans-serif | Nunito, Fredoka, Poppins |
| Technical | Monospace accents, clean sans | JetBrains Mono, IBM Plex |
| Elegant | Thin weights, generous tracking | Raleway Light, Montserrat Thin |
| Bold/Confident | Heavy weights, tight tracking | Outfit 800, Syne 700 |

### Spacing and Emotion
| Emotion | Spacing Strategy |
|---------|-----------------|
| Premium | Generous whitespace, low density |
| Efficient | Tight spacing, high density (expert UI) |
| Comfortable | Balanced spacing, breathing room |
| Urgent | Compact, action-oriented, minimal padding |

---

## Micro-Interactions and Emotional Design

Small interactions that create emotional responses:

| Interaction | Emotion | Implementation |
|------------|---------|----------------|
| Button press | Satisfying click | Scale 0.98 + color darken for 100ms |
| Task complete | Achievement | Check mark animation + brief color burst |
| Loading | Patience/anticipation | Skeleton screens with subtle shimmer |
| Error shake | Gentle correction | Horizontal wiggle (2-3 cycles, subtle) |
| Success toast | Relief/joy | Slide in from top, green accent, auto-dismiss |
| Hover reveal | Discovery | Smooth fade-in of additional info |
| Drag start | Control | Slight lift (shadow increase) + cursor change |
| Scroll progress | Orientation | Subtle progress bar at top of page |

---

## Self-Critique: Emotional Design Checklist

When evaluating a design for emotional quality:

- [ ] **Visceral**: Does the first impression match the brand personality?
- [ ] **Visceral**: Are colors, typography, and spacing emotionally appropriate for the ICP?
- [ ] **Behavioral**: Does every interaction provide immediate, clear feedback?
- [ ] **Behavioral**: Can users complete key tasks without frustration?
- [ ] **Behavioral**: Are error states helpful, not hostile?
- [ ] **Reflective**: Would users be proud to recommend this product?
- [ ] **Reflective**: Does the brand story come through in the design?
- [ ] **Journey**: Is the emotional arc mapped for each critical flow?
- [ ] **Micro-interactions**: Do small moments create delight?
- [ ] **Accessibility**: Do emotional design elements NOT exclude anyone?
