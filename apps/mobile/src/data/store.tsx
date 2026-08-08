import type { EventLog, RelationshipSnapshot } from '@sg/score-engine';
import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PlacedPoint } from '../graph/layout';
import { appendToLog, emptyLog, logFromRows, type StoredEvent } from './codec';
import { appendEvents, loadGraphLayout, loadRows, saveGraphLayout, type SavedLayout } from './db';
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
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [log, setLog] = useState<EventLog>(emptyLog);
  const [status, setStatus] = useState<Store['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const graphLayout = useRef<SavedLayout>({ positions: new Map(), tieSignature: '' }).current;

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
    }),
    [log, status, error, addPerson, logInteraction, updatePerson, graphLayout, saveGraphLayoutCb],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
