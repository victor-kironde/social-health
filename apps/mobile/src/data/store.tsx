import type { EventLog, RelationshipSnapshot } from '@sg/score-engine';
import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { appendToLog, emptyLog, logFromRows, type StoredEvent } from './codec';
import { appendEvents, loadRows } from './db';
import { newInteractionEvents, type NewInteractionInput } from './interactions';
import { editPersonEvents, newPersonEvents, type NewPersonInput, type PersonDraft } from './people';

interface Store {
  log: EventLog;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  addPerson(input: NewPersonInput): Promise<void>;
  logInteraction(input: NewInteractionInput): Promise<void>;
  updatePerson(personId: string, before: { displayName: string; rel: RelationshipSnapshot }, draft: PersonDraft): Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [log, setLog] = useState<EventLog>(emptyLog);
  const [status, setStatus] = useState<Store['status']>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRows()
      .then((rows) => {
        setLog(logFromRows(rows));
        setStatus('ready');
      })
      .catch((e: unknown) => {
        setError(String(e));
        setStatus('error');
      });
  }, []);

  /** Persist first, then update memory, so the UI never shows unsaved data. */
  const commit = useCallback(async (events: StoredEvent[]) => {
    await appendEvents(events);
    setLog((prev) => appendToLog(prev, events));
  }, []);

  const addPerson = useCallback(
    (input: NewPersonInput) => commit(newPersonEvents(input, Date.now(), randomUUID)),
    [commit],
  );

  const logInteraction = useCallback(
    (input: NewInteractionInput) =>
      // getTimezoneOffset is minutes *behind* UTC, so negate it for the conventional offset.
      commit(newInteractionEvents(input, Date.now(), -new Date().getTimezoneOffset(), randomUUID)),
    [commit],
  );

  const updatePerson = useCallback(
    (personId: string, before: { displayName: string; rel: RelationshipSnapshot }, draft: PersonDraft) =>
      commit(editPersonEvents(personId, before, draft, Date.now(), randomUUID)),
    [commit],
  );

  const value = useMemo(
    () => ({ log, status, error, addPerson, logInteraction, updatePerson }),
    [log, status, error, addPerson, logInteraction, updatePerson],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
