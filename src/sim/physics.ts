import {
  BARRIER_LIMIT,
  RaceTrack,
  advanceLapProgress,
  START_FINISH_T,
} from './track';
import type {
  ControlInput,
  TuningConfig,
  VehicleState,
  WeatherMode,
} from './types';

// Realistic GT3 vehicle physical constants
const MASS_KG = 1280;
const GRAVITY = 9.81;
const AIR_DENSITY = 1.225;
const FRONTAL_AREA = 2.02;
const WHEELBASE_M = 2.68;
const WHEEL_RADIUS_M = 0.34;
const MAX_RPM = 8600;
const IDLE_RPM = 1150;
const GEAR_RATIOS = [0, 3.15, 2.28, 1.72, 1.34, 1.06, 0.86]; // index 1..6
const FINAL_DRIVE = 3.65;

export function getTireWeatherGrip(
  compound: TuningConfig['tireCompound'],
  weather: WeatherMode,
): number {
  const table: Record<TuningConfig['tireCompound'], Record<WeatherMode, number>> = {
    slick: { clear: 1.18, fog: 1.08, rain: 0.68, storm: 0.54 },
    intermediate: { clear: 1.04, fog: 1.02, rain: 0.96, storm: 0.82 },
    wet: { clear: 0.94, fog: 0.96, rain: 1.06, storm: 0.97 },
  };
  return table[compound][weather];
}

export function getSurfaceGripMultiplier(surface: VehicleState['surface']): number {
  switch (surface) {
    case 'asphalt':
      return 1.0;
    case 'kerb':
      return 0.88;
    case 'gravel':
      return 0.56;
    case 'grass':
      return 0.50;
  }
}

/**
 * Simplified Pacejka Magic Formula lateral grip response.
 */
export function pacejkaLateralForce(slipAngleRad: number, normalLoadN: number, mu: number): number {
  const B = 9.2;
  const C = 1.38;
  const E = -0.35;
  const bx = B * slipAngleRad;
  const normForce = Math.sin(C * Math.atan(bx - E * (bx - Math.atan(bx))));
  return normalLoadN * mu * normForce;
}

export function createInitialVehicleState(
  track: RaceTrack,
  gridSlotIndex = 0,
): VehicleState {
  const slot = track.getGridSlot(gridSlotIndex);
  const progress = (((slot.t - START_FINISH_T) % 1) + 1) % 1;
  return {
    x: slot.x,
    y: slot.y,
    z: slot.z,
    yaw: slot.yaw,
    vx: 0,
    vz: 0,
    yawRate: 0,
    speedMs: 0,
    speedKmh: 0,
    rpm: IDLE_RPM,
    gear: 1,
    steerAngle: 0,
    pitch: 0,
    roll: 0,
    wheelSpin: 0,
    slipRatio: 0,
    surface: 'asphalt',
    trackT: slot.t,
    lateralOffset: 0,
    lap: 1,
    totalProgress: progress > 0.9 ? progress - 1 : progress, // just behind start line
    bestLapMs: null,
    currentLapMs: 0,
    totalRaceMs: 0,
    topSpeedKmh: 0,
    finished: false,
    finishTimeMs: null,
    impactTrauma: 0,
    backfireTimer: 0,
    brakeHeat: 0,
    ffbIntensity: 0,
  };
}

export function stepVehiclePhysics(
  prev: VehicleState,
  input: ControlInput,
  tuning: TuningConfig,
  weather: WeatherMode,
  track: RaceTrack,
  rawDt: number,
  totalLaps = 3,
  canMove = true,
): VehicleState {
  const dt = Math.min(Math.max(rawDt, 0.0001), 0.05);
  const next: VehicleState = { ...prev };

  // Decay visual/feedback timers
  next.impactTrauma = Math.max(0, next.impactTrauma - dt * 2.2);
  next.backfireTimer = Math.max(0, next.backfireTimer - dt);

  if (!canMove) {
    // Allow revving engine on starting grid during countdown!
    const targetRpm = IDLE_RPM + input.throttle * 5200;
    next.rpm = next.rpm + (targetRpm - next.rpm) * (1 - Math.exp(-8 * dt));
    next.steerAngle = next.steerAngle + (input.steer - next.steerAngle) * (1 - Math.exp(-10 * dt));
    return next;
  }

  // Forward and right unit vectors in world XZ (yaw=0 -> forward (0, -1), right (1, 0))
  const sinY = Math.sin(next.yaw);
  const cosY = Math.cos(next.yaw);
  const fwdX = -sinY;
  const fwdZ = -cosY;
  const rightX = cosY;
  const rightZ = -sinY;

  // Local velocities
  const vForward = next.vx * fwdX + next.vz * fwdZ;
  const vLateral = next.vx * rightX + next.vz * rightZ;
  const absSpeed = Math.hypot(next.vx, next.vz);

  // Smooth steering response with speed-sensitive high-speed authority
  const steerSpeedRate = input.source === 'wheel' ? 18 : 7.5;
  next.steerAngle = next.steerAngle + (input.steer - next.steerAngle) * (1 - Math.exp(-steerSpeedRate * dt));
  const speedSteerFactor = 1 / (1 + Math.pow(absSpeed / 42, 1.55));
  const maxWheelRad = 0.56 * (0.38 + 0.62 * speedSteerFactor);
  // Convention: steer > 0 turns right, so yaw decreases (CW from above)
  const deltaRad = -next.steerAngle * maxWheelRad;

  // Track projection & surface
  const proj = track.project(next.x, next.z, next.trackT);
  next.surface = track.getSurfaceAtOffset(proj.lateralOffset);
  next.lateralOffset = proj.lateralOffset;

  // Aerodynamic drag & downforce
  const cd = 0.31 + tuning.aeroDownforce * 0.24;
  const cl = 0.45 + tuning.aeroDownforce * 1.45;
  const qDyn = 0.5 * AIR_DENSITY * FRONTAL_AREA * absSpeed * absSpeed;
  const aeroDragN = qDyn * cd;
  const downforceN = qDyn * cl;
  const totalNormalLoad = MASS_KG * GRAVITY + downforceN;

  // Grip coefficient
  const tireWeatherMu = getTireWeatherGrip(tuning.tireCompound, weather);
  const surfaceMu = getSurfaceGripMultiplier(next.surface);
  const effectiveMu = tireWeatherMu * surfaceMu;

  // Gear selection (automatic sequential with smooth hysteresis)
  let gear = next.gear;
  if (vForward < 0.8 && input.brake > 0.25 && input.throttle < 0.1) {
    gear = -1;
  } else if (gear <= 0 && (input.throttle > 0.08 || vForward > 1.0)) {
    gear = 1;
  }

  const wheelRpm = Math.abs(vForward) / (2 * Math.PI * WHEEL_RADIUS_M) * 60;
  if (gear >= 1) {
    const currRatio = GEAR_RATIOS[gear] * FINAL_DRIVE;
    const estRpm = Math.max(IDLE_RPM, wheelRpm * currRatio);
    if (estRpm > 7950 && gear < 6) {
      gear += 1;
      next.backfireTimer = 0.12;
    } else if (estRpm < 3650 && gear > 1) {
      gear -= 1;
      if (absSpeed > 22) next.backfireTimer = 0.16;
    }
  }
  next.gear = gear;

  // Engine RPM & torque curve
  const activeRatio = gear === -1 ? 3.1 * FINAL_DRIVE : GEAR_RATIOS[Math.max(1, gear)] * FINAL_DRIVE;
  const drivenRpm = Math.min(MAX_RPM, Math.max(IDLE_RPM, wheelRpm * activeRatio + input.throttle * 650));
  next.rpm = next.rpm + (drivenRpm - next.rpm) * (1 - Math.exp(-14 * dt));

  // Peak torque ~ 780 Nm scaled by tuning.enginePower and realistic powerband curve
  const rpmNorm = (next.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM);
  const torqueBand = 0.74 + 0.34 * Math.sin(Math.min(1, Math.max(0, rpmNorm)) * Math.PI * 0.92);
  const peakEngineTorque = 780 * tuning.enginePower;

  // Longitudinal forces
  let driveForceN = 0;
  let brakeForceN = 0;

  if (gear === -1) {
    // Reverse gear using brake pedal as reverse throttle
    driveForceN = -input.brake * 6800 * tuning.enginePower;
    if (input.throttle > 0.1) {
      brakeForceN = input.throttle * 15000;
    }
  } else {
    const wheelTorque = peakEngineTorque * torqueBand * activeRatio * 0.92;
    const rawDriveForce = (wheelTorque / WHEEL_RADIUS_M) * input.throttle;
    // GT3 slick longitudinal traction with rear weight transfer
    const tractionShare = tuning.drivetrain === 'awd' ? 1.38 : 1.08;
    const maxTractionN = totalNormalLoad * tractionShare * effectiveMu;
    driveForceN = Math.min(rawDriveForce, maxTractionN);

    // Braking (~1.6G carbon-ceramic racing brakes)
    const maxBrakeForce = 24500 * effectiveMu;
    brakeForceN = input.brake * maxBrakeForce;
    if (input.handbrake) {
      brakeForceN += 11500 * effectiveMu;
    }
  }

  // Rolling resistance & gravel drag
  const rollingCoeff = next.surface === 'gravel' ? 0.14 : next.surface === 'grass' ? 0.16 : 0.015;
  const rollingResistanceN = totalNormalLoad * rollingCoeff * Math.sign(vForward);

  // Brake heat visual buildup
  const targetBrakeHeat = input.brake > 0.15 && absSpeed > 12 ? Math.min(1, next.brakeHeat + dt * 1.4) : Math.max(0, next.brakeHeat - dt * 0.55);
  next.brakeHeat = targetBrakeHeat;

  // Total longitudinal force
  let fLong = driveForceN - Math.sign(vForward) * (aeroDragN + brakeForceN) - rollingResistanceN;
  if (Math.abs(vForward) < 0.4 && input.throttle < 0.05 && input.brake > 0.1 && gear >= 0) {
    fLong = -vForward * MASS_KG * 12;
  }

  // Longitudinal weight transfer (front/rear normal loads)
  const longAccel = fLong / MASS_KG;
  const weightShift = Math.max(-0.22, Math.min(0.22, (longAccel / GRAVITY) * 0.14));
  const frontLoad = totalNormalLoad * (0.48 - weightShift);
  const rearLoad = totalNormalLoad * (0.52 + weightShift);

  // Slip angles (front & rear axle bicycle model with low-speed stabilization)
  const halfWb = WHEELBASE_M * 0.5;
  const vForwardSafe = Math.max(2.5, Math.abs(vForward));
  const vSign = vForward >= -0.2 ? 1 : -1;

  const alphaFront = Math.atan2(vLateral + next.yawRate * halfWb, vForwardSafe) - deltaRad * vSign;
  const alphaRear = Math.atan2(vLateral - next.yawRate * halfWb, vForwardSafe);

  // Handbrake + rear brake bias reduce rear lateral grip for controllable drifts
  const rearGripPenalty = input.handbrake ? 0.34 : 1.0 - Math.max(0, (0.55 - tuning.brakeBalance) * input.brake * 0.45);
  const frontGripScale = 1.04 + (tuning.suspensionStiffness - 0.5) * 0.12;
  const rearGripScale = (tuning.drivetrain === 'awd' ? 1.06 : 1.0) * rearGripPenalty;

  let fLatFront = -pacejkaLateralForce(alphaFront, frontLoad, effectiveMu * frontGripScale);
  let fLatRear = -pacejkaLateralForce(alphaRear, rearLoad, effectiveMu * rearGripScale);

  // Low-speed smooth kinematic damping so the car never jitters when stopped
  if (absSpeed < 2.2) {
    const lowScale = absSpeed / 2.2;
    fLatFront *= lowScale;
    fLatRear *= lowScale;
  }

  // Combine forces in local frame
  const fLocalX = fLatFront * Math.cos(deltaRad) + fLatRear; // right
  const fLocalZ = fLong - fLatFront * Math.sin(deltaRad); // forward

  const aLat = fLocalX / MASS_KG;
  const aLong = fLocalZ / MASS_KG;

  // Yaw torque
  const izz = 2150; // moment of inertia kg*m^2
  const yawTorque = halfWb * (fLatFront * Math.cos(deltaRad) - fLatRear);
  const yawDamping = -next.yawRate * (1200 + absSpeed * 55);
  let nextYawRate = next.yawRate + ((yawTorque + yawDamping) / izz) * dt;

  // Add gentle low-speed kinematic turning assist so parking / tight hairpins feel crisp
  if (absSpeed > 0.3 && absSpeed < 10) {
    const kinematicYaw = (vForward / WHEELBASE_M) * Math.tan(deltaRad);
    const blend = 1 - absSpeed / 10;
    nextYawRate = nextYawRate * (1 - blend * 0.7) + kinematicYaw * (blend * 0.7);
  }
  nextYawRate = Math.max(-3.2, Math.min(3.2, nextYawRate));

  // Integrate local velocities -> world velocities
  const newVForward = vForward + aLong * dt;
  let newVLateral = vLateral + aLat * dt;
  // Extra lateral scrub at near-zero speed to prevent creeping sideways
  if (Math.abs(newVForward) < 0.6) {
    newVLateral *= Math.exp(-12 * dt);
  }

  // Soft speed cap (~315 km/h depending on power & drag)
  const maxSpeedMs = 82 * Math.sqrt(tuning.enginePower) * (1.07 - tuning.aeroDownforce * 0.14);
  const clampedVForward = Math.max(-18, Math.min(maxSpeedMs, newVForward));

  next.yaw += nextYawRate * dt;
  next.yawRate = nextYawRate;

  const nSin = Math.sin(next.yaw);
  const nCos = Math.cos(next.yaw);
  const nFwdX = -nSin;
  const nFwdZ = -nCos;
  const nRightX = nCos;
  const nRightZ = -nSin;

  next.vx = nFwdX * clampedVForward + nRightX * newVLateral;
  next.vz = nFwdZ * clampedVForward + nRightZ * newVLateral;

  next.x += next.vx * dt;
  next.z += next.vz * dt;

  // Re-project onto track for elevation, guardrail collision & lap progress
  const afterProj = track.project(next.x, next.z, proj.t);
  next.y = afterProj.sample.y;

  // Guardrail soft containment at BARRIER_LIMIT
  if (Math.abs(afterProj.lateralOffset) > BARRIER_LIMIT) {
    const sign = Math.sign(afterProj.lateralOffset);
    const clampedLat = sign * BARRIER_LIMIT;
    next.x = afterProj.sample.x + afterProj.sample.rx * clampedLat;
    next.z = afterProj.sample.z + afterProj.sample.rz * clampedLat;

    // Reflect outward velocity component with energy loss
    const outVel = next.vx * afterProj.sample.rx * sign + next.vz * afterProj.sample.rz * sign;
    if (outVel > 0) {
      next.vx -= afterProj.sample.rx * sign * outVel * 1.32;
      next.vz -= afterProj.sample.rz * sign * outVel * 1.32;
      next.vx *= 0.84;
      next.vz *= 0.84;
      const impactWeight = Math.min(1, outVel / 18);
      next.impactTrauma = Math.min(1, next.impactTrauma + impactWeight * 0.85);
    }
    next.lateralOffset = clampedLat;
  } else {
    next.lateralOffset = afterProj.lateralOffset;
  }

  // Update speed, wheel spin, suspension pitch/roll, slip ratio
  next.speedMs = Math.hypot(next.vx, next.vz);
  next.speedKmh = next.speedMs * 3.6;
  if (next.speedKmh > next.topSpeedKmh) next.topSpeedKmh = next.speedKmh;
  next.wheelSpin += (clampedVForward / WHEEL_RADIUS_M) * dt;

  const stiffScale = 1.35 - tuning.suspensionStiffness * 0.65;
  const targetPitch = Math.max(-0.07, Math.min(0.07, (aLong / 22) * 0.048 * stiffScale));
  const targetRoll = Math.max(-0.09, Math.min(0.09, (-aLat / 20) * 0.068 * stiffScale));
  next.pitch = next.pitch + (targetPitch - next.pitch) * (1 - Math.exp(-10 * dt));
  next.roll = next.roll + (targetRoll - next.roll) * (1 - Math.exp(-10 * dt));

  const slipMetric =
    absSpeed > 5
      ? Math.min(1, (Math.abs(alphaRear) * 1.9 + (input.handbrake ? 0.55 : 0)) * (absSpeed / 25))
      : 0;
  next.slipRatio = next.slipRatio + (slipMetric - next.slipRatio) * (1 - Math.exp(-12 * dt));

  // Force Feedback intensity (curb vibration + lateral slip + off-track gravel + collisions)
  const kerbBuzz = next.surface === 'kerb' && absSpeed > 8 ? 0.35 : 0;
  const gravelBuzz = (next.surface === 'gravel' || next.surface === 'grass') && absSpeed > 5 ? 0.45 : 0;
  next.ffbIntensity = Math.min(
    1,
    next.impactTrauma * 0.9 + kerbBuzz + gravelBuzz + next.slipRatio * 0.4,
  );

  // Lap & timing progression
  if (!next.finished) {
    const dtMs = dt * 1000;
    next.currentLapMs += dtMs;
    next.totalRaceMs += dtMs;

    const lapRes = advanceLapProgress(prev.trackT, afterProj.t, next.lap);
    if (lapRes.crossedFinish && next.currentLapMs > 12000) {
      if (next.bestLapMs === null || next.currentLapMs < next.bestLapMs) {
        next.bestLapMs = Math.round(next.currentLapMs);
      }
      if (next.lap >= totalLaps) {
        next.finished = true;
        next.finishTimeMs = Math.round(next.totalRaceMs);
      } else {
        next.lap = lapRes.lap;
        next.currentLapMs = 0;
      }
    }

    const pNorm = (((afterProj.t - START_FINISH_T) % 1) + 1) % 1;
    // Handle initial pre-line grid slot cleanly
    const adjustedP = next.lap === 1 && next.totalRaceMs < 4000 && pNorm > 0.85 ? pNorm - 1 : pNorm;
    next.totalProgress = next.finished ? totalLaps : (next.lap - 1) + adjustedP;
  }

  next.trackT = afterProj.t;
  return next;
}
