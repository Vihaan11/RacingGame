import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import {
  DEFAULT_TUNING,
  LIVERY_SWATCHES,
  TUNING_PRESETS,
  type DrivetrainMode,
  type TireCompound,
  type TuningConfig,
} from '../sim/types';

interface TuningModalProps {
  tuning: TuningConfig;
  onChange: (next: TuningConfig) => void;
  onClose: () => void;
}

export const TuningModal: React.FC<TuningModalProps> = ({ tuning, onChange, onClose }) => {
  const update = <K extends keyof TuningConfig>(key: K, value: TuningConfig[K]) => {
    onChange({ ...tuning, [key]: value });
  };

  const applyPreset = (presetName: string) => {
    const preset = TUNING_PRESETS[presetName];
    if (preset) {
      onChange({ ...tuning, ...preset });
    }
  };

  const estimatedHp = Math.round(640 * tuning.enginePower);
  const estimatedTopKmh = Math.round(
    82 * Math.sqrt(tuning.enginePower) * (1.07 - tuning.aeroDownforce * 0.14) * 3.6,
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-end p-4 sm:p-5 bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label="Vehicle Tuning Garage"
    >
      <div className="w-full max-w-[430px] max-h-[88vh] flex flex-col rounded bg-[#0c1018] border border-white/14 shadow-2xl text-zinc-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="font-display font-bold text-xl tracking-wide text-white">
              Vehicle Tuning
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono-num">
              {estimatedHp} HP · Est. Top Speed {estimatedTopKmh} km/h
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_TUNING })}
              aria-label="Reset tuning to default"
              title="Reset to default"
              className="p-2 rounded hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Vehicle Tuning"
              className="p-2 rounded hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Setup Presets */}
          <div>
            <div className="text-xs font-medium text-zinc-400 mb-1.5">Setup Presets</div>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.keys(TUNING_PRESETS).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => applyPreset(name)}
                  className="py-1.5 px-3 rounded bg-[#151b28] hover:bg-[#1e2638] border border-white/10 text-xs font-medium text-zinc-200 text-left cursor-pointer transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Mechanical Sliders */}
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="tune-power" className="text-zinc-300 font-medium">
                  Engine Power &amp; Boost
                </label>
                <span className="font-mono-num text-amber-400">{estimatedHp} HP</span>
              </div>
              <input
                id="tune-power"
                type="range"
                min={0.75}
                max={1.35}
                step={0.05}
                value={tuning.enginePower}
                onChange={(e) => update('enginePower', Number(e.target.value))}
                className="sim-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="tune-aero" className="text-zinc-300 font-medium">
                  Rear Wing Downforce
                </label>
                <span className="font-mono-num text-amber-400">
                  {Math.round(tuning.aeroDownforce * 100)}%
                </span>
              </div>
              <input
                id="tune-aero"
                type="range"
                min={0.2}
                max={1.0}
                step={0.05}
                value={tuning.aeroDownforce}
                onChange={(e) => update('aeroDownforce', Number(e.target.value))}
                className="sim-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="tune-susp" className="text-zinc-300 font-medium">
                  Suspension Stiffness
                </label>
                <span className="font-mono-num text-amber-400">
                  {Math.round(tuning.suspensionStiffness * 100)}%
                </span>
              </div>
              <input
                id="tune-susp"
                type="range"
                min={0.3}
                max={1.0}
                step={0.05}
                value={tuning.suspensionStiffness}
                onChange={(e) => update('suspensionStiffness', Number(e.target.value))}
                className="sim-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="tune-height" className="text-zinc-300 font-medium">
                  Ride Height
                </label>
                <span className="font-mono-num text-amber-400">
                  {Math.round(52 + tuning.rideHeight * 38)} mm
                </span>
              </div>
              <input
                id="tune-height"
                type="range"
                min={0.0}
                max={1.0}
                step={0.05}
                value={tuning.rideHeight}
                onChange={(e) => update('rideHeight', Number(e.target.value))}
                className="sim-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="tune-brake" className="text-zinc-300 font-medium">
                  Brake Bias (Front)
                </label>
                <span className="font-mono-num text-amber-400">
                  {Math.round(tuning.brakeBalance * 100)}% F
                </span>
              </div>
              <input
                id="tune-brake"
                type="range"
                min={0.45}
                max={0.70}
                step={0.01}
                value={tuning.brakeBalance}
                onChange={(e) => update('brakeBalance', Number(e.target.value))}
                className="sim-slider"
              />
            </div>
          </div>

          {/* Tire Compound & Drivetrain */}
          <div className="pt-3 border-t border-white/10 space-y-3">
            <div>
              <div className="text-xs font-medium text-zinc-300 mb-1.5">Tire Compound</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['slick', 'intermediate', 'wet'] as TireCompound[]).map((compound) => (
                  <button
                    key={compound}
                    type="button"
                    onClick={() => update('tireCompound', compound)}
                    className={`py-1.5 px-2 rounded text-xs font-medium capitalize cursor-pointer transition-colors ${
                      tuning.tireCompound === compound
                        ? 'bg-amber-500 text-zinc-950 font-semibold'
                        : 'bg-[#151b28] text-zinc-300 hover:bg-[#1e2638]'
                    }`}
                  >
                    {compound}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-zinc-300 mb-1.5">Drivetrain</div>
              <div className="grid grid-cols-2 gap-1.5">
                {(['rwd', 'awd'] as DrivetrainMode[]).map((drive) => (
                  <button
                    key={drive}
                    type="button"
                    onClick={() => update('drivetrain', drive)}
                    className={`py-1.5 px-2 rounded text-xs font-medium uppercase cursor-pointer transition-colors ${
                      tuning.drivetrain === drive
                        ? 'bg-amber-500 text-zinc-950 font-semibold'
                        : 'bg-[#151b28] text-zinc-300 hover:bg-[#1e2638]'
                    }`}
                  >
                    {drive === 'rwd' ? 'RWD · Pure GT3' : 'AWD · High Traction'}
                  </button>
                ))}
              </div>
            </div>

            {/* Paint Livery Swatches */}
            <div>
              <div className="text-xs font-medium text-zinc-300 mb-1.5">Livery Finish</div>
              <div className="grid grid-cols-6 gap-2">
                {LIVERY_SWATCHES.map((swatch) => {
                  const selected = tuning.liveryColor.toLowerCase() === swatch.color.toLowerCase();
                  return (
                    <button
                      key={swatch.name}
                      type="button"
                      aria-label={`Paint ${swatch.name}`}
                      title={swatch.name}
                      onClick={() =>
                        onChange({
                          ...tuning,
                          liveryColor: swatch.color,
                          accentColor: swatch.accent,
                        })
                      }
                      className={`h-8 rounded cursor-pointer border-2 transition-transform ${
                        selected ? 'border-amber-400 scale-105' : 'border-white/15 hover:scale-105'
                      }`}
                      style={{ backgroundColor: swatch.color }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-white/10 shrink-0 bg-[#0c1018]">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display font-bold text-sm cursor-pointer transition-colors"
          >
            Apply &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
};
