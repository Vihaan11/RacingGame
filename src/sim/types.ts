import type { TimeOfDay, WeatherMode } from '../shared/protocol';

export type { TimeOfDay, WeatherMode };

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';
export type CameraMode = 'chase' | 'close' | 'hood' | 'cockpit';
export type TireCompound = 'slick' | 'intermediate' | 'wet';
export type DrivetrainMode = 'rwd' | 'awd';

export interface TuningConfig {
  enginePower: number; // 0.75 .. 1.35 multiplier (default 1.0 = ~640 hp GT3)
  aeroDownforce: number; // 0.2 .. 1.0 (rear wing pitch + grip at speed vs top speed drag)
  suspensionStiffness: number; // 0.3 .. 1.0 (body roll & pitch damping)
  rideHeight: number; // 0.0 .. 1.0 (0 = slammed track, 1 = raised)
  brakeBalance: number; // 0.45 .. 0.70 (front bias)
  tireCompound: TireCompound;
  drivetrain: DrivetrainMode;
  liveryColor: string;
  accentColor: string;
}

export const DEFAULT_TUNING: TuningConfig = {
  enginePower: 1.0,
  aeroDownforce: 0.65,
  suspensionStiffness: 0.72,
  rideHeight: 0.35,
  brakeBalance: 0.58,
  tireCompound: 'slick',
  drivetrain: 'rwd',
  liveryColor: '#d92626',
  accentColor: '#f59e0b',
};

export const TUNING_PRESETS: Record<string, Partial<TuningConfig>> = {
  Balanced: {
    enginePower: 1.0,
    aeroDownforce: 0.65,
    suspensionStiffness: 0.72,
    rideHeight: 0.35,
    brakeBalance: 0.58,
    tireCompound: 'slick',
    drivetrain: 'rwd',
  },
  'High Downforce': {
    enginePower: 1.05,
    aeroDownforce: 0.95,
    suspensionStiffness: 0.88,
    rideHeight: 0.18,
    brakeBalance: 0.61,
    tireCompound: 'slick',
    drivetrain: 'awd',
  },
  'Top Speed': {
    enginePower: 1.25,
    aeroDownforce: 0.25,
    suspensionStiffness: 0.78,
    rideHeight: 0.22,
    brakeBalance: 0.56,
    tireCompound: 'slick',
    drivetrain: 'rwd',
  },
  'Wet Spec': {
    enginePower: 0.95,
    aeroDownforce: 0.82,
    suspensionStiffness: 0.48,
    rideHeight: 0.62,
    brakeBalance: 0.54,
    tireCompound: 'wet',
    drivetrain: 'awd',
  },
};

export const LIVERY_SWATCHES = [
  { name: 'Rosso Corsa', color: '#d92626', accent: '#f59e0b' },
  { name: 'Alpine Blue', color: '#1d4ed8', accent: '#38bdf8' },
  { name: 'Racing Green', color: '#15803d', accent: '#facc15' },
  { name: 'Papaya Orange', color: '#ea580c', accent: '#e4e4e7' },
  { name: 'Silver Arrow', color: '#cbd5e1', accent: '#ef4444' },
  { name: 'Obsidian Carbon', color: '#18181b', accent: '#f59e0b' },
];

export interface WheelSettings {
  enabled: boolean;
  deadzone: number; // 0.0 .. 0.2
  linearity: number; // 0.6 .. 2.2 (1.0 = linear)
  sensitivity: number; // 0.5 .. 1.8
  steeringAxis: number; // default 0
  throttleAxis: number; // -1 = use button/trigger, >=0 = axis
  brakeAxis: number; // -1 = use button/trigger, >=0 = axis
  invertPedals: boolean;
  ffbStrength: number; // 0.0 .. 1.0
}

export const DEFAULT_WHEEL_SETTINGS: WheelSettings = {
  enabled: true,
  deadzone: 0.04,
  linearity: 1.15,
  sensitivity: 1.0,
  steeringAxis: 0,
  throttleAxis: -1,
  brakeAxis: -1,
  invertPedals: false,
  ffbStrength: 0.75,
};

export interface ControlInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. +1 (right)
  handbrake: boolean;
  source: 'keyboard' | 'wheel';
}

export interface VehicleState {
  x: number;
  y: number;
  z: number;
  yaw: number; // radians, 0 faces -Z, positive turns left (+CCW around Y)
  vx: number; // world X velocity m/s
  vz: number; // world Z velocity m/s
  yawRate: number; // rad/s
  speedMs: number;
  speedKmh: number;
  rpm: number;
  gear: number; // -1 = R, 0 = N, 1..6 = forward
  steerAngle: number; // current front wheel angle (-1..1 normalized)
  pitch: number; // suspension dive/squat rad
  roll: number; // suspension lateral roll rad
  wheelSpin: number; // cumulative wheel rotation rad
  slipRatio: number; // 0..1 tire slip for smoke/audio/HUD
  surface: 'asphalt' | 'kerb' | 'gravel' | 'grass';
  trackT: number; // 0..1 spline parameter
  lateralOffset: number; // meters from track center
  lap: number;
  totalProgress: number;
  bestLapMs: number | null;
  currentLapMs: number;
  totalRaceMs: number;
  topSpeedKmh: number;
  finished: boolean;
  finishTimeMs: number | null;
  impactTrauma: number; // 0..1 for camera shake & hitstop
  backfireTimer: number; // >0 shows exhaust flame
  brakeHeat: number; // 0..1 caliper glow
  ffbIntensity: number; // 0..1 requested wheel rumble
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  color: string;
  isPlayer: boolean;
  isRemote: boolean;
  position: number;
  lap: number;
  totalProgress: number;
  speedKmh: number;
  gapSeconds: number;
  bestLapMs: number | null;
  finished: boolean;
  finishTimeMs: number | null;
}

export interface HudSnapshot {
  speedKmh: number;
  rpm: number;
  maxRpm: number;
  gear: number;
  throttle: number;
  brake: number;
  steer: number;
  slipRatio: number;
  surface: VehicleState['surface'];
  lap: number;
  totalLaps: number;
  currentLapMs: number;
  bestLapMs: number | null;
  totalRaceMs: number;
  position: number;
  totalRacers: number;
  topSpeedKmh: number;
  wrongWay: boolean;
  countdownText: string | null;
  leaderboard: LeaderboardEntry[];
  minimapRacers: Array<{ id: string; x: number; z: number; color: string; isPlayer: boolean; yaw: number }>;
  wheelConnected: boolean;
  wheelName: string;
  inputSource: 'keyboard' | 'wheel';
}

export interface FinishSummary {
  position: number;
  totalRacers: number;
  totalRaceMs: number;
  bestLapMs: number | null;
  topSpeedKmh: number;
  weather: WeatherMode;
  timeOfDay: TimeOfDay;
  isMultiplayer: boolean;
  leaderboard: LeaderboardEntry[];
}
