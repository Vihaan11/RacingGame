import React from 'react';
import { CloudRain, CloudFog, Sun, CloudLightning, Sunset, Moon, Sliders, Users, Disc3, Play } from 'lucide-react';
import type { TimeOfDay, WeatherMode } from '../sim/types';

interface TitleOverlayProps {
  weather: WeatherMode;
  timeOfDay: TimeOfDay;
  wheelConnected: boolean;
  wheelName: string;
  onlineConnected: boolean;
  onlineRoomCode: string | null;
  onStartSolo: () => void;
  onOpenMultiplayer: () => void;
  onOpenTuning: () => void;
  onOpenWheel: () => void;
  onChangeWeather: (w: WeatherMode) => void;
  onChangeTime: (t: TimeOfDay) => void;
}

const WEATHER_OPTIONS: Array<{ id: WeatherMode; label: string; icon: React.ReactNode }> = [
  { id: 'clear', label: 'Clear', icon: <Sun className="w-3.5 h-3.5" /> },
  { id: 'fog', label: 'Fog', icon: <CloudFog className="w-3.5 h-3.5" /> },
  { id: 'rain', label: 'Rain', icon: <CloudRain className="w-3.5 h-3.5" /> },
  { id: 'storm', label: 'Storm', icon: <CloudLightning className="w-3.5 h-3.5" /> },
];

const TIME_OPTIONS: Array<{ id: TimeOfDay; label: string; icon: React.ReactNode }> = [
  { id: 'day', label: 'Day', icon: <Sun className="w-3.5 h-3.5" /> },
  { id: 'sunset', label: 'Sunset', icon: <Sunset className="w-3.5 h-3.5" /> },
  { id: 'night', label: 'Night', icon: <Moon className="w-3.5 h-3.5" /> },
];

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  weather,
  timeOfDay,
  wheelConnected,
  wheelName,
  onlineConnected,
  onlineRoomCode,
  onStartSolo,
  onOpenMultiplayer,
  onOpenTuning,
  onOpenWheel,
  onChangeWeather,
  onChangeTime,
}) => {
  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between">
      {/* Left-third calm atmospheric gradient scrim so 3D car on right-center stays razor sharp */}
      <div
        className="absolute inset-y-0 left-0 w-full max-w-[560px] pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(8,10,15,0.92) 0%, rgba(8,10,15,0.74) 58%, rgba(8,10,15,0) 100%)',
        }}
      />

      {/* Top safe margin: quiet circuit metadata */}
      <div className="relative z-10 flex items-center justify-between px-8 pt-7">
        <div className="flex items-center gap-3 text-xs text-zinc-400 tracking-wide">
          <span className="font-semibold text-zinc-200">Circuito delle Alpi</span>
          <span aria-hidden="true">·</span>
          <span>1.45 km GT3 Grand Prix</span>
          {wheelConnected && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-amber-400 truncate max-w-[200px]">Wheel: {wheelName}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span>{onlineConnected ? (onlineRoomCode ? `Online Room ${onlineRoomCode}` : 'Online Server Ready') : 'Connecting Server...'}</span>
        </div>
      </div>

      {/* Left-third Hero Title Lockup + Primary CTA */}
      <div className="relative z-10 px-8 sm:px-12 max-w-[490px] pointer-events-auto">
        {/* Bespoke inline SVG Motorsport Title Emblem */}
        <svg
          viewBox="0 0 420 94"
          className="w-full max-w-[390px] h-auto mb-3"
          role="img"
          aria-label="VELOCE GT"
        >
          {/* Racing apex geometric chevron emblem */}
          <polygon points="0,12 24,12 10,80 0,80" fill="#dc2626" />
          <polygon points="28,12 40,12 26,80 14,80" fill="#f59e0b" />
          {/* Display wordmark */}
          <text
            x="52"
            y="60"
            fill="#f8fafc"
            fontFamily="Chakra Petch, sans-serif"
            fontWeight="700"
            fontStyle="italic"
            fontSize="56"
            letterSpacing="2"
          >
            VELOCE
          </text>
          <text
            x="276"
            y="60"
            fill="#f59e0b"
            fontFamily="Chakra Petch, sans-serif"
            fontWeight="700"
            fontStyle="italic"
            fontSize="56"
            letterSpacing="1"
          >
            GT
          </text>
          {/* Precision track underline */}
          <rect x="52" y="72" width="320" height="3" fill="#f8fafc" fillOpacity="0.22" />
          <rect x="52" y="72" width="118" height="3" fill="#f59e0b" />
        </svg>

        <p className="text-sm text-zinc-300 leading-relaxed mb-7 max-w-[380px] hud-text-shadow">
          Precision GT3 physics, live weather &amp; lighting, steering wheel force feedback, custom vehicle setup, and real-time online races.
        </p>

        {/* Primary CTA + Compact Secondary Actions */}
        <div className="flex flex-col gap-3 max-w-[340px]">
          <button
            type="button"
            data-start="true"
            onClick={onStartSolo}
            className="flex items-center justify-center gap-2.5 w-full py-3.5 px-6 rounded bg-amber-500 hover:bg-amber-400 active:translate-y-[1px] text-zinc-950 font-display font-bold text-base tracking-wide transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          >
            <Play className="w-4 h-4 fill-current" />
            Race Now
          </button>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onOpenMultiplayer}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded bg-[#121620]/95 hover:bg-[#1b2232] border border-white/12 text-zinc-100 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Multiplayer</span>
            </button>
            <button
              type="button"
              onClick={onOpenTuning}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded bg-[#121620]/95 hover:bg-[#1b2232] border border-white/12 text-zinc-100 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Tuning</span>
            </button>
            <button
              type="button"
              onClick={onOpenWheel}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded bg-[#121620]/95 hover:bg-[#1b2232] border border-white/12 text-zinc-100 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Disc3 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Wheel</span>
            </button>
          </div>
        </div>

        {/* Live Showcase Environment Selectors */}
        <div className="mt-7 pt-5 border-t border-white/10 max-w-[340px] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-400 font-medium">Weather</span>
            <div className="flex items-center gap-1 bg-[#10141d]/90 p-1 rounded border border-white/10">
              {WEATHER_OPTIONS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onChangeWeather(w.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    weather === w.id
                      ? 'bg-amber-500 text-zinc-950'
                      : 'text-zinc-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {w.icon}
                  <span>{w.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-400 font-medium">Lighting</span>
            <div className="flex items-center gap-1 bg-[#10141d]/90 p-1 rounded border border-white/10">
              {TIME_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChangeTime(t.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    timeOfDay === t.id
                      ? 'bg-amber-500 text-zinc-950'
                      : 'text-zinc-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Single flat borderless control-hint line in bottom safe margin */}
      <div className="relative z-10 px-8 pb-6 flex items-center justify-between text-xs text-zinc-400 hud-text-shadow">
        <p>
          WASD / Arrows Drive · Space Handbrake · C Camera · T Tuning · L Lighting · R Reset · Esc Pause
        </p>
        <p className="hidden sm:block text-zinc-500">Press Enter to start</p>
      </div>
    </div>
  );
};
