import {
  DAY,
  type Category,
  type EventLog,
  type InteractionType,
  type Rating,
  type RelationshipChange,
  type RelationshipState,
  type Rhythm,
  type Timestamp,
} from '@sg/score-engine';

export interface PersonAttrs {
  category: Category;
  importance?: Rating;
  quality?: Rating | null;
  rhythm?: Rhythm;
  state?: RelationshipState;
}

export interface ContactOptions {
  type?: InteractionType;
  /** Defaults to the interaction time (logged straight away). */
  loggedAt?: Timestamp;
}

/**
 * Fluent builder for synthetic event logs. Times are given as "days ago"
 * relative to asOf so scenarios read like their descriptions.
 */
export class ScenarioBuilder {
  private log: EventLog = {
    people: [],
    relationshipEvents: [],
    interactions: [],
    supportReports: [],
    loggingActivity: [],
    pauses: [],
  };
  private seq = 0;

  constructor(readonly asOf: Timestamp) {}

  at(daysAgo: number): Timestamp {
    return this.asOf - daysAgo * DAY;
  }

  private nextId(prefix: string): string {
    return `${prefix}${String(this.seq++).padStart(6, '0')}`;
  }

  /** Add a person and their relationship attributes, recorded `addedDaysAgo` days ago. */
  person(id: string, attrs: PersonAttrs, addedDaysAgo = 365): this {
    this.log.people.push({ id, displayName: id });
    const ts = this.at(addedDaysAgo);
    this.change(id, { field: 'category', value: attrs.category }, ts);
    if (attrs.importance !== undefined) this.change(id, { field: 'importance', value: attrs.importance }, ts);
    if (attrs.quality !== undefined) this.change(id, { field: 'quality', value: attrs.quality }, ts);
    if (attrs.rhythm !== undefined) this.change(id, { field: 'rhythm', value: attrs.rhythm }, ts);
    if (attrs.state !== undefined) this.change(id, { field: 'state', value: attrs.state }, ts);
    return this;
  }

  change(personId: string, change: RelationshipChange, ts: Timestamp): this {
    this.log.relationshipEvents.push({ id: this.nextId('e'), personId, ts, ...change } as EventLog['relationshipEvents'][number]);
    return this;
  }

  contact(ids: string | string[], daysAgo: number, opts: ContactOptions = {}): this {
    const ts = this.at(daysAgo);
    this.log.interactions.push({
      id: this.nextId('i'),
      ts,
      loggedAt: opts.loggedAt ?? ts,
      type: opts.type ?? 'in_person',
      participants: Array.isArray(ids) ? ids : [ids],
      source: 'manual',
    });
    return this;
  }

  /** Regular contact every `everyDays`, from `fromDaysAgo` down to `toDaysAgo` (inclusive). */
  contactEvery(
    ids: string | string[],
    everyDays: number,
    range: { fromDaysAgo?: number; toDaysAgo?: number } = {},
    opts: ContactOptions = {},
  ): this {
    const from = range.fromDaysAgo ?? 365;
    const to = range.toDaysAgo ?? 0;
    for (let d = to; d <= from; d += everyDays) this.contact(ids, d, opts);
    return this;
  }

  support(personId: string, daysAgo: number, support: Rating): this {
    this.log.supportReports.push({ id: this.nextId('s'), personId, ts: this.at(daysAgo), support });
    return this;
  }

  pause(fromDaysAgo: number, toDaysAgo: number | null): this {
    this.log.pauses.push({ from: this.at(fromDaysAgo), to: toDaysAgo === null ? null : this.at(toDaysAgo) });
    return this;
  }

  build(): EventLog {
    // JSON round-trip rather than structuredClone, which Hermes may not provide.
    return JSON.parse(JSON.stringify(this.log)) as EventLog;
  }
}
