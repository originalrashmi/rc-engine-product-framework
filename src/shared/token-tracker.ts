import fs from 'node:fs';
import path from 'node:path';
import type { LLMProvider } from './types.js';

interface TokenRecord {
  domain: string;
  tool: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  provider: LLMProvider;
  timestamp: string;
}

/**
 * Tracks token usage across all domains in the unified pipeline.
 * Writes a running summary to .rc-engine/PIPELINE.md in the project directory.
 * Tracks cache hits/misses for prompt caching visibility.
 */
export class TokenTracker {
  private records: TokenRecord[] = [];
  private projectPath: string | null = null;

  /** Set the project path for persisting the pipeline file */
  setProjectPath(projectPath: string): void {
    this.projectPath = projectPath;
  }

  /** Record token usage from a tool call (backward-compatible: extra fields optional) */
  record(
    domain: string,
    tool: string,
    tokens: number,
    provider: LLMProvider,
    details?: { inputTokens?: number; outputTokens?: number; cacheCreationTokens?: number; cacheReadTokens?: number },
  ): void {
    this.records.push({
      domain,
      tool,
      tokens,
      inputTokens: details?.inputTokens ?? 0,
      outputTokens: details?.outputTokens ?? tokens,
      cacheCreationTokens: details?.cacheCreationTokens ?? 0,
      cacheReadTokens: details?.cacheReadTokens ?? 0,
      provider,
      timestamp: new Date().toISOString(),
    });

    // Persist after each record
    if (this.projectPath) {
      try {
        this.writePipelineFile();
      } catch {
        // Non-critical - don't crash if we can't write
      }
    }
  }

  /** Get total cache tokens saved (read from cache instead of recomputed). */
  getCacheStats(): { created: number; read: number; savedPercent: number } {
    let created = 0;
    let read = 0;
    let totalInput = 0;
    for (const r of this.records) {
      created += r.cacheCreationTokens;
      read += r.cacheReadTokens;
      totalInput += r.inputTokens;
    }
    const savedPercent = totalInput > 0 ? Math.round((read / totalInput) * 100) : 0;
    return { created, read, savedPercent };
  }

  /** Get total tokens used across all domains */
  getTotalTokens(): number {
    return this.records.reduce((sum, r) => sum + r.tokens, 0);
  }

  /** Get tokens by domain */
  getTokensByDomain(): Record<string, number> {
    const byDomain: Record<string, number> = {};
    for (const r of this.records) {
      byDomain[r.domain] = (byDomain[r.domain] || 0) + r.tokens;
    }
    return byDomain;
  }

  /** Get tokens by provider */
  getTokensByProvider(): Record<string, number> {
    const byProvider: Record<string, number> = {};
    for (const r of this.records) {
      byProvider[r.provider] = (byProvider[r.provider] || 0) + r.tokens;
    }
    return byProvider;
  }

  /** Get call count by domain */
  getCallsByDomain(): Record<string, number> {
    const byDomain: Record<string, number> = {};
    for (const r of this.records) {
      byDomain[r.domain] = (byDomain[r.domain] || 0) + 1;
    }
    return byDomain;
  }

  /** Get a formatted summary for a specific domain */
  getDomainSummary(domain: string): string {
    const domainRecords = this.records.filter((r) => r.domain === domain);
    if (domainRecords.length === 0) return '';

    const totalTokens = domainRecords.reduce((sum, r) => sum + r.tokens, 0);
    const byProvider: Record<string, number> = {};
    for (const r of domainRecords) {
      byProvider[r.provider] = (byProvider[r.provider] || 0) + r.tokens;
    }

    const providerLines = Object.entries(byProvider)
      .map(([provider, tokens]) => `    ${provider}: ${tokens.toLocaleString()} tokens`)
      .join('\n');

    return `\n  AI USAGE (this session):\n    Calls: ${domainRecords.length}\n    Tokens: ${totalTokens.toLocaleString()}\n${providerLines}`;
  }

  /** Get a formatted summary string */
  getSummary(): string {
    const total = this.getTotalTokens();
    const byDomain = this.getTokensByDomain();
    const byProvider = this.getTokensByProvider();
    const calls = this.getCallsByDomain();
    const cache = this.getCacheStats();

    const totalInput = this.records.reduce((s, r) => s + r.inputTokens, 0);
    const totalOutput = this.records.reduce((s, r) => s + r.outputTokens, 0);

    const lines: string[] = [
      '# RC Engine Pipeline - Token Usage',
      '',
      `**Total Tokens:** ${total.toLocaleString()} (input: ${totalInput.toLocaleString()}, output: ${totalOutput.toLocaleString()})`,
      `**Total Calls:** ${this.records.length}`,
    ];

    // Cache stats (only shown when caching is active)
    if (cache.created > 0 || cache.read > 0) {
      lines.push(
        '',
        '## Prompt Cache',
        `| Metric | Tokens |`,
        `|--------|--------|`,
        `| Cache created | ${cache.created.toLocaleString()} |`,
        `| Cache read (saved) | ${cache.read.toLocaleString()} |`,
        `| Cache hit rate | ${cache.savedPercent}% of input |`,
      );
    }

    lines.push(
      '',
      '## By Domain',
      '| Domain | Calls | Input | Output | Total |',
      '|--------|-------|-------|--------|-------|',
    );

    for (const [domain, tokens] of Object.entries(byDomain)) {
      const domainRecords = this.records.filter((r) => r.domain === domain);
      const dInput = domainRecords.reduce((s, r) => s + r.inputTokens, 0);
      const dOutput = domainRecords.reduce((s, r) => s + r.outputTokens, 0);
      lines.push(`| ${domain} | ${calls[domain] || 0} | ${dInput.toLocaleString()} | ${dOutput.toLocaleString()} | ${tokens.toLocaleString()} |`);
    }

    lines.push('', '## By Provider', '| Provider | Tokens |', '|----------|--------|');
    for (const [provider, tokens] of Object.entries(byProvider)) {
      lines.push(`| ${provider} | ${tokens.toLocaleString()} |`);
    }

    if (this.records.length > 0) {
      lines.push(
        '',
        '## Recent Calls (last 10)',
        '| Time | Domain | Tool | In | Out | Cache | Provider |',
        '|------|--------|------|----|-----|-------|----------|',
      );
      const recent = this.records.slice(-10);
      for (const r of recent) {
        const time = r.timestamp.split('T')[1]?.split('.')[0] || r.timestamp;
        const cacheLabel = r.cacheReadTokens > 0
          ? `hit(${r.cacheReadTokens.toLocaleString()})`
          : r.cacheCreationTokens > 0
            ? `new(${r.cacheCreationTokens.toLocaleString()})`
            : '-';
        lines.push(`| ${time} | ${r.domain} | ${r.tool} | ${r.inputTokens.toLocaleString()} | ${r.outputTokens.toLocaleString()} | ${cacheLabel} | ${r.provider} |`);
      }
    }

    return lines.join('\n');
  }

  /** Write pipeline summary to project directory */
  private writePipelineFile(): void {
    if (!this.projectPath) return;

    const dir = path.join(this.projectPath, '.rc-engine');
    fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, 'PIPELINE.md');
    const tmpPath = filePath + '.tmp';

    // Atomic write: write to tmp, then rename
    fs.writeFileSync(tmpPath, this.getSummary(), 'utf-8');
    fs.renameSync(tmpPath, filePath);
  }
}

/** Singleton instance shared across all domains */
export const tokenTracker = new TokenTracker();
