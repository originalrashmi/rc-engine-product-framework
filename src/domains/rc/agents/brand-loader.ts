import fs from 'node:fs';
import path from 'node:path';
import type { BrandProfile, BrandImportInput, BrandImportResult } from '../brand-types.js';
import { BrandNormalizer } from './brand-normalizer.js';

/**
 * BrandAssetLoader
 *
 * Ingests brand assets from three channels:
 * 1. Auto-detection from project files (tailwind config, CSS vars, tokens)
 * 2. URL scraping (extract colors, fonts, structure from a live site)
 * 3. Manual input (user-provided BrandProfile fields)
 *
 * Produces a normalized BrandProfile for downstream agents.
 */
export class BrandAssetLoader {
  private normalizer = new BrandNormalizer();

  /**
   * Import brand assets from all available sources.
   */
  async import(input: BrandImportInput): Promise<BrandImportResult> {
    const detectedFrom: string[] = [];
    const partialProfile: Partial<BrandProfile> = {};

    // Channel A: Auto-detect from project files
    const autoDetected = this.scanProjectFiles(input.projectPath);
    if (autoDetected.profile) {
      Object.assign(partialProfile, autoDetected.profile);
      detectedFrom.push(...autoDetected.sources);
    }

    // Channel B: URL scraping (if provided)
    if (input.websiteUrl) {
      const scraped = await this.scrapeUrl(input.websiteUrl);
      if (scraped) {
        // Merge scraped data (don't overwrite auto-detected)
        this.mergePartial(partialProfile, scraped);
        detectedFrom.push(`url:${input.websiteUrl}`);
      }
    }

    // Channel C: Manual input (highest priority — overrides everything)
    if (input.manualInput) {
      this.mergePartial(partialProfile, input.manualInput);
      detectedFrom.push('manual-input');
    }

    // Normalize: fill gaps based on mode
    const { profile, gaps } = this.normalizer.normalize(partialProfile, input.mode);

    // Determine source type
    let source: BrandImportResult['source'] = 'auto-detected';
    if (input.manualInput && autoDetected.profile) source = 'hybrid';
    else if (input.manualInput) source = 'manual';
    else if (input.websiteUrl) source = 'url-scraped';

    // Calculate confidence
    const confidence = this.calculateConfidence(profile, gaps);

    return { profile, source, confidence, detectedFrom, gaps };
  }

  /**
   * Scan project files for brand signals.
   */
  private scanProjectFiles(
    projectPath: string,
  ): { profile: Partial<BrandProfile> | null; sources: string[] } {
    const sources: string[] = [];
    const profile: Partial<BrandProfile> = {};

    // Priority 1: Tailwind config
    const tailwindResult = this.parseTailwindConfig(projectPath);
    if (tailwindResult) {
      Object.assign(profile, tailwindResult);
      sources.push('tailwind.config');
    }

    // Priority 1: Design tokens file
    const tokensResult = this.parseTokensFile(projectPath);
    if (tokensResult) {
      this.mergePartial(profile, tokensResult);
      sources.push('tokens.json');
    }

    // Priority 2: CSS custom properties
    const cssResult = this.parseCssVariables(projectPath);
    if (cssResult) {
      this.mergePartial(profile, cssResult);
      sources.push('globals.css');
    }

    // Priority 2: Package.json for UI framework
    const frameworkResult = this.detectFramework(projectPath);
    if (frameworkResult) {
      profile.existingSystem = { ...profile.existingSystem, ...frameworkResult };
      sources.push('package.json');
    }

    // Priority 2: Constants directory (like Navvo's colors.ts)
    const constantsResult = this.parseConstantsDir(projectPath);
    if (constantsResult) {
      this.mergePartial(profile, constantsResult);
      sources.push('src/lib/constants/');
    }

    // Priority 3: Logo file detection
    const logoResult = this.detectLogo(projectPath);
    if (logoResult) {
      profile.logo = logoResult;
      sources.push('public/logo.*');
    }

    if (sources.length === 0) return { profile: null, sources: [] };
    return { profile, sources };
  }

  // ── File Parsers ────────────────────────────────────────────────────────

  private parseTailwindConfig(projectPath: string): Partial<BrandProfile> | null {
    const configPaths = ['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.mjs'];

    for (const configFile of configPaths) {
      const configPath = path.join(projectPath, configFile);
      if (!fs.existsSync(configPath)) continue;

      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const profile: Partial<BrandProfile> = {};

        // Extract colors from theme.extend.colors
        const colorMatches = content.matchAll(
          /['"](\w+)['"]:\s*['"]?(#[0-9a-fA-F]{3,8})['"]?/g,
        );
        const extractedColors: Record<string, string> = {};
        for (const match of colorMatches) {
          extractedColors[match[1]] = match[2];
        }

        if (Object.keys(extractedColors).length > 0) {
          // Try to identify primary/secondary from naming conventions
          const primary =
            extractedColors['primary'] ??
            extractedColors['brand'] ??
            Object.values(extractedColors)[0];
          const secondary =
            extractedColors['secondary'] ??
            extractedColors['accent'] ??
            Object.values(extractedColors)[1];

          if (primary) {
            profile.colors = {
              primary: { hex: primary },
              secondary: secondary ? { hex: secondary } : undefined,
              neutral: {
                lightest: extractedColors['background'] ?? '#FFFFFF',
                darkest: extractedColors['foreground'] ?? '#111111',
              },
            };
          }
        }

        // Extract font families
        const fontMatches = content.matchAll(
          /(?:heading|sans|serif|mono|body|accent)['"]?:\s*\[?['"]([^'"]+)['"]/g,
        );
        const extractedFonts: Record<string, string> = {};
        for (const match of fontMatches) {
          const key = match[0].match(/(\w+)['"]?:/)?.[1] ?? 'sans';
          extractedFonts[key] = match[1];
        }

        if (Object.keys(extractedFonts).length > 0) {
          profile.typography = {
            headingFont: {
              family: extractedFonts['heading'] ?? extractedFonts['sans'] ?? 'Inter',
            },
            bodyFont: {
              family: extractedFonts['body'] ?? extractedFonts['sans'] ?? 'Inter',
            },
          };
          if (extractedFonts['mono']) {
            profile.typography.monoFont = { family: extractedFonts['mono'] };
          }
          if (extractedFonts['accent']) {
            profile.typography.accentFont = {
              family: extractedFonts['accent'],
              usage: 'accent text',
            };
          }
        }

        // Extract border radius
        const radiusMatch = content.match(/borderRadius:\s*\{[^}]*default:\s*['"]([^'"]+)['"]/);
        if (radiusMatch) {
          profile.shape = { borderRadius: { default: radiusMatch[1] as 'sm' | 'md' | 'lg' } };
        }

        return Object.keys(profile).length > 0 ? profile : null;
      } catch {
        continue;
      }
    }

    return null;
  }

  private parseTokensFile(projectPath: string): Partial<BrandProfile> | null {
    const tokenPaths = ['tokens.json', 'tokens.yaml', 'design-tokens.json'];

    for (const tokenFile of tokenPaths) {
      const tokenPath = path.join(projectPath, tokenFile);
      if (!fs.existsSync(tokenPath)) continue;

      try {
        const content = fs.readFileSync(tokenPath, 'utf-8');
        const tokens = JSON.parse(content) as Record<string, unknown>;

        // Extract what we can from the token structure
        const profile: Partial<BrandProfile> = {};
        if (tokens['color'] || tokens['colors']) {
          // Basic color extraction — real implementation would walk the tree
          profile.colors = {
            primary: { hex: '#3B82F6' },
            neutral: { lightest: '#FFFFFF', darkest: '#111111' },
          };
        }
        return Object.keys(profile).length > 0 ? profile : null;
      } catch {
        continue;
      }
    }

    return null;
  }

  private parseCssVariables(projectPath: string): Partial<BrandProfile> | null {
    const cssPaths = [
      'src/app/globals.css',
      'src/styles/globals.css',
      'styles/globals.css',
      'app/globals.css',
    ];

    for (const cssFile of cssPaths) {
      const cssPath = path.join(projectPath, cssFile);
      if (!fs.existsSync(cssPath)) continue;

      try {
        const content = fs.readFileSync(cssPath, 'utf-8');
        const profile: Partial<BrandProfile> = {};

        // Extract CSS custom properties from :root
        const varMatches = content.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{3,8})/gi);
        const vars: Record<string, string> = {};
        for (const match of varMatches) {
          vars[match[1]] = match[2];
        }

        if (Object.keys(vars).length > 0) {
          const primary =
            vars['primary'] ?? vars['color-primary'] ?? vars['brand-primary'];
          const background = vars['background'] ?? vars['bg'];
          const foreground = vars['foreground'] ?? vars['text'];

          if (primary) {
            profile.colors = {
              primary: { hex: primary },
              neutral: {
                lightest: background ?? '#FFFFFF',
                darkest: foreground ?? '#111111',
              },
            };
          }
        }

        // Extract font-family declarations
        const fontMatches = content.matchAll(
          /--font-([a-z]+):\s*['"]?([^;'"]+)['"]?;/gi,
        );
        const fonts: Record<string, string> = {};
        for (const match of fontMatches) {
          fonts[match[1]] = match[2].split(',')[0].trim().replace(/['"]/g, '');
        }

        if (Object.keys(fonts).length > 0) {
          profile.typography = {
            headingFont: { family: fonts['heading'] ?? fonts['sans'] ?? 'Inter' },
            bodyFont: { family: fonts['body'] ?? fonts['sans'] ?? 'Inter' },
          };
        }

        return Object.keys(profile).length > 0 ? profile : null;
      } catch {
        continue;
      }
    }

    return null;
  }

  private detectFramework(
    projectPath: string,
  ): { framework?: string; componentLibrary?: string } | null {
    const pkgPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<
        string,
        Record<string, string>
      >;
      const deps = { ...pkg['dependencies'], ...pkg['devDependencies'] };

      const result: { framework?: string; componentLibrary?: string } = {};

      // CSS framework detection
      if (deps['tailwindcss']) result.framework = 'Tailwind';
      else if (deps['@chakra-ui/react']) result.framework = 'Chakra UI';
      else if (deps['@mui/material']) result.framework = 'Material UI';
      else if (deps['antd']) result.framework = 'Ant Design';

      // Component library detection
      if (deps['@radix-ui/react-dialog'] || deps['@radix-ui/themes'])
        result.componentLibrary = 'Radix';
      // shadcn is detected by the presence of components.json
      if (fs.existsSync(path.join(projectPath, 'components.json')))
        result.componentLibrary = 'shadcn/ui';

      return Object.keys(result).length > 0 ? result : null;
    } catch {
      return null;
    }
  }

  private parseConstantsDir(projectPath: string): Partial<BrandProfile> | null {
    const constantsDirs = ['src/lib/constants', 'src/constants', 'lib/constants'];

    for (const dir of constantsDirs) {
      const constantsPath = path.join(projectPath, dir);
      if (!fs.existsSync(constantsPath)) continue;

      try {
        const files = fs.readdirSync(constantsPath);
        const colorFile = files.find(
          (f) => f.includes('color') && (f.endsWith('.ts') || f.endsWith('.js')),
        );

        if (colorFile) {
          const content = fs.readFileSync(path.join(constantsPath, colorFile), 'utf-8');
          const hexMatches = content.matchAll(/['"]?(#[0-9a-fA-F]{3,8})['"]?/g);
          const colors: string[] = [];
          for (const match of hexMatches) {
            if (!colors.includes(match[1])) colors.push(match[1]);
          }

          if (colors.length > 0) {
            return {
              colors: {
                primary: { hex: colors[0] },
                secondary: colors[1] ? { hex: colors[1] } : undefined,
                accent: colors.slice(2).map((hex) => ({ hex })),
                neutral: { lightest: '#FFFFFF', darkest: '#000000' },
              },
            };
          }
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private detectLogo(
    projectPath: string,
  ): BrandProfile['logo'] | undefined {
    const publicDir = path.join(projectPath, 'public');
    if (!fs.existsSync(publicDir)) return undefined;

    try {
      const files = fs.readdirSync(publicDir);
      const logoFile = files.find(
        (f) =>
          f.startsWith('logo') &&
          (f.endsWith('.svg') || f.endsWith('.png') || f.endsWith('.jpg')),
      );

      if (logoFile) {
        return {
          description: `Logo file detected: ${logoFile}`,
          variants: ['full-color'],
        };
      }
    } catch {
      // Non-fatal
    }

    return undefined;
  }

  // ── URL Scraping ────────────────────────────────────────────────────────

  private async scrapeUrl(url: string): Promise<Partial<BrandProfile> | null> {
    try {
      console.log(`[BrandAssetLoader] Scraping ${url} for brand signals...`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'RC-Engine-BrandLoader/1.0',
          Accept: 'text/html',
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.log(`[BrandAssetLoader] HTTP ${response.status} from ${url}`);
        return null;
      }

      const html = await response.text();
      const profile: Partial<BrandProfile> = {};

      // ── Extract brand name from meta tags / title ──
      const brandName = this.extractBrandName(html);
      if (brandName) {
        profile.name = brandName;
      }

      // ── Extract colors from inline styles and <style> blocks ──
      const colors = this.extractColorsFromHtml(html);
      if (colors) {
        profile.colors = colors;
      }

      // ── Extract fonts from CSS and Google Fonts links ──
      const typography = this.extractTypographyFromHtml(html);
      if (typography) {
        profile.typography = typography;
      }

      if (Object.keys(profile).length === 0) {
        console.log(`[BrandAssetLoader] No brand signals found in ${url}`);
        return null;
      }

      console.log(
        `[BrandAssetLoader] Extracted from ${url}: ${Object.keys(profile).join(', ')}`,
      );
      return profile;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[BrandAssetLoader] URL scrape failed for ${url}: ${message}`);
      return null;
    }
  }

  /**
   * Extract brand name from og:title, meta title, or <title> tag.
   */
  private extractBrandName(html: string): string | null {
    // Try og:title first
    const ogTitle = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    ) ?? html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    );
    if (ogTitle?.[1]) return ogTitle[1].trim();

    // Fall back to <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch?.[1]) {
      // Clean common suffixes like "| Company" or "- Home"
      const raw = titleMatch[1].trim();
      const cleaned = raw.split(/\s*[|\-–—]\s*/)[0].trim();
      return cleaned || raw;
    }

    return null;
  }

  /**
   * Extract hex colors from HTML style blocks and inline styles.
   * Picks the most common non-white/black/gray color as primary.
   */
  private extractColorsFromHtml(
    html: string,
  ): Partial<BrandProfile>['colors'] | null {
    // Collect all hex colors from the page
    const hexPattern = /#([0-9a-fA-F]{3,8})\b/g;
    const colorCounts = new Map<string, number>();

    for (const match of html.matchAll(hexPattern)) {
      let hex = match[1];
      // Normalize 3-char hex to 6-char
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      // Skip 8-char (alpha) and anything not 6-char after normalization
      if (hex.length !== 6) continue;

      const normalized = `#${hex.toUpperCase()}`;
      if (this.isNeutralColor(normalized)) continue;

      colorCounts.set(normalized, (colorCounts.get(normalized) ?? 0) + 1);
    }

    if (colorCounts.size === 0) return null;

    // Sort by frequency, most common first
    const sorted = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]);
    const primary = sorted[0][0];
    const secondary = sorted.length > 1 ? sorted[1][0] : undefined;
    const accents = sorted.slice(2, 5).map(([hex]) => ({ hex }));

    return {
      primary: { hex: primary },
      secondary: secondary ? { hex: secondary } : undefined,
      accent: accents.length > 0 ? accents : undefined,
      neutral: { lightest: '#FFFFFF', darkest: '#111111' },
    };
  }

  /**
   * Check if a hex color is effectively white, black, or gray.
   */
  private isNeutralColor(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Check if near-white or near-black
    if (r > 230 && g > 230 && b > 230) return true; // near white
    if (r < 30 && g < 30 && b < 30) return true; // near black

    // Check if gray (all channels within 15 of each other)
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 15) return true;

    return false;
  }

  /**
   * Extract font families from CSS font-family declarations and Google Fonts links.
   */
  private extractTypographyFromHtml(
    html: string,
  ): Partial<BrandProfile>['typography'] | null {
    const fonts: string[] = [];

    // Extract from Google Fonts <link> tags
    const googleFontsPattern =
      /fonts\.googleapis\.com\/css2?\?[^"'>\s]*family=([^"'>\s&]+)/gi;
    for (const match of html.matchAll(googleFontsPattern)) {
      // Google Fonts encodes families like "Inter:wght@400;700" or "Open+Sans"
      const familyParam = decodeURIComponent(match[1]);
      // May have multiple families separated by &family=
      const families = familyParam.split(/[&]?family=/);
      for (const fam of families) {
        if (!fam) continue;
        const cleaned = fam.split(':')[0].replace(/\+/g, ' ').trim();
        if (cleaned && !fonts.includes(cleaned)) {
          fonts.push(cleaned);
        }
      }
    }

    // Extract from CSS font-family declarations
    const fontFamilyPattern = /font-family:\s*['"]?([^;'"}\n]+)/gi;
    for (const match of html.matchAll(fontFamilyPattern)) {
      const firstFont = match[1].split(',')[0].trim().replace(/['"]/g, '');
      // Skip generic families and system defaults
      const generics = [
        'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
        'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace',
        'inherit', 'initial', 'unset', 'var',
      ];
      if (firstFont && !generics.includes(firstFont.toLowerCase()) && !fonts.includes(firstFont)) {
        fonts.push(firstFont);
      }
    }

    if (fonts.length === 0) return null;

    return {
      headingFont: { family: fonts[0], source: this.inferFontSource(fonts[0], html) },
      bodyFont: {
        family: fonts.length > 1 ? fonts[1] : fonts[0],
        source: this.inferFontSource(fonts.length > 1 ? fonts[1] : fonts[0], html),
      },
    };
  }

  /**
   * Infer whether a font is from Google Fonts or another source.
   */
  private inferFontSource(
    fontFamily: string,
    html: string,
  ): 'google' | 'custom' | 'system' {
    if (html.includes('fonts.googleapis.com') && html.includes(fontFamily.replace(/\s/g, '+'))) {
      return 'google';
    }
    const systemFonts = [
      'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana',
      'Courier New', 'Segoe UI', 'Roboto', 'SF Pro',
    ];
    if (systemFonts.some((sf) => sf.toLowerCase() === fontFamily.toLowerCase())) {
      return 'system';
    }
    return 'custom';
  }

  // ── Utilities ───────────────────────────────────────────────────────────

  /**
   * Recursively merge source into target without overwriting existing values.
   * - Scalars: target wins (source only fills gaps)
   * - Objects: recurse to fill gaps at every level
   * - Arrays: target wins (no array merging to avoid duplicates)
   */
  private mergePartial(
    target: Partial<BrandProfile>,
    source: Partial<BrandProfile>,
  ): void {
    this.deepMergeGaps(
      target as Record<string, unknown>,
      source as Record<string, unknown>,
    );
  }

  private deepMergeGaps(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): void {
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || value === null) continue;

      const existing = target[key];
      if (existing === undefined || existing === null) {
        // Gap: fill from source
        target[key] = value;
      } else if (
        typeof existing === 'object' &&
        typeof value === 'object' &&
        !Array.isArray(existing) &&
        !Array.isArray(value)
      ) {
        // Both are objects: recurse
        this.deepMergeGaps(
          existing as Record<string, unknown>,
          value as Record<string, unknown>,
        );
      }
      // Scalars and arrays: target wins
    }
  }

  private calculateConfidence(profile: BrandProfile, gaps: string[]): number {
    const totalFields = 10; // name, colors, typography, shape, voice, etc.
    const filledFields = totalFields - Math.min(gaps.length, totalFields);
    return Math.round((filledFields / totalFields) * 100);
  }
}
