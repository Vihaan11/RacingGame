import type {
  ClientToServerMessage,
  RoomSnapshot,
  RoomSummary,
  ServerToClientMessage,
  TimeOfDay,
  TrackRecord,
  WeatherMode,
} from '../shared/protocol';

export interface MultiplayerCallbacks {
  onConnectionChange?: (connected: boolean) => void;
  onRoomsList?: (rooms: RoomSummary[]) => void;
  onRoomUpdate?: (room: RoomSnapshot | null, playerId: string) => void;
  onRecordsUpdate?: (records: TrackRecord[]) => void;
  onError?: (message: string) => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private destroyed = false;
  private lastTelemetrySent = 0;

  public connected = false;
  public playerId = '';
  public currentRoom: RoomSnapshot | null = null;
  public rooms: RoomSummary[] = [];
  public records: TrackRecord[] = [];
  private callbacks: MultiplayerCallbacks;

  constructor(callbacks: MultiplayerCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public setCallbacks(callbacks: MultiplayerCallbacks): void {
    this.callbacks = callbacks;
  }

  public connect(): void {
    if (this.destroyed || this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.connected = true;
        this.callbacks.onConnectionChange?.(true);
      };

      ws.onmessage = (event) => {
        let msg: ServerToClientMessage;
        try {
          msg = JSON.parse(String(event.data)) as ServerToClientMessage;
        } catch {
          return;
        }

        if (msg.type === 'welcome') {
          this.playerId = msg.playerId;
          this.rooms = msg.rooms;
          this.records = msg.records;
          this.callbacks.onRoomsList?.(msg.rooms);
          this.callbacks.onRecordsUpdate?.(msg.records);
        } else if (msg.type === 'room:list') {
          this.rooms = msg.rooms;
          this.callbacks.onRoomsList?.(msg.rooms);
        } else if (msg.type === 'room:joined') {
          this.playerId = msg.playerId;
          this.currentRoom = msg.room;
          this.callbacks.onRoomUpdate?.(msg.room, this.playerId);
        } else if (msg.type === 'room:state') {
          this.currentRoom = msg.room;
          this.callbacks.onRoomUpdate?.(msg.room, this.playerId);
        } else if (msg.type === 'room:left') {
          this.currentRoom = null;
          this.callbacks.onRoomUpdate?.(null, this.playerId);
        } else if (msg.type === 'records:update') {
          this.records = msg.records;
          this.callbacks.onRecordsUpdate?.(msg.records);
        } else if (msg.type === 'room:error') {
          this.callbacks.onError?.(msg.message);
        }
      };

      ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        this.callbacks.onConnectionChange?.(false);
        if (!this.destroyed) {
          this.reconnectTimer = window.setTimeout(() => this.connect(), 2500);
        }
      };

      ws.onerror = () => {
        // Handled cleanly by onclose reconnect
      };
    } catch {
      this.connected = false;
    }
  }

  public send(msg: ClientToServerMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public createRoom(driverName: string, color: string, weather: WeatherMode, timeOfDay: TimeOfDay, roomName?: string): void {
    this.send({ type: 'room:create', driverName, color, weather, timeOfDay, roomName });
  }

  public joinRoom(code: string, driverName: string, color: string): void {
    this.send({ type: 'room:join', code, driverName, color });
  }

  public leaveRoom(): void {
    this.send({ type: 'room:leave' });
    this.currentRoom = null;
    this.callbacks.onRoomUpdate?.(null, this.playerId);
  }

  public setReady(ready: boolean): void {
    this.send({ type: 'room:ready', ready });
  }

  public updateRoomSettings(weather: WeatherMode, timeOfDay: TimeOfDay): void {
    this.send({ type: 'room:settings', weather, timeOfDay });
  }

  public startRoomRace(): void {
    this.send({ type: 'room:start' });
  }

  public submitTrackRecord(driverName: string, lapTimeMs: number, weather: WeatherMode, carColor: string): void {
    this.send({ type: 'record:submit', driverName, lapTimeMs, weather, carColor });
  }

  public sendTelemetry(data: {
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
  }): void {
    if (!this.currentRoom || !this.connected) return;
    const now = performance.now();
    if (now - this.lastTelemetrySent < 60 && !data.finished) return;
    this.lastTelemetrySent = now;
    this.send({ type: 'player:telemetry', ...data });
  }

  public dispose(): void {
    this.destroyed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
    this.ws = null;
  }
}
