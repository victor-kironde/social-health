/** Milliseconds since the Unix epoch, always UTC. */
export type Timestamp = number;

export type Category = 'family' | 'friend' | 'work' | 'neighbour' | 'community';
export type InteractionType = 'in_person' | 'video' | 'voice' | 'message';
export type Rhythm = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly' | 'occasional';
export type RelationshipState = 'active' | 'paused' | 'long_distance' | 'archived' | 'in_memoriam';
export type Rating = 1 | 2 | 3 | 4 | 5;
export type InteractionSource = 'manual' | 'call_log' | 'confirmed';

export interface Person {
  id: string;
  displayName: string;
  isAppUser?: boolean;
}

export type RelationshipChange =
  | { field: 'category'; value: Category }
  | { field: 'importance'; value: Rating }
  | { field: 'quality'; value: Rating | null }
  | { field: 'rhythm'; value: Rhythm | null } // null = follow the category default
  | { field: 'state'; value: RelationshipState }
  /** Further relationship types beyond the primary `category` (e.g. family who are also colleagues). */
  | { field: 'alsoCategories'; value: Category[] };

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
  defaultRhythm: Record<Category, Rhythm>;
  /** Expected interval is multiplied by this for long-distance relationships. */
  longDistanceFactor: number;
  /** Relationships at or above this importance count towards coverage. */
  importantThreshold: Rating;
  /** Contact contribution multiplier by self-rated quality. Unrated = 1. */
  qualityMultiplier: Record<Rating, number>;
  /** Relationships rated at or below this are excluded from rhythm, coverage and diversity. */
  excludeQualityAtOrBelow: Rating | 0;
  /** On-rhythm falls linearly from 1 at the expected interval to 0 at (1 + grace) x interval. */
  coverageGrace: number;
  /** Decay half-life for relationships with no expected rhythm. */
  occasionalHalfLifeDays: number;
  confidence: { windowDays: number; expectedActiveDays: number; lowBelow: number };
  smoothing: { samples: number; spacingDays: number };
  /** Call metadata: answered calls count fully, very short ones partly, missed ones not at all. */
  calls: { shortCallSec: number; shortCallWeight: number };
  /** Frecency (frequency x recency) half-life, shared by everyone so rankings are comparable. */
  frecencyHalfLifeDays: number;
}

export type ComponentName = 'rhythm' | 'coverage' | 'quality' | 'diversity' | 'calls' | 'frecency';

export interface RelationshipSnapshot {
  personId: string;
  /** Primary type: used by the score (default rhythm, diversity). */
  category: Category;
  /** Other types this person also belongs to; never includes `category`. Display and layout only. */
  alsoCategories: Category[];
  importance: Rating;
  quality: Rating | null;
  rhythm: Rhythm;
  state: RelationshipState;
}

export interface RelationshipContribution extends RelationshipSnapshot {
  /** Counted in rhythm, coverage and diversity. */
  included: boolean;
  /** Effective expected interval in days, or null when there is no expectation. */
  expectedIntervalDays: number | null;
  /** Decayed, saturated contact level in [0, 1]. */
  level: number;
  /** 1 = on rhythm, 0 = well behind. Null when there is no expectation. */
  onRhythm: number | null;
  /** Effective (pause-adjusted) days since last contact, or null if never. */
  lastContactAgeDays: number | null;
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
