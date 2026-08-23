import { Gauge, Music2, Scissors, SkipBack, SkipForward } from "lucide-react";
import type { OverlayEntity, OverlayReaction } from "@/engine/overlay/types";
import { useOverlayStore } from "@/store/useOverlayStore";

type Props = { entity: OverlayEntity };
type PlaybackPreset = "off" | "bass-speed" | "beat-scrub" | "volume-speed" | "treble-scrub";

function makeReaction(source: OverlayReaction["source"], target: OverlayReaction["target"], amount: number, smoothing: number): OverlayReaction {
  return { id: crypto.randomUUID(), source, target, amount, smoothing, invert: false };
}

function playbackReactions(preset: PlaybackPreset): OverlayReaction[] {
  switch (preset) {
    case "bass-speed": return [makeReaction("bass", "playback-speed", 1.2, 0.35)];
    case "beat-scrub": return [makeReaction("beat", "playback-position", 1, 0.04)];
    case "volume-speed": return [makeReaction("overall", "playback-speed", 0.8, 0.55)];
    case "treble-scrub": return [makeReaction("treble", "playback-position", 1, 0.25)];
    default: return [];
  }
}

function currentPreset(reactions: OverlayReaction[]): PlaybackPreset {
  const r = reactions.find(item => item.target === "playback-speed" || item.target === "playback-position");
  if (!r) return "off";
  if (r.source === "bass" && r.target === "playback-speed") return "bass-speed";
  if (r.source === "beat" && r.target === "playback-position") return "beat-scrub";
  if (r.source === "overall" && r.target === "playback-speed") return "volume-speed";
  if (r.source === "treble" && r.target === "playback-position") return "treble-scrub";
  return "off";
}

export function OverlayLottieControls({ entity }: Props) {
  const patchEntity = useOverlayStore(s => s.patchEntity);
  const isLottie = entity.asset.kind === "lottie-json" || entity.asset.kind === "dotlottie";
  if (!isLottie) return null;

  const setPlayback = (patch: Partial<OverlayEntity["playback"]>) => patchEntity(entity.id, { playback: { ...entity.playback, ...patch } });
  const segment = entity.playback.segment ?? [0, 1];
  const preset = currentPreset(entity.reactions);
  const nonPlayback = entity.reactions.filter(r => r.target !== "playback-speed" && r.target !== "playback-position");

  const setPreset = (next: PlaybackPreset) => patchEntity(entity.id, {
    reactions: [...nonPlayback, ...playbackReactions(next)],
  });

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-1">
      <Gauge size={9} className="mx-1 text-cyan-200" />
      <label className="flex items-center gap-1 rounded-full border border-cyan-300/15 px-2 py-1 font-mono text-[7px] uppercase text-cyan-100" title="Scrub animation">
        scrub
        <input aria-label="Lottie scrub position" type="range" min={0} max={1} step={0.01} value={entity.playback.position ?? 0} onChange={e => setPlayback({ position: Number(e.target.value), playing: false })} className="w-20 accent-cyan-300" />
      </label>

      <label className="flex items-center gap-1 rounded-full border border-cyan-300/15 px-2 py-1 font-mono text-[7px] uppercase text-cyan-100" title="Animation segment start">
        <SkipBack size={8} /> in
        <input aria-label="Lottie segment start" type="range" min={0} max={0.99} step={0.01} value={segment[0]} onChange={e => {
          const start = Math.min(Number(e.target.value), segment[1] - 0.01);
          setPlayback({ segment: [Math.max(0, start), segment[1]] });
        }} className="w-14 accent-cyan-300" />
      </label>

      <label className="flex items-center gap-1 rounded-full border border-cyan-300/15 px-2 py-1 font-mono text-[7px] uppercase text-cyan-100" title="Animation segment end">
        out <SkipForward size={8} />
        <input aria-label="Lottie segment end" type="range" min={0.01} max={1} step={0.01} value={segment[1]} onChange={e => {
          const end = Math.max(Number(e.target.value), segment[0] + 0.01);
          setPlayback({ segment: [segment[0], Math.min(1, end)] });
        }} className="w-14 accent-cyan-300" />
      </label>

      <button type="button" onClick={() => setPlayback({ segment: null, position: null })} className="rounded-full border border-white/10 px-2 py-1 font-mono text-[7px] uppercase text-white/45 hover:text-white" title="Reset segment and scrub">reset</button>

      <label className={`flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[7px] uppercase ${preset === "off" ? "border-white/10 text-white/45" : "border-cyan-300/30 text-cyan-200"}`}>
        <Music2 size={8} />
        <select aria-label="Lottie playback reaction" value={preset} onChange={e => setPreset(e.target.value as PlaybackPreset)} className="bg-transparent text-inherit outline-none">
          <option value="off">Playback react off</option>
          <option value="bass-speed">Bass → speed</option>
          <option value="beat-scrub">Beat → scrub</option>
          <option value="volume-speed">Volume → speed</option>
          <option value="treble-scrub">Treble → scrub</option>
        </select>
      </label>

      <Scissors size={8} className="text-white/25" />
    </div>
  );
}
