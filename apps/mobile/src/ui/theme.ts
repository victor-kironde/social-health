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
  /**
   * Relationship types: deliberately muted, loosely following the kind of closeness (green
   * family, blue friends, lavender work, sand neighbours, rose community), so they sit quietly
   * behind the health colours.
   */
  category: {
    family: '#6f9e7c',
    friend: '#6f8fb8',
    work: '#8c84a8',
    neighbour: '#b39a6b',
    community: '#a97f92',
  } as Record<Category, string>,
  /** Relationship health: 1 unhealthy (red) to 5 good (green), and grey for lost touch. */
  health: { 1: '#d64545', 2: '#e8833a', 3: '#d9a72b', 4: '#7cb342', 5: '#2e9d57', lost: '#9aa0a8' } as Record<
    Rating | 'lost',
    string
  >,
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
    family: '#8fbf9b',
    friend: '#8fadd4',
    work: '#a99fc6',
    neighbour: '#cbb487',
    community: '#c79db0',
  },
  health: { 1: '#f26d6d', 2: '#f5a05c', 3: '#f0c94f', 4: '#a3d65c', 5: '#4cc779', lost: '#7a808a' },
  quality: { 1: '#f97066', 2: '#fdb022', 3: '#8f8a80', 4: '#94d82d', 5: '#51cf66' },
  edge: '#4a505c',
  groups: ['#56b4e9', '#f0b840', '#3fc4a0', '#e39bc8', '#8fd0f5', '#ff8a50', '#a79ef0', '#d6c050'],
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
