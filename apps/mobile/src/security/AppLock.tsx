import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Button } from '../ui/components';
import { useTheme } from '../ui/theme';
import { DEFAULT_SECURITY, parseSettings, shouldRelock, type SecuritySettings } from './policy';

const SETTINGS_KEY = 'security-settings-v1';

interface Security {
  settings: SecuritySettings;
  /** Whether the phone has a screen lock (PIN, pattern or biometrics); app lock needs one. */
  deviceSecure: boolean;
  /**
   * Applies new settings. Turning app lock off first asks the user to
   * authenticate, so someone holding an unlocked phone cannot simply disable
   * it. Resolves false if that fails or the change is not possible.
   */
  update(next: SecuritySettings): Promise<boolean>;
}

const SecurityContext = createContext<Security | null>(null);

export function useSecurity(): Security {
  const s = useContext(SecurityContext);
  if (!s) throw new Error('useSecurity must be used inside SecurityProvider');
  return s;
}

async function authenticate(prompt: string): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, disableDeviceFallback: false });
  return r.success;
}

/**
 * Gates the app behind the phone's own authentication. This hides the UI;
 * the data itself is protected separately by the encrypted database (see
 * docs/threat-model.md for why the two are not tied together).
 */
export function SecurityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [deviceSecure, setDeviceSecure] = useState(false);
  const [locked, setLocked] = useState(true);
  // The system prompt (or the PIN screen it falls back to) takes the app to the
  // background; ignore those transitions so unlocking cannot re-lock itself.
  const authenticating = useRef(false);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    Promise.all([SecureStore.getItemAsync(SETTINGS_KEY), LocalAuthentication.getEnrolledLevelAsync()])
      .then(([raw, level]) => {
        const s = parseSettings(raw);
        const secure = level !== LocalAuthentication.SecurityLevel.NONE;
        setDeviceSecure(secure);
        setSettings(s);
        if (!s.appLock || !secure) setLocked(false);
      })
      .catch(() => {
        // If we cannot even read the settings, stay safe: locked, with defaults.
        setSettings(DEFAULT_SECURITY);
        setDeviceSecure(true);
      });
  }, []);

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    try {
      if (await authenticate('Unlock Social Graph')) setLocked(false);
    } finally {
      authenticating.current = false;
      leftAt.current = null;
    }
  }, []);

  const lockActive = locked && !!settings?.appLock && deviceSecure;

  // Ask straight away when locked and in the foreground; a cancelled prompt leaves the Unlock button.
  useEffect(() => {
    if (lockActive && AppState.currentState === 'active') unlock();
  }, [lockActive, unlock]);

  useEffect(() => {
    if (!settings) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (authenticating.current) return;
      if (state === 'background') {
        leftAt.current = Date.now();
        // Lock before Android takes the recent-apps snapshot.
        if (settings.appLock && settings.relockImmediately && deviceSecure) setLocked(true);
      } else if (state === 'active') {
        if (deviceSecure && shouldRelock(settings, leftAt.current, Date.now())) {
          setLocked(true);
          unlock();
        }
        leftAt.current = null;
      }
    });
    return () => sub.remove();
  }, [settings, deviceSecure, unlock]);

  const update = useCallback(
    async (next: SecuritySettings) => {
      if (!settings) return false;
      if (next.appLock && !deviceSecure) return false;
      if (settings.appLock && !next.appLock) {
        authenticating.current = true;
        try {
          if (!(await authenticate('Confirm it is you to turn off app lock'))) return false;
        } finally {
          authenticating.current = false;
        }
      }
      await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(next));
      setSettings(next);
      return true;
    },
    [settings, deviceSecure],
  );

  const value = useMemo(
    () => ({ settings: settings ?? DEFAULT_SECURITY, deviceSecure, update }),
    [settings, deviceSecure, update],
  );

  return (
    <SecurityContext.Provider value={value}>
      {children}
      {/* Until settings load, cover the app so nothing flashes before the lock appears. */}
      {(settings === null || lockActive) && <LockScreen ready={settings !== null} onUnlock={unlock} />}
    </SecurityContext.Provider>
  );
}

function LockScreen({ ready, onUnlock }: { ready: boolean; onUnlock: () => void }) {
  const t = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, styles.lock, { backgroundColor: t.bg }]} accessibilityViewIsModal>
      {ready && (
        <>
          <Text style={[styles.title, { color: t.text }]}>Social Graph is locked</Text>
          <Text style={{ color: t.muted, textAlign: 'center', marginBottom: 24 }}>
            Use your fingerprint, face or phone PIN to continue.
          </Text>
          <View style={{ alignSelf: 'stretch' }}>
            <Button title="Unlock" onPress={onUnlock} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lock: { alignItems: 'center', justifyContent: 'center', padding: 32, zIndex: 1000, elevation: 1000 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
});
