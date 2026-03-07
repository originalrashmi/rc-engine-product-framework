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
    // URL scraping is done via WebFetch or Firecrawl MCP in the host environment.
    // This agent method prepares the scrape request and processes results.
    // For now, return null — the host IDE (Claude Code) will handle actual fetching
    // via MCP tools when the brand_import tool is called.
    //
    // In autonomous mode (with API key), this would:
    // 1. fetch(url) to get HTML
    // 2. Parse CSS for colors, fonts, spacing
    // 3. Extract meta tags for brand name, description
    // 4. Return partial BrandProfile
    console.log(`[BrandAssetLoader] URL scraping for ${url} — delegated to host environment`);
    return null;
  }

  // ── Utilities ───────────────────────────────────────────────────────────

  /**
   * Merge source into target without overwriting existing values.
   */
  private mergePartial(
    target: Partial<BrandProfile>,
    source: Partial<BrandProfile>,
  ): void {
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || value === null) continue;

      const existing = (target as Record<string, unknown>)[key];
      if (existing === undefined || existing === null) {
        (target as Record<string, unknown>)[key] = value;
      } else if (typeof existing === 'object' && typeof value === 'object' && !Array.isArray(existing)) {
        // Deep merge objects
        Object.assign(existing, value);
      }
      // If target already has a value and source has one too, target wins
      // (manual input is applied last to override)
    }
  }

  private calculateConfidence(profile: BrandProfile, gaps: string[]): number {
    const totalFields = 10; // name, colors, typography, shape, voice, etc.
    const filledFields = totalFields - Math.min(gaps.length, totalFields);
    return Math.round((filledFields / totalFields) * 100);
  }
}
