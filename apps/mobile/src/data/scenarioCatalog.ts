import type { EventLog } from '@sg/score-engine';
import * as s from '@sg/synth/scenarios';

/**
 * Every synthetic scenario the engine is tested on, grouped for the engine preview, with a
 * one-line description. The graph can also show any of them (graph?scenario=<id>).
 */
export interface ScenarioInfo {
  id: string;
  label: string;
  group: 'Contact' | 'Life events' | 'Quality' | 'Calls' | 'Network';
  description: string;
  build: () => EventLog;
}

export const SCENARIO_AS_OF = s.AS_OF;

export const SCENARIOS: ScenarioInfo[] = [
  { id: 'closeKnit', label: 'Close-knit', group: 'Contact', description: '4 important people, each seen in person monthly.', build: () => s.closeKnit() },
  { id: 'messagesOnly', label: 'Messages only', group: 'Contact', description: 'The close-knit pattern, but every contact is a message.', build: () => s.closeKnit('message') },
  { id: 'balanced', label: 'Balanced', group: 'Contact', description: '6 important people, each seen once a month.', build: s.balanced },
  { id: 'concentrated', label: 'Concentrated', group: 'Contact', description: 'The same 6 people and meetings, all with one person.', build: s.concentrated },
  { id: 'largeNeglected', label: 'Large, neglected', group: 'Contact', description: '30 people: the 10 important ones not seen for 120 days; lots of messages with others.', build: s.largeNeglected },
  { id: 'inactive', label: 'Inactive', group: 'Contact', description: 'The close-knit network, with no contact for the last 90 days.', build: s.inactive },
  { id: 'singleCategory', label: 'One type', group: 'Contact', description: '5 people, all family, all on rhythm.', build: s.singleCategory },
  { id: 'diverse', label: 'Diverse', group: 'Contact', description: '5 people, one of each type, all on rhythm.', build: s.diverse },
  { id: 'loggingRegular', label: 'Logged regularly', group: 'Contact', description: 'Weekly contact, logged as it happens.', build: () => s.logging(true) },
  { id: 'loggingOneDay', label: 'Logged all at once', group: 'Contact', description: 'The same contact, all logged yesterday (lower confidence).', build: () => s.logging(false) },
  { id: 'busyPaused', label: 'Busy, paused', group: 'Life events', description: 'Contact stopped 60 days ago, during a pause.', build: () => s.busyPeriod(true) },
  { id: 'busyUnpaused', label: 'Busy, not paused', group: 'Life events', description: 'Contact stopped 60 days ago, with no pause.', build: () => s.busyPeriod(false) },
  { id: 'bereavementMarked', label: 'Bereavement, in memoriam', group: 'Life events', description: 'A parent died 200 days ago and was marked in memoriam.', build: () => s.bereavement(true) },
  { id: 'bereavementUnmarked', label: 'Bereavement, unmarked', group: 'Life events', description: 'The same loss, not marked: they still count as overdue.', build: () => s.bereavement(false) },
  { id: 'ratedGood', label: 'Rated very good', group: 'Quality', description: 'Close-knit, every relationship rated very good.', build: () => s.rated(5) },
  { id: 'ratedStrained', label: 'Rated strained', group: 'Quality', description: 'Close-knit, every relationship rated strained.', build: () => s.rated(2) },
  { id: 'harmfulContact', label: 'Harmful, in contact', group: 'Quality', description: 'A relationship rated harmful, with frequent contact (left out of the score).', build: () => s.withHarmful(true) },
  { id: 'harmfulNoContact', label: 'Harmful, no contact', group: 'Quality', description: 'The same, with no contact.', build: () => s.withHarmful(false) },
  { id: 'callsRegular', label: 'Regular calls', group: 'Calls', description: 'Call history connected; a call with each friend every two weeks.', build: s.callsRegular },
  { id: 'callsNone', label: 'No calls', group: 'Calls', description: 'Call history connected, but no calls.', build: s.callsNone },
  { id: 'callsSpread', label: 'Calls spread', group: 'Calls', description: 'Four recent calls, one with each friend.', build: s.callsSpread },
  { id: 'callsConcentrated', label: 'Calls concentrated', group: 'Calls', description: 'The same four calls, all with one friend.', build: s.callsConcentrated },
  { id: 'callsBrief', label: 'Brief calls', group: 'Calls', description: 'Regular calls, every one under a minute.', build: s.callsBrief },
  { id: 'callsOnly', label: 'Calls only', group: 'Calls', description: 'Frequent calls, nothing logged by hand.', build: s.callsOnly },
  { id: 'circles', label: 'Two circles and a bridge', group: 'Network', description: 'Family and friends who meet as groups, one friend who joins both, a colleague who is also family, plus strained, lost-touch and new relationships.', build: s.circles },
];

export const SCENARIO_GROUPS = ['Contact', 'Life events', 'Quality', 'Calls', 'Network'] as const;

export function findScenario(id: string | undefined): ScenarioInfo | undefined {
  return id ? SCENARIOS.find((x) => x.id === id) : undefined;
}

/** Scenario people are named by short ids; show them capitalised. */
export function scenarioNames(log: EventLog): Map<string, string> {
  return new Map(log.people.map((p) => [p.id, p.displayName.charAt(0).toUpperCase() + p.displayName.slice(1)]));
}
