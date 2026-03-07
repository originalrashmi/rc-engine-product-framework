/**
 * Font Intelligence Service
 *
 * Provides font catalog access (Google Fonts API), curated font pairings,
 * font validation, and embed code generation.
 *
 * Used by the Design Agent and Brand Asset Loader to select and validate fonts.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface FontFamily {
  family: string;
  category: 'serif' | 'sans-serif' | 'display' | 'handwriting' | 'monospace';
  variants: string[]; // e.g. ['300', '400', '400italic', '600', '700']
  subsets: string[]; // e.g. ['latin', 'latin-ext', 'cyrillic']
  popularity: number; // rank (1 = most popular)
  lastModified: string;
}

export interface FontPairing {
  heading: { family: string; weights: number[] };
  body: { family: string; weights: number[] };
  mono?: { family: string };
  rationale: string;
  mood: string;
  embedHtml: string;
  cssVariables: string;
}

export interface FontSearchQuery {
  category?: 'serif' | 'sans-serif' | 'display' | 'handwriting' | 'monospace';
  minWeights?: number;
  subsets?: string[];
  popularity?: 'top50' | 'top200' | 'all';
}

export interface FontValidationResult {
  available: boolean;
  source: 'google' | 'system' | 'unknown';
  missingWeights: number[];
  missingSubsets: string[];
  alternatives: Array<{ family: string; category: string }>;
}

export type FontMood =
  | 'professional'
  | 'playful'
  | 'luxurious'
  | 'technical'
  | 'warm'
  | 'bold'
  | 'minimal';

// ── Curated Pairings Database ───────────────────────────────────────────────

const CURATED_PAIRINGS: FontPairing[] = [
  // Professional / Enterprise
  {
    heading: { family: 'Inter', weights: [600, 700] },
    body: { family: 'Inter', weights: [400, 500] },
    rationale: 'Same family, weight contrast — clean and corporate',
    mood: 'professional',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Inter', system-ui, sans-serif;\n--font-body: 'Inter', system-ui, sans-serif;",
  },
  {
    heading: { family: 'DM Sans', weights: [500, 700] },
    body: { family: 'DM Sans', weights: [400, 500] },
    rationale: 'Geometric, clean — modern enterprise aesthetic',
    mood: 'professional',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'DM Sans', system-ui, sans-serif;\n--font-body: 'DM Sans', system-ui, sans-serif;",
  },
  {
    heading: { family: 'Playfair Display', weights: [700] },
    body: { family: 'Source Sans 3', weights: [400, 600] },
    rationale: 'Serif/sans contrast — editorial authority with readability',
    mood: 'professional',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Playfair Display', Georgia, serif;\n--font-body: 'Source Sans 3', system-ui, sans-serif;",
  },
  // Playful / Consumer
  {
    heading: { family: 'Outfit', weights: [600, 700] },
    body: { family: 'Inter', weights: [400, 500] },
    rationale: 'Geometric heading, neutral body — approachable and modern',
    mood: 'playful',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Outfit', system-ui, sans-serif;\n--font-body: 'Inter', system-ui, sans-serif;",
  },
  {
    heading: { family: 'Fredoka', weights: [500, 700] },
    body: { family: 'Nunito', weights: [400, 600] },
    rationale: 'Rounded forms, friendly feel — great for consumer apps',
    mood: 'playful',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;700&family=Nunito:wght@400;600&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Fredoka', system-ui, sans-serif;\n--font-body: 'Nunito', system-ui, sans-serif;",
  },
  {
    heading: { family: 'Space Grotesk', weights: [500, 700] },
    body: { family: 'DM Sans', weights: [400, 500] },
    rationale: 'Modern geometric with character — tech-meets-consumer',
    mood: 'playful',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Space Grotesk', system-ui, sans-serif;\n--font-body: 'DM Sans', system-ui, sans-serif;",
  },
  // Luxurious / Premium
  {
    heading: { family: 'Cormorant Garamond', weights: [600, 700] },
    body: { family: 'Montserrat', weights: [300, 400] },
    rationale: 'Elegant serif heading with light sans body — premium contrast',
    mood: 'luxurious',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Montserrat:wght@300;400&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Cormorant Garamond', Georgia, serif;\n--font-body: 'Montserrat', system-ui, sans-serif;",
  },
  {
    heading: { family: 'Libre Baskerville', weights: [700] },
    body: { family: 'Raleway', weights: [300, 400] },
    rationale: 'Classic serif authority with elegant sans body',
    mood: 'luxurious',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@700&family=Raleway:wght@300;400&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Libre Baskerville', Georgia, serif;\n--font-body: 'Raleway', system-ui, sans-serif;",
  },
  // Technical / Developer
  {
    heading: { family: 'JetBrains Mono', weights: [700] },
    body: { family: 'Inter', weights: [400, 500] },
    rationale: 'Code-forward heading signals technical audience',
    mood: 'technical',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&family=Inter:wght@400;500&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'JetBrains Mono', monospace;\n--font-body: 'Inter', system-ui, sans-serif;",
  },
  {
    heading: { family: 'IBM Plex Sans', weights: [500, 700] },
    body: { family: 'IBM Plex Sans', weights: [400, 500] },
    mono: { family: 'IBM Plex Mono' },
    rationale: 'IBM Plex family — technical clarity, designed for developer tools',
    mood: 'technical',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;700&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'IBM Plex Sans', system-ui, sans-serif;\n--font-body: 'IBM Plex Sans', system-ui, sans-serif;\n--font-mono: 'IBM Plex Mono', monospace;",
  },
  {
    heading: { family: 'Space Mono', weights: [700] },
    body: { family: 'Work Sans', weights: [400, 500] },
    rationale: 'Monospace accent heading with clean body — developer aesthetic',
    mood: 'technical',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&family=Work+Sans:wght@400;500&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Space Mono', monospace;\n--font-body: 'Work Sans', system-ui, sans-serif;",
  },
  // Bold / Memphis-Brutalist
  {
    heading: { family: 'Outfit', weights: [700, 800] },
    body: { family: 'Inter', weights: [400, 500] },
    rationale: 'Bold geometric heading — strong presence without sacrificing body readability',
    mood: 'bold',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@700;800&family=Inter:wght@400;500&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Outfit', system-ui, sans-serif;\n--font-body: 'Inter', system-ui, sans-serif;",
  },
  {
    heading: { family: 'Syne', weights: [700, 800] },
    body: { family: 'DM Sans', weights: [400, 500] },
    rationale: 'Expressive, distinctive heading — makes a statement',
    mood: 'bold',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Syne', system-ui, sans-serif;\n--font-body: 'DM Sans', system-ui, sans-serif;",
  },
  {
    heading: { family: 'Archivo Black', weights: [400] },
    body: { family: 'Archivo', weights: [400, 500] },
    rationale: 'Same family, display weight heading — impact and cohesion',
    mood: 'bold',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Archivo Black', system-ui, sans-serif;\n--font-body: 'Archivo', system-ui, sans-serif;",
  },
  // Warm / Friendly
  {
    heading: { family: 'Poppins', weights: [600, 700] },
    body: { family: 'Nunito Sans', weights: [400, 600] },
    rationale: 'Rounded geometric heading, warm humanist body — approachable',
    mood: 'warm',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Nunito+Sans:wght@400;600&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Poppins', system-ui, sans-serif;\n--font-body: 'Nunito Sans', system-ui, sans-serif;",
  },
  {
    heading: { family: 'Rubik', weights: [500, 700] },
    body: { family: 'Rubik', weights: [400, 500] },
    rationale: 'Slightly rounded sans-serif — warm but not childish',
    mood: 'warm',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Rubik', system-ui, sans-serif;\n--font-body: 'Rubik', system-ui, sans-serif;",
  },
  // Minimal / Clean
  {
    heading: { family: 'Inter', weights: [500, 600] },
    body: { family: 'Inter', weights: [400] },
    rationale: 'Inter at restrained weights — invisible typography, content-first',
    mood: 'minimal',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Inter', system-ui, sans-serif;\n--font-body: 'Inter', system-ui, sans-serif;",
  },
  {
    heading: { family: 'Plus Jakarta Sans', weights: [500, 700] },
    body: { family: 'Plus Jakarta Sans', weights: [400, 500] },
    rationale: 'Clean geometric sans with subtle personality — modern minimal',
    mood: 'minimal',
    embedHtml: '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700&display=swap" rel="stylesheet">',
    cssVariables: "--font-heading: 'Plus Jakarta Sans', system-ui, sans-serif;\n--font-body: 'Plus Jakarta Sans', system-ui, sans-serif;",
  },
];

// ── System Font Stacks ──────────────────────────────────────────────────────

const SYSTEM_FONTS = new Set([
  'system-ui',
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI',
  'Roboto',
  'Helvetica Neue',
  'Arial',
  'sans-serif',
  'serif',
  'monospace',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Menlo',
  'Monaco',
  'Consolas',
  'Liberation Mono',
  'SF Pro',
  'SF Mono',
]);

// ── Font Service ────────────────────────────────────────────────────────────

let _googleFontsCache: FontFamily[] | null = null;

export class FontService {
  /**
   * Search Google Fonts catalog.
   * Fetches from API on first call, caches for subsequent calls.
   */
  async search(query: FontSearchQuery = {}): Promise<FontFamily[]> {
    const fonts = await this.loadGoogleFonts();

    let filtered = fonts;

    if (query.category) {
      filtered = filtered.filter((f) => f.category === query.category);
    }

    if (query.minWeights) {
      filtered = filtered.filter((f) => f.variants.length >= query.minWeights!);
    }

    if (query.subsets?.length) {
      filtered = filtered.filter((f) => query.subsets!.every((s) => f.subsets.includes(s)));
    }

    if (query.popularity === 'top50') {
      filtered = filtered.slice(0, 50);
    } else if (query.popularity === 'top200') {
      filtered = filtered.slice(0, 200);
    }

    return filtered;
  }

  /**
   * Get curated font pairings for a given mood/style.
   * Uses the embedded pairing database (no API call).
   */
  getPairings(options: {
    mood: FontMood;
    existingFont?: string;
  }): FontPairing[] {
    if (options.existingFont) {
      // Find pairings that include the existing font
      const matches = CURATED_PAIRINGS.filter(
        (p) =>
          p.heading.family.toLowerCase() === options.existingFont!.toLowerCase() ||
          p.body.family.toLowerCase() === options.existingFont!.toLowerCase(),
      );
      if (matches.length > 0) return matches;
    }

    return CURATED_PAIRINGS.filter((p) => p.mood === options.mood);
  }

  /** Get all available moods */
  getAvailableMoods(): FontMood[] {
    return [...new Set(CURATED_PAIRINGS.map((p) => p.mood))] as FontMood[];
  }

  /**
   * Validate a font choice against Google Fonts catalog.
   */
  async validate(font: {
    family: string;
    requiredWeights: number[];
    requiredSubsets?: string[];
  }): Promise<FontValidationResult> {
    // Check system fonts first
    if (SYSTEM_FONTS.has(font.family)) {
      return {
        available: true,
        source: 'system',
        missingWeights: [],
        missingSubsets: [],
        alternatives: [],
      };
    }

    const fonts = await this.loadGoogleFonts();
    const match = fonts.find((f) => f.family.toLowerCase() === font.family.toLowerCase());

    if (!match) {
      // Find alternatives by category and popularity
      const alternatives = fonts
        .slice(0, 50)
        .map((f) => ({ family: f.family, category: f.category }))
        .slice(0, 5);

      return {
        available: false,
        source: 'unknown',
        missingWeights: font.requiredWeights,
        missingSubsets: font.requiredSubsets ?? [],
        alternatives,
      };
    }

    const availableWeights = match.variants
      .filter((v) => !v.includes('italic'))
      .map((v) => parseInt(v === 'regular' ? '400' : v, 10))
      .filter((n) => !isNaN(n));

    const missingWeights = font.requiredWeights.filter((w) => !availableWeights.includes(w));
    const missingSubsets = (font.requiredSubsets ?? []).filter(
      (s) => !match.subsets.includes(s),
    );

    return {
      available: true,
      source: 'google',
      missingWeights,
      missingSubsets,
      alternatives: [],
    };
  }

  /**
   * Generate embed HTML for fonts (Google Fonts <link> tags).
   */
  getEmbedCode(
    fonts: Array<{ family: string; weights: number[]; italic?: boolean }>,
  ): string {
    if (fonts.length === 0) return '';

    const families = fonts
      .map((f) => {
        const name = f.family.replace(/ /g, '+');
        const axes = f.weights.sort((a, b) => a - b);
        if (f.italic) {
          const italicAxes = axes.map((w) => `0,${w}`).concat(axes.map((w) => `1,${w}`));
          return `family=${name}:ital,wght@${italicAxes.join(';')}`;
        }
        return `family=${name}:wght@${axes.join(';')}`;
      })
      .join('&');

    return [
      '<link rel="preconnect" href="https://fonts.googleapis.com">',
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
      `<link href="https://fonts.googleapis.com/css2?${families}&display=swap" rel="stylesheet">`,
    ].join('\n');
  }

  /**
   * Generate CSS fallback stack for a font family.
   */
  getFallbackStack(family: string, category: string): string {
    const stacks: Record<string, string> = {
      'sans-serif': `'${family}', system-ui, -apple-system, 'Segoe UI', sans-serif`,
      serif: `'${family}', Georgia, 'Times New Roman', serif`,
      monospace: `'${family}', 'SF Mono', 'Fira Code', 'Courier New', monospace`,
      display: `'${family}', system-ui, sans-serif`,
      handwriting: `'${family}', 'Comic Sans MS', cursive`,
    };
    return stacks[category] ?? `'${family}', system-ui, sans-serif`;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private async loadGoogleFonts(): Promise<FontFamily[]> {
    if (_googleFontsCache) return _googleFontsCache;

    try {
      // Google Fonts API — requires API key for production use
      // For now, use the curated list as a fallback
      const apiKey = process.env.GOOGLE_FONTS_API_KEY;
      if (apiKey) {
        const response = await fetch(
          `https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`,
        );
        if (response.ok) {
          const data = (await response.json()) as {
            items: Array<{
              family: string;
              category: string;
              variants: string[];
              subsets: string[];
              lastModified: string;
            }>;
          };
          _googleFontsCache = data.items.map((item, index) => ({
            family: item.family,
            category: item.category as FontFamily['category'],
            variants: item.variants,
            subsets: item.subsets,
            popularity: index + 1,
            lastModified: item.lastModified,
          }));
          return _googleFontsCache;
        }
      }
    } catch {
      // Fall through to curated list
    }

    // Fallback: curated list of popular Google Fonts
    _googleFontsCache = POPULAR_GOOGLE_FONTS;
    return _googleFontsCache;
  }
}

// ── Fallback: Popular Google Fonts ──────────────────────────────────────────

const POPULAR_GOOGLE_FONTS: FontFamily[] = [
  { family: 'Inter', category: 'sans-serif', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'], popularity: 1, lastModified: '2024-01-01' },
  { family: 'Roboto', category: 'sans-serif', variants: ['100', '300', '400', '500', '700', '900'], subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'], popularity: 2, lastModified: '2024-01-01' },
  { family: 'Open Sans', category: 'sans-serif', variants: ['300', '400', '500', '600', '700', '800'], subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'], popularity: 3, lastModified: '2024-01-01' },
  { family: 'Montserrat', category: 'sans-serif', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext', 'cyrillic', 'vietnamese'], popularity: 4, lastModified: '2024-01-01' },
  { family: 'Poppins', category: 'sans-serif', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext'], popularity: 5, lastModified: '2024-01-01' },
  { family: 'Lato', category: 'sans-serif', variants: ['100', '300', '400', '700', '900'], subsets: ['latin', 'latin-ext'], popularity: 6, lastModified: '2024-01-01' },
  { family: 'DM Sans', category: 'sans-serif', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext'], popularity: 7, lastModified: '2024-01-01' },
  { family: 'Outfit', category: 'sans-serif', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext'], popularity: 8, lastModified: '2024-01-01' },
  { family: 'Nunito', category: 'sans-serif', variants: ['200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext', 'cyrillic', 'vietnamese'], popularity: 9, lastModified: '2024-01-01' },
  { family: 'Nunito Sans', category: 'sans-serif', variants: ['200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext', 'cyrillic', 'vietnamese'], popularity: 10, lastModified: '2024-01-01' },
  { family: 'Raleway', category: 'sans-serif', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext', 'cyrillic', 'vietnamese'], popularity: 11, lastModified: '2024-01-01' },
  { family: 'Work Sans', category: 'sans-serif', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext', 'vietnamese'], popularity: 12, lastModified: '2024-01-01' },
  { family: 'Rubik', category: 'sans-serif', variants: ['300', '400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext', 'cyrillic', 'hebrew'], popularity: 13, lastModified: '2024-01-01' },
  { family: 'Plus Jakarta Sans', category: 'sans-serif', variants: ['200', '300', '400', '500', '600', '700', '800'], subsets: ['latin', 'latin-ext', 'cyrillic-ext', 'vietnamese'], popularity: 14, lastModified: '2024-01-01' },
  { family: 'Space Grotesk', category: 'sans-serif', variants: ['300', '400', '500', '600', '700'], subsets: ['latin', 'latin-ext', 'vietnamese'], popularity: 15, lastModified: '2024-01-01' },
  { family: 'IBM Plex Sans', category: 'sans-serif', variants: ['100', '200', '300', '400', '500', '600', '700'], subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'], popularity: 16, lastModified: '2024-01-01' },
  { family: 'Syne', category: 'sans-serif', variants: ['400', '500', '600', '700', '800'], subsets: ['latin', 'latin-ext', 'greek'], popularity: 17, lastModified: '2024-01-01' },
  { family: 'Fredoka', category: 'sans-serif', variants: ['300', '400', '500', '600', '700'], subsets: ['latin', 'latin-ext', 'hebrew'], popularity: 18, lastModified: '2024-01-01' },
  { family: 'Archivo', category: 'sans-serif', variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext', 'vietnamese'], popularity: 19, lastModified: '2024-01-01' },
  { family: 'Archivo Black', category: 'sans-serif', variants: ['400'], subsets: ['latin', 'latin-ext'], popularity: 20, lastModified: '2024-01-01' },
  // Serifs
  { family: 'Playfair Display', category: 'serif', variants: ['400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext', 'cyrillic', 'vietnamese'], popularity: 21, lastModified: '2024-01-01' },
  { family: 'Libre Baskerville', category: 'serif', variants: ['400', '700'], subsets: ['latin', 'latin-ext'], popularity: 22, lastModified: '2024-01-01' },
  { family: 'Cormorant Garamond', category: 'serif', variants: ['300', '400', '500', '600', '700'], subsets: ['latin', 'latin-ext', 'cyrillic', 'vietnamese'], popularity: 23, lastModified: '2024-01-01' },
  { family: 'Source Sans 3', category: 'sans-serif', variants: ['200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'], popularity: 24, lastModified: '2024-01-01' },
  // Monospace
  { family: 'JetBrains Mono', category: 'monospace', variants: ['100', '200', '300', '400', '500', '600', '700', '800'], subsets: ['latin', 'latin-ext', 'cyrillic'], popularity: 25, lastModified: '2024-01-01' },
  { family: 'IBM Plex Mono', category: 'monospace', variants: ['100', '200', '300', '400', '500', '600', '700'], subsets: ['latin', 'latin-ext', 'cyrillic', 'vietnamese'], popularity: 26, lastModified: '2024-01-01' },
  { family: 'Space Mono', category: 'monospace', variants: ['400', '700'], subsets: ['latin', 'latin-ext', 'vietnamese'], popularity: 27, lastModified: '2024-01-01' },
  { family: 'Fira Code', category: 'monospace', variants: ['300', '400', '500', '600', '700'], subsets: ['latin', 'latin-ext', 'cyrillic', 'greek'], popularity: 28, lastModified: '2024-01-01' },
  // Handwriting
  { family: 'Gochi Hand', category: 'handwriting', variants: ['400'], subsets: ['latin'], popularity: 29, lastModified: '2024-01-01' },
  { family: 'Caveat', category: 'handwriting', variants: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext', 'cyrillic'], popularity: 30, lastModified: '2024-01-01' },
];
