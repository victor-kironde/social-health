import { DAY, type EventLog } from '@sg/score-engine';
import { onlyPeople } from './kinds';
import { PermissionsAndroid, Platform } from 'react-native';
import CallLog from '../../modules/call-log/src/CallLogModule';
import { matchCalls, type CallMatch } from './callImport';
import type { StoredEvent } from './codec';

/** How far back the first import looks. */
export const CALL_HISTORY_DAYS = 365;

export async function requestCallLogPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG, {
    title: 'Use your call history?',
    message:
      'Social Graph reads when calls happened, how long they lasted and the contact name, to match calls to people you have added. Phone numbers are never read.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Reads calls since the newest one already imported (or CALL_HISTORY_DAYS
 * on first import) and matches them to people. Returns the events to store;
 * `connect` adds the source event that marks the call log as connected.
 */
export async function collectCalls(log: EventLog, existingIds: Set<string>, connect: boolean): Promise<CallMatch> {
  const newest = Math.max(0, ...(log.calls ?? []).map((c) => c.ts));
  const since = newest > 0 ? newest - 1 : Date.now() - CALL_HISTORY_DAYS * DAY;
  const calls = await CallLog.getCalls(since);
  // Calls are only ever matched to people, never to a group's name.
  const match = matchCalls(calls, onlyPeople(log.people), existingIds);
  if (connect) {
    const source: StoredEvent = { id: 'source:call_log', ts: Date.now(), kind: 'source', body: { source: 'call_log' } };
    match.events.unshift(source);
  }
  return match;
}
