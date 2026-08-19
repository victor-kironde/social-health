import type { Category, Rating } from '@sg/score-engine';
import { useColorScheme } from 'react-native';

const light = {
  bg: '#f6f7f9',
  card: '#ffffff',
  text: '#16181d',
  muted: '#5d6470',
  accent: '#2f6fde',
  onAccent: '#ffffff',
  track: '#e3e6eb',
  border: '#d6dae1',
  warn: '#a8570a',
  danger: '#b42318',
  /** Category rings: distinct hues, readable on the card background. */
  category: {
    family: '#d9480f',
    friend: '#1c7ed6',
    work: '#7048e8',
    neighbour: '#2b8a3e',
    community: '#c2255c',
  } as Record<Category, string>,
  /** Quality, harmful → very good. Unrated edges use `edge`. */
  quality: { 1: '#d92d20', 2: '#f79009', 3: '#a39e93', 4: '#66a80f', 5: '#2b8a3e' } as Record<Rating, string>,
  edge: '#b8bec9',
  /** Okabe-Ito-inspired, colour-blind-safe set for communities. */
  groups: ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00', '#7a6fd0', '#8f7a00'],
};

export type Theme = typeof light;

const dark: Theme = {
  bg: '#101215',
  card: '#1b1e23',
  text: '#eceef1',
  muted: '#9aa1ad',
  accent: '#6e9cf0',
  onAccent: '#0b1220',
  track: '#2c3038',
  border: '#343944',
  warn: '#f0a75a',
  danger: '#f97066',
  category: {
    family: '#ff8a4c',
    friend: '#5ea8f0',
    work: '#a48bf5',
    neighbour: '#5fc06f',
    community: '#f06595',
  },
  quality: { 1: '#f97066', 2: '#fdb022', 3: '#8f8a80', 4: '#94d82d', 5: '#51cf66' },
  edge: '#4a505c',
  groups: ['#56b4e9', '#f0b840', '#3fc4a0', '#e39bc8', '#8fd0f5', '#ff8a50', '#a79ef0', '#d6c050'],
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
