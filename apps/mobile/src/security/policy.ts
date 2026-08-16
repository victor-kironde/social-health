/** App-lock settings and rules. Pure, so they can be unit-tested. */

export interface SecuritySettings {
  /** Ask for fingerprint/face/device PIN when opening the app. On by default. */
  appLock: boolean;
  /** Lock as soon as the app is left, rather than after a short grace period. */
  relockImmediately: boolean;
}

export const DEFAULT_SECURITY: SecuritySettings = { appLock: true, relockImmediately: false };

/** Leaving briefly (e.g. to check a message) does not re-lock within this time. */
export const RELOCK_GRACE_MS = 30_000;

/** Reads stored settings; anything missing or malformed falls back to the safe defaults. */
export function parseSettings(raw: string | null): SecuritySettings {
  if (!raw) return DEFAULT_SECURITY;
  try {
    const v = JSON.parse(raw) as Partial<SecuritySettings>;
    return {
      appLock: typeof v.appLock === 'boolean' ? v.appLock : DEFAULT_SECURITY.appLock,
      relockImmediately:
        typeof v.relockImmediately === 'boolean' ? v.relockImmediately : DEFAULT_SECURITY.relockImmediately,
    };
  } catch {
    return DEFAULT_SECURITY;
  }
}

/** Whether returning to the app (at `now`, having left at `leftAt`) should require unlocking again. */
export function shouldRelock(s: SecuritySettings, leftAt: number | null, now: number): boolean {
  if (!s.appLock || leftAt === null) return false;
  return s.relockImmediately || now - leftAt >= RELOCK_GRACE_MS;
}
