import { computeScore, type EventLog, type ModelConfig, type RelationshipContribution, type Timestamp } from '@sg/score-engine';
import { CATEGORY_LABELS, lastContactText } from '../ui/labels';
import { HEALTH_LABELS, personalHealth, relationshipHealth, scoreBand, scoreOutOf10, type HealthBand } from './health';
import { BAND_ORDER, TREND_RANGES, trendChange, trendPoints, type TrendPoint, type TrendRange } from './trends';

/**
 * A printable Social Health report (HTML, turned into a PDF by the app): the score, the network
 * graph, the trends and every relationship. It holds personal information about the user and the
 * people they know, so every page is marked Confidential.
 */

export interface ReportPalette {
  text: string;
  muted: string;
  border: string;
  accent: string;
  health: Record<HealthBand, string>;
}

export interface ReportInput {
  log: EventLog;
  config: ModelConfig;
  now: Timestamp;
  /** Remembered graph positions (the user at 0,0), so the report matches the app; others are placed on rings. */
  positions?: Map<string, { x: number; y: number }>;
  /** Group id → member ids, for the faint member lines. */
  groups?: { id: string; members: string[] }[];
  palette: ReportPalette;
  range?: TrendRange;
  /** The diagonal "CONFIDENTIAL" watermark (default on). Every page keeps its Confidential header and footer. */
  watermark?: boolean;
  /** Numbers instead of names everywhere (photos are never included in the table). */
  anonymous?: boolean;
  /** A picture of the graph exactly as on screen (base64 PNG) and the background it was drawn on. */
  graphImage?: { png: string; background: string };
}

const RETIRED = new Set(['archived', 'in_memoriam']);
/** Node sizes by how much in touch (same five steps as the app). */
const SIZES = [10, 14, 19, 25, 32];

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Numbers instead of names, for an anonymised report: people numbered 1, 2, … by importance (then
 * id), groups "Group 1", … The graph and the report table use the same numbering.
 */
export function anonymousNames(rels: { personId: string; importance: number }[], groupIds: Set<string>): Map<string, string> {
  const order = [...rels].sort((a, b) => b.importance - a.importance || (a.personId < b.personId ? -1 : 1));
  let people = 0;
  let groups = 0;
  return new Map(order.map((r) => [r.personId, groupIds.has(r.personId) ? `Group ${++groups}` : `Person ${++people}`]));
}

const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Five size steps by catch-up frequency, as on the graph. */
function sizeOf(rels: RelationshipContribution[]): Map<string, number> {
  const sorted = [...rels].sort((a, b) => (b.frecency ?? 0) - (a.frecency ?? 0));
  return new Map(sorted.map((r, i) => [r.personId, SIZES[4 - Math.min(4, Math.floor((i * 5) / Math.max(1, sorted.length)))]!]));
}

/** The network as SVG: you in the middle, each relationship coloured by its health. */
export function graphSvg(input: ReportInput, rels: RelationshipContribution[], names: Map<string, string>, groupIds: Set<string>): string {
  const { palette: p } = input;
  const size = sizeOf(rels);
  const pos = new Map<string, { x: number; y: number }>();
  // Anyone without a remembered position goes on their importance ring, spread evenly.
  const missing = rels.filter((r) => !input.positions?.has(r.personId));
  rels.forEach((r) => {
    const saved = input.positions?.get(r.personId);
    if (saved) pos.set(r.personId, saved);
  });
  missing.forEach((r, i) => {
    const ring = 80 + (10 - r.importance) * 30;
    const a = (2 * Math.PI * i) / Math.max(1, missing.length) - Math.PI / 2;
    pos.set(r.personId, { x: ring * Math.cos(a), y: ring * Math.sin(a) });
  });
  const pts = [...pos.values(), { x: 0, y: 0 }];
  const pad = 60;
  const minX = Math.min(...pts.map((q) => q.x)) - pad;
  const maxX = Math.max(...pts.map((q) => q.x)) + pad;
  const minY = Math.min(...pts.map((q) => q.y)) - pad;
  const maxY = Math.max(...pts.map((q) => q.y)) + pad;
  const colour = (r: RelationshipContribution) => p.health[relationshipHealth(r)];

  const members = (input.groups ?? []).flatMap((g) =>
    pos.has(g.id) ? g.members.filter((m) => pos.has(m)).map((m) => [pos.get(g.id)!, pos.get(m)!] as const) : [],
  );
  const parts: string[] = [];
  for (const [a, b] of members) {
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${p.accent}" stroke-opacity="0.35" stroke-width="1.2"/>`);
  }
  for (const r of rels) {
    const q = pos.get(r.personId)!;
    parts.push(`<line x1="0" y1="0" x2="${q.x}" y2="${q.y}" stroke="${colour(r)}" stroke-opacity="0.55" stroke-width="2"/>`);
  }
  for (const r of rels) {
    const q = pos.get(r.personId)!;
    const s = size.get(r.personId)!;
    const c = colour(r);
    const lost = relationshipHealth(r) === 'lost';
    const name = names.get(r.personId) ?? '?';
    const shape = groupIds.has(r.personId)
      ? `<rect x="${q.x - s}" y="${q.y - s}" width="${2 * s}" height="${2 * s}" rx="${s * 0.3}" fill="#ffffff" stroke="${c}" stroke-width="3.5"/>`
      : `<circle cx="${q.x}" cy="${q.y}" r="${s}" fill="#ffffff" stroke="${c}" stroke-width="3.5"/>`;
    parts.push(
      `<g opacity="${lost ? 0.55 : 1}">${shape}` +
        `<text x="${q.x}" y="${q.y + s * 0.35}" font-size="${Math.max(9, s * 0.9)}" font-weight="700" text-anchor="middle" fill="${p.text}">${escapeHtml(name.charAt(0).toUpperCase())}</text>` +
        `<text x="${q.x}" y="${q.y + s + 12}" font-size="10" text-anchor="middle" fill="${p.muted}">${escapeHtml(name)}</text></g>`,
    );
  }
  parts.push(`<circle cx="0" cy="0" r="18" fill="${p.accent}"/><text x="0" y="4" font-size="11" font-weight="700" text-anchor="middle" fill="#ffffff">You</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="100%" style="max-height:120mm">${parts.join('')}</svg>`;
}

function axisLabels(points: TrendPoint[], x: (i: number) => number, y: number, muted: string): string {
  const idx = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  return idx.map((i) => `<text x="${x(i)}" y="${y}" font-size="9" text-anchor="middle" fill="${muted}">${shortDate(points[i]!.ts)}</text>`).join('');
}

const W = 520;
const H = 140;
const L = 26;

/** Social Health out of 10 over time. */
export function scoreSvg(points: TrendPoint[], p: ReportPalette): string {
  const x = (i: number) => L + ((W - L - 10) * i) / Math.max(1, points.length - 1);
  const y = (s: number) => 10 + ((H - 34) * (10 - s)) / 9;
  const scored = points.map((q, i) => (q.total === null ? null : { i, s: scoreOutOf10(q.total) })).filter((q): q is { i: number; s: number } => q !== null);
  const grid = [1, 5, 10]
    .map((s) => `<line x1="${L}" x2="${W - 10}" y1="${y(s)}" y2="${y(s)}" stroke="${p.border}"/><text x="${L - 6}" y="${y(s) + 3}" font-size="9" text-anchor="end" fill="${p.muted}">${s}</text>`)
    .join('');
  const line = scored.length > 1 ? `<polyline points="${scored.map((q) => `${x(q.i)},${y(q.s)}`).join(' ')}" fill="none" stroke="${p.accent}" stroke-width="2.5"/>` : '';
  const dots = scored.map((q) => `<circle cx="${x(q.i)}" cy="${y(q.s)}" r="3" fill="${p.health[scoreBand(q.s)]}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">${grid}${line}${dots}${axisLabels(points, x, H - 6, p.muted)}</svg>`;
}

/** Relationships in each closeness band over time (stacked). */
export function closenessSvg(points: TrendPoint[], p: ReportPalette): string {
  const max = Math.max(1, ...points.map((q) => BAND_ORDER.reduce((s, b) => s + q.bands[b], 0)));
  const slot = (W - L - 10) / points.length;
  const x = (i: number) => L + slot * i + slot / 2;
  const h = (n: number) => ((H - 34) * n) / max;
  const bars = points
    .map((q, i) => {
      let base = H - 24;
      return BAND_ORDER.map((b) => {
        const n = q.bands[b];
        if (!n) return '';
        base -= h(n);
        return `<rect x="${x(i) - slot * 0.35}" y="${base}" width="${slot * 0.7}" height="${h(n)}" fill="${p.health[b]}"/>`;
      }).join('');
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%"><line x1="${L}" x2="${W - 10}" y1="${H - 24}" y2="${H - 24}" stroke="${p.border}"/><text x="${L - 6}" y="18" font-size="9" text-anchor="end" fill="${p.muted}">${max}</text>${bars}${axisLabels(points, x, H - 6, p.muted)}</svg>`;
}

/** Catch-ups per period. */
export function catchUpSvg(points: TrendPoint[], p: ReportPalette): string {
  const max = Math.max(1, ...points.map((q) => q.catchUps));
  const slot = (W - L - 10) / points.length;
  const x = (i: number) => L + slot * i + slot / 2;
  const h = (n: number) => ((H - 34) * n) / max;
  const bars = points.map((q, i) => `<rect x="${x(i) - slot * 0.35}" y="${H - 24 - h(q.catchUps)}" width="${slot * 0.7}" height="${h(q.catchUps)}" fill="${p.accent}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%"><line x1="${L}" x2="${W - 10}" y1="${H - 24}" y2="${H - 24}" stroke="${p.border}"/><text x="${L - 6}" y="18" font-size="9" text-anchor="end" fill="${p.muted}">${max}</text>${bars}${axisLabels(points, x, H - 6, p.muted)}</svg>`;
}

export function buildReportHtml(input: ReportInput): string {
  const { log, config, now, palette: p } = input;
  const range = input.range ?? '5m';
  const result = computeScore(log, config, now);
  const groupIds = new Set(log.people.filter((x) => x.kind === 'group').map((x) => x.id));
  const rels = result.relationships.filter((r) => !RETIRED.has(r.state));
  const names = input.anonymous ? anonymousNames(rels, groupIds) : new Map(log.people.map((x) => [x.id, x.displayName]));
  const graph = input.graphImage
    ? `<div class="shot" style="background:${input.graphImage.background}"><img src="data:image/png;base64,${input.graphImage.png}" alt="Your network graph"/></div>`
    : graphSvg(input, rels, names, groupIds);
  const points = trendPoints(log, now, range, config);
  const change = trendChange(points, scoreOutOf10);
  const score = result.total === null ? null : scoreOutOf10(result.total);
  const counts = BAND_ORDER.map((b) => [b, rels.filter((r) => relationshipHealth(r) === b).length] as const);
  const legend = BAND_ORDER.map((b) => `<span class="key"><i style="background:${p.health[b]}"></i>${HEALTH_LABELS[b]}</span>`).join('');
  const rows = [...rels]
    .sort((a, b) => personalHealth(b).score - personalHealth(a).score || (names.get(a.personId) ?? '').localeCompare(names.get(b.personId) ?? ''))
    .map((r) => {
      const { score: s, band } = personalHealth(r);
      return `<tr><td>${escapeHtml(names.get(r.personId) ?? '?')}${groupIds.has(r.personId) ? ' <span class="muted">(group)</span>' : ''}</td>` +
        `<td>${CATEGORY_LABELS[r.category]}</td>` +
        `<td><b style="color:${p.health[band]}">${s}/10</b> ${HEALTH_LABELS[band]}</td>` +
        `<td>${r.idealSet ? (r.ideal === null ? "Don't mind" : `${r.ideal}/10`) : 'Not set'}</td>` +
        `<td>${r.importance}/10</td>` +
        `<td>${escapeHtml(lastContactText(r.lastContactAgeDays).replace(/^Last catch-up /, ''))}</td></tr>`;
    })
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Social Health report</title><style>
@page { margin: 10mm 14mm; }
table.page { width: 100%; border-collapse: collapse; } table.page > thead td, table.page > tfoot td { border: 0; padding: 0; }
body { font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; color: ${p.text}; font-size: 11pt; }
.mark { text-align: center; font-size: 9pt; font-weight: 700; letter-spacing: 3px; color: #b42318; padding: 2mm 0 5mm; }
.mark.bottom { padding: 5mm 0 2mm; }
.watermark { position: fixed; top: 45%; left: 0; right: 0; text-align: center; font-size: 72pt; font-weight: 800; color: rgba(180,35,24,0.07); transform: rotate(-30deg); z-index: -1; }
h1 { font-size: 20pt; margin: 0 0 2mm; } h2 { font-size: 13pt; margin: 8mm 0 2mm; page-break-after: avoid; }
.muted { color: ${p.muted}; } .small { font-size: 9pt; }
.score { display: flex; align-items: center; gap: 6mm; margin-top: 4mm; }
.ring { width: 26mm; height: 26mm; border-radius: 50%; border: 3mm solid ${score === null ? p.border : p.health[scoreBand(score)]}; display: flex; align-items: center; justify-content: center; font-size: 26pt; font-weight: 800; }
.key { display: inline-flex; align-items: center; margin-right: 4mm; font-size: 9pt; color: ${p.muted}; }
.key i { display: inline-block; width: 3mm; height: 3mm; border-radius: 1mm; margin-right: 1.5mm; }
.chart { page-break-inside: avoid; margin-bottom: 4mm; }
.shot { border-radius: 3mm; padding: 2mm; text-align: center; } .shot img { max-width: 100%; max-height: 150mm; }
table.rels { width: 100%; border-collapse: collapse; font-size: 9.5pt; } table.rels th, table.rels td { text-align: left; padding: 1.6mm 2mm; border-bottom: 0.3mm solid ${p.border}; }
table.rels th { color: ${p.muted}; font-weight: 600; } table.rels tr { page-break-inside: avoid; }
</style></head><body>
${input.watermark === false ? '' : '<div class="watermark">CONFIDENTIAL</div>'}
<table class="page"><thead><tr><td><div class="mark top">CONFIDENTIAL</div></td></tr></thead>
<tfoot><tr><td><div class="mark bottom">CONFIDENTIAL · PERSONAL INFORMATION</div></td></tr></tfoot><tbody><tr><td style="border:0;padding:0">
<h1>Social Health report</h1>
<div class="muted small">Generated ${fmtDate(now)} · ${input.anonymous ? 'Anonymised: people are numbered by importance, without names or photos.' : 'Contains private information about you and the people you know. Keep it safe.'}</div>
<div class="score"><div class="ring">${score ?? '–'}</div><div>
<div style="font-size:14pt;font-weight:700">${score === null ? 'No score yet' : `${score} out of 10`}</div>
<div class="muted">${change === null ? 'Not enough history for a trend yet.' : change === 0 ? `About the same as ${TREND_RANGES[range].label.toLowerCase()} ago.` : `${change > 0 ? 'Up' : 'Down'} ${Math.abs(change)} over the last ${TREND_RANGES[range].label.toLowerCase()}.`}</div>
<div class="small muted">${rels.length} relationships · ${counts.filter(([, n]) => n).map(([b, n]) => `${n} ${HEALTH_LABELS[b].toLowerCase()}`).join(' · ')}</div>
</div></div>
<h2>Your network</h2>
<div class="chart">${graph}</div>
<div>${legend}</div>
<div class="small muted">You are in the middle. Closer = more important; bigger = more in touch; colour = how the relationship is doing. Rounded squares are groups.</div>
<h2>Trends over ${TREND_RANGES[range].label.toLowerCase()}</h2>
<div class="chart"><b>Social Health over time</b>${scoreSvg(points, p)}</div>
<div class="chart"><b>How close your relationships have been</b>${closenessSvg(points, p)}<div>${legend}</div></div>
<div class="chart"><b>Catch-ups per ${TREND_RANGES[range].stepDays === 1 ? 'day' : TREND_RANGES[range].stepDays === 7 ? 'week' : 'month'}</b>${catchUpSvg(points, p)}</div>
<h2>Relationships</h2>
<table class="rels"><thead><tr><th>Name</th><th>Type</th><th>Closeness</th><th>Ideal</th><th>Importance</th><th>Last catch-up</th></tr></thead><tbody>${rows}</tbody></table>
<p class="small muted" style="margin-top:6mm"><i>Social Health is for information and reflection only. It is not a diagnosis, and not a measure of anyone's worth.</i></p>
</td></tr></tbody></table>
</body></html>`;
}
