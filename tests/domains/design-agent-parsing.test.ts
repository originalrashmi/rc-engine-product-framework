import { describe, it, expect } from 'vitest';

/**
 * Tests the wireframe parsing logic from DesignAgent.
 * Since parseWireframes is private, we test the regex extraction pattern directly.
 */

const WIREFRAME_REGEX = /===WIREFRAME:\s*(.+?)\|(.+?)===\n([\s\S]*?)===END_WIREFRAME===/g;

function parseWireframes(optionId: string, text: string) {
  const screens = new Map<string, { lofi?: string; hifi?: string }>();
  let match;
  const regex = new RegExp(WIREFRAME_REGEX.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    const screenName = match[1].trim();
    const fidelity = match[2].trim().toLowerCase();
    const html = match[3].trim();

    if (!screens.has(screenName)) {
      screens.set(screenName, {});
    }

    const screen = screens.get(screenName)!;
    if (fidelity === 'lofi') screen.lofi = html;
    else if (fidelity === 'hifi') screen.hifi = html;
  }

  const results = [];
  for (const [screenName, content] of screens) {
    results.push({
      optionId,
      screenName,
      lofiHtml: content.lofi ?? '<html><body><p>Lo-fi wireframe not generated</p></body></html>',
      hifiHtml: content.hifi ?? '<html><body><p>Hi-fi wireframe not generated</p></body></html>',
    });
  }
  return results;
}

describe('Design Agent Wireframe Parsing', () => {
  it('parses a single screen with both lo-fi and hi-fi', () => {
    const text = `Some preamble text.

===WIREFRAME: Dashboard|lofi===
<html><body><div>Lo-fi dashboard</div></body></html>
===END_WIREFRAME===

===WIREFRAME: Dashboard|hifi===
<html><body><div style="color:blue">Hi-fi dashboard</div></body></html>
===END_WIREFRAME===

Some trailing text.`;

    const results = parseWireframes('A', text);
    expect(results).toHaveLength(1);
    expect(results[0].optionId).toBe('A');
    expect(results[0].screenName).toBe('Dashboard');
    expect(results[0].lofiHtml).toContain('Lo-fi dashboard');
    expect(results[0].hifiHtml).toContain('Hi-fi dashboard');
  });

  it('parses multiple screens', () => {
    const text = `===WIREFRAME: Dashboard|lofi===
<html>dash lofi</html>
===END_WIREFRAME===

===WIREFRAME: Dashboard|hifi===
<html>dash hifi</html>
===END_WIREFRAME===

===WIREFRAME: Settings|lofi===
<html>settings lofi</html>
===END_WIREFRAME===

===WIREFRAME: Settings|hifi===
<html>settings hifi</html>
===END_WIREFRAME===`;

    const results = parseWireframes('B', text);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.screenName)).toEqual(['Dashboard', 'Settings']);
    expect(results[0].lofiHtml).toContain('dash lofi');
    expect(results[1].hifiHtml).toContain('settings hifi');
  });

  it('provides fallback HTML when only one fidelity is present', () => {
    const text = `===WIREFRAME: Login|hifi===
<html>login hifi only</html>
===END_WIREFRAME===`;

    const results = parseWireframes('A', text);
    expect(results).toHaveLength(1);
    expect(results[0].lofiHtml).toContain('Lo-fi wireframe not generated');
    expect(results[0].hifiHtml).toContain('login hifi only');
  });

  it('returns empty array for no wireframe blocks', () => {
    const results = parseWireframes('A', 'Just some plain text with no wireframes.');
    expect(results).toHaveLength(0);
  });

  it('handles whitespace in screen names', () => {
    const text = `===WIREFRAME: User Profile|lofi===
<html>profile</html>
===END_WIREFRAME===`;

    const results = parseWireframes('C', text);
    expect(results).toHaveLength(1);
    expect(results[0].screenName).toBe('User Profile');
  });

  it('handles multiline HTML content', () => {
    const text = `===WIREFRAME: Home|hifi===
<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body>
  <div class="container">
    <h1>Welcome</h1>
    <p>Multi-line content</p>
  </div>
</body>
</html>
===END_WIREFRAME===`;

    const results = parseWireframes('A', text);
    expect(results).toHaveLength(1);
    expect(results[0].hifiHtml).toContain('<h1>Welcome</h1>');
    expect(results[0].hifiHtml).toContain('Multi-line content');
  });

  it('preserves option ID from input', () => {
    const text = `===WIREFRAME: Page|lofi===
<html>x</html>
===END_WIREFRAME===`;

    expect(parseWireframes('A', text)[0].optionId).toBe('A');
    expect(parseWireframes('B', text)[0].optionId).toBe('B');
    expect(parseWireframes('C', text)[0].optionId).toBe('C');
  });

  it('is case-insensitive for fidelity markers', () => {
    const text = `===WIREFRAME: Dash|LOFI===
<html>lo</html>
===END_WIREFRAME===

===WIREFRAME: Dash|HiFi===
<html>hi</html>
===END_WIREFRAME===`;

    const results = parseWireframes('A', text);
    expect(results).toHaveLength(1);
    expect(results[0].lofiHtml).toContain('lo');
    expect(results[0].hifiHtml).toContain('hi');
  });
});
