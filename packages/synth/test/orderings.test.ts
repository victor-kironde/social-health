/**
 * Pairwise orderings between synthetic scenarios, decided before the formula
 * was chosen. They state what the model should conclude, not exact values.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, computeScore, type EventLog } from '@sg/score-engine';
import { AS_OF, ScenarioBuilder, scenarios as s } from '../src';

const total = (log: EventLog) => computeScore(log, DEFAULT_CONFIG, AS_OF).total;

describe('scenario orderings', () => {
  it('O1 a small on-rhythm network beats a large network whose important people are neglected', () => {
    expect(total(s.closeKnit())).toBeGreaterThan(total(s.largeNeglected()));
  });

  it('O2 balanced contact beats the same contact concentrated on one person', () => {
    expect(total(s.balanced())).toBeGreaterThan(total(s.concentrated()));
  });

  it('O3 an active network beats the same network after 90 days of inactivity', () => {
    expect(total(s.closeKnit())).toBeGreaterThan(total(s.inactive()));
  });

  it('O4 in-person contact on rhythm beats message-only contact on rhythm', () => {
    expect(total(s.closeKnit('in_person'))).toBeGreaterThan(total(s.closeKnit('message')));
  });

  it('O5 marking a deceased person in memoriam removes the neglect penalty', () => {
    expect(total(s.bereavement(true))).toBeGreaterThan(total(s.bereavement(false)));
  });

  it('O6 batch logging gives lower confidence than regular logging, and is flagged', () => {
    const regular = computeScore(s.logging(true), DEFAULT_CONFIG, AS_OF);
    const batch = computeScore(s.logging(false), DEFAULT_CONFIG, AS_OF);
    expect(batch.confidence).toBeLessThan(regular.confidence);
    expect(batch.lowData).toBe(true);
    expect(regular.lowData).toBe(false);
  });

  it('O7 frequent contact with a relationship rated harmful does not raise the score', () => {
    expect(total(s.withHarmful(true))).toBeLessThanOrEqual(total(s.withHarmful(false)));
  });

  it('O8 a gap covered by a global pause scores higher than the same gap unpaused', () => {
    expect(total(s.busyPeriod(true))).toBeGreaterThan(total(s.busyPeriod(false)));
  });

  it('O9 a single-category network on rhythm is not heavily penalised against a diverse one', () => {
    expect(total(s.singleCategory())).toBeGreaterThanOrEqual(total(s.diverse()) - 10);
  });

  it('O10 a healthy on-rhythm network scores at least 60; a neglected one at most 40', () => {
    expect(total(s.closeKnit())).toBeGreaterThanOrEqual(60);
    expect(total(s.inactive())).toBeLessThanOrEqual(40);
  });
});

describe('confidence', () => {
  it('C1 a window that was almost entirely paused is not flagged as low data', () => {
    expect(computeScore(s.busyPeriod(true), DEFAULT_CONFIG, AS_OF).lowData).toBe(false);
  });

  it('C2 the same gap without a pause is flagged as low data', () => {
    expect(computeScore(s.busyPeriod(false), DEFAULT_CONFIG, AS_OF).lowData).toBe(true);
  });
});

describe('model v0.2 orderings (calls and frecency)', () => {
  function friends(build: (b: ScenarioBuilder) => void) {
    const b = new ScenarioBuilder(AS_OF);
    ['ana', 'ben', 'cleo', 'dev'].forEach((id) => {
      b.person(id, { category: 'friend', importance: 5, rhythm: 'monthly' });
      b.contactEvery(id, 30, { fromDaysAgo: 365, toDaysAgo: 20 }); // some logged contact, a bit behind
    });
    b.connectCalls();
    build(b);
    return b.build();
  }

  it('O11 regular calls with everyone beat the same network with no calls', () => {
    const called = friends((b) => ['ana', 'ben', 'cleo', 'dev'].forEach((id) => b.callEvery(id, 14, { toDaysAgo: 2 })));
    const silent = friends(() => {});
    expect(total(called)).toBeGreaterThan(total(silent));
  });

  it('O12 calls spread across people beat the same number of calls with one person', () => {
    const spread = friends((b) => ['ana', 'ben', 'cleo', 'dev'].forEach((id, i) => b.call(id, 3 + i)));
    const oneOnly = friends((b) => [0, 1, 2, 3].forEach((i) => b.call('ana', 3 + i)));
    expect(total(spread)).toBeGreaterThan(total(oneOnly));
  });

  it('O13 calls alone cannot make up for no contact being logged at all', () => {
    const b = new ScenarioBuilder(AS_OF);
    ['ana', 'ben'].forEach((id) => {
      b.person(id, { category: 'friend', importance: 5, rhythm: 'monthly' });
      b.callEvery(id, 7, { toDaysAgo: 1 });
    });
    const callsOnly = total(b.build());
    expect(callsOnly).toBeLessThan(60); // rhythm and coverage still need logged contact
  });
});

describe('model v0.2 orderings (ratings and call length)', () => {
  it('O14 the same contact pattern with good, supportive relationships beats strained, unsupportive ones', () => {
    expect(total(s.rated(5))).toBeGreaterThan(total(s.rated(2)));
  });

  it('O15 regular proper calls beat the same number of very brief calls', () => {
    expect(total(s.callsRegular())).toBeGreaterThan(total(s.callsBrief()));
  });
});
