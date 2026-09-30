import { DEFAULT_CONFIG, type Frequency, type FrequencyPeriod, type ModelConfig, type Rhythm } from '@sg/score-engine';
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
  /**
   * The catch-up rhythm everyone follows unless you choose one for them: a preset, or a custom
   * "at least N times a period" (which wins when set). Default: at least once a month.
   */
  defaultRhythm: { rhythm: Rhythm; frequency: Frequency | null };
  /** Ask before the graph's reset button puts moved people back ("Don't ask again" turns it off). */
  confirmReset: boolean;
}

const DEFAULTS: DisplayPrefs = { showScore: true, defaultRhythm: { rhythm: 'monthly', frequency: null }, confirmReset: true };

const RHYTHMS: Rhythm[] = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly', 'occasional'];
const PERIODS: FrequencyPeriod[] = ['day', 'week', 'month', 'year'];

function parseFrequency(v: unknown): Frequency | null {
  if (!v || typeof v !== 'object') return null;
  const f = v as Partial<Frequency>;
  if (typeof f.times !== 'number' || !PERIODS.includes(f.per as FrequencyPeriod)) return null;
  return { times: Math.min(31, Math.max(1, Math.round(f.times))), per: f.per as FrequencyPeriod };
}

export function parsePrefs(raw: string | null): DisplayPrefs {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<DisplayPrefs>) : {};
    const d = v.defaultRhythm;
    return {
      showScore: typeof v.showScore === 'boolean' ? v.showScore : DEFAULTS.showScore,
      defaultRhythm: {
        rhythm: d && RHYTHMS.includes(d.rhythm) ? d.rhythm : DEFAULTS.defaultRhythm.rhythm,
        frequency: parseFrequency(d?.frequency),
      },
      confirmReset: typeof v.confirmReset === 'boolean' ? v.confirmReset : DEFAULTS.confirmReset,
    };
  } catch {
    return DEFAULTS;
  }
}

/** The scoring model with the user's defaults applied. */
export function modelConfigFor(prefs: DisplayPrefs): ModelConfig {
  const { rhythm, frequency } = prefs.defaultRhythm;
  const all = Object.fromEntries(Object.keys(DEFAULT_CONFIG.defaultRhythm).map((c) => [c, rhythm])) as ModelConfig['defaultRhythm'];
  return { ...DEFAULT_CONFIG, defaultRhythm: all, defaultFrequency: frequency };
}

/** The scoring model to use on screen: the standard one with your defaults. */
export function useModelConfig(): ModelConfig {
  const { prefs } = usePrefs();
  return useMemo(() => modelConfigFor(prefs), [prefs]);
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
