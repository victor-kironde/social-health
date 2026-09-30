import type { EventLog } from '@sg/score-engine';
import * as s from '@sg/synth/scenarios';
import type { PersonGroup } from './groups';

/**
 * Every synthetic scenario the engine is tested on, grouped for the engine preview, with a
 * one-line description. The graph can also show any of them (graph?scenario=<id>).
 */
export interface ScenarioInfo {
  id: string;
  label: string;
  group: 'Catch-ups' | 'Life events' | 'Quality' | 'Ideals' | 'Calls' | 'Network' | 'Lives';
  description: string;
  build: () => EventLog;
}

export const SCENARIO_AS_OF = s.AS_OF;

export const SCENARIOS: ScenarioInfo[] = [
  { id: 'closeKnit', label: 'Close-knit', group: 'Catch-ups', description: '4 important people, each seen in person monthly.', build: () => s.closeKnit() },
  { id: 'messagesOnly', label: 'Messages only', group: 'Catch-ups', description: 'The close-knit pattern, but every catch-up is a message.', build: () => s.closeKnit('message') },
  { id: 'balanced', label: 'Balanced', group: 'Catch-ups', description: '6 important people, each seen once a month.', build: s.balanced },
  { id: 'concentrated', label: 'Concentrated', group: 'Catch-ups', description: 'The same 6 people and meetings, all with one person.', build: s.concentrated },
  { id: 'largeNeglected', label: 'Large, neglected', group: 'Catch-ups', description: '30 people: the 10 important ones not seen for 120 days; lots of messages with others.', build: s.largeNeglected },
  { id: 'inactive', label: 'Inactive', group: 'Catch-ups', description: 'The close-knit network, with no catch-ups for the last 90 days.', build: s.inactive },
  { id: 'singleCategory', label: 'One type', group: 'Catch-ups', description: '5 people, all family, all on rhythm.', build: s.singleCategory },
  { id: 'diverse', label: 'Diverse', group: 'Catch-ups', description: '5 people, one of each type, all on rhythm.', build: s.diverse },
  { id: 'loggingRegular', label: 'Logged regularly', group: 'Catch-ups', description: 'Weekly catch-ups, logged as they happen.', build: () => s.logging(true) },
  { id: 'loggingOneDay', label: 'Logged all at once', group: 'Catch-ups', description: 'The same catch-ups, all logged yesterday (lower confidence).', build: () => s.logging(false) },
  { id: 'busyPaused', label: 'Busy, paused', group: 'Life events', description: 'Catch-ups stopped 60 days ago, during a pause.', build: () => s.busyPeriod(true) },
  { id: 'busyUnpaused', label: 'Busy, not paused', group: 'Life events', description: 'Catch-ups stopped 60 days ago, with no pause.', build: () => s.busyPeriod(false) },
  { id: 'bereavementMarked', label: 'Bereavement, in memoriam', group: 'Life events', description: 'A parent died 200 days ago and was marked in memoriam.', build: () => s.bereavement(true) },
  { id: 'bereavementUnmarked', label: 'Bereavement, unmarked', group: 'Life events', description: 'The same loss, not marked: they still count as overdue.', build: () => s.bereavement(false) },
  { id: 'ratedGood', label: 'Rated very good', group: 'Quality', description: 'Close-knit, every relationship rated very good.', build: () => s.rated(5) },
  { id: 'ratedStrained', label: 'Rated strained', group: 'Quality', description: 'Close-knit, every relationship rated strained.', build: () => s.rated(2) },
  { id: 'harmfulContact', label: 'Harmful, still in touch', group: 'Quality', description: 'A relationship rated harmful, with frequent catch-ups (left out of the score).', build: () => s.withHarmful(true) },
  { id: 'harmfulNoContact', label: 'Harmful, not in touch', group: 'Quality', description: 'The same, with no catch-ups.', build: () => s.withHarmful(false) },
  { id: 'coParentDistant', label: 'Kept distant, ideal 3', group: 'Ideals', description: 'Close family and friends, plus a relationship rated strained with brief messages every few weeks, kept distant on purpose (ideal 3).', build: () => s.coParenting(3) },
  { id: 'coParentDefault', label: 'Kept distant, ideal 10', group: 'Ideals', description: 'The same, with the default ideal of 10: the distance now counts against the score.', build: () => s.coParenting(undefined) },
  { id: 'coParentClose', label: 'Ideal 3, weekly meetings', group: 'Ideals', description: 'Ideal 3, but meeting every week: closer than hoped.', build: () => s.coParenting(3, 'close') },
  { id: 'coParentDontMind', label: "Don't mind", group: 'Ideals', description: "The distant relationship set to \"don't mind\": left out of the score entirely.", build: () => s.coParenting(null) },
  { id: 'callsRegular', label: 'Regular calls', group: 'Calls', description: 'Call history connected; a call with each friend every two weeks.', build: s.callsRegular },
  { id: 'callsNone', label: 'No calls', group: 'Calls', description: 'Call history connected, but no calls.', build: s.callsNone },
  { id: 'callsSpread', label: 'Calls spread', group: 'Calls', description: 'Four recent calls, one with each friend.', build: s.callsSpread },
  { id: 'callsConcentrated', label: 'Calls concentrated', group: 'Calls', description: 'The same four calls, all with one friend.', build: s.callsConcentrated },
  { id: 'callsBrief', label: 'Brief calls', group: 'Calls', description: 'Regular calls, every one under a minute.', build: s.callsBrief },
  { id: 'callsOnly', label: 'Calls only', group: 'Calls', description: 'Frequent calls, no catch-ups logged by hand.', build: s.callsOnly },
  { id: 'doctor', label: 'A doctor', group: 'Lives', description: 'A GP seeing 6–14 patients every weekday (not named, a count only) plus a few returning ones; a supportive partner and nurse, a mum called less often, and friends squeezed out by work.', build: s.doctor },
  { id: 'teacher', label: 'A kindergarten teacher', group: 'Lives', description: 'A class of about 20 every school day, parents at the gate (one difficult, kept at a distance on purpose), a close teaching assistant, choir, and a warm home life. School holidays show as gaps.', build: s.teacher },
  { id: 'waitress', label: 'A waitress at a bar', group: 'Lives', description: 'Crowds of regulars on late shifts, one pushy regular rated strained, a bartender and flatmate she sees all the time, and weekend friends slipping away since she took Saturday shifts.', build: s.waitress },
  { id: 'lawyer', label: 'A trial lawyer', group: 'Lives', description: 'Court and clients all week, contentious opposing counsel and a client relationship that sours, and a long trial that strains home life and pushes friends aside.', build: s.lawyer },
  { id: 'careHome', label: 'An elderly lady in a care home', group: 'Lives', description: 'Daily company from a carer and a fellow resident, a devoted daughter, a son abroad calling less, bingo and Sunday service, and the death of her closest friend 75 days ago.', build: s.careHome },
  { id: 'student', label: 'A university student', group: 'Lives', description: 'Housemates, a study group and a climbing club, a new friend made there, home friends drifting, and an exam period with fewer catch-ups.', build: s.student },
  { id: 'parentOfThree', label: 'A parent of three', group: 'Lives', description: 'A toddler and a teenager at home (conversations with the teen getting harder), an adult child who moved out 120 days ago, grandma helping weekly, the school gate, and old friends seen less.', build: s.parentOfThree },
  { id: 'newInTown', label: 'New in town', group: 'Lives', description: 'Moved to a new city 75 days ago: old friends and family move to calls, then a new team, a running club, a new friend and a neighbour fill in.', build: s.newInTown },
  { id: 'circles', label: 'Two circles and a bridge', group: 'Network', description: 'Family and friends who meet as groups, one friend who joins both, a colleague who is also family, plus strained, lost-touch and new relationships.', build: s.circles },
];

export const SCENARIO_GROUPS = ['Lives', 'Catch-ups', 'Life events', 'Quality', 'Ideals', 'Calls', 'Network'] as const;

export function findScenario(id: string | undefined): ScenarioInfo | undefined {
  return id ? SCENARIOS.find((x) => x.id === id) : undefined;
}

/** Scenario people are named by short ids; show them capitalised. */
export function scenarioNames(log: EventLog): Map<string, string> {
  return new Map(log.people.map((p) => [p.id, p.displayName.charAt(0).toUpperCase() + p.displayName.slice(1)]));
}

/**
 * A scenario's groups (people of kind 'group'), with everyone named at a catch-up with each group
 * as its members, as the app does when you log one.
 */
export function scenarioGroups(log: EventLog): PersonGroup[] {
  return log.people
    .filter((p) => p.kind === 'group')
    .map((p) => {
      const members = new Set<string>();
      for (const i of log.interactions) {
        if (i.participants.includes(p.id)) for (const m of i.participants) if (m !== p.id) members.add(m);
      }
      return { id: p.id, name: p.displayName, members: [...members].sort(), createdAt: 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
