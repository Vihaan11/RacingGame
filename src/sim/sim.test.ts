import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceTrack, START_FINISH_T, advanceLapProgress, BARRIER_LIMIT } from './track';
import { createInitialVehicleState, getTireWeatherGrip, stepVehiclePhysics } from './physics';
import { DEFAULT_TUNING, DEFAULT_WHEEL_SETTINGS } from './types';
import { applyDeadzoneAndCurve, mapGamepadToControlInput } from './input';
import { buildLiveLeaderboard, formatRaceTime } from './leaderboard';
import { createAiRacers, stepAiRacer } from './ai';

test('RaceTrack builds closed spline with valid length, elevation, and projection', () => {
  const track = new RaceTrack(360);
  assert.ok(track.totalLength > 900 && track.totalLength < 2500, `Expected GP track length, got ${track.totalLength}`);

  const s0 = track.sampleAt(0.05);
  const proj = track.project(s0.x + s0.rx * 3.0, s0.z + s0.rz * 3.0, 0.05);
  assert.ok(Math.abs(proj.lateralOffset - 3.0) < 0.35, `Expected lateralOffset ~3.0, got ${proj.lateralOffset}`);
  assert.equal(track.getSurfaceAtOffset(proj.lateralOffset), 'asphalt');
  assert.equal(track.getSurfaceAtOffset(8.8), 'kerb');
  assert.equal(track.getSurfaceAtOffset(12.0), 'gravel');
  assert.equal(track.getSurfaceAtOffset(16.0), 'grass');
});

test('advanceLapProgress increments only on forward finish-line crossing', () => {
  const beforeLine = (START_FINISH_T - 0.02 + 1) % 1;
  const afterLine = (START_FINISH_T + 0.02) % 1;

  const forward = advanceLapProgress(beforeLine, afterLine, 1);
  assert.equal(forward.crossedFinish, true);
  assert.equal(forward.lap, 2);

  const reverse = advanceLapProgress(afterLine, beforeLine, 1);
  assert.equal(reverse.crossedFinish, false);
  assert.equal(reverse.lap, 1);
});

test('Vehicle physics accelerates smoothly, shifts gears, steers, and stays inside barriers', () => {
  const track = new RaceTrack(360);
  let state = createInitialVehicleState(track, 0);

  // Full throttle straight ahead for 4 seconds
  for (let i = 0; i < 240; i++) {
    state = stepVehiclePhysics(
      state,
      { throttle: 1, brake: 0, steer: 0, handbrake: false, source: 'keyboard' },
      DEFAULT_TUNING,
      'clear',
      track,
      1 / 60,
    );
  }
  assert.ok(state.speedKmh > 120, `Expected car to accelerate above 120 km/h, got ${state.speedKmh.toFixed(1)}`);
  assert.ok(state.gear >= 2, `Expected upshift to gear >= 2, got ${state.gear}`);

  // Hard right turn + steering test
  const yawBefore = state.yaw;
  for (let i = 0; i < 60; i++) {
    state = stepVehiclePhysics(
      state,
      { throttle: 0.6, brake: 0, steer: 1, handbrake: false, source: 'keyboard' },
      DEFAULT_TUNING,
      'clear',
      track,
      1 / 60,
    );
  }
  assert.notEqual(state.yaw, yawBefore, 'Steering right must change yaw');
  assert.ok(Math.abs(state.lateralOffset) <= BARRIER_LIMIT + 0.05, 'Guardrail must contain vehicle');
});

test('Weather and tire compound tuning meaningfully impact traction', () => {
  const slickDry = getTireWeatherGrip('slick', 'clear');
  const slickStorm = getTireWeatherGrip('slick', 'storm');
  const wetStorm = getTireWeatherGrip('wet', 'storm');

  assert.ok(slickDry > slickStorm, 'Slick tires must lose grip in storm');
  assert.ok(wetStorm > slickStorm, 'Wet tires must outperform slicks in storm');
});

test('Steering wheel peripheral mapping respects deadzone, curve, and wheel pedal axes', () => {
  assert.equal(applyDeadzoneAndCurve(0.02, 0.05, 1.0, 1.0), 0);
  assert.ok(applyDeadzoneAndCurve(0.5, 0.0, 2.0, 1.0) < 0.5, 'Linearity > 1 softens center steering');

  const logitechWheel = {
    id: 'Logitech G29 Driving Force Racing Wheel',
    axes: [0.5, 1.0, -1.0, 0.0], // steer right, axis2=-1 (full throttle), axis3=0 (half brake)
    buttons: Array.from({ length: 12 }, () => ({ pressed: false, value: 0 })),
  };
  const input = mapGamepadToControlInput(logitechWheel, DEFAULT_WHEEL_SETTINGS);
  assert.equal(input.source, 'wheel');
  assert.ok(input.steer > 0.3 && input.steer < 0.6);
  assert.ok(input.throttle > 0.95, `Expected full throttle on axis 2 = -1, got ${input.throttle}`);
  assert.ok(Math.abs(input.brake - 0.5) < 0.05, `Expected 0.5 brake on axis 3 = 0, got ${input.brake}`);
});

test('Live leaderboard ranks racers accurately and formats lap times', () => {
  const board = buildLiveLeaderboard([
    { id: 'a', name: 'A', color: '#f00', isPlayer: false, isRemote: false, lap: 2, totalProgress: 1.4, speedKmh: 180, bestLapMs: 70000, finished: false, finishTimeMs: null },
    { id: 'b', name: 'B', color: '#0f0', isPlayer: true, isRemote: false, lap: 2, totalProgress: 1.65, speedKmh: 200, bestLapMs: 68500, finished: false, finishTimeMs: null },
    { id: 'c', name: 'C', color: '#00f', isPlayer: false, isRemote: true, lap: 3, totalProgress: 3.0, speedKmh: 210, bestLapMs: 67000, finished: true, finishTimeMs: 205120 },
  ]);

  assert.equal(board[0].id, 'c');
  assert.equal(board[0].position, 1);
  assert.equal(board[1].id, 'b');
  assert.equal(board[2].id, 'a');
  assert.equal(formatRaceTime(68420), '1:08.42');
  assert.equal(formatRaceTime(null), '--:--.--');
});

test('AI racers advance cleanly along track and adapt to weather', () => {
  const track = new RaceTrack(360);
  const racers = createAiRacers(track);
  assert.equal(racers.length, 5);
  const startT = racers[0].t;
  for (let i = 0; i < 120; i++) {
    stepAiRacer(racers[0], track, 'clear', 1 / 60, 3, { x: 999, z: 999 }, true);
  }
  assert.ok(racers[0].speedKmh > 60, `Expected AI to accelerate, got ${racers[0].speedKmh}`);
  assert.notEqual(racers[0].t, startT);
});
