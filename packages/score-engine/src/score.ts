import { resolveRelationships } from './state';
import { DAY, effectiveAgeMs, mergePauses, pausedOverlap } from './time';
import type {
  ComponentName,
  EventLog,
  Interaction,
  ModelConfig,
  RelationshipContribution,
  RelationshipSnapshot,
  RelationshipState,
  ScoreResult,
  SupportReport,
  Timestamp,
} from './types';

/** States that remove a relationship from every component. */
const RETIRED: ReadonlySet<RelationshipState> = new Set(['archived', 'in_memoriam']);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Importance-weighted mean of `value` over `rels`, or null if `rels` is empty. */
function weightedMean<T extends { importance: number }>(rels: T[], value: (r: T) => number): number | null {
  let num = 0;
  let den = 0;
  for (const r of rels) {
    num += r.importance * value(r);
    den += r.importance;
  }
  return den > 0 ? num / den : null;
}

function expectedIntervalDays(rel: RelationshipSnapshot, config: ModelConfig): number | null {
  if (rel.state === 'paused' || rel.rhythm === 'occasional') return null;
  const days = config.rhythmDays[rel.rhythm];
  return rel.state === 'long_distance' ? days * config.longDistanceFactor : days;
}

function isIncluded(rel: RelationshipSnapshot, config: ModelConfig): boolean {
  if (RETIRED.has(rel.state)) return false;
  return rel.quality === null || rel.quality > config.excludeQualityAtOrBelow;
}

/**
 * Social Health Score at `asOf`, computed only from events at or before it.
 * See docs/model-spec.md for the definition of each component.
 */
export function computeScore(log: EventLog, config: ModelConfig, asOf: Timestamp): ScoreResult {
  const rels = resolveRelationships(log.relationshipEvents, config, asOf);
  const pauses = mergePauses(log.pauses, asOf);
  const ageDays = (ts: Timestamp) => effectiveAgeMs(ts, asOf, pauses) / DAY;

  const byPerson = new Map<string, Interaction[]>();
  for (const x of log.interactions) {
    if (x.ts > asOf) continue;
    for (const p of new Set(x.participants)) {
      if (!rels.has(p)) continue;
      const list = byPerson.get(p);
      if (list) list.push(x);
      else byPerson.set(p, [x]);
    }
  }

  const contributions: RelationshipContribution[] = [...rels.values()]
    .sort((a, b) => (a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0))
    .map((rel) => {
      const expected = expectedIntervalDays(rel, config);
      const halfLife = expected ?? config.occasionalHalfLifeDays;
      const qualityMult = rel.quality === null ? 1 : config.qualityMultiplier[rel.quality];

      let energy = 0;
      let lastAge: number | null = null;
      for (const x of byPerson.get(rel.personId) ?? []) {
        const age = ageDays(x.ts);
        energy += config.interactionWeights[x.type] * qualityMult * 0.5 ** (age / halfLife);
        if (lastAge === null || age < lastAge) lastAge = age;
      }

      const onRhythm =
        expected === null
          ? null
          : lastAge === null
            ? 0
            : clamp01(1 - (lastAge - expected) / (config.coverageGrace * expected));

      return {
        ...rel,
        included: isIncluded(rel, config),
        expectedIntervalDays: expected,
        level: 1 - Math.exp(-energy / config.saturation),
        onRhythm,
        lastContactAgeDays: lastAge,
      };
    });

  const included = contributions.filter((c) => c.included);
  const withRhythm = included.filter((c) => c.expectedIntervalDays !== null);

  const components: Record<ComponentName, number | null> = {
    rhythm: weightedMean(withRhythm, (c) => c.level),
    coverage: weightedMean(
      withRhythm.filter((c) => c.importance >= config.importantThreshold),
      (c) => c.onRhythm ?? 0,
    ),
    diversity: diversity(included),
    quality: qualityAndSupport(
      contributions.filter((c) => !RETIRED.has(c.state)),
      log.supportReports,
      asOf,
    ),
  };

  let num = 0;
  let den = 0;
  for (const [name, value] of Object.entries(components) as [ComponentName, number | null][]) {
    if (value === null) continue;
    num += config.componentWeights[name] * value;
    den += config.componentWeights[name];
  }

  const confidence = rels.size === 0 ? 0 : loggingConfidence(log, config, asOf, pauses);

  return {
    asOf,
    modelVersion: config.version,
    total: den > 0 ? clamp01(num / den) * 100 : 0,
    components,
    confidence,
    lowData: confidence < config.confidence.lowBelow,
    relationships: contributions,
  };
}

/**
 * Mean over categories of sqrt(importance-weighted contact level). The square
 * root makes spreading contact across categories worth more than concentrating
 * it, while a single-category network is judged only on that category.
 */
function diversity(included: RelationshipContribution[]): number | null {
  const byCategory = new Map<string, RelationshipContribution[]>();
  for (const c of included) {
    const list = byCategory.get(c.category);
    if (list) list.push(c);
    else byCategory.set(c.category, [c]);
  }
  if (byCategory.size === 0) return null;
  let sum = 0;
  for (const group of byCategory.values()) sum += Math.sqrt(weightedMean(group, (c) => c.level) ?? 0);
  return sum / byCategory.size;
}

/**
 * Importance-weighted mean of each relationship's latest quality rating and
 * support report, each mapped from 1-5 to 0-1. Old reports are kept (not
 * expired) so the score never jumps when a report ages out.
 */
function qualityAndSupport(
  rels: RelationshipContribution[],
  reports: SupportReport[],
  asOf: Timestamp,
): number | null {
  const latestSupport = new Map<string, SupportReport>();
  for (const r of reports) {
    if (r.ts > asOf) continue;
    const prev = latestSupport.get(r.personId);
    if (!prev || r.ts > prev.ts || (r.ts === prev.ts && r.id > prev.id)) latestSupport.set(r.personId, r);
  }

  const rated = rels.flatMap((c) => {
    const values: number[] = [];
    if (c.quality !== null) values.push((c.quality - 1) / 4);
    const s = latestSupport.get(c.personId);
    if (s) values.push((s.support - 1) / 4);
    return values.length ? [{ importance: c.importance, value: values.reduce((a, b) => a + b, 0) / values.length }] : [];
  });
  return weightedMean(rated, (r) => r.value);
}

/** Share of the expected number of days with logging activity in the recent window, ignoring paused time. */
function loggingConfidence(
  log: EventLog,
  config: ModelConfig,
  asOf: Timestamp,
  pauses: ReturnType<typeof mergePauses>,
): number {
  const windowMs = config.confidence.windowDays * DAY;
  const start = asOf - windowMs;
  const days = new Set<number>();
  const note = (ts: Timestamp) => {
    if (ts > start && ts <= asOf) days.add(Math.floor(ts / DAY));
  };
  for (const x of log.interactions) note(x.loggedAt);
  for (const a of log.loggingActivity) note(a.ts);

  const unpausedShare = 1 - pausedOverlap(pauses, start, asOf) / windowMs;
  const expected = config.confidence.expectedActiveDays * unpausedShare;
  // When the window was almost entirely paused, an absence of logging is not evidence of missing data.
  return expected < 1 ? 1 : Math.min(1, days.size / expected);
}

/**
 * Display score: mean of the raw total at `samples` points spaced
 * `spacingDays` apart ending at asOf, so small networks do not jump.
 */
export function smoothedScore(
  log: EventLog,
  config: ModelConfig,
  asOf: Timestamp,
): ScoreResult & { rawTotal: number } {
  const current = computeScore(log, config, asOf);
  let sum = current.total;
  for (let i = 1; i < config.smoothing.samples; i++) {
    sum += computeScore(log, config, asOf - i * config.smoothing.spacingDays * DAY).total;
  }
  return { ...current, rawTotal: current.total, total: sum / config.smoothing.samples };
}
