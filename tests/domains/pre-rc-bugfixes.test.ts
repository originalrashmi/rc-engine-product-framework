/**
 * Tests for Pre-RC core functionality:
 * - prc_start behavior (new project, existing project)
 * - ComplexityClassifier (parsing, fallback extraction)
 * - PersonaSelector coverage
 */

import { describe, it, expect, vi } from 'vitest';
import { ComplexityClassifier } from '../../src/domains/pre-rc/complexity-classifier.js';
import { PersonaSelector } from '../../src/domains/pre-rc/persona-selector.js';
import { prcStart } from '../../src/domains/pre-rc/tools/prc-start.js';
import { ComplexityDomain } from '../../src/domains/pre-rc/types.js';
import type { StatePersistence } from '../../src/domains/pre-rc/state/state-persistence.js';
import type { LLMFactory } from '../../src/shared/llm/factory.js';
import type { ContextLoader } from '../../src/domains/pre-rc/context-loader.js';

// Suppress console.error noise from classifier logs
vi.spyOn(console, 'error').mockImplementation(() => {});

// ═══════════════════════════════════════════════════════════════════════════
// prc_start behavior
// ═══════════════════════════════════════════════════════════════════════════

describe('prc_start', () => {
  function makePersistence(existingProject: boolean): StatePersistence {
    return {
      exists: vi.fn().mockResolvedValue(existingProject),
      createDirectories: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
      writeArtifact: vi.fn().mockResolvedValue('/fake/path'),
    } as unknown as StatePersistence;
  }

  it('rejects when project already exists', async () => {
    const persistence = makePersistence(true);

    const result = await prcStart(persistence, '/test', 'Test', 'A test product');

    expect(result).toContain('already exists');
    expect(persistence.createDirectories).not.toHaveBeenCalled();
  });

  it('proceeds normally when no existing project', async () => {
    const persistence = makePersistence(false);

    const result = await prcStart(persistence, '/test', 'Test', 'A test product');

    expect(persistence.createDirectories).toHaveBeenCalled();
    expect(persistence.save).toHaveBeenCalled();
    expect(result).toContain('initialized');
  });

  it('saves product brief with correct fields', async () => {
    const persistence = makePersistence(false);

    await prcStart(persistence, '/test/project', 'My App', 'Build an invoicing tool for freelancers');

    const saveCall = (persistence.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saveCall.projectPath).toBe('/test/project');
    expect(saveCall.projectName).toBe('My App');
    expect(saveCall.brief.rawInput).toBe('Build an invoicing tool for freelancers');
    expect(saveCall.brief.name).toBe('My App');
  });

  it('writes brief artifact', async () => {
    const persistence = makePersistence(false);

    await prcStart(persistence, '/test', 'Test', 'My product idea');

    expect(persistence.writeArtifact).toHaveBeenCalledWith(
      '/test',
      'brief.md',
      expect.stringContaining('My product idea'),
    );
  });

  it('truncates description to 300 chars', async () => {
    const persistence = makePersistence(false);
    const longBrief = 'A'.repeat(500);

    await prcStart(persistence, '/test', 'Test', longBrief);

    const saveCall = (persistence.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saveCall.brief.description.length).toBeLessThanOrEqual(300);
    expect(saveCall.brief.rawInput).toBe(longBrief); // rawInput preserved in full
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ComplexityClassifier
// ═══════════════════════════════════════════════════════════════════════════

describe('ComplexityClassifier', () => {
  const mockBrief = {
    name: 'Test Product',
    description: 'A test product',
    rawInput: 'Build an invoicing tool',
    timestamp: new Date().toISOString(),
  };

  const classificationJson = JSON.stringify({
    domain: 'complicated',
    confidence: 0.85,
    reasoning: 'Multi-integration product',
    productClass: 'enterprise SaaS',
    complexityFactors: ['auth', 'billing'],
  });

  function makeClient(shouldFail: boolean) {
    return {
      getProvider: () => 'gemini',
      getModel: () => 'gemini-2.0-flash',
      chatWithRetry: shouldFail
        ? vi.fn().mockRejectedValue(new Error('quota exceeded'))
        : vi.fn().mockResolvedValue({
            content: '```json\n' + classificationJson + '\n```',
            tokensUsed: 100,
            provider: 'gemini',
            inputTokens: 80,
            outputTokens: 20,
          }),
    };
  }

  function makeLlmFactory(client: ReturnType<typeof makeClient>): LLMFactory {
    return {
      getClient: vi.fn().mockReturnValue(client),
    } as unknown as LLMFactory;
  }

  function makeContextLoader(): ContextLoader {
    return {
      loadKnowledge: vi.fn().mockResolvedValue('# Complexity Framework\nClassify products...'),
    } as unknown as ContextLoader;
  }

  it('classifies successfully with valid JSON response', async () => {
    const client = makeClient(false);
    const classifier = new ComplexityClassifier(makeLlmFactory(client), makeContextLoader());

    const result = await classifier.classify(mockBrief);

    expect(result.domain).toBe(ComplexityDomain.Complicated);
    expect(result.confidence).toBe(0.85);
    expect(result.productClass).toBe('enterprise SaaS');
    expect(result.complexityFactors).toEqual(['auth', 'billing']);
    expect(client.chatWithRetry).toHaveBeenCalledTimes(1);
  });

  it('throws when provider fails', async () => {
    const client = makeClient(true);
    const classifier = new ComplexityClassifier(makeLlmFactory(client), makeContextLoader());

    await expect(classifier.classify(mockBrief)).rejects.toThrow('quota exceeded');
  });

  it('parses non-JSON response with best-effort extraction', async () => {
    const client = {
      getProvider: () => 'gemini',
      getModel: () => 'gemini-2.0-flash',
      chatWithRetry: vi.fn().mockResolvedValue({
        content: 'This product is clearly complex due to its AI components.',
        tokensUsed: 50,
        provider: 'gemini',
        inputTokens: 40,
        outputTokens: 10,
      }),
    };
    const classifier = new ComplexityClassifier(makeLlmFactory(client), makeContextLoader());

    const result = await classifier.classify(mockBrief);

    expect(result.domain).toBe(ComplexityDomain.Complex);
    expect(result.confidence).toBe(0.3); // Low confidence for fallback parse
  });

  it('extracts chaotic domain from free text', async () => {
    const client = {
      getProvider: () => 'gemini',
      getModel: () => 'gemini-2.0-flash',
      chatWithRetry: vi.fn().mockResolvedValue({
        content: 'The situation is chaotic and needs immediate stabilization.',
        tokensUsed: 50,
        provider: 'gemini',
      }),
    };
    const classifier = new ComplexityClassifier(makeLlmFactory(client), makeContextLoader());

    const result = await classifier.classify(mockBrief);

    expect(result.domain).toBe(ComplexityDomain.Chaotic);
  });

  it('extracts complicated domain from free text', async () => {
    const client = {
      getProvider: () => 'gemini',
      getModel: () => 'gemini-2.0-flash',
      chatWithRetry: vi.fn().mockResolvedValue({
        content: 'This is a complicated enterprise system requiring expert analysis.',
        tokensUsed: 50,
        provider: 'gemini',
      }),
    };
    const classifier = new ComplexityClassifier(makeLlmFactory(client), makeContextLoader());

    const result = await classifier.classify(mockBrief);

    expect(result.domain).toBe(ComplexityDomain.Complicated);
  });

  it('defaults to clear domain when no keywords found', async () => {
    const client = {
      getProvider: () => 'gemini',
      getModel: () => 'gemini-2.0-flash',
      chatWithRetry: vi.fn().mockResolvedValue({
        content: 'This is a simple standard application.',
        tokensUsed: 50,
        provider: 'gemini',
      }),
    };
    const classifier = new ComplexityClassifier(makeLlmFactory(client), makeContextLoader());

    const result = await classifier.classify(mockBrief);

    expect(result.domain).toBe(ComplexityDomain.Clear);
  });

  it('builds passthrough prompt with knowledge content', async () => {
    const client = makeClient(false);
    const classifier = new ComplexityClassifier(makeLlmFactory(client), makeContextLoader());

    const prompt = await classifier.buildPassthroughPrompt(mockBrief);

    expect(prompt).toContain('Complexity Framework');
    expect(prompt).toContain('Test Product');
    expect(prompt).toContain('Build an invoicing tool');
    expect(prompt).toContain('"domain"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Persona selector
// ═══════════════════════════════════════════════════════════════════════════

describe('PersonaSelector selection logic', () => {
  const selector = new PersonaSelector();

  it('activates more personas for complex products', () => {
    const clear = selector.select({
      domain: ComplexityDomain.Clear,
      confidence: 0.9,
      reasoning: 'Simple CRUD app',
      productClass: 'utility',
      complexityFactors: [],
    });

    const complex = selector.select({
      domain: ComplexityDomain.Complex,
      confidence: 0.8,
      reasoning: 'AI-native product with novel market',
      productClass: 'AI platform',
      complexityFactors: ['ai', 'novel market', 'regulatory'],
    });

    expect(complex.totalActive).toBeGreaterThan(clear.totalActive);
  });

  it('always activates core personas regardless of complexity', () => {
    const clear = selector.select({
      domain: ComplexityDomain.Clear,
      confidence: 0.95,
      reasoning: 'Static site',
      productClass: 'website',
      complexityFactors: [],
    });

    // At minimum, always-run personas should be active
    expect(clear.totalActive).toBeGreaterThanOrEqual(3);
    expect(clear.activePersonas.length).toBe(clear.totalActive);
  });

  it('skips personas with reasons', () => {
    const clear = selector.select({
      domain: ComplexityDomain.Clear,
      confidence: 0.9,
      reasoning: 'Simple product',
      productClass: 'utility',
      complexityFactors: [],
    });

    expect(clear.totalSkipped).toBeGreaterThan(0);
    expect(clear.skippedPersonas.length).toBe(clear.totalSkipped);
    for (const skipped of clear.skippedPersonas) {
      expect(skipped.reason).toBeTruthy();
      expect(skipped.id).toBeTruthy();
    }
  });

  it('active + skipped = total personas', () => {
    for (const domain of [
      ComplexityDomain.Clear,
      ComplexityDomain.Complicated,
      ComplexityDomain.Complex,
      ComplexityDomain.Chaotic,
    ]) {
      const result = selector.select({
        domain,
        confidence: 0.8,
        reasoning: 'test',
        productClass: 'test',
        complexityFactors: ['test'],
      });

      expect(result.totalActive + result.totalSkipped).toBeGreaterThanOrEqual(15);
    }
  });
});
