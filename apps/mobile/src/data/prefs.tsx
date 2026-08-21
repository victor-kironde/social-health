import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const KEY = 'display-prefs-v1';

export interface DisplayPrefs {
  /**
   * Show the numeric Social Health Score. Some people may find a number
   * unhelpful or start to fixate on it; turning it off keeps the network,
   * explanations and history without the score.
   */
  showScore: boolean;
}

const DEFAULTS: DisplayPrefs = { showScore: true };

export function parsePrefs(raw: string | null): DisplayPrefs {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<DisplayPrefs>) : {};
    return { showScore: typeof v.showScore === 'boolean' ? v.showScore : DEFAULTS.showScore };
  } catch {
    return DEFAULTS;
  }
}

const PrefsContext = createContext<{ prefs: DisplayPrefs; setPrefs(next: DisplayPrefs): void } | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState(DEFAULTS);
  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((raw) => setState(parsePrefs(raw)))
      .catch(() => undefined);
  }, []);
  const setPrefs = useCallback((next: DisplayPrefs) => {
    setState(next);
    SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);
  const value = useMemo(() => ({ prefs, setPrefs }), [prefs, setPrefs]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const p = useContext(PrefsContext);
  if (!p) throw new Error('usePrefs must be used inside PrefsProvider');
  return p;
}
