import { DEFAULT_CONFIG } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import { buildReportHtml, escapeHtml, type ReportPalette } from '../src/data/report';
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

  it('escapes names', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jo'</b>`)).toBe('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jo&#39;&lt;/b&gt;');
  });
});
