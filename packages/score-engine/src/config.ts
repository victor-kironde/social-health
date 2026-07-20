import type { ModelConfig } from './types';

export const MODEL_VERSION = '0.1.0';

/**
 * Initial parameters. These are configurable model assumptions, not
 * scientifically established values; see docs/model-spec.md.
 */
export const DEFAULT_CONFIG: ModelConfig = {
  version: MODEL_VERSION,
  componentWeights: { rhythm: 0.4, coverage: 0.3, quality: 0.2, diversity: 0.1 },
  interactionWeights: { in_person: 1, video: 0.7, voice: 0.5, message: 0.2 },
  saturation: 1,
  rhythmDays: { weekly: 7, fortnightly: 14, monthly: 30, quarterly: 91, yearly: 365 },
  defaultRhythm: {
    family: 'monthly',
    friend: 'monthly',
    work: 'weekly',
    neighbour: 'monthly',
    community: 'monthly',
  },
  longDistanceFactor: 2,
  importantThreshold: 4,
  qualityMultiplier: { 1: 0, 2: 0.4, 3: 0.75, 4: 0.9, 5: 1 },
  excludeQualityAtOrBelow: 1,
  coverageGrace: 1,
  occasionalHalfLifeDays: 365,
  confidence: { windowDays: 28, expectedActiveDays: 4, lowBelow: 0.5 },
  smoothing: { samples: 3, spacingDays: 7 },
};

export function validateConfig(config: ModelConfig): string[] {
  const errors: string[] = [];
  const weights = Object.values(config.componentWeights);
  if (weights.some((w) => w < 0)) errors.push('component weights must be non-negative');
  if (weights.every((w) => w === 0)) errors.push('at least one component weight must be positive');
  if (Object.values(config.interactionWeights).some((w) => w < 0)) {
    errors.push('interaction weights must be non-negative');
  }
  if (Object.values(config.qualityMultiplier).some((m) => m < 0 || m > 1)) {
    errors.push('quality multipliers must be in [0, 1]');
  }
  if (config.saturation <= 0) errors.push('saturation must be positive');
  if (Object.values(config.rhythmDays).some((d) => d <= 0)) errors.push('rhythm days must be positive');
  if (config.longDistanceFactor < 1) errors.push('longDistanceFactor must be >= 1');
  if (config.coverageGrace <= 0) errors.push('coverageGrace must be positive');
  if (config.occasionalHalfLifeDays <= 0) errors.push('occasionalHalfLifeDays must be positive');
  if (config.smoothing.samples < 1) errors.push('smoothing.samples must be >= 1');
  return errors;
}
