import React, { useState } from 'react';
import { X, Users, Plus, LogIn, Play, LogOut, Trophy } from 'lucide-react';
import type { RoomSnapshot, RoomSummary, TrackRecord } from '../shared/protocol';
import { formatRaceTime } from '../sim/leaderboard';

interface MultiplayerModalProps {
  connected: boolean;
  playerId: string;
  driverName: string;
  onChangeDriverName: (name: string) => void;
  rooms: RoomSummary[];
  currentRoom: RoomSnapshot | null;
  records: TrackRecord[];
  errorMessage: string | null;
  onCreateRoom: (roomName: string) => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
  onToggleReady: (ready: boolean) => void;
  onStartOnlineRace: () => void;
  onClose: () => void;
}

export const MultiplayerModal: React.FC<MultiplayerModalProps> = ({
  connected,
  playerId,
  driverName,
  onChangeDriverName,
  rooms,
  currentRoom,
  records,
  errorMessage,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onToggleReady,
  onStartOnlineRace,
  onClose,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [activeTab, setActiveTab] = useState<'rooms' | 'records'>('rooms');

  const me = currentRoom?.players.find((p) => p.id === playerId);
  const isHost = Boolean(me?.isHost);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (cleaned) {
      onJoinRoom(cleaned);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/65"
      role="dialog"
      aria-modal="true"
      aria-label="Online Multiplayer Lobby"
    >
      <div className="w-full max-w-[600px] max-h-[88vh] overflow-y-auto rounded bg-[#0c1018] border border-white/14 shadow-2xl p-6 text-zinc-100">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <h2 className="font-display font-bold text-xl tracking-wide text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-400" />
              Online Multiplayer
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {connected
                ? 'Connected to live WebSocket race server · Real-time telemetry sync'
                : 'Connecting to multiplayer server...'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Multiplayer Lobby"
            className="p-2 rounded hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Driver Name Input */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <label htmlFor="mp-driver-name" className="text-xs font-medium text-zinc-300 shrink-0">
            Driver Name
          </label>
          <input
            id="mp-driver-name"
            type="text"
            maxLength={18}
            value={driverName}
            onChange={(e) => onChangeDriverName(e.target.value)}
            placeholder="Enter your driver name"
            className="flex-1 px-3 py-2 rounded bg-[#141925] border border-white/14 text-sm text-white focus:outline-none focus:border-amber-400"
          />
          <div className="flex items-center gap-1 p-1 bg-[#141925] rounded border border-white/10 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('rooms')}
              className={`px-3 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                activeTab === 'rooms' ? 'bg-amber-500 text-zinc-950 font-semibold' : 'text-zinc-300'
              }`}
            >
              Race Rooms
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('records')}
              className={`px-3 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                activeTab === 'records' ? 'bg-amber-500 text-zinc-950 font-semibold' : 'text-zinc-300'
              }`}
            >
              Track Records
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-3 px-3 py-2 rounded bg-red-500/15 border border-red-500/35 text-xs text-red-300">
            {errorMessage}
          </div>
        )}

        {activeTab === 'records' ? (
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-zinc-400 pb-2 border-b border-white/10">
              <span className="flex items-center gap-1.5 font-medium text-zinc-200">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                Alpine GP Fastest Laps
              </span>
              <span>Global Session Leaderboard</span>
            </div>
            <div className="mt-2 divide-y divide-white/8">
              {records.map((rec, i) => (
                <div key={rec.id} className="flex items-center justify-between py-2.5 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono-num text-zinc-400 w-5">#{i + 1}</span>
                    <span
                      className="w-1.5 h-3.5 rounded-xs"
                      style={{ backgroundColor: rec.carColor }}
                    />
                    <span className="font-medium text-zinc-100">{rec.driverName}</span>
                    <span className="text-zinc-500 capitalize">· {rec.weather}</span>
                  </div>
                  <span className="font-mono-num font-bold text-amber-400">
                    {formatRaceTime(rec.lapTimeMs)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : currentRoom ? (
          /* ACTIVE ROOM LOBBY */
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between p-4 rounded bg-[#131824] border border-white/12">
              <div>
                <div className="text-xs text-zinc-400">Active Room · Share Code with Friends</div>
                <div className="flex items-center gap-3 mt-1">
                  <span
                    className="font-display font-bold text-2xl text-amber-400 tracking-widest font-mono-num"
                    data-testid="room-code"
                  >
                    {currentRoom.code}
                  </span>
                  <span className="text-sm text-zinc-200 font-medium">{currentRoom.name}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onLeaveRoom}
                className="flex items-center gap-1.5 px-3 py-2 rounded bg-white/8 hover:bg-red-500/20 text-xs text-zinc-200 cursor-pointer transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Leave
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                <span>Connected Drivers ({currentRoom.players.length}/8)</span>
                <span className="capitalize">
                  {currentRoom.weather} · {currentRoom.timeOfDay} · {currentRoom.totalLaps} Laps
                </span>
              </div>
              <div className="rounded bg-[#111520] border border-white/10 divide-y divide-white/8">
                {currentRoom.players.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-2 h-4 rounded-xs"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="font-medium text-white">
                        {p.name} {p.id === playerId ? '(You)' : ''}
                      </span>
                      {p.isHost && <span className="text-amber-400">· Host</span>}
                    </div>
                    <span className={p.ready ? 'text-emerald-400 font-medium' : 'text-zinc-400'}>
                      {p.ready ? 'Ready' : 'Waiting'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              {!isHost && (
                <button
                  type="button"
                  onClick={() => onToggleReady(!me?.ready)}
                  className="flex-1 py-2.5 rounded bg-[#182030] hover:bg-[#222d42] border border-white/12 text-sm font-medium text-white cursor-pointer"
                >
                  {me?.ready ? 'Set Not Ready' : 'Ready Up'}
                </button>
              )}
              {isHost ? (
                <button
                  type="button"
                  onClick={onStartOnlineRace}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display font-bold text-sm cursor-pointer transition-colors"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Start Online Race
                </button>
              ) : (
                <div className="flex-1 text-center text-xs text-zinc-400">
                  Waiting for host to launch race...
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ROOM BROWSER & CREATE / JOIN */
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Create Room */}
              <div className="p-4 rounded bg-[#131824] border border-white/10 space-y-2.5">
                <div className="text-xs font-semibold text-zinc-200">Create Private Room</div>
                <input
                  type="text"
                  maxLength={22}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Room title (optional)"
                  className="w-full px-3 py-2 rounded bg-[#0c1018] border border-white/12 text-xs text-white focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  disabled={!connected}
                  onClick={() => onCreateRoom(roomName)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-45 text-zinc-950 font-display font-bold text-xs cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create Room
                </button>
              </div>

              {/* Join by Code */}
              <form
                onSubmit={handleJoinSubmit}
                className="p-4 rounded bg-[#131824] border border-white/10 space-y-2.5"
              >
                <div className="text-xs font-semibold text-zinc-200">Join by Room Code</div>
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. OPEN"
                  className="w-full px-3 py-2 rounded bg-[#0c1018] border border-white/12 text-xs font-mono-num uppercase text-white focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  disabled={!connected || !joinCode.trim()}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded bg-[#1d2536] hover:bg-[#273248] disabled:opacity-45 border border-white/12 text-white font-semibold text-xs cursor-pointer transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Join Room
                </button>
              </form>
            </div>

            {/* Active Public Rooms */}
            <div>
              <div className="text-xs font-medium text-zinc-400 mb-2">Active Race Rooms</div>
              <div className="rounded bg-[#111520] border border-white/10 divide-y divide-white/8">
                {rooms.length === 0 ? (
                  <div className="px-4 py-5 text-center text-xs text-zinc-500">
                    No active rooms found. Create one above to host a grid.
                  </div>
                ) : (
                  rooms.map((room) => (
                    <div
                      key={room.code}
                      className="flex items-center justify-between px-4 py-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-zinc-100 flex items-center gap-2">
                          <span className="font-mono-num text-amber-400">{room.code}</span>
                          <span>{room.name}</span>
                        </div>
                        <div className="text-zinc-400 mt-0.5 capitalize">
                          {room.playerCount}/{room.maxPlayers} drivers · {room.weather} ·{' '}
                          {room.timeOfDay} · {room.status}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!connected}
                        onClick={() => onJoinRoom(room.code)}
                        className="px-3.5 py-1.5 rounded bg-white/10 hover:bg-amber-500 hover:text-zinc-950 text-zinc-100 font-semibold transition-colors cursor-pointer"
                      >
                        Join
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
