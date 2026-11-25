import { RaceTrack, START_FINISH_T, advanceLapProgress } from './track';
import type { WeatherMode } from './types';

export interface AiRacer {
  id: string;
  name: string;
  color: string;
  accentColor: string;
  t: number;
  lateralOffset: number;
  targetOffset: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speedMs: number;
  speedKmh: number;
  steerAngle: number;
  wheelSpin: number;
  lap: number;
  totalProgress: number;
  currentLapMs: number;
  bestLapMs: number | null;
  totalRaceMs: number;
  finished: boolean;
  finishTimeMs: number | null;
  basePace: number; // m/s top speed capability
  cornerSkill: number; // multiplier on cornering speed
  wetSkill: number; // multiplier in rain/storm
  brakeLight: number;
}

const AI_ROSTER = [
  { id: 'ai-1', name: 'M. Bellini', color: '#1d4ed8', accentColor: '#38bdf8', basePace: 68, cornerSkill: 1.03, wetSkill: 0.96, lane: -2.4 },
  { id: 'ai-2', name: 'K. Takahashi', color: '#15803d', accentColor: '#facc15', basePace: 66.5, cornerSkill: 1.06, wetSkill: 1.02, lane: 2.6 },
  { id: 'ai-3', name: 'S. Lindqvist', color: '#ea580c', accentColor: '#f4f4f5', basePace: 65, cornerSkill: 0.99, wetSkill: 1.06, lane: -1.8 },
  { id: 'ai-4', name: 'A. Moreau', color: '#cbd5e1', accentColor: '#ef4444', basePace: 63.5, cornerSkill: 0.97, wetSkill: 0.94, lane: 2.1 },
  { id: 'ai-5', name: 'L. Vasquez', color: '#18181b', accentColor: '#f59e0b', basePace: 62, cornerSkill: 0.95, wetSkill: 0.92, lane: -3.0 },
];

export function createAiRacers(track: RaceTrack): AiRacer[] {
  return AI_ROSTER.map((cfg, idx) => {
    // Player starts at grid slot 0; AI occupy slots 1..5
    const slot = track.getGridSlot(idx + 1);
    const pNorm = (((slot.t - START_FINISH_T) % 1) + 1) % 1;
    return {
      id: cfg.id,
      name: cfg.name,
      color: cfg.color,
      accentColor: cfg.accentColor,
      t: slot.t,
      lateralOffset: idx % 2 === 0 ? 3.2 : -3.2,
      targetOffset: cfg.lane,
      x: slot.x,
      y: slot.y,
      z: slot.z,
      yaw: slot.yaw,
      speedMs: 0,
      speedKmh: 0,
      steerAngle: 0,
      wheelSpin: 0,
      lap: 1,
      totalProgress: pNorm > 0.9 ? pNorm - 1 : pNorm,
      currentLapMs: 0,
      bestLapMs: null,
      totalRaceMs: 0,
      finished: false,
      finishTimeMs: null,
      basePace: cfg.basePace,
      cornerSkill: cfg.cornerSkill,
      wetSkill: cfg.wetSkill,
      brakeLight: 0,
    };
  });
}

export function stepAiRacer(
  racer: AiRacer,
  track: RaceTrack,
  weather: WeatherMode,
  dt: number,
  totalLaps: number,
  playerPos: { x: number; z: number },
  canMove: boolean,
): void {
  if (!canMove) return;

  const weatherFactor =
    weather === 'clear'
      ? 1.0
      : weather === 'fog'
        ? 0.94
        : weather === 'rain'
          ? 0.84 * racer.wetSkill
          : 0.74 * racer.wetSkill;

  // Look ahead for upcoming corner curvature to brake realistically
  let maxCurv = 0;
  for (let look = 1; look <= 5; look++) {
    const s = track.sampleAt(racer.t + look * 0.012);
    const absC = Math.abs(s.curvature);
    if (absC > maxCurv) maxCurv = absC;
  }

  // Target speed inversely related to upcoming curvature
  const cornerSpeedLimit = maxCurv > 0.002 ? Math.sqrt((14.8 * racer.cornerSkill * weatherFactor) / maxCurv) : racer.basePace;
  const targetSpeed = Math.min(racer.basePace * weatherFactor, Math.max(18, cornerSpeedLimit));

  const speedDiff = targetSpeed - racer.speedMs;
  if (speedDiff > 0) {
    const accel = (12.5 + Math.max(0, 35 - racer.speedMs) * 0.25) * weatherFactor;
    racer.speedMs = Math.min(targetSpeed, racer.speedMs + accel * dt);
    racer.brakeLight = Math.max(0, racer.brakeLight - dt * 5);
  } else {
    const decel = 19.5 * weatherFactor;
    racer.speedMs = Math.max(targetSpeed, racer.speedMs - decel * dt);
    racer.brakeLight = Math.min(1, racer.brakeLight + dt * 6);
  }

  // Gentle avoidance if very close to player
  const distToPlayer = Math.hypot(racer.x - playerPos.x, racer.z - playerPos.z);
  let dynamicOffset = racer.targetOffset;
  if (distToPlayer < 8.5) {
    const currSample = track.sampleAt(racer.t);
    const pLat = (playerPos.x - currSample.x) * currSample.rx + (playerPos.z - currSample.z) * currSample.rz;
    dynamicOffset = pLat > 0 ? -3.4 : 3.4;
  }

  racer.lateralOffset += (dynamicOffset - racer.lateralOffset) * (1 - Math.exp(-2.2 * dt));

  const prevT = racer.t;
  const deltaT = (racer.speedMs * dt) / track.totalLength;
  racer.t = (racer.t + deltaT) % 1;

  const sample = track.sampleAt(racer.t);
  racer.x = sample.x + sample.rx * racer.lateralOffset;
  racer.y = sample.y;
  racer.z = sample.z + sample.rz * racer.lateralOffset;

  const targetYaw = track.getHeadingAt(racer.t);
  // Smooth yaw wrap
  let yawDiff = targetYaw - racer.yaw;
  while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
  while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
  racer.yaw += yawDiff * (1 - Math.exp(-10 * dt));
  racer.steerAngle = Math.max(-1, Math.min(1, -sample.curvature * 32));
  racer.speedKmh = racer.speedMs * 3.6;
  racer.wheelSpin += (racer.speedMs / 0.34) * dt;

  if (!racer.finished) {
    const dtMs = dt * 1000;
    racer.currentLapMs += dtMs;
    racer.totalRaceMs += dtMs;
    const lapRes = advanceLapProgress(prevT, racer.t, racer.lap);
    if (lapRes.crossedFinish && racer.currentLapMs > 12000) {
      if (racer.bestLapMs === null || racer.currentLapMs < racer.bestLapMs) {
        racer.bestLapMs = Math.round(racer.currentLapMs);
      }
      if (racer.lap >= totalLaps) {
        racer.finished = true;
        racer.finishTimeMs = Math.round(racer.totalRaceMs);
      } else {
        racer.lap = lapRes.lap;
        racer.currentLapMs = 0;
      }
    }
    const pNorm = (((racer.t - START_FINISH_T) % 1) + 1) % 1;
    const adjustedP = racer.lap === 1 && racer.totalRaceMs < 4000 && pNorm > 0.85 ? pNorm - 1 : pNorm;
    racer.totalProgress = racer.finished ? totalLaps : (racer.lap - 1) + adjustedP;
  }
}
