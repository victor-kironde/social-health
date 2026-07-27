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
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
