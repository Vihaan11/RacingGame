export type WeatherMode = 'clear' | 'fog' | 'rain' | 'storm';
export type TimeOfDay = 'day' | 'sunset' | 'night';

export interface RemotePlayerState {
  id: string;
  name: string;
  color: string;
  ready: boolean;
  isHost: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speedKmh: number;
  steerAngle: number;
  lap: number;
  trackProgress: number; // 0..1 within current lap
  totalProgress: number; // lap + trackProgress
  bestLapMs: number | null;
  finished: boolean;
  finishTimeMs: number | null;
  lastUpdate: number;
}

export interface RoomSummary {
  code: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  status: 'lobby' | 'racing' | 'finished';
  weather: WeatherMode;
  timeOfDay: TimeOfDay;
}

export interface RoomSnapshot {
  code: string;
  name: string;
  status: 'lobby' | 'racing' | 'finished';
  weather: WeatherMode;
  timeOfDay: TimeOfDay;
  totalLaps: number;
  raceStartTime: number | null;
  players: RemotePlayerState[];
}

export interface TrackRecord {
  id: string;
  driverName: string;
  lapTimeMs: number;
  weather: WeatherMode;
  carColor: string;
  dateIso: string;
}

export type ClientToServerMessage =
  | { type: 'room:list' }
  | { type: 'room:create'; driverName: string; color: string; weather: WeatherMode; timeOfDay: TimeOfDay; roomName?: string }
  | { type: 'room:join'; code: string; driverName: string; color: string }
  | { type: 'room:leave' }
  | { type: 'room:ready'; ready: boolean }
  | { type: 'room:settings'; weather: WeatherMode; timeOfDay: TimeOfDay }
  | { type: 'room:start' }
  | {
      type: 'player:telemetry';
      x: number;
      y: number;
      z: number;
      yaw: number;
      speedKmh: number;
      steerAngle: number;
      lap: number;
      trackProgress: number;
      bestLapMs: number | null;
      finished: boolean;
      finishTimeMs: number | null;
    }
  | { type: 'record:submit'; driverName: string; lapTimeMs: number; weather: WeatherMode; carColor: string };

export type ServerToClientMessage =
  | { type: 'welcome'; playerId: string; rooms: RoomSummary[]; records: TrackRecord[] }
  | { type: 'room:list'; rooms: RoomSummary[] }
  | { type: 'room:joined'; room: RoomSnapshot; playerId: string }
  | { type: 'room:state'; room: RoomSnapshot }
  | { type: 'room:left' }
  | { type: 'room:error'; message: string }
  | { type: 'records:update'; records: TrackRecord[] };
