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
  deleteGroup as dbDeleteGroup,
  erasePerson,
  loadGraphLayout,
  loadGroups,
  loadPhotos,
  loadRows,
  saveGraphLayout,
  savePhoto,
  saveGroup as dbSaveGroup,
  type SavedLayout,
} from './db';
import { newInteractionEvents, type NewInteractionInput } from './interactions';
import { groupEntityEvents, groupRenameEvent, joinFromCatchUp, type PersonGroup } from './groups';
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
  /** Person photos (base64 JPEG) by person id. */
  photos: Map<string, string>;
  /** Sets or (with null) removes a person's photo. */
  setPhoto(personId: string, jpeg: string | null): Promise<void>;
  /** Adds a synthetic scenario's events (testing and trying the app; only into an empty network). */
  loadSample(events: StoredEvent[]): Promise<void>;
  /** Your own groups of people, sorted by name. */
  groups: PersonGroup[];
  /** Creates a group; returns its id. */
  addGroup(name: string, members: string[]): Promise<string>;
  /** Saves a group's new name and members. */
  updateGroup(group: PersonGroup): Promise<void>;
  /** Deletes a group for good (its people are untouched). */
  deleteGroup(groupId: string): Promise<void>;
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
  const [photos, setPhotos] = useState<Map<string, string>>(() => new Map());
  const [groups, setGroups] = useState<PersonGroup[]>([]);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const graphLayout = useRef<SavedLayout>({ positions: new Map(), tieSignature: '' }).current;
  const logRef = useRef(log);
  logRef.current = log;

  useEffect(() => {
    Promise.all([loadRows(), loadGraphLayout(), loadPhotos(), loadGroups()])
      .then(async ([rows, layout, savedPhotos, savedGroups]) => {
        setPhotos(savedPhotos);
        setGroups(savedGroups);
        layout.positions.forEach((p, id) => graphLayout.positions.set(id, p));
        graphLayout.tieSignature = layout.tieSignature;
        let loaded = logFromRows(rows);
        // Groups made before groups were relationships: give each its own entry once.
        const missing = savedGroups.filter((g) => !loaded.people.some((p) => p.id === g.id));
        if (missing.length) {
          const events = missing.flatMap((g) => groupEntityEvents(g, Date.now(), randomUUID));
          await appendEvents(events);
          loaded = appendToLog(loaded, events);
        }
        setLog(loaded);
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
    async (input: NewInteractionInput) => {
      // getTimezoneOffset is minutes *behind* UTC, so negate it for the conventional offset.
      await commit(newInteractionEvents(input, Date.now(), -new Date().getTimezoneOffset(), randomUUID));
      // Anyone named at a group catch-up joins that group.
      const joined = joinFromCatchUp(groupsRef.current, input.participants);
      for (const g of joined) await dbSaveGroup(g);
      if (joined.length) setGroups(await loadGroups());
    },
    [commit],
  );

  const updatePerson = useCallback(
    async (personId: string, before: { displayName: string; rel: RelationshipSnapshot }, draft: PersonDraft) => {
      await commit(editPersonEvents(personId, before, draft, Date.now(), randomUUID));
      // A group renamed on its page: keep its membership record's name in step.
      const g = groupsRef.current.find((x) => x.id === personId);
      if (g && g.name !== draft.displayName.trim()) {
        await dbSaveGroup({ ...g, name: draft.displayName.trim() });
        setGroups(await loadGroups());
      }
    },
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

  const setPhoto = useCallback(async (personId: string, jpeg: string | null) => {
    await savePhoto(personId, jpeg);
    setPhotos((prev) => {
      const next = new Map(prev);
      if (jpeg === null) next.delete(personId);
      else next.set(personId, jpeg);
      return next;
    });
  }, []);

  const loadSample = useCallback(
    async (events: StoredEvent[]) => {
      if (logRef.current.people.length > 0) throw new Error('Sample data can only be loaded into an empty network.');
      await commit(events);
    },
    [commit],
  );

  const addGroup = useCallback(
    async (name: string, members: string[]) => {
      const group: PersonGroup = { id: randomUUID(), name: name.trim(), members, createdAt: Date.now() };
      await dbSaveGroup(group);
      // A group is also a relationship of its own.
      await commit(groupEntityEvents(group, Date.now(), randomUUID));
      setGroups(await loadGroups());
      return group.id;
    },
    [commit],
  );

  const updateGroup = useCallback(
    async (group: PersonGroup) => {
      const before = groupsRef.current.find((g) => g.id === group.id);
      await dbSaveGroup(group);
      if (before && before.name !== group.name.trim()) await commit([groupRenameEvent(group.id, group.name, Date.now(), randomUUID)]);
      setGroups(await loadGroups());
    },
    [commit],
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      // Erase the group's relationship and catch-ups like a person's, then its membership record.
      await erasePerson(groupId);
      await dbDeleteGroup(groupId);
      graphLayout.positions.delete(groupId);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      setLog(logFromRows(await loadRows()));
    },
    [graphLayout],
  );

  const deletePerson = useCallback(
    async (personId: string) => {
      await erasePerson(personId);
      setGroups(await loadGroups());
      graphLayout.positions.delete(personId);
      setPhotos((prev) => {
        const next = new Map(prev);
        next.delete(personId);
        return next;
      });
      // Erasure rewrites history, so rebuild the log from what is now stored.
      setLog(logFromRows(await loadRows()));
    },
    [graphLayout],
  );

  const deleteAllData = useCallback(async () => {
    await deleteEverything();
    graphLayout.positions.clear();
    graphLayout.tieSignature = '';
    setPhotos(new Map());
    setGroups([]);
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
      photos,
      setPhoto,
      groups,
      addGroup,
      updateGroup,
      deleteGroup,
      loadSample,
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
      photos,
      setPhoto,
      groups,
      addGroup,
      updateGroup,
      deleteGroup,
      loadSample,
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
