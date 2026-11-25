import React, { useMemo } from 'react';
import {
  Camera,
  CloudFog,
  CloudLightning,
  CloudRain,
  Disc3,
  Moon,
  Pause,
  RotateCcw,
  Sliders,
  Sun,
  Sunset,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ALPINE_TRACK } from '../sim/track';
import { formatRaceTime } from '../sim/leaderboard';
import type { CameraMode, HudSnapshot, TimeOfDay, WeatherMode } from '../sim/types';

interface RaceHudProps {
  hud: HudSnapshot;
  weather: WeatherMode;
  timeOfDay: TimeOfDay;
  cameraMode: CameraMode;
  muted: boolean;
  roomCode: string | null;
  onCycleWeather: () => void;
  onCycleTime: () => void;
  onCycleCamera: () => void;
  onOpenTuning: () => void;
  onOpenWheel: () => void;
  onOpenMultiplayer: () => void;
  onToggleMute: () => void;
  onResetCar: () => void;
  onPause: () => void;
}

const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: 'Chase',
  close: 'Close',
  hood: 'Hood',
  cockpit: 'Cockpit',
};

export const RaceHud: React.FC<RaceHudProps> = ({
  hud,
  weather,
  timeOfDay,
  cameraMode,
  muted,
  roomCode,
  onCycleWeather,
  onCycleTime,
  onCycleCamera,
  onOpenTuning,
  onOpenWheel,
  onOpenMultiplayer,
  onToggleMute,
  onResetCar,
  onPause,
}) => {
  const minimap = useMemo(() => ALPINE_TRACK.getMinimapSvgPoints(156, 124, 14), []);

  // SVG Tachometer Arc math (220° sweep)
  const rpmRatio = Math.max(0, Math.min(1, hud.rpm / hud.maxRpm));
  const arcRadius = 56;
  const arcCircumference = 2 * Math.PI * arcRadius;
  const arcMaxLen = arcCircumference * 0.64; // ~230 deg sweep
  const rpmDashLen = arcMaxLen * rpmRatio;
  const isRedline = rpmRatio > 0.87;
  const gearLabel = hud.gear === -1 ? 'R' : hud.gear === 0 ? 'N' : String(hud.gear);

  const weatherIcon =
    weather === 'clear' ? (
      <Sun className="w-4 h-4" />
    ) : weather === 'fog' ? (
      <CloudFog className="w-4 h-4" />
    ) : weather === 'rain' ? (
      <CloudRain className="w-4 h-4" />
    ) : (
      <CloudLightning className="w-4 h-4" />
    );

  const timeIcon =
    timeOfDay === 'day' ? (
      <Sun className="w-4 h-4" />
    ) : timeOfDay === 'sunset' ? (
      <Sunset className="w-4 h-4" />
    ) : (
      <Moon className="w-4 h-4" />
    );

  const blurOnClick = (fn: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    fn();
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 sm:p-5">
      {/* TOP PERIMETER ROW: Live Leaderboard (Left) + Lap Timing & Compact Utility Controls (Right) */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left: Live Race Leaderboard */}
        <div
          className="w-[238px] rounded bg-[#0a0d14]/86 border border-white/10 px-3 py-2.5 shadow-lg"
          aria-label="Live race leaderboard"
        >
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10 text-[11px] text-zinc-400">
            <span className="font-display font-semibold text-zinc-200 tracking-wide">
              {roomCode ? `LIVE GRID · ${roomCode}` : 'STANDINGS'}
            </span>
            <span className="font-mono-num">
              P{hud.position}/{hud.totalRacers}
            </span>
          </div>
          <div className="space-y-1">
            {hud.leaderboard.slice(0, 6).map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center justify-between text-xs px-1.5 py-0.5 rounded-sm ${
                  entry.isPlayer ? 'bg-amber-500/20 text-white font-semibold' : 'text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono-num w-3.5 text-zinc-400 text-[11px]">
                    {entry.position}
                  </span>
                  <span
                    className="w-1 h-3 rounded-xs shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="truncate max-w-[116px]">{entry.name}</span>
                </div>
                <span className="font-mono-num text-[11px] text-zinc-400 shrink-0 ml-2">
                  {entry.position === 1
                    ? `L${entry.lap}`
                    : `+${entry.gapSeconds.toFixed(1)}s`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Center Top Banner: Green Flag or Wrong Way alert */}
        <div className="flex flex-col items-center">
          {hud.countdownText && (
            <div className="px-5 py-1.5 rounded bg-emerald-500/90 text-zinc-950 font-display font-bold text-lg tracking-wider shadow-lg">
              {hud.countdownText}
            </div>
          )}
          {hud.wrongWay && (
            <div className="mt-2 px-4 py-1.5 rounded bg-red-600/95 text-white font-display font-bold text-sm tracking-wider shadow-lg">
              WRONG WAY · PRESS R TO RESET
            </div>
          )}
        </div>

        {/* Top-Right: Lap Timing + Compact Square Icon Controls */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-4 rounded bg-[#0a0d14]/86 border border-white/10 px-3.5 py-2 shadow-lg">
            <div className="text-right">
              <div className="text-[10px] text-zinc-400 tracking-wider font-medium">LAP</div>
              <div className="font-display font-bold text-xl leading-none text-white font-mono-num">
                {hud.lap}
                <span className="text-sm text-zinc-400">/{hud.totalLaps}</span>
              </div>
            </div>
            <div className="h-7 w-px bg-white/12" />
            <div className="text-right">
              <div className="text-[10px] text-zinc-400 tracking-wider font-medium">CURRENT</div>
              <div className="font-mono-num text-sm font-bold text-zinc-100 leading-tight">
                {formatRaceTime(hud.currentLapMs)}
              </div>
            </div>
            <div className="hidden sm:block text-right">
              <div className="text-[10px] text-zinc-400 tracking-wider font-medium">BEST</div>
              <div className="font-mono-num text-sm font-bold text-amber-400 leading-tight">
                {formatRaceTime(hud.bestLapMs)}
              </div>
            </div>
          </div>

          {/* Utility Icon Action Row */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              onClick={blurOnClick(onCycleWeather)}
              aria-label={`Weather: ${weather}. Click to change weather`}
              title={`Weather: ${weather}`}
              className="h-9 px-2.5 rounded bg-[#0a0d14]/90 hover:bg-[#171d2b] border border-white/12 text-zinc-200 flex items-center gap-1.5 text-xs cursor-pointer transition-colors"
            >
              {weatherIcon}
              <span className="hidden md:inline capitalize">{weather}</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={blurOnClick(onCycleTime)}
              aria-label={`Lighting: ${timeOfDay}. Click to change time of day`}
              title={`Lighting: ${timeOfDay} [L]`}
              className="h-9 px-2.5 rounded bg-[#0a0d14]/90 hover:bg-[#171d2b] border border-white/12 text-zinc-200 flex items-center gap-1.5 text-xs cursor-pointer transition-colors"
            >
              {timeIcon}
              <span className="hidden md:inline capitalize">{timeOfDay}</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={blurOnClick(onCycleCamera)}
              aria-label={`Camera: ${CAMERA_LABELS[cameraMode]}. Press C to switch`}
              title={`Camera: ${CAMERA_LABELS[cameraMode]} [C]`}
              className="h-9 px-2.5 rounded bg-[#0a0d14]/90 hover:bg-[#171d2b] border border-white/12 text-zinc-200 flex items-center gap-1.5 text-xs cursor-pointer transition-colors"
            >
              <Camera className="w-4 h-4" />
              <span className="hidden md:inline">{CAMERA_LABELS[cameraMode]}</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={blurOnClick(onOpenTuning)}
              aria-label="Open Vehicle Tuning"
              title="Vehicle Tuning [T]"
              className="w-9 h-9 rounded bg-[#0a0d14]/90 hover:bg-[#171d2b] border border-white/12 text-amber-400 flex items-center justify-center cursor-pointer transition-colors"
            >
              <Sliders className="w-4 h-4" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={blurOnClick(onOpenWheel)}
              aria-label="Open Steering Wheel Setup"
              title="Steering Wheel Setup"
              className={`w-9 h-9 rounded bg-[#0a0d14]/90 hover:bg-[#171d2b] border border-white/12 flex items-center justify-center cursor-pointer transition-colors ${
                hud.wheelConnected ? 'text-emerald-400' : 'text-zinc-300'
              }`}
            >
              <Disc3 className="w-4 h-4" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={blurOnClick(onOpenMultiplayer)}
              aria-label="Open Multiplayer Lobby"
              title="Online Multiplayer"
              className={`w-9 h-9 rounded bg-[#0a0d14]/90 hover:bg-[#171d2b] border border-white/12 flex items-center justify-center cursor-pointer transition-colors ${
                roomCode ? 'text-amber-400' : 'text-zinc-300'
              }`}
            >
              <Users className="w-4 h-4" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={blurOnClick(onResetCar)}
              aria-label="Reset Car to Track"
              title="Reset Car [R]"
              className="w-9 h-9 rounded bg-[#0a0d14]/90 hover:bg-[#171d2b] border border-white/12 text-zinc-300 flex items-center justify-center cursor-pointer transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={blurOnClick(onToggleMute)}
              aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
              title="Toggle Audio [M]"
              className="w-9 h-9 rounded bg-[#0a0d14]/90 hover:bg-[#171d2b] border border-white/12 text-zinc-300 flex items-center justify-center cursor-pointer transition-colors"
            >
              {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={blurOnClick(onPause)}
              aria-label="Pause Race"
              title="Pause [Esc / P]"
              className="w-9 h-9 rounded bg-[#0a0d14]/90 hover:bg-[#171d2b] border border-white/12 text-zinc-100 flex items-center justify-center cursor-pointer transition-colors"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* BOTTOM PERIMETER ROW: Projected Track Minimap (Left) + Bespoke Tachometer & Speed Cluster (Right) */}
      <div className="flex items-end justify-between gap-4">
        {/* Bottom-Left: Real-time Projected Circuit Minimap */}
        <div className="flex flex-col gap-1.5">
          <div className="rounded bg-[#0a0d14]/84 border border-white/10 p-2 shadow-lg">
            <svg viewBox="0 0 156 124" className="w-[150px] h-[118px]" aria-label="Track minimap">
              <path
                d={minimap.pathD}
                fill="none"
                stroke="#272c38"
                strokeWidth="7"
                strokeLinejoin="round"
              />
              <path
                d={minimap.pathD}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              {hud.minimapRacers.map((r) => {
                const { mx, my } = minimap.mapPoint(r.x, r.z);
                return (
                  <circle
                    key={r.id}
                    cx={mx}
                    cy={my}
                    r={r.isPlayer ? 4.8 : 3.2}
                    fill={r.isPlayer ? '#f59e0b' : r.color}
                    stroke="#090b0f"
                    strokeWidth={r.isPlayer ? 1.5 : 1}
                  />
                );
              })}
            </svg>
          </div>
          {hud.wheelConnected && (
            <div className="text-[11px] text-zinc-300 hud-text-shadow px-1">
              Wheel Active · {hud.wheelName.slice(0, 26)}
            </div>
          )}
        </div>

        {/* Bottom-Right: Bespoke Motorsport Tachometer, Speedometer, Gear & Pedal Telemetry */}
        <div className="flex items-end gap-3 rounded bg-[#0a0d14]/86 border border-white/10 px-4 py-3 shadow-lg">
          {/* Steering & Pedal Telemetry Bars */}
          <div className="flex flex-col justify-end gap-2 pb-1">
            {/* Throttle / Brake vertical bars */}
            <div className="flex items-end gap-1.5 h-16">
              <div className="flex flex-col items-center gap-1">
                <div className="w-2.5 h-14 bg-white/10 rounded-xs overflow-hidden flex items-end">
                  <div
                    className="w-full bg-red-500 transition-transform duration-75 origin-bottom"
                    style={{ height: '100%', transform: `scaleY(${Math.max(0.02, hud.brake)})` }}
                  />
                </div>
                <span className="text-[9px] text-zinc-400 font-mono-num">BRK</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-2.5 h-14 bg-white/10 rounded-xs overflow-hidden flex items-end">
                  <div
                    className="w-full bg-emerald-400 transition-transform duration-75 origin-bottom"
                    style={{ height: '100%', transform: `scaleY(${Math.max(0.02, hud.throttle)})` }}
                  />
                </div>
                <span className="text-[9px] text-zinc-400 font-mono-num">THR</span>
              </div>
            </div>
            {/* Surface & Slip readout */}
            <div className="text-[10px] font-mono-num text-zinc-400 text-center uppercase">
              {hud.slipRatio > 0.35 ? (
                <span className="text-amber-400 font-bold">SLIP</span>
              ) : (
                hud.surface
              )}
            </div>
          </div>

          {/* Inline SVG Radial Tachometer + Digital Speed & Gear */}
          <div className="relative w-[138px] h-[126px] flex items-center justify-center">
            <svg viewBox="0 0 140 130" className="w-full h-full">
              {/* Background Track Arc */}
              <circle
                cx="70"
                cy="70"
                r={arcRadius}
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="8"
                strokeDasharray={`${arcMaxLen} ${arcCircumference}`}
                strokeLinecap="butt"
                transform="rotate(155 70 70)"
              />
              {/* Redline zone tick */}
              <circle
                cx="70"
                cy="70"
                r={arcRadius}
                fill="none"
                stroke="rgba(239,68,68,0.4)"
                strokeWidth="8"
                strokeDasharray={`${arcMaxLen * 0.16} ${arcCircumference}`}
                strokeDashoffset={-(arcMaxLen * 0.84)}
                transform="rotate(155 70 70)"
              />
              {/* Active RPM Fill */}
              <circle
                cx="70"
                cy="70"
                r={arcRadius}
                fill="none"
                stroke={isRedline ? '#ef4444' : '#f59e0b'}
                strokeWidth="8"
                strokeDasharray={`${rpmDashLen} ${arcCircumference}`}
                strokeLinecap="butt"
                transform="rotate(155 70 70)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
              <div
                className="font-display font-bold text-4xl leading-none text-white font-mono-num"
                data-testid="hud-speed"
              >
                {hud.speedKmh}
              </div>
              <div className="text-[10px] text-zinc-400 tracking-widest mt-0.5">KM/H</div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[10px] font-mono-num text-zinc-400">
                  {(hud.rpm / 1000).toFixed(1)}k
                </span>
                <span className="px-2 py-0.5 rounded-xs bg-amber-500 text-zinc-950 font-display font-bold text-xs leading-none">
                  {gearLabel}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
