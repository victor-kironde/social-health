import { DAY, DEFAULT_CONFIG, computeScore } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import { logFromRows, toRow } from '../src/data/codec';
import { newInteractionEvents, validateInteraction } from '../src/data/interactions';
import { newPersonEvents } from '../src/data/people';

const NOW = Date.UTC(2026, 9, 5, 15, 30);

function ids() {
  let n = 0;
  return () => `id-${String(n++).padStart(4, '0')}`;
}

describe('newInteractionEvents', () => {
  it('backdates ts but records loggedAt as now', () => {
    const [e] = newInteractionEvents({ participants: ['a'], type: 'video', daysAgo: 3 }, NOW, 60, ids());
    expect(e!.kind).toBe('interaction');
    if (e!.kind !== 'interaction') return;
    expect(e!.body.ts).toBe(NOW - 3 * DAY);
    expect(e!.body.loggedAt).toBe(NOW);
    expect(e!.body.tzOffsetMin).toBe(60);
    expect(e!.ts).toBe(e!.body.ts);
  });

  it('records a group as one interaction with de-duplicated participants', () => {
    const events = newInteractionEvents({ participants: ['a', 'b', 'a'], type: 'in_person', daysAgo: 0 }, NOW, 0, ids());
    expect(events).toHaveLength(1);
    expect(events[0]!.kind === 'interaction' && events[0]!.body.participants).toEqual(['a', 'b']);
  });

  it('logged contact shows up as recent contact in the score', () => {
    const next = ids();
    const person = newPersonEvents({ displayName: 'Ana', category: 'friend', importance: 5, quality: null }, NOW - 10 * DAY, next);
    const personId = person[0]!.kind === 'person' ? person[0]!.body.id : '';
    const contact = newInteractionEvents({ participants: [personId], type: 'in_person', daysAgo: 2 }, NOW, 0, next);
    const r = computeScore(logFromRows([...person, ...contact].map(toRow)), DEFAULT_CONFIG, NOW);
    expect(r.relationships[0]!.lastContactAgeDays).toBeCloseTo(2, 9);
    expect(r.relationships[0]!.onRhythm).toBe(1);
  });
});

describe('validateInteraction', () => {
  it('requires a participant', () => {
    expect(validateInteraction({ participants: [], type: 'message', daysAgo: 0 })).toMatch(/person/);
  });

  it('rejects future, fractional and very old dates', () => {
    for (const daysAgo of [-1, 1.5, 366]) {
      expect(validateInteraction({ participants: ['a'], type: 'message', daysAgo })).not.toBeNull();
    }
    expect(validateInteraction({ participants: ['a'], type: 'message', daysAgo: 365 })).toBeNull();
  });
});

describe('catch-up notes', () => {
  const ids = () => {
    let n = 0;
    return () => `n${n++}`;
  };
  it('stores a trimmed note, and none when blank', () => {
    const base = { participants: ['a'], type: 'in_person' as const, daysAgo: 0 };
    const [withNote] = newInteractionEvents({ ...base, note: '  Talked about her new job.  ' }, 1_000_000, 0, ids());
    expect((withNote!.body as { note?: string }).note).toBe('Talked about her new job.');
    const [blank] = newInteractionEvents({ ...base, note: '   ' }, 1_000_000, 0, ids());
    expect('note' in (blank!.body as object)).toBe(false);
  });

  it('rejects notes that are too long', () => {
    expect(validateInteraction({ participants: ['a'], type: 'in_person', daysAgo: 0, note: 'x'.repeat(2001) })).toMatch(/under/);
    expect(validateInteraction({ participants: ['a'], type: 'in_person', daysAgo: 0, note: 'x'.repeat(2000) })).toBeNull();
  });
});
