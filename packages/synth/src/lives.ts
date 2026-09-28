import { DAY, type EventLog } from '@sg/score-engine';
import { ScenarioBuilder, type ContactOptions } from './builder';

/**
 * Whole lives, for illustrating the app (report figures, demos): about ten months of history,
 * with the story told in the last five. Each is deterministic (seeded), as of AS_OF.
 */

const AS_OF = Date.UTC(2026, 6, 1);
/** How far back each life's history goes. */
const HISTORY = 300;

/** Small seeded generator (mulberry32), so every build is identical. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 = Sunday … 6 = Saturday, for `daysAgo` before AS_OF. */
const weekday = (daysAgo: number) => new Date(AS_OF - daysAgo * DAY).getUTCDay();
const isWeekday = (d: number) => weekday(d) >= 1 && weekday(d) <= 5;

/** Catch-ups on each day from `from` to `to` days ago where `when` says so. */
function each(
  b: ScenarioBuilder,
  ids: string[] | ((d: number) => string[]),
  from: number,
  to: number,
  when: (d: number) => boolean,
  opts: ContactOptions | ((d: number) => ContactOptions) = {},
): void {
  for (let d = from; d >= to; d--) {
    if (!when(d)) continue;
    const who = typeof ids === 'function' ? ids(d) : ids;
    if (who.length) b.contact(who, d, typeof opts === 'function' ? opts(d) : opts);
  }
}

const every = (n: number, offset = 0) => (d: number) => (d + offset) % n === 0;

/** A GP: a clinic full of new and returning patients every weekday, and a busy job squeezing out friends. */
export function doctor(): EventLog {
  const r = rng(1);
  const b = new ScenarioBuilder(AS_OF);
  b.person('patients', { name: 'Patients', group: true, category: 'work', importance10: 6, frequency: { times: 5, per: 'week' } }, HISTORY);
  b.person('grace', { name: 'Grace', category: 'other', importance10: 2 }, HISTORY);
  b.person('tom', { name: 'Tom', category: 'other', importance10: 2, rhythm: 'fortnightly' }, 130);
  b.person('edwin', { name: 'Edwin', category: 'other', importance10: 2, rhythm: 'weekly' }, 160);
  b.person('amara', { name: 'Amara (nurse)', category: 'work', importance10: 6, together: true }, HISTORY);
  b.person('patel', { name: 'Dr Patel', category: 'work', importance10: 4, rhythm: 'weekly' }, HISTORY);
  b.person('sam', { name: 'Sam', category: 'family', importance10: 10, together: true }, HISTORY);
  b.person('mum', { name: 'Mum', category: 'family', importance10: 8, rhythm: 'weekly' }, HISTORY);
  b.person('jo', { name: 'Jo', category: 'friend', importance10: 7, rhythm: 'fortnightly' }, HISTORY);
  b.person('raj', { name: 'Raj', category: 'friend', importance10: 7, rhythm: 'fortnightly' }, HISTORY);

  // Clinic: every weekday, 6–14 patients not named, plus anyone returning.
  each(
    b,
    (d) => [
      'patients',
      ...(d % 28 === 5 ? ['grace'] : []),
      ...(d <= 125 && d % 14 === 1 ? ['tom'] : []),
      ...(d <= 155 && d >= 60 && d % 7 === 2 ? ['edwin'] : []),
    ],
    HISTORY,
    0,
    isWeekday,
    () => ({ newPeople: 6 + Math.floor(r() * 9) }),
  );
  each(b, ['amara'], HISTORY, 0, isWeekday);
  each(b, ['patel'], HISTORY, 0, (d) => weekday(d) === 2);
  each(b, ['sam'], HISTORY, 0, () => true);
  // Calls with Mum go from weekly to fortnightly as the job gets busier.
  each(b, ['mum'], HISTORY, 0, (d) => weekday(d) === 0 && (d > 70 || d % 14 < 7), { type: 'voice' });
  // Friends: fortnightly, then monthly, then Raj drops off.
  each(b, ['jo', 'raj'], HISTORY, 150, (d) => weekday(d) === 6 && d % 14 < 7);
  each(b, ['jo'], 149, 0, (d) => weekday(d) === 6 && d % 28 < 7);
  each(b, ['raj'], 149, 70, (d) => weekday(d) === 6 && d % 28 < 7);
  return b.build();
}

/** A kindergarten teacher: a class every weekday (children not named), parents at the gate, and a warm home life. */
export function teacher(): EventLog {
  const r = rng(2);
  const b = new ScenarioBuilder(AS_OF);
  const holiday = (d: number) => (d >= 80 && d <= 93) || (d >= 130 && d <= 136) || (d >= 185 && d <= 200);
  b.person('class', { name: 'My class', group: true, category: 'work', importance10: 8, frequency: { times: 5, per: 'week' } }, HISTORY);
  b.person('parents', { name: 'Class parents', group: true, category: 'community', importance10: 3, rhythm: 'weekly' }, HISTORY);
  b.person('priya', { name: 'Priya', category: 'community', importance10: 3 }, HISTORY);
  b.person('mark', { name: 'Mark', category: 'community', importance10: 2, quality: 2, ideal: 4 }, HISTORY);
  b.person('tess', { name: 'Tess (TA)', category: 'work', importance10: 6, together: true, quality: 5 }, HISTORY);
  b.person('bello', { name: 'Mrs Bello', category: 'work', importance10: 4, rhythm: 'weekly' }, HISTORY);
  b.person('dan', { name: 'Dan', category: 'family', importance10: 10, together: true, quality: 5 }, HISTORY);
  b.person('kate', { name: 'Kate (sister)', category: 'family', importance10: 7, rhythm: 'weekly' }, HISTORY);
  b.person('lucy', { name: 'Lucy', category: 'friend', importance10: 7, rhythm: 'fortnightly' }, HISTORY);
  b.person('ola', { name: 'Ola', category: 'friend', importance10: 6 }, HISTORY);
  b.person('choir', { name: 'Choir', group: true, category: 'community', importance10: 5, rhythm: 'weekly' }, HISTORY);

  each(b, ['class'], HISTORY, 0, (d) => isWeekday(d) && !holiday(d), () => ({ newPeople: 18 + Math.floor(r() * 5) }));
  each(
    b,
    (d) => ['parents', ...(d % 9 === 0 ? ['priya'] : []), ...(d % 11 === 0 ? ['mark'] : [])],
    HISTORY,
    0,
    (d) => isWeekday(d) && !holiday(d) && (weekday(d) === 1 || weekday(d) === 4),
    () => ({ newPeople: 3 + Math.floor(r() * 5) }),
  );
  each(b, ['tess'], HISTORY, 0, (d) => isWeekday(d) && !holiday(d));
  each(b, ['bello'], HISTORY, 0, (d) => weekday(d) === 5 && !holiday(d));
  each(b, ['dan'], HISTORY, 0, () => true);
  each(b, ['kate'], HISTORY, 0, (d) => weekday(d) === 0, { type: 'video' });
  each(b, ['lucy', 'ola'], HISTORY, 0, (d) => weekday(d) === 6 && d % 14 < 7);
  each(b, ['choir'], HISTORY, 0, (d) => weekday(d) === 2, () => ({ newPeople: 12 + Math.floor(r() * 6) }));
  return b.build();
}

/** A waitress at a bar: crowds of regulars on late shifts, one pushy regular, and weekend friends slipping away. */
export function waitress(): EventLog {
  const r = rng(3);
  const b = new ScenarioBuilder(AS_OF);
  // Shifts Wednesday to Sunday; from 150 days ago she also takes the Saturday day shift.
  const shift = (d: number) => [0, 3, 4, 5, 6].includes(weekday(d));
  b.person('regulars', { name: 'Bar regulars', group: true, category: 'community', importance10: 4, frequency: { times: 3, per: 'week' } }, HISTORY);
  b.person('mick', { name: 'Mick', category: 'other', importance10: 2, quality: 2, ideal: 2 }, HISTORY);
  b.person('dee', { name: 'Dee', category: 'community', importance10: 4, quality: 4 }, HISTORY);
  b.person('jonno', { name: 'Jonno', category: 'work', importance10: 6, together: true, quality: 4 }, HISTORY);
  b.person('rosa', { name: 'Rosa (boss)', category: 'work', importance10: 5, quality: 3 }, HISTORY);
  b.person('bea', { name: 'Bea', category: 'friend', importance10: 7, together: true }, HISTORY);
  b.person('mum', { name: 'Mum', category: 'family', importance10: 9, frequency: { times: 2, per: 'week' } }, HISTORY);
  b.person('tia', { name: 'Tia', category: 'friend', importance10: 8, rhythm: 'weekly' }, HISTORY);
  b.person('marcus', { name: 'Marcus', category: 'friend', importance10: 7, rhythm: 'weekly' }, HISTORY);

  each(
    b,
    (d) => ['regulars', ...(r() < 0.7 ? ['mick'] : []), ...(weekday(d) === 5 ? ['dee'] : [])],
    HISTORY,
    0,
    (d) => [4, 5, 6].includes(weekday(d)),
    () => ({ newPeople: 20 + Math.floor(r() * 25) }),
  );
  each(b, ['jonno'], HISTORY, 0, shift);
  each(b, ['rosa'], HISTORY, 0, (d) => shift(d) && d % 2 === 0);
  each(b, ['bea'], HISTORY, 0, (d) => d % 2 === 0);
  each(b, ['mum'], HISTORY, 0, (d) => weekday(d) === 1 || weekday(d) === 4, { type: 'message' });
  each(b, ['mum'], HISTORY, 0, (d) => weekday(d) === 1 && d % 28 < 7);
  // Weekend friends: weekly brunch, then the extra Saturday shift.
  each(b, ['tia', 'marcus'], HISTORY, 150, (d) => weekday(d) === 6);
  each(b, ['tia'], 149, 0, (d) => weekday(d) === 1 && d % 21 < 7);
  each(b, ['marcus'], 149, 60, (d) => weekday(d) === 1 && d % 42 < 7, { type: 'message' });
  return b.build();
}

/** A trial lawyer: court and clients all week, contentious opposing counsel, and a long trial straining home and friends. */
export function lawyer(): EventLog {
  const r = rng(4);
  const b = new ScenarioBuilder(AS_OF);
  const trial = (d: number) => d <= 100 && d >= 20;
  b.person('court', { name: 'Court', group: true, category: 'work', importance10: 4, ideal: 6, frequency: { times: 2, per: 'week' } }, HISTORY);
  b.person('clients', { name: 'Clients', group: true, category: 'work', importance10: 6, rhythm: 'weekly' }, HISTORY);
  b.person('hale', { name: 'Mr Hale', category: 'work', importance10: 3, quality: 2, ideal: 3 }, HISTORY);
  b.person('reyes', { name: 'Ms Reyes', category: 'work', importance10: 5, quality: 3, rhythm: 'weekly' }, 130);
  b.person('helen', { name: 'Helen', category: 'work', importance10: 7, quality: 3, rhythm: 'weekly' }, HISTORY);
  b.person('nia', { name: 'Nia', category: 'work', importance10: 6, quality: 5, together: true }, HISTORY);
  b.person('alex', { name: 'Alex', category: 'family', importance10: 10, quality: 4, together: true }, HISTORY);
  b.person('dad', { name: 'Dad', category: 'family', importance10: 8 }, HISTORY);
  b.person('ben', { name: 'Ben', category: 'friend', importance10: 7 }, HISTORY);
  b.person('chloe', { name: 'Chloe', category: 'friend', importance10: 7 }, HISTORY);

  // Court two or three days a week (daily during the trial), with clerks, witnesses and others not named.
  each(
    b,
    (d) => ['court', ...(d <= 125 && r() < 0.6 ? ['hale'] : [])],
    HISTORY,
    0,
    (d) => isWeekday(d) && (trial(d) || weekday(d) === 2 || weekday(d) === 4),
    () => ({ newPeople: 5 + Math.floor(r() * 8) }),
  );
  each(b, ['hale'], 125, 0, (d) => isWeekday(d) && d % 2 === 1, { type: 'message' });
  each(b, (d) => ['clients', ...(d <= 125 && weekday(d) === 1 ? ['reyes'] : [])], HISTORY, 0, (d) => weekday(d) === 1 || weekday(d) === 3, () => ({ newPeople: 1 + Math.floor(r() * 3) }));
  b.change('reyes', { field: 'quality', value: 2 }, b.at(40));
  each(b, ['helen'], HISTORY, 0, (d) => weekday(d) === 5);
  each(b, ['nia'], HISTORY, 0, isWeekday);
  // Home: every day, but the trial wears on things.
  each(b, ['alex'], HISTORY, 0, (d) => !trial(d) || d % 3 !== 0);
  b.change('alex', { field: 'quality', value: 3 }, b.at(60));
  each(b, ['dad'], HISTORY, 0, (d) => weekday(d) === 0 && d % 28 < 7 && !trial(d), { type: 'voice' });
  each(b, ['ben', 'chloe'], HISTORY, 0, (d) => weekday(d) === 6 && d % 28 < 7 && d > 100);
  each(b, ['ben'], 19, 0, (d) => weekday(d) === 6);
  return b.build();
}

/** An elderly lady in a care home: daily company at the home, a devoted daughter, a son abroad, and the loss of a close friend. */
export function careHome(): EventLog {
  const r = rng(5);
  const b = new ScenarioBuilder(AS_OF);
  b.person('carol', { name: 'Carol', category: 'family', importance10: 10, quality: 5, rhythm: 'weekly' }, HISTORY);
  b.person('peter', { name: 'Peter', category: 'family', importance10: 9, state: 'long_distance' }, HISTORY);
  b.person('lily', { name: 'Lily', category: 'family', importance10: 7 }, HISTORY);
  b.person('josh', { name: 'Josh', category: 'family', importance10: 6 }, HISTORY);
  b.person('joy', { name: 'Joy (carer)', category: 'work', importance10: 6, together: true, quality: 4 }, HISTORY);
  b.person('edith', { name: 'Edith', category: 'neighbour', importance10: 8, together: true, quality: 4 }, HISTORY);
  b.person('margaret', { name: 'Margaret', category: 'friend', importance10: 9, quality: 5, rhythm: 'weekly' }, HISTORY);
  b.person('bingo', { name: 'Bingo club', group: true, category: 'community', importance10: 4, rhythm: 'weekly' }, HISTORY);
  b.person('church', { name: 'Sunday service', group: true, category: 'community', importance10: 5, rhythm: 'weekly' }, HISTORY);

  each(b, ['carol'], HISTORY, 0, (d) => weekday(d) === 0);
  each(b, ['carol'], HISTORY, 0, (d) => weekday(d) === 3, { type: 'voice' });
  // Peter: a video call a month, thinning to every other month.
  each(b, ['peter'], HISTORY, 0, (d) => weekday(d) === 6 && (d > 150 ? d % 28 < 7 : d % 56 < 7), { type: 'video' });
  each(b, ['lily'], HISTORY, 0, (d) => weekday(d) === 6 && d % 28 >= 14 && d % 28 < 21, { type: 'video' });
  each(b, ['josh'], HISTORY, 140, (d) => d % 45 === 0);
  each(b, ['joy'], HISTORY, 0, () => true);
  each(b, ['edith'], HISTORY, 0, () => true);
  // Margaret: weekly phone calls until she died, 75 days ago.
  each(b, ['margaret'], HISTORY, 76, (d) => weekday(d) === 2, { type: 'voice' });
  b.change('margaret', { field: 'state', value: 'in_memoriam' }, b.at(70));
  each(b, (d) => ['bingo', ...(r() < 0.8 ? ['edith'] : [])], HISTORY, 0, (d) => weekday(d) === 4, () => ({ newPeople: 6 + Math.floor(r() * 5) }));
  each(b, (d) => ['church', ...(d > 76 && r() < 0.7 ? ['margaret'] : [])], HISTORY, 0, (d) => weekday(d) === 0, () => ({ newPeople: 20 + Math.floor(r() * 10) }));
  return b.build();
}

/** A university student: housemates, a study group and a climbing club, a new friend, home friends drifting, and exams. */
export function student(): EventLog {
  const r = rng(6);
  const b = new ScenarioBuilder(AS_OF);
  const exams = (d: number) => d <= 40 && d >= 20;
  b.person('kai', { name: 'Kai', category: 'friend', importance10: 7, together: true }, HISTORY);
  b.person('mo', { name: 'Mo', category: 'friend', importance10: 6, together: true }, HISTORY);
  b.person('study', { name: 'Study group', group: true, category: 'work', importance10: 5, rhythm: 'weekly' }, HISTORY);
  b.person('climbing', { name: 'Climbing club', group: true, category: 'community', importance10: 5, frequency: { times: 2, per: 'week' } }, HISTORY);
  b.person('jess', { name: 'Jess', category: 'friend', importance10: 7 }, 120);
  b.person('mum', { name: 'Mum', category: 'family', importance10: 9, rhythm: 'weekly' }, HISTORY);
  b.person('dad', { name: 'Dad', category: 'family', importance10: 8 }, HISTORY);
  b.person('ellie', { name: 'Ellie', category: 'friend', importance10: 8, rhythm: 'fortnightly' }, HISTORY);
  b.person('tom', { name: 'Tom', category: 'friend', importance10: 7, rhythm: 'fortnightly' }, HISTORY);
  b.person('ahmed', { name: 'Dr Ahmed', category: 'work', importance10: 4, rhythm: 'fortnightly' }, HISTORY);

  each(b, ['kai'], HISTORY, 0, (d) => d % 7 !== 3);
  each(b, ['mo'], HISTORY, 0, (d) => d % 2 === 0);
  each(b, (d) => ['study', ...(d % 2 ? ['kai'] : [])], HISTORY, 0, (d) => weekday(d) === 2 || (exams(d) && isWeekday(d)), () => ({ newPeople: 2 + Math.floor(r() * 2) }));
  // Climbing club twice a week (less during exams); Jess joins 120 days ago and becomes a friend.
  each(
    b,
    (d) => ['climbing', ...(d <= 120 && r() < 0.8 ? ['jess'] : [])],
    HISTORY,
    0,
    (d) => (weekday(d) === 3 || weekday(d) === 6) && (!exams(d) || weekday(d) === 6),
    () => ({ newPeople: 4 + Math.floor(r() * 7) }),
  );
  each(b, ['jess'], 90, 0, (d) => weekday(d) === 5 && d % 14 < 7);
  each(b, ['mum'], HISTORY, 0, (d) => weekday(d) === 0, { type: 'voice' });
  each(b, ['dad'], HISTORY, 0, (d) => weekday(d) === 0 && d % 28 < 7, { type: 'voice' });
  each(b, ['mum', 'dad'], HISTORY, 0, (d) => d === 190 || d === 100 || d === 15);
  // Home friends: fortnightly video, then monthly; Tom drops away.
  each(b, ['ellie', 'tom'], HISTORY, 150, (d) => weekday(d) === 4 && d % 14 < 7, { type: 'video' });
  each(b, ['ellie'], 149, 0, (d) => weekday(d) === 4 && d % 28 < 7, { type: 'video' });
  each(b, ['tom'], 149, 100, (d) => weekday(d) === 4 && d % 42 < 7, { type: 'message' });
  each(b, ['ahmed'], HISTORY, 0, (d) => weekday(d) === 1 && d % 14 < 7);
  return b.build();
}

/** A parent of three (toddler, teenager, adult child who moved out 120 days ago), with family, school gate and old friends. */
export function parentOfThree(): EventLog {
  const r = rng(7);
  const b = new ScenarioBuilder(AS_OF);
  b.person('chris', { name: 'Chris', category: 'family', importance10: 10, together: true, quality: 4 }, HISTORY);
  b.person('mia', { name: 'Mia (2)', category: 'family', importance10: 10, together: true, quality: 5 }, HISTORY);
  b.person('leo', { name: 'Leo (15)', category: 'family', importance10: 10, together: true, quality: 4 }, HISTORY);
  b.person('ava', { name: 'Ava (21)', category: 'family', importance10: 9, together: true, quality: 5 }, HISTORY);
  b.person('rose', { name: 'Grandma Rose', category: 'family', importance10: 8, rhythm: 'weekly' }, HISTORY);
  b.person('gate', { name: 'School gate', group: true, category: 'community', importance10: 3, rhythm: 'weekly' }, HISTORY);
  b.person('hana', { name: 'Hana', category: 'friend', importance10: 6 }, 100);
  b.person('jade', { name: 'Jade', category: 'friend', importance10: 7 }, HISTORY);
  b.person('sol', { name: 'Sol', category: 'friend', importance10: 7 }, HISTORY);
  b.person('ben', { name: 'Ben', category: 'work', importance10: 4, rhythm: 'weekly' }, HISTORY);

  each(b, ['chris', 'mia'], HISTORY, 0, () => true);
  // Leo: every day at home, but the conversations get harder.
  each(b, ['leo'], HISTORY, 0, (d) => d % 4 !== 0);
  each(b, ['leo'], HISTORY, 0, (d) => d % 3 === 0, { type: 'message' });
  b.change('leo', { field: 'quality', value: 3 }, b.at(90));
  // Ava lives at home, then moves out: a weekly video call and a visit a month.
  each(b, ['ava'], HISTORY, 121, () => true);
  b.change('ava', { field: 'together', value: false }, b.at(120));
  each(b, ['ava'], 120, 0, (d) => weekday(d) === 0, { type: 'video' });
  each(b, ['ava', 'chris', 'mia', 'leo'], 120, 0, (d) => weekday(d) === 6 && d % 28 < 7);
  each(b, ['rose', 'mia'], HISTORY, 0, (d) => weekday(d) === 3);
  each(
    b,
    (d) => ['gate', ...(d <= 100 && r() < 0.4 ? ['hana'] : [])],
    HISTORY,
    0,
    (d) => isWeekday(d) && !(d >= 80 && d <= 93),
    () => ({ newPeople: 3 + Math.floor(r() * 4) }),
  );
  each(b, ['hana'], 90, 0, (d) => weekday(d) === 5 && d % 14 < 7);
  each(b, ['jade', 'sol'], HISTORY, 0, (d) => weekday(d) === 6 && (d > 150 ? d % 28 < 7 : d % 56 < 7));
  each(b, ['ben'], HISTORY, 0, (d) => weekday(d) === 2);
  return b.build();
}

/** Moving to a new city 75 days ago: old friends move to video, then new friends, colleagues and a running club fill in. */
export function newInTown(): EventLog {
  const r = rng(8);
  const b = new ScenarioBuilder(AS_OF);
  const MOVE = 75;
  b.person('mum', { name: 'Mum', category: 'family', importance10: 9, rhythm: 'weekly' }, HISTORY);
  b.person('nat', { name: 'Nat', category: 'friend', importance10: 9, rhythm: 'weekly' }, HISTORY);
  b.person('ollie', { name: 'Ollie', category: 'friend', importance10: 8, rhythm: 'weekly' }, HISTORY);
  b.person('fran', { name: 'Fran', category: 'friend', importance10: 6 }, HISTORY);
  b.person('oldteam', { name: 'Old team', group: true, category: 'work', importance10: 4, rhythm: 'weekly' }, HISTORY);
  b.person('newteam', { name: 'New team', group: true, category: 'work', importance10: 5, rhythm: 'weekly' }, MOVE);
  b.person('lena', { name: 'Lena', category: 'work', importance10: 5 }, MOVE - 5);
  b.person('running', { name: 'Running club', group: true, category: 'community', importance10: 5, rhythm: 'weekly' }, 50);
  b.person('kofi', { name: 'Kofi', category: 'friend', importance10: 6 }, 45);
  b.person('mrsdunn', { name: 'Mrs Dunn', category: 'neighbour', importance10: 3 }, 60);

  each(b, ['mum'], HISTORY, MOVE + 1, (d) => weekday(d) === 0);
  each(b, ['mum'], MOVE, 0, (d) => weekday(d) === 0, { type: 'video' });
  each(b, ['nat', 'ollie'], HISTORY, MOVE + 1, (d) => weekday(d) === 5);
  each(b, ['nat'], MOVE, 0, (d) => weekday(d) === 2 && d % 14 < 7, { type: 'video' });
  each(b, ['ollie'], MOVE, 0, (d) => weekday(d) === 2 && d % 28 < 7, { type: 'message' });
  each(b, ['fran'], HISTORY, MOVE + 1, (d) => weekday(d) === 6 && d % 21 < 7);
  each(b, ['oldteam'], HISTORY, MOVE + 1, isWeekday, () => ({ newPeople: 4 + Math.floor(r() * 3) }));
  b.change('oldteam', { field: 'state', value: 'archived' }, b.at(MOVE - 10));
  each(b, (d) => ['newteam', ...(d < MOVE - 5 && r() < 0.6 ? ['lena'] : [])], MOVE, 0, isWeekday, () => ({ newPeople: 3 + Math.floor(r() * 4) }));
  each(b, ['running'], 50, 0, (d) => weekday(d) === 4 || (weekday(d) === 0 && d > 45), () => ({ newPeople: 8 + Math.floor(r() * 10) }));
  each(b, ['kofi', 'running'], 45, 0, (d) => weekday(d) === 0 && r() < 0.8, () => ({ newPeople: 8 + Math.floor(r() * 8) }));
  each(b, ['kofi'], 30, 0, (d) => weekday(d) === 5 && d % 14 < 7);
  each(b, ['mrsdunn'], 60, 0, (d) => d % 9 === 0);
  // The visit home.
  each(b, ['mum', 'nat', 'ollie', 'fran'], 30, 29, () => true);
  return b.build();
}
