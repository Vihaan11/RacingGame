import React from 'react';
import { Play, RotateCcw, Sliders, Disc3, Home, Trophy } from 'lucide-react';
import type { FinishSummary, HudSnapshot } from '../sim/types';
import { formatRaceTime } from '../sim/leaderboard';

interface PauseModalProps {
  hud: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onOpenTuning: () => void;
  onOpenWheel: () => void;
  onReturnTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  hud,
  onResume,
  onRestart,
  onOpenTuning,
  onOpenWheel,
  onReturnTitle,
}) => {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/65"
      role="dialog"
      aria-modal="true"
      aria-label="Race Paused"
    >
      <div className="w-full max-w-[380px] rounded bg-[#0c1018] border border-white/14 shadow-2xl p-6 text-zinc-100">
        <h2 className="font-display font-bold text-2xl tracking-wide text-white">Race Paused</h2>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 rounded bg-[#131824] border border-white/10">
            <div className="text-[10px] text-zinc-400">POSITION</div>
            <div className="font-display font-bold text-lg text-amber-400 font-mono-num">
              P{hud.position}/{hud.totalRacers}
            </div>
          </div>
          <div className="p-2.5 rounded bg-[#131824] border border-white/10">
            <div className="text-[10px] text-zinc-400">LAP</div>
            <div className="font-display font-bold text-lg text-white font-mono-num">
              {hud.lap}/{hud.totalLaps}
            </div>
          </div>
          <div className="p-2.5 rounded bg-[#131824] border border-white/10">
            <div className="text-[10px] text-zinc-400">TOP SPEED</div>
            <div className="font-display font-bold text-lg text-white font-mono-num">
              {hud.topSpeedKmh}
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full flex items-center justify-center gap-2 py-3 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display font-bold text-sm cursor-pointer transition-colors"
          >
            <Play className="w-4 h-4 fill-current" />
            Resume Race
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenTuning}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded bg-[#151b28] hover:bg-[#1e2638] border border-white/10 text-xs font-medium text-zinc-100 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              Tuning
            </button>
            <button
              type="button"
              onClick={onOpenWheel}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded bg-[#151b28] hover:bg-[#1e2638] border border-white/10 text-xs font-medium text-zinc-100 cursor-pointer"
            >
              <Disc3 className="w-3.5 h-3.5 text-amber-400" />
              Wheel Setup
            </button>
          </div>
          <button
            type="button"
            onClick={onRestart}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded bg-[#151b28] hover:bg-[#1e2638] border border-white/10 text-xs font-medium text-zinc-200 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restart Race
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded hover:bg-white/8 text-xs font-medium text-zinc-400 hover:text-white cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            Return to Title
          </button>
        </div>
      </div>
    </div>
  );
};

interface FinishModalProps {
  summary: FinishSummary;
  onRaceAgain: () => void;
  onReturnTitle: () => void;
}

export const FinishModal: React.FC<FinishModalProps> = ({
  summary,
  onRaceAgain,
  onReturnTitle,
}) => {
  const isPodium = summary.position <= 3;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-label="Race Results"
    >
      <div className="w-full max-w-[460px] rounded bg-[#0c1018] border border-white/14 shadow-2xl p-6 text-zinc-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-amber-400 font-semibold tracking-wider uppercase">
              Checkered Flag · Alpine GP
            </div>
            <h2 className="font-display font-bold text-3xl text-white mt-0.5">
              {summary.position === 1
                ? '1st Place Victory'
                : `Finished P${summary.position} of ${summary.totalRacers}`}
            </h2>
          </div>
          {isPodium && <Trophy className="w-9 h-9 text-amber-400 shrink-0" />}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2.5 text-center">
          <div className="p-3 rounded bg-[#131824] border border-white/10">
            <div className="text-[10px] text-zinc-400">RACE TIME</div>
            <div className="font-mono-num font-bold text-sm text-white mt-1">
              {formatRaceTime(summary.totalRaceMs)}
            </div>
          </div>
          <div className="p-3 rounded bg-[#131824] border border-white/10">
            <div className="text-[10px] text-zinc-400">BEST LAP</div>
            <div className="font-mono-num font-bold text-sm text-amber-400 mt-1">
              {formatRaceTime(summary.bestLapMs)}
            </div>
          </div>
          <div className="p-3 rounded bg-[#131824] border border-white/10">
            <div className="text-[10px] text-zinc-400">TOP SPEED</div>
            <div className="font-mono-num font-bold text-sm text-white mt-1">
              {summary.topSpeedKmh} km/h
            </div>
          </div>
        </div>

        <div className="mt-4 rounded bg-[#111520] border border-white/10 divide-y divide-white/8">
          {summary.leaderboard.slice(0, 6).map((row) => (
            <div
              key={row.id}
              className={`flex items-center justify-between px-3.5 py-2 text-xs ${
                row.isPlayer ? 'bg-amber-500/15 text-white font-semibold' : 'text-zinc-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="font-mono-num text-zinc-400 w-4">P{row.position}</span>
                <span className="w-1.5 h-3.5 rounded-xs" style={{ backgroundColor: row.color }} />
                <span>{row.name}</span>
              </div>
              <span className="font-mono-num text-zinc-400">
                {row.position === 1
                  ? formatRaceTime(row.finishTimeMs ?? summary.totalRaceMs)
                  : `+${row.gapSeconds.toFixed(2)}s`}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-2.5">
          <button
            type="button"
            data-start="true"
            onClick={onRaceAgain}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display font-bold text-sm cursor-pointer transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Race Again
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="px-4 py-3 rounded bg-[#151b28] hover:bg-[#1e2638] border border-white/10 text-xs font-medium text-zinc-200 cursor-pointer"
          >
            Title
          </button>
        </div>
      </div>
    </div>
  );
};
