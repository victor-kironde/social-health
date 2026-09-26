import type { Person } from '@sg/score-engine';

/** Whether a record is a group (a relationship with a group as a whole) rather than a person. */
export const isGroup = (p: Pick<Person, 'kind'> | undefined): boolean => p?.kind === 'group';

/** Ids of every group in the log. */
export function groupIds(people: Person[]): Set<string> {
  return new Set(people.filter(isGroup).map((p) => p.id));
}

/** Only the people (not groups). */
export function onlyPeople<T extends Pick<Person, 'kind'>>(people: T[]): T[] {
  return people.filter((p) => !isGroup(p));
}
