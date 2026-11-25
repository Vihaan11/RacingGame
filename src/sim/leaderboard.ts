import type { LeaderboardEntry } from './types';

export interface RacerSortInput {
  id: string;
  name: string;
  color: string;
  isPlayer: boolean;
  isRemote: boolean;
  lap: number;
  totalProgress: number;
  speedKmh: number;
  bestLapMs: number | null;
  finished: boolean;
  finishTimeMs: number | null;
}

/**
 * Pure deterministic leaderboard sorting and time-gap estimation.
 */
export function buildLiveLeaderboard(
  racers: RacerSortInput[],
  trackLengthMeters = 1450,
): LeaderboardEntry[] {
  const sorted = [...racers].sort((a, b) => {
    if (a.finished && b.finished) {
      return (a.finishTimeMs ?? Infinity) - (b.finishTimeMs ?? Infinity);
    }
    if (a.finished) return -1;
    if (b.finished) return 1;
    if (Math.abs(b.totalProgress - a.totalProgress) > 0.00001) {
      return b.totalProgress - a.totalProgress;
    }
    return b.speedKmh - a.speedKmh;
  });

  const leader = sorted[0];
  return sorted.map((r, idx) => {
    let gapSeconds = 0;
    if (idx > 0 && leader) {
      if (r.finished && leader.finished && r.finishTimeMs && leader.finishTimeMs) {
        gapSeconds = Math.max(0, (r.finishTimeMs - leader.finishTimeMs) / 1000);
      } else {
        const distGapM = Math.max(0, (leader.totalProgress - r.totalProgress) * trackLengthMeters);
        const refSpeedMs = Math.max(22, (leader.speedKmh + r.speedKmh) * 0.5 / 3.6);
        gapSeconds = distGapM / refSpeedMs;
      }
    }

    return {
      id: r.id,
      name: r.name,
      color: r.color,
      isPlayer: r.isPlayer,
      isRemote: r.isRemote,
      position: idx + 1,
      lap: r.lap,
      totalProgress: r.totalProgress,
      speedKmh: Math.round(r.speedKmh),
      gapSeconds,
      bestLapMs: r.bestLapMs,
      finished: r.finished,
      finishTimeMs: r.finishTimeMs,
    };
  });
}

export function formatRaceTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return '--:--.--';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${mins}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}
