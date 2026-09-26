/** Milliseconds since the Unix epoch, always UTC. */
export type Timestamp = number;

export type Category = 'family' | 'friend' | 'work' | 'neighbour' | 'community' | 'other';
export type InteractionType = 'in_person' | 'video' | 'voice' | 'message';
export type Rhythm = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly' | 'occasional';

export type FrequencyPeriod = 'day' | 'week' | 'month' | 'year';

/**
 * A minimum catch-up frequency the user chooses themselves: "at least `times` times a `per`"
 * (e.g. at least twice a month, at least 5 times a week). When set, it replaces the preset rhythm.
 */
export interface Frequency {
  times: number;
  per: FrequencyPeriod;
}
export type RelationshipState = 'active' | 'paused' | 'long_distance' | 'archived' | 'in_memoriam';
export type Rating = 1 | 2 | 3 | 4 | 5;
export type InteractionSource = 'manual' | 'call_log' | 'confirmed';

export interface Person {
  id: string;
  displayName: string;
  isAppUser?: boolean;
  /**
   * 'group' for a group you have a relationship with as a whole (a team, a book club, your patients).
   * A group is scored like a person; catch-ups list it as a participant alongside anyone named.
   */
  kind?: 'person' | 'group';
}

export type RelationshipChange =
  | { field: 'category'; value: Category }
  /**
   * How important the relationship is, 1–10 (default 1). Events recorded before v0.4 used a 1–5
   * scale and have no `scale`; they are read as double (5 → 10).
   */
  | { field: 'importance'; value: number; scale?: 10 }
  | { field: 'quality'; value: Rating | null }
  | { field: 'rhythm'; value: Rhythm | null } // null = follow the category default
  | { field: 'state'; value: RelationshipState }
  /** Further relationship types beyond the primary `category` (e.g. family who are also colleagues). */
  | { field: 'alsoCategories'; value: Category[] }
  /**
   * How close the user would like this relationship to be, 1–10 (10 = as close as possible, the
   * default), or null for "don't mind": the relationship is then left out of the score.
   */
  | { field: 'ideal'; value: number | null }
  /** A custom minimum catch-up frequency, or null to go back to the preset rhythm. */
  | { field: 'frequency'; value: Frequency | null }
  /** Lives or works with the user: time apart counts much less (see togetherDecayRate). */
  | { field: 'together'; value: boolean };

/**
 * Append-only record of a change to the owner's private view of a relationship.
 * The current relationship is the fold of all events with ts <= asOf.
 */
export type RelationshipEvent = { id: string; personId: string; ts: Timestamp } & RelationshipChange;

export interface Interaction {
  id: string;
  /** When the interaction happened (may be backdated). */
  ts: Timestamp;
  /** Local timezone offset at the time, for display only. */
  tzOffsetMin?: number;
  /** When it was recorded. Drives the data-confidence measure. */
  loggedAt: Timestamp;
  type: InteractionType;
  durationMin?: number;
  /** One interaction may involve several people (e.g. a group dinner). */
  participants: string[];
  source: InteractionSource;
  /** A private note or journal entry about the catch-up. Never used in scoring. */
  note?: string;
  /** People at a group catch-up who were not named (e.g. new patients): a count only, never names. */
  newPeople?: number;
}

export interface SupportReport {
  id: string;
  personId: string;
  ts: Timestamp;
  support: Rating;
}

export interface LoggingActivity {
  ts: Timestamp;
  kind: 'prompt_answered' | 'entry_made';
}

/** Global pause (illness, exams, ...). `to: null` means still paused. */
export interface Pause {
  from: Timestamp;
  to: Timestamp | null;
}

/**
 * A phone call taken from the device's call log (passive metadata): when,
 * how long and which direction. Never the number or content; already
 * matched to a person on the device.
 */
export interface CallRecord {
  id: string;
  personId: string;
  ts: Timestamp;
  durationSec: number;
  direction: 'incoming' | 'outgoing' | 'missed';
}

export interface EventLog {
  people: Person[];
  relationshipEvents: RelationshipEvent[];
  interactions: Interaction[];
  supportReports: SupportReport[];
  loggingActivity: LoggingActivity[];
  pauses: Pause[];
  /**
   * Call-log metadata. Undefined = the source is not connected (the calls
   * component is then left out and its weight redistributed); an array,
   * even empty, = connected.
   */
  calls?: CallRecord[];
}

export interface ModelConfig {
  version: string;
  componentWeights: Record<ComponentName, number>;
  interactionWeights: Record<InteractionType, number>;
  /** k in level = 1 - exp(-e / k). Larger k = slower saturation. */
  saturation: number;
  rhythmDays: Record<Exclude<Rhythm, 'occasional'>, number>;
  /** Length of each custom-frequency period in days (a month matches the monthly rhythm). */
  frequencyPeriodDays: Record<FrequencyPeriod, number>;
  defaultRhythm: Record<Category, Rhythm>;
  /** A custom default "at least N times a period"; when set it replaces `defaultRhythm` for everyone following the default. */
  defaultFrequency: Frequency | null;
  /** Expected interval is multiplied by this for long-distance relationships. */
  longDistanceFactor: number;
  /** Contact contribution multiplier by self-rated quality. Unrated = 1. */
  qualityMultiplier: Record<Rating, number>;
  /** Relationships rated at or below this are excluded from rhythm, coverage and diversity. */
  excludeQualityAtOrBelow: Rating | 0;
  /** On-rhythm falls linearly from 1 at the expected interval to 0 at (1 + grace) x interval. */
  rhythmGrace: number;
  /**
   * How fast time counts for people the user lives or works with, relative to everyone else
   * (0.1 = a tenth: a catch-up keeps its value ten times longer, and they fall behind ten times
   * more slowly), since they are seen anyway.
   */
  togetherDecayRate: number;
  /** Decay half-life for relationships with no expected rhythm. */
  occasionalHalfLifeDays: number;
  confidence: { windowDays: number; expectedActiveDays: number; lowBelow: number };
  smoothing: { samples: number; spacingDays: number };
  /** Call metadata: answered calls count fully, very short ones partly, missed ones not at all. */
  calls: { shortCallSec: number; shortCallWeight: number };
  /** Frecency (frequency x recency) half-life, shared by everyone so rankings are comparable. */
  frecencyHalfLifeDays: number;
}

export type ComponentName = 'rhythm' | 'quality' | 'diversity' | 'calls' | 'frecency';

export interface RelationshipSnapshot {
  personId: string;
  /** Primary type: used by the score (default rhythm, diversity). */
  category: Category;
  /** Other types this person also belongs to; never includes `category`. Display and layout only. */
  alsoCategories: Category[];
  /** 1–10, default 1: how much this relationship counts in every average. */
  importance: number;
  quality: Rating | null;
  rhythm: Rhythm;
  state: RelationshipState;
  /** Hoped-for closeness 1–10 (default 10), or null = "don't mind" (left out of the score). */
  ideal: number | null;
  /** Whether the user has chosen an ideal; when not, `ideal` is the default 10. */
  idealSet: boolean;
  /** A custom "at least N times a period" frequency; overrides `rhythm` when set. */
  frequency: Frequency | null;
  /** Whether the user chose this relationship's rhythm; when not, it follows the default. */
  rhythmSet: boolean;
  /** Lives or works with the user (default false). */
  together: boolean;
}

export interface RelationshipContribution extends RelationshipSnapshot {
  /** Counted in rhythm, calls, frecency and diversity (false when retired, rated harmful, or "don't mind"). */
  included: boolean;
  /** Effective expected interval in days, or null when there is no expectation. */
  expectedIntervalDays: number | null;
  /** Decayed, saturated contact level in [0, 1]. */
  level: number;
  /** 1 = on rhythm, 0 = well behind. Null when there is no expectation. */
  onRhythm: number | null;
  /** Effective (pause-adjusted) days since last contact, or null if never. */
  lastContactAgeDays: number | null;
  /** How fast time counts for this relationship (1, or togetherDecayRate when living/working together). */
  decayRate: number;
  /** Decayed, saturated call level in [0, 1]; null when call data is not connected. */
  callLevel: number | null;
  /**
   * Frecency: sum over every contact (logged or called) of weight x
   * 0.5^(age / frecencyHalfLife). Unbounded; used to rank people by how much
   * and how recently they have been in touch.
   */
  frecency: number;
}

export interface ScoreResult {
  asOf: Timestamp;
  modelVersion: string;
  /** 0-100. */
  total: number;
  /** Each in [0, 1], or null when it cannot be computed (weight is redistributed). */
  components: Record<ComponentName, number | null>;
  /** 0-1: how much recent logging the score is based on. */
  confidence: number;
  lowData: boolean;
  relationships: RelationshipContribution[];
}

export interface Explanation {
  kind: 'component_change' | 'fell_behind' | 'back_on_rhythm' | 'importance_changed' | 'low_data';
  component?: ComponentName;
  /** Change in points (0-100 scale) for component changes. */
  delta?: number;
  personIds?: string[];
  text: string;
}
