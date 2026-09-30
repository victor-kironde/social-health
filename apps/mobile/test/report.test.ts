import { DEFAULT_CONFIG } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import { anonymousNames, buildReportHtml, escapeHtml, type ReportPalette } from '../src/data/report';
import { SCENARIO_AS_OF, findScenario, scenarioGroups } from '../src/data/scenarioCatalog';

const palette: ReportPalette = {
  text: '#111',
  muted: '#666',
  border: '#ddd',
  accent: '#2f6fde',
  health: { 1: '#d64545', 2: '#e8833a', 3: '#d9a72b', 4: '#7cb342', 5: '#2e9d57', lost: '#9aa0a8' },
};

describe('PDF report', () => {
  const log = findScenario('doctor')!.build();
  const html = buildReportHtml({ log, config: DEFAULT_CONFIG, now: SCENARIO_AS_OF, palette, groups: scenarioGroups(log) });

  it('is marked Confidential on every page and carries the disclaimer', () => {
    expect(html).toContain('<div class="mark top">CONFIDENTIAL</div>');
    expect(html).toMatch(/class="mark bottom">CONFIDENTIAL/);
    expect(html).toContain('not a measure of anyone');
  });

  it('has the score, the graph, three trend charts and every current relationship', () => {
    expect(html).toContain('7 out of 10');
    expect((html.match(/<svg /g) ?? []).length).toBe(4);
    for (const name of ['Sam', 'Mum', 'Jo', 'Raj', 'Patients', 'Grace']) expect(html).toContain(`<td>${name}`);
    expect(html).toContain('Trends over 5 months');
  });

  it('can leave out the watermark, but keeps the Confidential header and footer', () => {
    const plain = buildReportHtml({ log, config: DEFAULT_CONFIG, now: SCENARIO_AS_OF, palette, watermark: false });
    expect(plain).not.toContain('class="watermark"');
    expect(plain).toContain('<div class="mark top">CONFIDENTIAL</div>');
    expect(html).toContain('class="watermark"');
  });

  it('anonymises: no names anywhere, people numbered by importance and groups separately', () => {
    const anon = buildReportHtml({ log, config: DEFAULT_CONFIG, now: SCENARIO_AS_OF, palette, anonymous: true });
    for (const name of ['Sam', 'Mum', 'Raj', 'Grace', 'Amara', 'Patients']) expect(anon).not.toContain(name);
    expect(anon).toContain('<td>Person 1');
    expect(anon).toContain('<td>Group 1');
    // Sam (importance 10) comes first.
    expect(anonymousNames([{ personId: 'a', importance: 3 }, { personId: 'b', importance: 9 }, { personId: 'g', importance: 5 }], new Set(['g']))).toEqual(
      new Map([['b', 'Person 1'], ['g', 'Group 1'], ['a', 'Person 2']]),
    );
  });

  it('uses the on-screen picture of the graph when there is one', () => {
    const shot = buildReportHtml({ log, config: DEFAULT_CONFIG, now: SCENARIO_AS_OF, palette, graphImage: { png: 'AAAA', background: '#101215' } });
    expect(shot).toContain('src="data:image/png;base64,AAAA"');
    expect((shot.match(/<svg /g) ?? []).length).toBe(3);
  });

  it('escapes names', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jo'</b>`)).toBe('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jo&#39;&lt;/b&gt;');
  });
});
