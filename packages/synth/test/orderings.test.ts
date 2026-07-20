/**
 * Pairwise orderings between synthetic scenarios, decided before the formula
 * was chosen. They state what the model should conclude, not exact values.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, computeScore, type EventLog } from '@sg/score-engine';
import { AS_OF, scenarios as s } from '../src';

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
