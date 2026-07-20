import type { EventLog, ModelConfig, ScoreResult, Timestamp } from './types';

export function computeScore(_log: EventLog, _config: ModelConfig, _asOf: Timestamp): ScoreResult {
  throw new Error('not implemented');
}

export function smoothedScore(
  _log: EventLog,
  _config: ModelConfig,
  _asOf: Timestamp,
): ScoreResult & { rawTotal: number } {
  throw new Error('not implemented');
}
