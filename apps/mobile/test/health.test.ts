import type { RelationshipContribution } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import { GROUP_MUTE, groupHealthColour, mixHex, relationshipHealth, scoreBand, scoreOutOf10 } from '../src/data/health';

function rel(over: Partial<RelationshipContribution> = {}): RelationshipContribution {
  return {
    personId: 'a',
    category: 'friend',
    alsoCategories: [],
    importance: 3,
    quality: null,
    rhythm: 'monthly',
    state: 'active',
    included: true,
    expectedIntervalDays: 30,
    level: 0.8,
    onRhythm: 1,
    lastContactAgeDays: 5,
    callLevel: null,
    frecency: 1,
    ...over,
  };
}

describe('relationshipHealth', () => {
  it('is good when on rhythm and unrated or rated well', () => {
    expect(relationshipHealth(rel())).toBe(5);
    expect(relationshipHealth(rel({ quality: 5 }))).toBe(5);
  });

  it('is limited by quality: a harmful relationship is red however often you meet', () => {
    expect(relationshipHealth(rel({ quality: 1 }))).toBe(1);
    expect(relationshipHealth(rel({ quality: 3 }))).toBe(3);
  });

  it('is limited by rhythm: falling behind lowers it', () => {
    expect(relationshipHealth(rel({ onRhythm: 0.6 }))).toBe(4);
    expect(relationshipHealth(rel({ onRhythm: 0.3, quality: 5 }))).toBe(3);
    expect(relationshipHealth(rel({ onRhythm: 0.1 }))).toBe(2);
  });

  it('is lost touch when never contacted, long overdue, or paused', () => {
    expect(relationshipHealth(rel({ lastContactAgeDays: null }))).toBe('lost');
    expect(relationshipHealth(rel({ lastContactAgeDays: 91, onRhythm: 0 }))).toBe('lost');
    expect(relationshipHealth(rel({ lastContactAgeDays: 89, onRhythm: 0 }))).toBe(2);
    expect(relationshipHealth(rel({ state: 'paused' }))).toBe('lost');
  });
});

describe('score out of 10', () => {
  it('maps 0–100 onto 1–10, monotonically, with both ends reachable', () => {
    expect(scoreOutOf10(0)).toBe(1);
    expect(scoreOutOf10(100)).toBe(10);
    expect(scoreOutOf10(56)).toBe(6);
    let prev = 0;
    for (let t = 0; t <= 100; t++) {
      const s = scoreOutOf10(t);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('colours 1–2 red up to 9–10 green', () => {
    expect([1, 2, 3, 5, 6, 8, 10].map(scoreBand)).toEqual([1, 1, 2, 3, 3, 4, 5]);
  });
});

describe('groupHealthColour', () => {
  const palette = { 1: '#ff0000', 2: '#ff8000', 3: '#ffff00', 4: '#80ff00', 5: '#00ff00', lost: '#808080' } as const;
  const muted = (hex: string) => mixHex(hex, palette.lost, GROUP_MUTE);

  it('is the (muted) health colour when everyone in the group is alike', () => {
    expect(groupHealthColour([5, 5, 5], palette)).toBe(muted('#00ff00'));
    expect(groupHealthColour([1], palette)).toBe(muted('#ff0000'));
  });

  it('averages health, blending between neighbouring colours', () => {
    expect(groupHealthColour([4, 5], palette)).toBe(muted(mixHex('#80ff00', '#00ff00', 0.5)));
    expect(groupHealthColour([1, 5], palette)).toBe(muted('#ffff00'));
  });

  it('greys out with the share of lost touch, and is plain grey when all are lost', () => {
    expect(groupHealthColour([5, 'lost'], palette)).toBe(muted(mixHex('#00ff00', '#808080', 0.5)));
    expect(groupHealthColour(['lost', 'lost'], palette)).toBe('#808080');
    expect(groupHealthColour([], palette)).toBe('#808080');
  });

  it('a healthier group is never redder than a less healthy one', () => {
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
    expect(red(groupHealthColour([5, 5], palette))).toBeLessThan(red(groupHealthColour([2, 3], palette)));
  });
});
