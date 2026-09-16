import fc from 'fast-check';
import {
  DAY,
  type Category,
  type EventLog,
  type InteractionType,
  type Rating,
  type RelationshipChange,
  type RelationshipEvent,
  type RelationshipState,
  type Rhythm,
} from '@sg/score-engine';

/** All generated data lies at or before this time. */
export const ARB_AS_OF = Date.UTC(2026, 6, 1);
const START = ARB_AS_OF - 400 * DAY;

const arbTs = fc.integer({ min: START, max: ARB_AS_OF });
const arbRating = fc.constantFrom<Rating>(1, 2, 3, 4, 5);
const arbCategory = fc.constantFrom<Category>('family', 'friend', 'work', 'neighbour', 'community', 'other');

const arbChange: fc.Arbitrary<RelationshipChange> = fc.oneof(
  arbCategory.map((value) => ({ field: 'category' as const, value })),
  arbRating.map((value) => ({ field: 'importance' as const, value })),
  fc.option(arbRating, { nil: null }).map((value) => ({ field: 'quality' as const, value })),
  fc
    .constantFrom<Rhythm | null>('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly', 'occasional', null)
    .map((value) => ({ field: 'rhythm' as const, value })),
  fc
    .constantFrom<RelationshipState>('active', 'active', 'active', 'paused', 'long_distance', 'archived', 'in_memoriam')
    .map((value) => ({ field: 'state' as const, value })),
);

/** Random but well-formed event logs with 1-8 people and all data at or before ARB_AS_OF. */
export function arbEventLog(): fc.Arbitrary<EventLog> {
  return fc.integer({ min: 1, max: 8 }).chain((n) => {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const arbId = fc.constantFrom(...ids);
    return fc
      .record({
        categories: fc.array(arbCategory, { minLength: n, maxLength: n }),
        changes: fc.array(fc.record({ personId: arbId, ts: arbTs, change: arbChange }), { maxLength: 24 }),
        interactions: fc.array(
          fc.record({
            ts: arbTs,
            logDelayDays: fc.integer({ min: 0, max: 10 }),
            type: fc.constantFrom<InteractionType>('in_person', 'video', 'voice', 'message'),
            participants: fc.uniqueArray(arbId, { minLength: 1, maxLength: Math.min(n, 4) }),
          }),
          { maxLength: 40 },
        ),
        support: fc.array(fc.record({ personId: arbId, ts: arbTs, support: arbRating }), { maxLength: 6 }),
        prompts: fc.array(arbTs, { maxLength: 10 }),
        pauses: fc.array(
          fc.record({ from: arbTs, lengthDays: fc.integer({ min: 1, max: 60 }), open: fc.boolean() }),
          { maxLength: 2 },
        ),
        // Call-log source: sometimes not connected (undefined), sometimes connected with calls.
        calls: fc.option(
          fc.array(
            fc.record({
              personId: arbId,
              ts: arbTs,
              durationSec: fc.integer({ min: 0, max: 3600 }),
              direction: fc.constantFrom<'incoming' | 'outgoing' | 'missed'>('incoming', 'outgoing', 'missed'),
            }),
            { maxLength: 20 },
          ),
          { nil: undefined },
        ),
      })
      .map((r): EventLog => {
        const relationshipEvents: RelationshipEvent[] = [
          ...ids.map((personId, i) => ({
            id: `e-init-${i}`,
            personId,
            ts: START,
            field: 'category' as const,
            value: r.categories[i]!,
          })),
          ...r.changes.map((c, i) => ({ id: `e${i}`, personId: c.personId, ts: c.ts, ...c.change }) as RelationshipEvent),
        ];
        return {
          people: ids.map((id) => ({ id, displayName: id })),
          relationshipEvents,
          interactions: r.interactions.map((x, i) => ({
            id: `i${i}`,
            ts: x.ts,
            loggedAt: Math.min(ARB_AS_OF, x.ts + x.logDelayDays * DAY),
            type: x.type,
            participants: x.participants,
            source: 'manual',
          })),
          supportReports: r.support.map((s, i) => ({ id: `s${i}`, ...s })),
          loggingActivity: r.prompts.map((ts) => ({ ts, kind: 'prompt_answered' })),
          pauses: r.pauses.map((p) => ({
            from: p.from,
            to: p.open ? null : Math.min(ARB_AS_OF, p.from + p.lengthDays * DAY),
          })),
          ...(r.calls ? { calls: r.calls.map((c, i) => ({ id: `c${i}`, ...c })) } : {}),
        };
      });
  });
}
