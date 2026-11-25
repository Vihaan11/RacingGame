import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  ClientToServerMessage,
  RemotePlayerState,
  RoomSnapshot,
  RoomSummary,
  ServerToClientMessage,
  TimeOfDay,
  TrackRecord,
  WeatherMode,
} from './src/shared/protocol.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

interface RoomInternal {
  code: string;
  name: string;
  status: 'lobby' | 'racing' | 'finished';
  weather: WeatherMode;
  timeOfDay: TimeOfDay;
  totalLaps: number;
  raceStartTime: number | null;
  persistent: boolean;
  players: Map<string, RemotePlayerState>;
  sockets: Map<string, WebSocket>;
}

const rooms = new Map<string, RoomInternal>();

// Pre-seed one always-open public room so players can jump right in
rooms.set('OPEN', {
  code: 'OPEN',
  name: 'Alpine GP Open Grid',
  status: 'lobby',
  weather: 'clear',
  timeOfDay: 'day',
  totalLaps: 3,
  raceStartTime: null,
  persistent: true,
  players: new Map(),
  sockets: new Map(),
});

// Track leaderboard records (persisted for server lifetime)
const trackRecords: TrackRecord[] = [
  { id: 'rec-1', driverName: 'M. Bellini', lapTimeMs: 68420, weather: 'clear', carColor: '#dc2626', dateIso: '2026-11-20' },
  { id: 'rec-2', driverName: 'K. Takahashi', lapTimeMs: 69850, weather: 'clear', carColor: '#2563eb', dateIso: '2026-11-21' },
  { id: 'rec-3', driverName: 'S. Lindqvist', lapTimeMs: 71190, weather: 'sunset' === 'sunset' ? 'fog' : 'clear', carColor: '#f59e0b', dateIso: '2026-11-22' },
  { id: 'rec-4', driverName: 'A. Moreau', lapTimeMs: 73640, weather: 'rain', carColor: '#10b981', dateIso: '2026-11-23' },
];

function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Driver';
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9 ._-]/g, '').slice(0, 18);
  return cleaned || 'Driver';
}

function sanitizeColor(raw: unknown): string {
  if (typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  return '#dc2626';
}

function sanitizeWeather(raw: unknown): WeatherMode {
  return raw === 'clear' || raw === 'fog' || raw === 'rain' || raw === 'storm' ? raw : 'clear';
}

function sanitizeTime(raw: unknown): TimeOfDay {
  return raw === 'day' || raw === 'sunset' || raw === 'night' ? raw : 'day';
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return `R${Date.now().toString().slice(-3)}`;
}

function getRoomSummaries(): RoomSummary[] {
  const list: RoomSummary[] = [];
  for (const room of rooms.values()) {
    list.push({
      code: room.code,
      name: room.name,
      playerCount: room.players.size,
      maxPlayers: 8,
      status: room.status,
      weather: room.weather,
      timeOfDay: room.timeOfDay,
    });
  }
  return list;
}

function serializeRoom(room: RoomInternal): RoomSnapshot {
  const sortedPlayers = Array.from(room.players.values()).sort((a, b) => {
    if (a.finished && b.finished) {
      return (a.finishTimeMs ?? Infinity) - (b.finishTimeMs ?? Infinity);
    }
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.totalProgress - a.totalProgress;
  });

  return {
    code: room.code,
    name: room.name,
    status: room.status,
    weather: room.weather,
    timeOfDay: room.timeOfDay,
    totalLaps: room.totalLaps,
    raceStartTime: room.raceStartTime,
    players: sortedPlayers,
  };
}

function sendMsg(ws: WebSocket, msg: ServerToClientMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastRoom(room: RoomInternal) {
  const payload = JSON.stringify({
    type: 'room:state',
    room: serializeRoom(room),
  } satisfies ServerToClientMessage);
  for (const ws of room.sockets.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function broadcastRoomList(wss: WebSocketServer) {
  const payload = JSON.stringify({
    type: 'room:list',
    rooms: getRoomSummaries(),
  } satisfies ServerToClientMessage);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: getRoomSummaries() });
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ records: trackRecords.slice(0, 10) });
  });

  if (IS_PROD) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  let nextPlayerNum = 1;

  function removePlayerFromRoom(playerId: string, currentRoomCode: string | null): null {
    if (!currentRoomCode) return null;
    const room = rooms.get(currentRoomCode);
    if (!room) return null;

    const wasHost = room.players.get(playerId)?.isHost ?? false;
    room.players.delete(playerId);
    room.sockets.delete(playerId);

    if (room.players.size === 0) {
      if (room.persistent) {
        room.status = 'lobby';
        room.raceStartTime = null;
      } else {
        rooms.delete(currentRoomCode);
      }
    } else {
      if (wasHost) {
        const nextFirst = room.players.values().next().value;
        if (nextFirst) nextFirst.isHost = true;
      }
      broadcastRoom(room);
    }
    broadcastRoomList(wss);
    return null;
  }

  // Broadcast live race state to active racing rooms at 15Hz
  const syncInterval = setInterval(() => {
    for (const room of rooms.values()) {
      if (room.status === 'racing' && room.players.size > 0) {
        broadcastRoom(room);
      }
    }
  }, 66);

  wss.on('close', () => clearInterval(syncInterval));

  wss.on('connection', (ws) => {
    const playerId = `p-${nextPlayerNum++}-${Math.random().toString(36).slice(2, 6)}`;
    let currentRoomCode: string | null = null;

    sendMsg(ws, {
      type: 'welcome',
      playerId,
      rooms: getRoomSummaries(),
      records: trackRecords.slice(0, 10),
    });

    ws.on('message', (raw) => {
      let msg: ClientToServerMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientToServerMessage;
      } catch {
        return;
      }

      if (msg.type === 'room:list') {
        sendMsg(ws, { type: 'room:list', rooms: getRoomSummaries() });
        return;
      }

      if (msg.type === 'record:submit') {
        const lapMs = Number(msg.lapTimeMs);
        if (Number.isFinite(lapMs) && lapMs >= 25000 && lapMs <= 600000) {
          trackRecords.push({
            id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            driverName: sanitizeName(msg.driverName),
            lapTimeMs: Math.round(lapMs),
            weather: sanitizeWeather(msg.weather),
            carColor: sanitizeColor(msg.carColor),
            dateIso: new Date().toISOString().slice(0, 10),
          });
          trackRecords.sort((a, b) => a.lapTimeMs - b.lapTimeMs);
          if (trackRecords.length > 20) trackRecords.length = 20;
          const updatePayload = JSON.stringify({
            type: 'records:update',
            records: trackRecords.slice(0, 10),
          } satisfies ServerToClientMessage);
          for (const client of wss.clients) {
            if (client.readyState === WebSocket.OPEN) client.send(updatePayload);
          }
        }
        return;
      }

      if (msg.type === 'room:create') {
        currentRoomCode = removePlayerFromRoom(playerId, currentRoomCode);
        const code = generateRoomCode();
        const driverName = sanitizeName(msg.driverName);
        const roomName = sanitizeName(msg.roomName || `${driverName}'s Grid`);
        const room: RoomInternal = {
          code,
          name: roomName,
          status: 'lobby',
          weather: sanitizeWeather(msg.weather),
          timeOfDay: sanitizeTime(msg.timeOfDay),
          totalLaps: 3,
          raceStartTime: null,
          persistent: false,
          players: new Map(),
          sockets: new Map(),
        };
        room.players.set(playerId, {
          id: playerId,
          name: driverName,
          color: sanitizeColor(msg.color),
          ready: true,
          isHost: true,
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          speedKmh: 0,
          steerAngle: 0,
          lap: 1,
          trackProgress: 0,
          totalProgress: 0,
          bestLapMs: null,
          finished: false,
          finishTimeMs: null,
          lastUpdate: Date.now(),
        });
        room.sockets.set(playerId, ws);
        rooms.set(code, room);
        currentRoomCode = code;

        sendMsg(ws, { type: 'room:joined', room: serializeRoom(room), playerId });
        broadcastRoomList(wss);
        return;
      }

      if (msg.type === 'room:join') {
        const targetCode = String(msg.code || '').trim().toUpperCase();
        const room = rooms.get(targetCode);
        if (!room) {
          sendMsg(ws, { type: 'room:error', message: `Room "${targetCode}" not found.` });
          return;
        }
        if (room.players.size >= 8 && !room.players.has(playerId)) {
          sendMsg(ws, { type: 'room:error', message: 'Room is full (8/8 drivers).' });
          return;
        }
        if (currentRoomCode && currentRoomCode !== targetCode) {
          currentRoomCode = removePlayerFromRoom(playerId, currentRoomCode);
        }
        const isHost = room.players.size === 0;
        room.players.set(playerId, {
          id: playerId,
          name: sanitizeName(msg.driverName),
          color: sanitizeColor(msg.color),
          ready: true,
          isHost,
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          speedKmh: 0,
          steerAngle: 0,
          lap: 1,
          trackProgress: 0,
          totalProgress: 0,
          bestLapMs: null,
          finished: false,
          finishTimeMs: null,
          lastUpdate: Date.now(),
        });
        room.sockets.set(playerId, ws);
        currentRoomCode = targetCode;

        sendMsg(ws, { type: 'room:joined', room: serializeRoom(room), playerId });
        broadcastRoom(room);
        broadcastRoomList(wss);
        return;
      }

      if (msg.type === 'room:leave') {
        currentRoomCode = removePlayerFromRoom(playerId, currentRoomCode);
        sendMsg(ws, { type: 'room:left' });
        return;
      }

      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const player = room.players.get(playerId);
      if (!player) return;

      if (msg.type === 'room:ready') {
        player.ready = Boolean(msg.ready);
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'room:settings' && player.isHost) {
        room.weather = sanitizeWeather(msg.weather);
        room.timeOfDay = sanitizeTime(msg.timeOfDay);
        broadcastRoom(room);
        broadcastRoomList(wss);
        return;
      }

      if (msg.type === 'room:start' && player.isHost) {
        room.status = 'racing';
        room.raceStartTime = Date.now();
        for (const p of room.players.values()) {
          p.lap = 1;
          p.trackProgress = 0;
          p.totalProgress = 0;
          p.finished = false;
          p.finishTimeMs = null;
        }
        broadcastRoom(room);
        broadcastRoomList(wss);
        return;
      }

      if (msg.type === 'player:telemetry') {
        player.x = Number(msg.x) || 0;
        player.y = Number(msg.y) || 0;
        player.z = Number(msg.z) || 0;
        player.yaw = Number(msg.yaw) || 0;
        player.speedKmh = Math.max(0, Math.min(450, Number(msg.speedKmh) || 0));
        player.steerAngle = Math.max(-1, Math.min(1, Number(msg.steerAngle) || 0));
        player.lap = Math.max(1, Math.min(99, Math.floor(Number(msg.lap) || 1)));
        player.trackProgress = Math.max(0, Math.min(1, Number(msg.trackProgress) || 0));
        player.totalProgress = (player.lap - 1) + player.trackProgress;
        player.bestLapMs = msg.bestLapMs && Number.isFinite(msg.bestLapMs) ? Math.round(msg.bestLapMs) : null;
        player.finished = Boolean(msg.finished);
        player.finishTimeMs = msg.finishTimeMs && Number.isFinite(msg.finishTimeMs) ? Math.round(msg.finishTimeMs) : null;
        player.lastUpdate = Date.now();
      }
    });

    ws.on('close', () => {
      currentRoomCode = removePlayerFromRoom(playerId, currentRoomCode);
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`VELOCE GT server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
