import type { EventLog, RelationshipSnapshot } from '@sg/score-engine';
import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PlacedPoint } from '../graph/layout';
import { appendToLog, emptyLog, logFromRows, type StoredEvent } from './codec';
import { collectCalls, requestCallLogPermission } from './callSync';
import type { CallMatch } from './callImport';
import {
  appendEvents,
  deleteCallData,
  deleteEverything,
  erasePerson,
  loadGraphLayout,
  loadRows,
  saveGraphLayout,
  type SavedLayout,
} from './db';
import { newInteractionEvents, type NewInteractionInput } from './interactions';
import { editPersonEvents, newPersonEvents, type NewPersonInput, type PersonDraft } from './people';

interface Store {
  log: EventLog;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  addPerson(input: NewPersonInput): Promise<void>;
  logInteraction(input: NewInteractionInput): Promise<void>;
  updatePerson(personId: string, before: { displayName: string; rel: RelationshipSnapshot }, draft: PersonDraft): Promise<void>;
  /** Remembered graph layout. A cache: mutated in place, never triggers a re-render. */
  graphLayout: SavedLayout;
  saveGraphLayout(positions: Map<string, PlacedPoint>, tieSignature: string): void;
  /** Adds several people at once (e.g. from contacts) with default settings, atomically. */
  importPeople(names: string[]): Promise<void>;
  /** Asks for permission, then imports the last year of calls and keeps them in sync. */
  connectCallLog(): Promise<CallMatch | 'denied'>;
  /** Imports calls made since the last import (no-op when not connected). */
  syncCallLog(): Promise<CallMatch | null>;
  /** Deletes every imported call and stops using the call log. */
  disconnectCallLog(): Promise<void>;
  /** Erases a person and everything recorded about them (see erase.ts). */
  deletePerson(personId: string): Promise<void>;
  /** Deletes the whole database and its key; the app starts again empty. */
  deleteAllData(): Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [log, setLog] = useState<EventLog>(emptyLog);
  const [status, setStatus] = useState<Store['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const graphLayout = useRef<SavedLayout>({ positions: new Map(), tieSignature: '' }).current;
  const logRef = useRef(log);
  logRef.current = log;

  useEffect(() => {
    Promise.all([loadRows(), loadGraphLayout()])
      .then(([rows, layout]) => {
        layout.positions.forEach((p, id) => graphLayout.positions.set(id, p));
        graphLayout.tieSignature = layout.tieSignature;
        setLog(logFromRows(rows));
        setStatus('ready');
      })
      .catch((e: unknown) => {
        setError(String(e));
        setStatus('error');
      });
  }, [graphLayout]);

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

  const saveGraphLayoutCb = useCallback(
    (positions: Map<string, PlacedPoint>, tieSignature: string) => {
      graphLayout.positions.clear();
      positions.forEach((p, id) => graphLayout.positions.set(id, p));
      graphLayout.tieSignature = tieSignature;
      // Only a cache: if saving fails, the worst case is laying the graph out again.
      saveGraphLayout({ positions, tieSignature }).catch((e: unknown) => console.warn('Could not save graph layout', e));
    },
    [graphLayout],
  );

  const importPeople = useCallback(
    (names: string[]) => {
      const now = Date.now();
      return commit(
        names.flatMap((displayName) =>
          newPersonEvents({ displayName, category: 'friend', importance: 3, quality: null }, now, randomUUID),
        ),
      );
    },
    [commit],
  );

  const callIds = () => new Set((logRef.current.calls ?? []).map((c) => c.id));

  const connectCallLog = useCallback(async () => {
    if (!(await requestCallLogPermission())) return 'denied' as const;
    const match = await collectCalls(logRef.current, callIds(), true);
    await commit(match.events);
    return match;
  }, [commit]);

  const syncCallLog = useCallback(async () => {
    if (!logRef.current.calls) return null;
    const match = await collectCalls(logRef.current, callIds(), false);
    if (match.events.length) await commit(match.events);
    return match;
  }, [commit]);

  const disconnectCallLog = useCallback(async () => {
    await deleteCallData();
    setLog(logFromRows(await loadRows()));
  }, []);

  // Pick up new calls each time the app starts (silently: permission may have been revoked).
  useEffect(() => {
    if (status === 'ready') syncCallLog().catch(() => undefined);
  }, [status, syncCallLog]);

  const deletePerson = useCallback(
    async (personId: string) => {
      await erasePerson(personId);
      graphLayout.positions.delete(personId);
      // Erasure rewrites history, so rebuild the log from what is now stored.
      setLog(logFromRows(await loadRows()));
    },
    [graphLayout],
  );

  const deleteAllData = useCallback(async () => {
    await deleteEverything();
    graphLayout.positions.clear();
    graphLayout.tieSignature = '';
    setLog(emptyLog());
  }, [graphLayout]);

  const value = useMemo(
    () => ({
      log,
      status,
      error,
      addPerson,
      logInteraction,
      updatePerson,
      graphLayout,
      saveGraphLayout: saveGraphLayoutCb,
      importPeople,
      connectCallLog,
      syncCallLog,
      disconnectCallLog,
      deletePerson,
      deleteAllData,
    }),
    [
      log,
      status,
      error,
      addPerson,
      logInteraction,
      updatePerson,
      graphLayout,
      saveGraphLayoutCb,
      importPeople,
      connectCallLog,
      syncCallLog,
      disconnectCallLog,
      deletePerson,
      deleteAllData,
    ],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
