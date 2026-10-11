import React from 'react';
import { X, Orbit, Sparkles, Zap, Award } from 'lucide-react';
import { formatBlobValue } from '../utils/colors';

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 text-zinc-100 flex flex-col gap-5 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Orbit className="w-6 h-6 text-zinc-300" />
            <h2 className="text-xl font-extrabold text-white tracking-tight">
              How To Play Gravity Blobs
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex flex-col gap-4 text-sm text-zinc-300">
          <div className="flex items-start gap-3 bg-black/60 p-3 rounded-xl border border-zinc-800">
            <div className="p-2 rounded-lg bg-zinc-800 text-zinc-200 font-black text-lg">
              360°
            </div>
            <div>
              <h4 className="font-bold text-white mb-0.5">360° Perimeter Aim & Launch</h4>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Move your cursor or touch anywhere around the perimeter circle to rotate your launcher angle. Click or press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono text-[10px]">Space</kbd> to shoot a blob towards the central gravity core.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-black/60 p-3 rounded-xl border border-zinc-800">
            <div className="p-2 rounded-lg bg-zinc-800 text-amber-400 font-black text-lg">
              3x / 2x
            </div>
            <div>
              <h4 className="font-bold text-white mb-0.5">Bonded vs. Unbonded Game Modes</h4>
              <p className="text-zinc-400 text-xs leading-relaxed mb-1.5">
                • <strong>Bonded Mode:</strong> When 2 identical blobs meet, they form a <strong>tethered bond</strong>. When a 3rd identical blob joins, all 3 converge to combine into 1 blob with <strong>3x power</strong> ({formatBlobValue(2)} → {formatBlobValue(6)} → {formatBlobValue(18)} → {formatBlobValue(54)}...).
              </p>
              <p className="text-zinc-400 text-xs leading-relaxed">
                • <strong>Unbonded Mode:</strong> Classic rules without bonding. 2 identical blobs immediately merge into 1 blob with <strong>2x power</strong> ({formatBlobValue(2)} → {formatBlobValue(4)} → {formatBlobValue(8)} → {formatBlobValue(16)}...).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-black/60 p-3 rounded-xl border border-zinc-800">
            <div className="p-2 rounded-lg bg-zinc-800 text-amber-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-white mb-0.5">Gravity Supernova Event</h4>
              <p className="text-zinc-400 text-xs leading-relaxed">
                When the central cluster merges down until <strong>ONLY 1 blob remains</strong>, a massive Gravity Nova triggers! Explosive shockwaves grant <strong>+2,000 Bonus Points</strong> and seed a fresh chaotic orbiting cluster.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-black/60 p-3 rounded-xl border border-zinc-800">
            <div className="p-2 rounded-lg bg-zinc-800 text-rose-400">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-white mb-0.5">Multipliers & Combos</h4>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Chain reactions and simultaneous multi-merges grant turn point multipliers (2x, 3x, 4x, 5x+). Match rapidly to stack score bonanzas!
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-zinc-100 hover:bg-white text-black font-black tracking-wide text-sm transition shadow-lg"
        >
          Got It, Let's Play!
        </button>
      </div>
    </div>
  );
};
