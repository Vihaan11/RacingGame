import React from 'react';
import { X, Disc3, Vibrate, RotateCcw } from 'lucide-react';
import { DEFAULT_WHEEL_SETTINGS, type WheelSettings } from '../sim/types';

interface WheelModalProps {
  settings: WheelSettings;
  connected: boolean;
  deviceName: string;
  liveSteer: number;
  liveThrottle: number;
  liveBrake: number;
  onChange: (next: WheelSettings) => void;
  onTestFfb: () => void;
  onClose: () => void;
}

export const WheelModal: React.FC<WheelModalProps> = ({
  settings,
  connected,
  deviceName,
  liveSteer,
  liveThrottle,
  liveBrake,
  onChange,
  onTestFfb,
  onClose,
}) => {
  const update = <K extends keyof WheelSettings>(key: K, val: WheelSettings[K]) => {
    onChange({ ...settings, [key]: val });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/65"
      role="dialog"
      aria-modal="true"
      aria-label="Steering Wheel and Pedal Calibration"
    >
      <div className="w-full max-w-[480px] max-h-[88vh] overflow-y-auto rounded bg-[#0c1018] border border-white/14 shadow-2xl p-6 text-zinc-100">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <h2 className="font-display font-bold text-xl tracking-wide text-white flex items-center gap-2">
              <Disc3 className="w-5 h-5 text-amber-400" />
              Steering Wheel &amp; Pedals
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Web Gamepad API · Logitech G29/G920, Thrustmaster, Fanatec &amp; Controllers
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_WHEEL_SETTINGS })}
              aria-label="Reset wheel calibration"
              title="Reset defaults"
              className="p-2 rounded hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Steering Wheel Setup"
              className="p-2 rounded hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Connected Peripheral Status & Live Visual Telemetry */}
        <div className="mt-4 p-4 rounded bg-[#131824] border border-white/10 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-zinc-400">Detected Peripheral</div>
            <div className={`text-sm font-semibold mt-0.5 truncate ${connected ? 'text-emerald-400' : 'text-zinc-300'}`}>
              {connected ? deviceName : 'No wheel or gamepad detected'}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              {connected
                ? 'Turn wheel or press pedals to verify live calibration.'
                : 'Connect your USB steering wheel or controller and press any button.'}
            </p>
          </div>

          {/* Live Rotating SVG Steering Wheel Preview */}
          <svg
            viewBox="0 0 80 80"
            className="w-16 h-16 shrink-0"
            aria-label="Live steering wheel angle"
          >
            <g transform={`rotate(${(liveSteer * 135).toFixed(1)} 40 40)`}>
              <circle cx="40" cy="40" r="32" fill="none" stroke="#334155" strokeWidth="7" />
              <rect x="37" y="5" width="6" height="8" rx="1" fill="#f59e0b" />
              <line x1="12" y1="40" x2="68" y2="40" stroke="#64748b" strokeWidth="5" />
              <line x1="40" y1="40" x2="40" y2="68" stroke="#64748b" strokeWidth="5" />
              <circle cx="40" cy="40" r="9" fill="#0f172a" stroke="#94a3b8" strokeWidth="2" />
            </g>
          </svg>
        </div>

        {/* Live Pedal Axis Bars */}
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div className="p-2.5 rounded bg-[#111520] border border-white/8">
            <div className="flex justify-between text-zinc-400 mb-1">
              <span>Throttle</span>
              <span className="font-mono-num text-emerald-400">{Math.round(liveThrottle * 100)}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded overflow-hidden">
              <div
                className="h-full bg-emerald-400"
                style={{ width: `${Math.round(liveThrottle * 100)}%` }}
              />
            </div>
          </div>
          <div className="p-2.5 rounded bg-[#111520] border border-white/8">
            <div className="flex justify-between text-zinc-400 mb-1">
              <span>Brake</span>
              <span className="font-mono-num text-red-400">{Math.round(liveBrake * 100)}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded overflow-hidden">
              <div
                className="h-full bg-red-500"
                style={{ width: `${Math.round(liveBrake * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Calibration Controls */}
        <div className="mt-5 space-y-4">
          <label className="flex items-center justify-between text-xs cursor-pointer">
            <span className="text-zinc-200 font-medium">Enable Steering Wheel / Gamepad Input</span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => update('enabled', e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </label>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <label htmlFor="wheel-deadzone" className="text-zinc-300">
                Center Deadzone
              </label>
              <span className="font-mono-num text-amber-400">
                {Math.round(settings.deadzone * 100)}%
              </span>
            </div>
            <input
              id="wheel-deadzone"
              type="range"
              min={0}
              max={0.2}
              step={0.01}
              value={settings.deadzone}
              onChange={(e) => update('deadzone', Number(e.target.value))}
              className="sim-slider"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <label htmlFor="wheel-linearity" className="text-zinc-300">
                Steering Linearity Curve
              </label>
              <span className="font-mono-num text-amber-400">{settings.linearity.toFixed(2)}</span>
            </div>
            <input
              id="wheel-linearity"
              type="range"
              min={0.6}
              max={2.2}
              step={0.05}
              value={settings.linearity}
              onChange={(e) => update('linearity', Number(e.target.value))}
              className="sim-slider"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <label htmlFor="wheel-sens" className="text-zinc-300">
                Steering Sensitivity
              </label>
              <span className="font-mono-num text-amber-400">
                {Math.round(settings.sensitivity * 100)}%
              </span>
            </div>
            <input
              id="wheel-sens"
              type="range"
              min={0.5}
              max={1.8}
              step={0.05}
              value={settings.sensitivity}
              onChange={(e) => update('sensitivity', Number(e.target.value))}
              className="sim-slider"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <label htmlFor="wheel-ffb" className="text-zinc-300">
                Force Feedback / Curb Rumble
              </label>
              <span className="font-mono-num text-amber-400">
                {Math.round(settings.ffbStrength * 100)}%
              </span>
            </div>
            <input
              id="wheel-ffb"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.ffbStrength}
              onChange={(e) => update('ffbStrength', Number(e.target.value))}
              className="sim-slider"
            />
          </div>

          <label className="flex items-center justify-between text-xs cursor-pointer">
            <span className="text-zinc-300">Invert Pedal Axes</span>
            <input
              type="checkbox"
              checked={settings.invertPedals}
              onChange={(e) => update('invertPedals', e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </label>
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onTestFfb}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded bg-[#182030] hover:bg-[#222d42] border border-white/12 text-xs font-medium text-zinc-100 cursor-pointer transition-colors"
          >
            <Vibrate className="w-3.5 h-3.5 text-amber-400" />
            Test Rumble
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display font-bold text-sm cursor-pointer transition-colors"
          >
            Save Calibration
          </button>
        </div>
      </div>
    </div>
  );
};
