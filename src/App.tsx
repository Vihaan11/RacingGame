import { useCallback, useEffect, useRef, useState } from 'react';
import { RacingEngine } from './render/RacingEngine';
import { MultiplayerClient } from './net/multiplayerClient';
import {
  DEFAULT_TUNING,
  DEFAULT_WHEEL_SETTINGS,
  type CameraMode,
  type FinishSummary,
  type GameState,
  type HudSnapshot,
  type TimeOfDay,
  type TuningConfig,
  type WeatherMode,
  type WheelSettings,
} from './sim/types';
import type { RoomSnapshot, RoomSummary, TrackRecord } from './shared/protocol';
import { TitleOverlay } from './components/TitleOverlay';
import { RaceHud } from './components/RaceHud';
import { TuningModal } from './components/TuningModal';
import { MultiplayerModal } from './components/MultiplayerModal';
import { WheelModal } from './components/WheelModal';
import { FinishModal, PauseModal } from './components/PauseFinishModal';

type OverlayModal = 'none' | 'tuning' | 'multiplayer' | 'wheel';

const WEATHER_ORDER: WeatherMode[] = ['clear', 'fog', 'rain', 'storm'];
const TIME_ORDER: TimeOfDay[] = ['day', 'sunset', 'night'];
const CAMERA_ORDER: CameraMode[] = ['chase', 'close', 'hood', 'cockpit'];

const INITIAL_HUD: HudSnapshot = {
  speedKmh: 0,
  rpm: 1150,
  maxRpm: 8600,
  gear: 1,
  throttle: 0,
  brake: 0,
  steer: 0,
  slipRatio: 0,
  surface: 'asphalt',
  lap: 1,
  totalLaps: 3,
  currentLapMs: 0,
  bestLapMs: null,
  totalRaceMs: 0,
  position: 1,
  totalRacers: 6,
  topSpeedKmh: 0,
  wrongWay: false,
  countdownText: null,
  leaderboard: [],
  minimapRacers: [],
  wheelConnected: false,
  wheelName: '',
  inputSource: 'keyboard',
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RacingEngine | null>(null);
  const mpClientRef = useRef<MultiplayerClient | null>(null);

  const [gameState, setGameState] = useState<GameState>('title');
  const [activeModal, setActiveModal] = useState<OverlayModal>('none');
  const [weather, setWeather] = useState<WeatherMode>('clear');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [muted, setMuted] = useState(false);

  const [tuning, setTuning] = useState<TuningConfig>(() =>
    loadJson('veloce_tuning_v1', DEFAULT_TUNING),
  );
  const [wheelSettings, setWheelSettings] = useState<WheelSettings>(() =>
    loadJson('veloce_wheel_v1', DEFAULT_WHEEL_SETTINGS),
  );
  const [driverName, setDriverName] = useState<string>(() => {
    try {
      return window.localStorage.getItem('veloce_driver_name') || 'Driver 01';
    } catch {
      return 'Driver 01';
    }
  });

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [finishSummary, setFinishSummary] = useState<FinishSummary | null>(null);

  // Multiplayer state
  const [mpConnected, setMpConnected] = useState(false);
  const [mpPlayerId, setMpPlayerId] = useState('');
  const [mpRooms, setMpRooms] = useState<RoomSummary[]>([]);
  const [currentRoom, setCurrentRoom] = useState<RoomSnapshot | null>(null);
  const [trackRecords, setTrackRecords] = useState<TrackRecord[]>([]);
  const [mpError, setMpError] = useState<string | null>(null);

  // Refs for fresh state inside engine callbacks without remounting WebGL
  const stateRef = useRef({
    gameState,
    activeModal,
    weather,
    timeOfDay,
    cameraMode,
    muted,
    driverName,
    tuning,
    currentRoom,
  });
  stateRef.current = {
    gameState,
    activeModal,
    weather,
    timeOfDay,
    cameraMode,
    muted,
    driverName,
    tuning,
    currentRoom,
  };

  // Sync document.body.dataset.state immediately
  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  const transitionToPlaying = useCallback((isMultiplayer: boolean, gridSlot = 0) => {
    document.body.dataset.state = 'playing';
    (document.activeElement as HTMLElement | null)?.blur?.();
    setFinishSummary(null);
    setActiveModal('none');
    setGameState('playing');
    engineRef.current?.startNewRace(isMultiplayer, gridSlot);
    engineRef.current?.setGameState('playing');
  }, []);

  const handleStartSolo = useCallback(() => {
    if (mpClientRef.current?.currentRoom) {
      mpClientRef.current.leaveRoom();
    }
    transitionToPlaying(false, 0);
  }, [transitionToPlaying]);

  const handleResume = useCallback(() => {
    document.body.dataset.state = 'playing';
    (document.activeElement as HTMLElement | null)?.blur?.();
    setActiveModal('none');
    setGameState('playing');
    engineRef.current?.setGameState('playing');
  }, []);

  const handlePause = useCallback(() => {
    document.body.dataset.state = 'paused';
    setActiveModal('none');
    setGameState('paused');
    engineRef.current?.setGameState('paused');
  }, []);

  const handleReturnTitle = useCallback(() => {
    document.body.dataset.state = 'title';
    setActiveModal('none');
    setFinishSummary(null);
    setGameState('title');
    engineRef.current?.setGameState('title');
  }, []);

  const handleChangeWeather = useCallback((nextWeather: WeatherMode) => {
    setWeather(nextWeather);
    engineRef.current?.setWeather(nextWeather);
    if (mpClientRef.current?.currentRoom) {
      mpClientRef.current.updateRoomSettings(nextWeather, stateRef.current.timeOfDay);
    }
  }, []);

  const handleChangeTime = useCallback((nextTime: TimeOfDay) => {
    setTimeOfDay(nextTime);
    engineRef.current?.setTimeOfDay(nextTime);
    if (mpClientRef.current?.currentRoom) {
      mpClientRef.current.updateRoomSettings(stateRef.current.weather, nextTime);
    }
  }, []);

  const handleCycleWeather = useCallback(() => {
    const idx = WEATHER_ORDER.indexOf(stateRef.current.weather);
    handleChangeWeather(WEATHER_ORDER[(idx + 1) % WEATHER_ORDER.length]);
  }, [handleChangeWeather]);

  const handleCycleTime = useCallback(() => {
    const idx = TIME_ORDER.indexOf(stateRef.current.timeOfDay);
    handleChangeTime(TIME_ORDER[(idx + 1) % TIME_ORDER.length]);
  }, [handleChangeTime]);

  const handleCycleCamera = useCallback(() => {
    const idx = CAMERA_ORDER.indexOf(stateRef.current.cameraMode);
    const next = CAMERA_ORDER[(idx + 1) % CAMERA_ORDER.length];
    setCameraMode(next);
    engineRef.current?.setCameraMode(next);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleTuningChange = useCallback((next: TuningConfig) => {
    setTuning(next);
    engineRef.current?.setTuning(next);
    try {
      window.localStorage.setItem('veloce_tuning_v1', JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleWheelSettingsChange = useCallback((next: WheelSettings) => {
    setWheelSettings(next);
    engineRef.current?.setWheelSettings(next);
    try {
      window.localStorage.setItem('veloce_wheel_v1', JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const handleDriverNameChange = useCallback((name: string) => {
    setDriverName(name);
    engineRef.current?.setDriverName(name);
    try {
      window.localStorage.setItem('veloce_driver_name', name);
    } catch {
      // ignore
    }
  }, []);

  // Mount Three.js RacingEngine ONCE
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new RacingEngine(mount, tuning, wheelSettings, {
      onHudUpdate: (snap) => setHud(snap),
      onFinish: (summary) => {
        document.body.dataset.state = 'gameover';
        setFinishSummary(summary);
        setGameState('gameover');
        engine.setGameState('gameover');
        if (summary.bestLapMs && mpClientRef.current?.connected) {
          mpClientRef.current.submitTrackRecord(
            stateRef.current.driverName,
            summary.bestLapMs,
            stateRef.current.weather,
            stateRef.current.tuning.liveryColor,
          );
        }
      },
      onActionHotkey: (action) => {
        const s = stateRef.current;
        if (action === 'camera') {
          handleCycleCamera();
        } else if (action === 'lighting') {
          handleCycleTime();
        } else if (action === 'weather') {
          handleCycleWeather();
        } else if (action === 'mute') {
          handleToggleMute();
        } else if (action === 'tuning') {
          setActiveModal((prev) => (prev === 'tuning' ? 'none' : 'tuning'));
        } else if (action === 'pause') {
          if (s.activeModal !== 'none') {
            setActiveModal('none');
          } else if (s.gameState === 'playing') {
            handlePause();
          } else if (s.gameState === 'paused') {
            handleResume();
          }
        }
      },
      onTelemetryTick: (telemetry) => {
        mpClientRef.current?.sendTelemetry(telemetry);
      },
    });

    engine.setDriverName(driverName);
    engineRef.current = engine;

    // Support ?autostart=1 for instant launch
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      document.body.dataset.state = 'playing';
      setGameState('playing');
      engine.startNewRace(false, 0);
      engine.setGameState('playing');
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // Intentionally mounted once for stable WebGL lifecycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connect real-time WebSocket Multiplayer client ONCE
  useEffect(() => {
    let prevRoomStatus: string | null = null;
    const client = new MultiplayerClient({
      onConnectionChange: (conn) => setMpConnected(conn),
      onRoomsList: (rooms) => setMpRooms(rooms),
      onRecordsUpdate: (records) => setTrackRecords(records),
      onError: (message) => {
        setMpError(message);
        window.setTimeout(() => setMpError(null), 4000);
      },
      onRoomUpdate: (room, playerId) => {
        setMpPlayerId(playerId);
        setCurrentRoom(room);
        if (!room) {
          prevRoomStatus = null;
          engineRef.current?.syncRemotePlayers([], playerId, false);
          return;
        }

        // Sync room weather & lighting from host
        setWeather(room.weather);
        setTimeOfDay(room.timeOfDay);
        engineRef.current?.setWeather(room.weather);
        engineRef.current?.setTimeOfDay(room.timeOfDay);
        engineRef.current?.syncRemotePlayers(room.players, playerId, true);

        // Auto-launch race when room transitions into 'racing'
        if (room.status === 'racing' && prevRoomStatus !== 'racing') {
          const mySlot = Math.max(
            0,
            room.players.findIndex((p) => p.id === playerId),
          );
          transitionToPlaying(true, mySlot);
        }
        prevRoomStatus = room.status;
      },
    });

    mpClientRef.current = client;
    client.connect();

    return () => {
      client.dispose();
      mpClientRef.current = null;
    };
  }, [transitionToPlaying]);

  // Title Screen Enter / Space start handshake (only when no modal is open)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (stateRef.current.gameState !== 'title' || stateRef.current.activeModal !== 'none') {
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        handleStartSolo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStartSolo]);

  const handleCreateRoom = (roomName: string) => {
    setMpError(null);
    mpClientRef.current?.createRoom(
      driverName,
      tuning.liveryColor,
      weather,
      timeOfDay,
      roomName || undefined,
    );
  };

  const handleJoinRoom = (code: string) => {
    setMpError(null);
    mpClientRef.current?.joinRoom(code, driverName, tuning.liveryColor);
  };

  const handleLeaveRoom = () => {
    mpClientRef.current?.leaveRoom();
  };

  const handleToggleReady = (ready: boolean) => {
    mpClientRef.current?.setReady(ready);
  };

  const handleStartOnlineRace = () => {
    mpClientRef.current?.startRoomRace();
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#090b0f]">
      {/* Isolated WebGL mount container: React UI updates never remount the 3D scene */}
      <div ref={canvasMountRef} className="fixed inset-0 z-0" />

      {/* Title Screen Shell */}
      {gameState === 'title' && (
        <TitleOverlay
          weather={weather}
          timeOfDay={timeOfDay}
          wheelConnected={hud.wheelConnected}
          wheelName={hud.wheelName}
          onlineConnected={mpConnected}
          onlineRoomCode={currentRoom?.code ?? null}
          onStartSolo={handleStartSolo}
          onOpenMultiplayer={() => setActiveModal('multiplayer')}
          onOpenTuning={() => setActiveModal('tuning')}
          onOpenWheel={() => setActiveModal('wheel')}
          onChangeWeather={handleChangeWeather}
          onChangeTime={handleChangeTime}
        />
      )}

      {/* Active Gameplay HUD */}
      {gameState === 'playing' && (
        <RaceHud
          hud={hud}
          weather={weather}
          timeOfDay={timeOfDay}
          cameraMode={cameraMode}
          muted={muted}
          roomCode={currentRoom?.code ?? null}
          onCycleWeather={handleCycleWeather}
          onCycleTime={handleCycleTime}
          onCycleCamera={handleCycleCamera}
          onOpenTuning={() => setActiveModal('tuning')}
          onOpenWheel={() => setActiveModal('wheel')}
          onOpenMultiplayer={() => setActiveModal('multiplayer')}
          onToggleMute={handleToggleMute}
          onResetCar={() => engineRef.current?.resetCarToTrack()}
          onPause={handlePause}
        />
      )}

      {/* Pause Modal */}
      {gameState === 'paused' && activeModal === 'none' && (
        <PauseModal
          hud={hud}
          onResume={handleResume}
          onRestart={() => transitionToPlaying(Boolean(currentRoom), 0)}
          onOpenTuning={() => setActiveModal('tuning')}
          onOpenWheel={() => setActiveModal('wheel')}
          onReturnTitle={handleReturnTitle}
        />
      )}

      {/* Race Finish / Checkered Flag Modal */}
      {gameState === 'gameover' && finishSummary && activeModal === 'none' && (
        <FinishModal
          summary={finishSummary}
          onRaceAgain={() => transitionToPlaying(Boolean(currentRoom), 0)}
          onReturnTitle={handleReturnTitle}
        />
      )}

      {/* Interactive Garage & Configuration Modals */}
      {activeModal === 'tuning' && (
        <TuningModal
          tuning={tuning}
          onChange={handleTuningChange}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'multiplayer' && (
        <MultiplayerModal
          connected={mpConnected}
          playerId={mpPlayerId}
          driverName={driverName}
          onChangeDriverName={handleDriverNameChange}
          rooms={mpRooms}
          currentRoom={currentRoom}
          records={trackRecords}
          errorMessage={mpError}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onLeaveRoom={handleLeaveRoom}
          onToggleReady={handleToggleReady}
          onStartOnlineRace={handleStartOnlineRace}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'wheel' && (
        <WheelModal
          settings={wheelSettings}
          connected={hud.wheelConnected}
          deviceName={hud.wheelName}
          liveSteer={hud.steer}
          liveThrottle={hud.throttle}
          liveBrake={hud.brake}
          onChange={handleWheelSettingsChange}
          onTestFfb={() => engineRef.current?.testForceFeedback()}
          onClose={() => setActiveModal('none')}
        />
      )}
    </div>
  );
}
