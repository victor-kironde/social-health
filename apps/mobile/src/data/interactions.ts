import { DAY, type InteractionType, type Timestamp } from '@sg/score-engine';
import type { StoredEvent } from './codec';

export interface NewInteractionInput {
  participants: string[];
  type: InteractionType;
  /** 0 = today. Backdated entries keep the current time of day. */
  daysAgo: number;
  /** Optional private note (journal) about how it went. */
  note?: string;
  /** At a group catch-up: how many people were there who are not named (stored as a count only). */
  newPeople?: number;
}

export const MAX_NEW_PEOPLE = 999;

export const MAX_BACKDATE_DAYS = 365;
export const MAX_NOTE_LENGTH = 2000;

export function validateInteraction(input: NewInteractionInput): string | null {
  if (input.participants.length === 0) return 'Choose at least one person.';
  if (!Number.isInteger(input.daysAgo) || input.daysAgo < 0 || input.daysAgo > MAX_BACKDATE_DAYS) {
    return 'Choose when it happened.';
  }
  if ((input.note ?? '').length > MAX_NOTE_LENGTH) return `Keep the note under ${MAX_NOTE_LENGTH} characters.`;
  const n = input.newPeople ?? 0;
  if (!Number.isInteger(n) || n < 0 || n > MAX_NEW_PEOPLE) return 'Enter how many new people, as a whole number.';
  return null;
}

/** One interaction event, however many people took part (a group dinner is one event). */
export function newInteractionEvents(
  input: NewInteractionInput,
  now: Timestamp,
  tzOffsetMin: number,
  newId: () => string,
): StoredEvent[] {
  const id = newId();
  const ts = now - input.daysAgo * DAY;
  const note = input.note?.trim();
  return [
    {
      id,
      ts,
      kind: 'interaction',
      body: {
        id,
        ts,
        tzOffsetMin,
        loggedAt: now,
        type: input.type,
        participants: [...new Set(input.participants)],
        source: 'manual',
        ...(note ? { note } : {}),
        ...(input.newPeople ? { newPeople: input.newPeople } : {}),
      },
    },
  ];
}
