import type { Category, EventLog, InteractionType } from '@sg/score-engine';
import { ScenarioBuilder } from './builder';

/** Fixed reference date so scenarios are reproducible. */
export const AS_OF = Date.UTC(2026, 6, 1);

const CATEGORIES: Category[] = ['family', 'friend', 'work', 'neighbour', 'community'];

/** 4 important people (family and friends), each seen in person monthly. */
export function closeKnit(type: InteractionType = 'in_person'): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  ['mum', 'sister', 'ana', 'ben'].forEach((id, i) => {
    b.person(id, { category: i < 2 ? 'family' : 'friend', importance: 5, rhythm: 'monthly' });
    b.contactEvery(id, 30, { toDaysAgo: 3 + i }, { type });
  });
  return b.build();
}

/** The close-knit network, but nobody has been contacted for the last 90 days. */
export function inactive(): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  ['mum', 'sister', 'ana', 'ben'].forEach((id, i) => {
    b.person(id, { category: i < 2 ? 'family' : 'friend', importance: 5, rhythm: 'monthly' });
    b.contactEvery(id, 30, { toDaysAgo: 90 + i });
  });
  return b.build();
}

/**
 * 30 people. The 10 important ones have not been contacted for 120 days;
 * activity is frequent messaging with low-importance work contacts.
 */
export function largeNeglected(): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  for (let i = 0; i < 30; i++) {
    const id = `p${i}`;
    const important = i < 10;
    b.person(id, {
      category: important ? CATEGORIES[i % 2]! : CATEGORIES[2 + (i % 3)]!,
      importance: important ? 5 : 2,
    });
    if (important) b.contactEvery(id, 30, { fromDaysAgo: 365, toDaysAgo: 120 });
    else b.contactEvery(id, 2, { fromDaysAgo: 120, toDaysAgo: 0 }, { type: 'message' });
  }
  return b.build();
}

const SIX = ['a', 'b', 'c', 'd', 'e', 'f'];

function sixImportant(b: ScenarioBuilder): void {
  SIX.forEach((id, i) => b.person(id, { category: i % 2 ? 'friend' : 'family', importance: 5, rhythm: 'monthly' }));
}

/** 6 important people, each seen once a month. */
export function balanced(): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  sixImportant(b);
  SIX.forEach((id, i) => b.contactEvery(id, 30, { toDaysAgo: i * 5 }));
  return b.build();
}

/** Same 6 people and the same number of meetings, all with one person. */
export function concentrated(): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  sixImportant(b);
  SIX.forEach((_, i) => b.contactEvery('a', 30, { toDaysAgo: i * 5 }));
  return b.build();
}

/** A close family member died 200 days ago; optionally marked in memoriam. */
export function bereavement(markedInMemoriam: boolean): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  b.person('dad', { category: 'family', importance: 5, rhythm: 'weekly' });
  b.contactEvery('dad', 7, { fromDaysAgo: 365, toDaysAgo: 200 });
  if (markedInMemoriam) b.change('dad', { field: 'state', value: 'in_memoriam' }, b.at(190));
  ['mum', 'ana', 'ben'].forEach((id, i) => {
    b.person(id, { category: i === 0 ? 'family' : 'friend', importance: 5, rhythm: 'monthly' });
    b.contactEvery(id, 30, { toDaysAgo: 4 + i });
  });
  return b.build();
}

/** Close-knit contact pattern, logged regularly or all on one day. */
export function logging(regular: boolean): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  ['mum', 'sister', 'ana', 'ben'].forEach((id, i) => {
    b.person(id, { category: i < 2 ? 'family' : 'friend', importance: 5, rhythm: 'weekly' });
    b.contactEvery(id, 7, { toDaysAgo: i }, regular ? {} : { loggedAt: b.at(1) });
  });
  return b.build();
}

/** Close-knit network plus a relationship rated harmful (quality 1). */
export function withHarmful(contactWithHarmful: boolean): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  ['mum', 'ana'].forEach((id, i) => {
    b.person(id, { category: i ? 'friend' : 'family', importance: 5, rhythm: 'monthly' });
    b.contactEvery(id, 30, { toDaysAgo: 2 });
  });
  b.person('ex', { category: 'friend', importance: 4, quality: 1, rhythm: 'weekly' });
  if (contactWithHarmful) b.contactEvery('ex', 3, { fromDaysAgo: 60, toDaysAgo: 0 });
  return b.build();
}

/** Monthly contact stopped 60 days ago; optionally a global pause covered that gap. */
export function busyPeriod(paused: boolean): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  ['mum', 'ana', 'ben'].forEach((id, i) => {
    b.person(id, { category: i ? 'friend' : 'family', importance: 5, rhythm: 'monthly' });
    b.contactEvery(id, 30, { toDaysAgo: 60 + i });
  });
  if (paused) b.pause(58, 2);
  return b.build();
}

/** 5 people, all in one category, all on rhythm. */
export function singleCategory(): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  for (let i = 0; i < 5; i++) {
    b.person(`f${i}`, { category: 'family', importance: 5, rhythm: 'monthly' });
    b.contactEvery(`f${i}`, 30, { toDaysAgo: i * 3 });
  }
  return b.build();
}

/** 5 people, one per category, all on rhythm. */
export function diverse(): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  CATEGORIES.forEach((category, i) => {
    b.person(`d${i}`, { category, importance: 5, rhythm: 'monthly' });
    b.contactEvery(`d${i}`, 30, { toDaysAgo: i * 3 });
  });
  return b.build();
}

/** Four close friends with some logged contact (a little behind) and the call log connected. */
function friendsWithCalls(addCalls: (b: ScenarioBuilder) => void): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  ['ana', 'ben', 'cleo', 'dev'].forEach((id) => {
    b.person(id, { category: 'friend', importance: 5, rhythm: 'monthly' });
    b.contactEvery(id, 30, { fromDaysAgo: 365, toDaysAgo: 20 });
  });
  b.connectCalls();
  addCalls(b);
  return b.build();
}

/** Regular calls with everyone. */
export function callsRegular(): EventLog {
  return friendsWithCalls((b) => ['ana', 'ben', 'cleo', 'dev'].forEach((id) => b.callEvery(id, 14, { toDaysAgo: 2 })));
}

/** Call log connected, but no calls. */
export function callsNone(): EventLog {
  return friendsWithCalls(() => {});
}

/** Four recent calls, one with each friend. */
export function callsSpread(): EventLog {
  return friendsWithCalls((b) => ['ana', 'ben', 'cleo', 'dev'].forEach((id, i) => b.call(id, 3 + i)));
}

/** The same four calls, all with one friend. */
export function callsConcentrated(): EventLog {
  return friendsWithCalls((b) => [0, 1, 2, 3].forEach((i) => b.call('ana', 3 + i)));
}

/** Frequent calls but nothing logged by hand. */
export function callsOnly(): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  ['ana', 'ben'].forEach((id) => {
    b.person(id, { category: 'friend', importance: 5, rhythm: 'monthly' });
    b.callEvery(id, 7, { toDaysAgo: 1 });
  });
  return b.build();
}

/** Close-knit network on rhythm, with every relationship rated (and support reported) at `rating`. */
export function rated(rating: 2 | 5): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  ['mum', 'sister', 'ana', 'ben'].forEach((id, i) => {
    b.person(id, { category: i < 2 ? 'family' : 'friend', importance: 5, rhythm: 'monthly', quality: rating });
    b.contactEvery(id, 30, { toDaysAgo: 3 + i });
    b.support(id, 10, rating);
  });
  return b.build();
}

/** Regular calls with everyone, but every call under a minute. */
export function callsBrief(): EventLog {
  return friendsWithCalls((b) => ['ana', 'ben', 'cleo', 'dev'].forEach((id) => {
    for (let d = 2; d <= 365; d += 14) b.call(id, d, 30);
  }));
}

/**
 * Two social circles and a bridge, for showing network structure: a family who meet together,
 * a group of friends who meet together, and one friend (cleo) who also joins family meals and
 * so connects the circles. Kim is a colleague who is also family. Rounded out with a strained
 * relationship (lee), someone you have lost touch with (zoe) and a new neighbour not yet met (nia).
 */
export function circles(): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  ['mum', 'dad', 'sis'].forEach((id) => b.person(id, { category: 'family', importance: 5, rhythm: 'monthly' }));
  ['ana', 'ben', 'cleo'].forEach((id) => b.person(id, { category: 'friend', importance: 4, rhythm: 'monthly' }));
  b.person('kim', { category: 'work', importance: 3, rhythm: 'weekly' });
  b.change('kim', { field: 'alsoCategories', value: ['family'] }, b.at(365));
  b.person('lee', { category: 'work', importance: 3, rhythm: 'monthly', quality: 2 });
  b.person('zoe', { category: 'friend', importance: 4, rhythm: 'monthly' });
  b.person('nia', { category: 'neighbour', importance: 2, rhythm: 'quarterly' });

  b.contactEvery(['mum', 'dad', 'sis'], 21, { toDaysAgo: 4 });
  b.contactEvery(['ana', 'ben', 'cleo'], 14, { toDaysAgo: 2 });
  b.contactEvery(['mum', 'dad', 'cleo'], 60, { toDaysAgo: 10 });
  b.contactEvery(['kim', 'sis'], 30, { toDaysAgo: 6 });
  b.contactEvery('kim', 7, { toDaysAgo: 1 }, { type: 'message' });
  b.contactEvery('lee', 30, { toDaysAgo: 12 });
  b.contactEvery('zoe', 30, { fromDaysAgo: 365, toDaysAgo: 200 });
  return b.build();
}

/**
 * Co-parenting after a divorce: a close family and friends on rhythm, plus an ex-partner rated
 * strained with only brief, occasional contact about the children. With `ideal`, the user says how
 * close they hope that relationship to be (3 = distant on purpose); without it, the default of 10.
 * `contact`: 'sparse' (a short call every few weeks) or 'close' (meeting in person every week).
 */
export function coParenting(ideal: number | null | undefined, contact: 'sparse' | 'close' = 'sparse'): EventLog {
  const b = new ScenarioBuilder(AS_OF);
  ['mum', 'sis', 'ana'].forEach((id, i) => {
    b.person(id, { category: i < 2 ? 'family' : 'friend', importance: 5, rhythm: 'monthly' });
    b.contactEvery(id, 30, { toDaysAgo: 3 + i });
  });
  b.person('ex', { category: 'other', importance: 4, rhythm: 'monthly', quality: 2, ...(ideal === undefined ? {} : { ideal }) });
  if (contact === 'sparse') b.contactEvery('ex', 45, { toDaysAgo: 20 }, { type: 'message' });
  else b.contactEvery('ex', 7, { toDaysAgo: 1 });
  return b.build();
}
