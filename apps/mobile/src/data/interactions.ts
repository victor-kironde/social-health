import { DAY, type InteractionType, type Timestamp } from '@sg/score-engine';
import type { StoredEvent } from './codec';

export interface NewInteractionInput {
  participants: string[];
  type: InteractionType;
  /** 0 = today. Backdated entries keep the current time of day. */
  daysAgo: number;
}

export const MAX_BACKDATE_DAYS = 365;

export function validateInteraction(input: NewInteractionInput): string | null {
  if (input.participants.length === 0) return 'Choose at least one person.';
  if (!Number.isInteger(input.daysAgo) || input.daysAgo < 0 || input.daysAgo > MAX_BACKDATE_DAYS) {
    return 'Choose when it happened.';
  }
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
      },
    },
  ];
}
