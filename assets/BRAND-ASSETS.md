# RC Engine Brand Assets

## Brand Identity

RC Engine is a product of **Toerana**. All RC Engine brand assets follow the Toerana design system.

## Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| **Navy Dark** | `#0D1B2A` | Gradient start, deep backgrounds |
| **Navy** | `#1B2A4A` | Gradient end, primary brand color |
| **Cream** | `#F5F0E8` | Light backgrounds, text on dark, warmth accent |
| **Gold Light** | `#E8D5A3` | Gold gradient start |
| **Gold** | `#C9A962` | Gold gradient midpoint, accent color |
| **Gold Dark** | `#A8893F` | Gold gradient end |

## Typography

| Font | Usage |
|------|-------|
| **Playfair Display** (serif, italic) | Toerana parent brand, editorial headings |
| **Trebuchet MS / Century Gothic** (geometric sans) | RC Engine logo lettermark |
| **Inter** (sans-serif) | Body text, UI, documentation |

## Logo Files

| File | Mode | Description |
|------|------|-------------|
| `logo-dark.svg` | Dark mode | Navy background, cream RC, gold watermark, cream pipeline dots |
| `logo-light.svg` | Light mode | Cream background, navy RC, navy watermark, navy pipeline dots |

### Logo Anatomy

- **Watermark:** Large ghosted "RC" in background (geometric bold, 7% opacity)
- **Lettermark:** "RC" in geometric sans-serif (cream on dark, navy on light)
- **Pipeline:** Horizontal line with 3 phase dots (research → build → ship)
- **Subtitle:** "ENGINE" in tracked sans-serif below pipeline
- **Container:** Rounded square (96px radius at 512px) with subtle 2px border

### Usage in GitHub README

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg" width="160">
  <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg" width="160">
  <img src="assets/logo-dark.svg" alt="RC Engine" width="160">
</picture>
```

### Minimum Sizes

- **Full logo:** 64px minimum (RC + pipeline + ENGINE all readable)
- **Icon only:** 20px minimum (RC lettermark still legible)
- **Favicon:** Use without "ENGINE" subtitle at 16-32px

## Parent Brand

- **Toerana** — [toerana.com](https://toerana.com)
- Toerana favicon: Italic serif "T" in gold on navy rounded square
- Same color palette, same design language, different mark

## Design System Sources

- Toerana website: Playfair Display + Inter, navy/cream/gold
- Consulting-grade reports: Playfair Display + Inter, navy `#1B2A4A` / gold `#C4952B`, 816px pages
- RC Engine logo: Geometric sans + Inter, navy/cream/gold with pipeline motif
