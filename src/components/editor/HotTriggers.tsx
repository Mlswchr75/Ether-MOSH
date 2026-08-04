import { Mic, MicOff, Circle, Square, Sparkles, Scissors, Snowflake, Camera, Shuffle, Star, Play, Pencil, Trash2, X, Film, Brain, Lock, Share2, Tornado, Maximize2, Minimize2, Gem, Home, SwitchCamera, Crosshair } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "@/store/useStore";
import { requestCameraStream, type CameraFacing } from "@/hooks/useCamera";
import { IsolationPanel } from "./IsolationPanel";
import { toast } from "sonner";



type Props = {
  isRecording: boolean;
  onToggleRecord: () => void;
  onScreenshot: () => void;
  onFreeze: () => void;
  onGif: () => void;
  onShare?: () => void;
  onSupport?: () => void;
  gifBusy?: boolean;
  gifProgress?: number; // 0..1
  onMicFlash?: (on: boolean) => void;
  smartOn?: boolean;
  onToggleSmart?: () => void;
  smartLocked?: boolean;
  stormOn?: boolean;
  onToggleStorm?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onHome?: () => void;
  dimmed?: boolean;
};

const SHUFFLE_TIMINGS = [5, 15, 30, 60, 120] as const;
const DEFAULT_SHUFFLE_SEC = 5;

/**
 * Stable, module-scoped button. Defining this inside HotTriggers made React
 * remount every button on every render — clicks landing during a remount were
 * dropped (record button appeared "stuck").
 */
function HotBtn({
  label, active, onClick, children, delay,
}: {
  label: string;
  active?: boolean;
  delay: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active ? true : undefined}
      title={label}
      data-active={active || undefined}
      data-no-longpress
      className="hot-trigger"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="hot-trigger__glitch" aria-hidden>{children}</span>
      <span className="hot-trigger__ico">{children}</span>
    </button>
  );
}

/**
 * Floating cluster of "moshing" cute icons over the visualizer.
 * The DOM overlay is outside <canvas>, so canvas.captureStream() never records these.
 */
export function HotTriggers({ isRecording, onToggleRecord, onScreenshot, onFreeze, onGif, onShare, onSupport, gifBusy, gifProgress, onMicFlash, smartOn, onToggleSmart, smartLocked, stormOn, onToggleStorm, isFullscreen, onToggleFullscreen, onHome, dimmed }: Props) {
  const micEnabled = useStore(s => s.micEnabled);
  const setMicEnabled = useStore(s => s.setMicEnabled);
  const mosh = useStore(s => s.mosh);
  const shuffleSec = useStore(s => s.shuffleSec);
  const setShuffleSec = useStore(s => s.setShuffleSec);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const favorites = useStore(s => s.favorites);
  const saveFavorite = useStore(s => s.saveFavorite);
  const applyFavorite = useStore(s => s.applyFavorite);
  const removeFavorite = useStore(s => s.removeFavorite);
  const renameFavorite = useStore(s => s.renameFavorite);
  const heldRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const favHeldRef = useRef(false);
  const favHoldTimerRef = useRef<number | null>(null);

  // Switch-camera — only shown on touch devices when a live camera stream is active
  const [isTouchScreen, setIsTouchScreen] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouchScreen(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const videoStream = useStore(s => s.videoStream);
  const cameraFacing = useStore(s => s.cameraFacing);
  const setVideoSource = useStore(s => s.setVideoSource);
  const clearVideoSource = useStore(s => s.clearVideoSource);
  const [flipBusy, setFlipBusy] = useState(false);

  const isolationMode = useStore(s => s.isolationMode);
  const stickerMode = useStore(s => s.stickerMode);
  const setStickerMode = useStore(s => s.setStickerMode);
  const [isoOpen, setIsoOpen] = useState(false);

  useEffect(() => {
    if (!isoOpen) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest("[data-iso-panel]")) return;
      setIsoOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [isoOpen]);


  const flipCamera = async () => {
    if (flipBusy || !videoStream) return;
    setFlipBusy(true);
    // Determine next facing from store (reliable) instead of track.getSettings() (unreliable on iOS)
    const next: CameraFacing = cameraFacing === "user" ? "environment" : "user";
    try {
      // Stop current tracks — iOS requires them fully stopped before a new getUserMedia
      videoStream.getTracks().forEach(t => t.stop());
      // Give iOS 150 ms to release the hardware (Promise.resolve / microtask is too short)
      await new Promise<void>(r => setTimeout(r, 150));
      const stream = await requestCameraStream({ facing: next });
      setVideoSource(stream, next === "user" ? "front camera" : "rear camera");
    } catch {
      // Flip failed — clear the dead stream so the user can re-open the camera from the menu
      clearVideoSource();
      toast.error("Couldn't switch camera. Tap the camera button to reconnect.");
    } finally {
      setFlipBusy(false);
    }
  };

  // Close picker on outside tap
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("[data-shuffle-picker]")) return;
      setPickerOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [pickerOpen]);

  // Close favorites panel on outside tap
  useEffect(() => {
    if (!favOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("[data-fav-panel]")) return;
      setFavOpen(false);
      setRenameId(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [favOpen]);

  // Keyboard-driven openers (Shift+S opens favorites list; Shift+A cycles shuffle timing)
  useEffect(() => {
    const openFav = () => setFavOpen(v => !v);
    const cycleShuffle = () => {
      const ladder = [null, 5, 15, 30, 60, 120] as const;
      const cur = useStore.getState().shuffleSec;
      const idx = ladder.findIndex(v => v === cur);
      const next = ladder[(idx + 1) % ladder.length];
      useStore.getState().setShuffleSec(next);
    };
    window.addEventListener("mosh:toggle-favorites", openFav);
    window.addEventListener("mosh:cycle-shuffle", cycleShuffle);
    return () => {
      window.removeEventListener("mosh:toggle-favorites", openFav);
      window.removeEventListener("mosh:cycle-shuffle", cycleShuffle);
    };
  }, []);


  const startHold = () => {
    heldRef.current = false;
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      heldRef.current = true;
      setPickerOpen(true);
      try { (navigator as any).vibrate?.(10); } catch {}
    }, 420);
  };
  const endHold = () => {
    if (holdTimerRef.current) { window.clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
  };
  const toggleShuffle = () => {
    if (heldRef.current) return;
    setShuffleSec(shuffleSec == null ? DEFAULT_SHUFFLE_SEC : null);
  };

  const startFavHold = () => {
    favHeldRef.current = false;
    if (favHoldTimerRef.current) window.clearTimeout(favHoldTimerRef.current);
    favHoldTimerRef.current = window.setTimeout(() => {
      favHeldRef.current = true;
      // Long-press = quick save without opening the panel (power-user shortcut).
      saveFavorite();
      try { (navigator as any).vibrate?.(15); } catch {}
    }, 480);
  };
  const endFavHold = () => {
    if (favHoldTimerRef.current) { window.clearTimeout(favHoldTimerRef.current); favHoldTimerRef.current = null; }
  };
  const onFavTap = () => {
    if (favHeldRef.current) return; // long-press already saved
    // Tap = open the favorites panel (obvious entry point). The panel itself
    // has a prominent "+ save current mosh" button.
    setFavOpen(v => !v);
  };

  return (
    /* top-14 keeps the rail clear of the account chip pinned at top-3/right-3
       (z-40), which would otherwise sit on top of the first trigger. */
    <div
      className={`hot-triggers pointer-events-none absolute right-3 top-14 z-30 flex flex-col items-end gap-1 safe-top safe-right transition-opacity duration-700 ${dimmed ? "opacity-0" : "opacity-100"}`}
    >
      {/* Auto-wrapping rail: fills a column, then starts a second one inward.
          No overflow clipping, so left-opening panels stay visible. */}
      <div
        className={`hot-trigger-rail pointer-events-auto ${dimmed ? "pointer-events-none" : ""}`}
      >
        {onHome && (
          <HotBtn delay={0} label="Back to start" onClick={onHome}>
            <Home className="h-4 w-4" strokeWidth={1.5} />
          </HotBtn>
        )}
        {onToggleFullscreen && (
          <HotBtn
            delay={0}
            label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            active={isFullscreen}
            onClick={onToggleFullscreen}
          >
            {isFullscreen
              ? <Minimize2 className="h-4 w-4" strokeWidth={1.5} />
              : <Maximize2 className="h-4 w-4" strokeWidth={1.5} />}
          </HotBtn>
        )}
        {isTouchScreen && videoStream && (
          <HotBtn delay={0} label="Switch camera" onClick={flipCamera} active={flipBusy}>
            <SwitchCamera className="h-4 w-4" strokeWidth={1.5} />
          </HotBtn>
        )}

        <HotBtn
          delay={0}
          label={isRecording ? "Stop recording" : "One-tap record"}
          active={isRecording}
          onClick={onToggleRecord}
        >
          {isRecording
            ? <Square className="h-3.5 w-3.5 fill-current" strokeWidth={1.5} />
            : <Circle className="h-4 w-4" strokeWidth={1.5} />}
        </HotBtn>

        <HotBtn
          delay={60}
          label={micEnabled ? "Mic on" : "Mic off"}
          active={micEnabled}
          onClick={() => {
            const next = !useStore.getState().micEnabled;
            setMicEnabled(next);
            onMicFlash?.(next);
          }}
        >
          {micEnabled
            ? <Mic className="h-4 w-4" strokeWidth={1.5} />
            : <MicOff className="h-4 w-4" strokeWidth={1.5} />}
        </HotBtn>

        {/* Auto-shuffle — dropdown opens LEFT */}
        <div className="relative" data-shuffle-picker>
          <button
            type="button"
            aria-label={shuffleSec ? `Auto-shuffle ${shuffleSec}s (hold for timing)` : "Auto-shuffle (hold for timing)"}
            aria-pressed={shuffleSec != null}
            title={shuffleSec ? `Shuffle every ${shuffleSec}s — hold for timing` : "Auto-shuffle — hold for timing"}
            data-active={shuffleSec != null || undefined}
            data-no-longpress
            className="hot-trigger"
            style={{ animationDelay: `120ms` }}
            onClick={toggleShuffle}
            onPointerDown={startHold}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onPointerCancel={endHold}
            onContextMenu={(e) => { e.preventDefault(); setPickerOpen(true); }}
          >
            <span className="hot-trigger__glitch" aria-hidden><Shuffle className="h-4 w-4" strokeWidth={1.5} /></span>
            <span className="hot-trigger__ico"><Shuffle className="h-4 w-4" strokeWidth={1.5} /></span>
            {shuffleSec != null && (
              <span className="absolute -bottom-1 -right-1 rounded-sm bg-[hsl(var(--accent))] px-1 font-mono text-[8px] leading-[10px] text-black">
                {shuffleSec}s
              </span>
            )}
          </button>
          {pickerOpen && (
            <div
              data-shuffle-picker
              className="absolute right-full mr-2 top-0 z-40 flex flex-col gap-0.5 rounded-md border border-white/10 bg-black/75 p-1 backdrop-blur-md panel-in-3d"
            >
              <button
                type="button"
                onClick={() => { setShuffleSec(null); setPickerOpen(false); }}
                data-active={shuffleSec == null || undefined}
                className="w-full rounded px-2 py-1 text-left font-mono text-[10px] uppercase tracking-[0.15em] text-white/70 hover:bg-white/10 hover:text-white data-[active]:text-[hsl(var(--accent))]"
              >
                off
              </button>
              {SHUFFLE_TIMINGS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setShuffleSec(s); setPickerOpen(false); }}
                  data-active={shuffleSec === s || undefined}
                  className="w-full rounded px-2 py-1 text-left font-mono text-[10px] uppercase tracking-[0.15em] text-white/70 hover:bg-white/10 hover:text-white data-[active]:text-[hsl(var(--accent))]"
                >
                  {s}s
                </button>
              ))}
            </div>
          )}
        </div>

        <HotBtn delay={180} label="Mosh" onClick={mosh}>
          <Sparkles className="h-4 w-4" strokeWidth={1.5} />
        </HotBtn>

        {onToggleSmart && (
          <button
            type="button"
            onClick={onToggleSmart}
            aria-label={smartLocked ? "Smart AI (supporter unlock)" : (smartOn ? "Smart AI on" : "Smart AI off")}
            aria-pressed={smartOn || undefined}
            title={smartLocked ? "Smart AI · supporter unlock (I)" : (smartOn ? "Smart AI on · reading motion & sound (I)" : "Smart AI · reads motion & sound (I)")}
            data-active={smartOn || undefined}
            data-no-longpress
            className="hot-trigger relative"
            style={{ animationDelay: `195ms` }}
          >
            <span className="hot-trigger__glitch" aria-hidden><Brain className="h-4 w-4" strokeWidth={1.5} /></span>
            <span className="hot-trigger__ico"><Brain className="h-4 w-4" strokeWidth={1.5} /></span>
            {smartLocked && (
              <span className="pointer-events-none absolute -bottom-1 -right-1 rounded-sm bg-black/70 p-[1px] text-[hsl(var(--accent))]">
                <Lock className="h-2 w-2" strokeWidth={2} />
              </span>
            )}
            {smartOn && !smartLocked && (
              <span className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-[hsl(var(--accent))]/60 animate-pulse" />
            )}
          </button>
        )}

        {onToggleStorm && (
          <button
            type="button"
            onClick={onToggleStorm}
            aria-label={stormOn ? "Reality Storm on" : "Reality Storm off"}
            aria-pressed={stormOn || undefined}
            title={stormOn ? "Reality Storm on · reacting to motion & sound" : "Reality Storm · reactive AI warp"}
            data-active={stormOn || undefined}
            data-no-longpress
            className="hot-trigger relative"
            style={{ animationDelay: `205ms` }}
          >
            <span className="hot-trigger__glitch" aria-hidden><Tornado className="h-4 w-4" strokeWidth={1.5} /></span>
            <span className="hot-trigger__ico"><Tornado className="h-4 w-4" strokeWidth={1.5} /></span>
            {stormOn && (
              <span className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-[hsl(var(--accent))]/60 animate-pulse" />
            )}
          </button>
        )}

        {/* AI Isolation — dropdown opens LEFT */}
        <div className="relative" data-iso-panel>
          <HotBtn
            delay={207}
            label="Isolation mode"
            active={isolationMode !== 'off'}
            onClick={() => setIsoOpen(v => !v)}
          >
            <Crosshair className="h-4 w-4" strokeWidth={1.5} />
          </HotBtn>
          {isolationMode !== 'off' && (
            <span className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-[hsl(var(--accent))]/60 animate-pulse" />
          )}
          {isoOpen && (
            <div className="absolute right-full mr-2 top-0 z-40">
              <IsolationPanel onClose={() => setIsoOpen(false)} />
            </div>
          )}
        </div>

        {/* Sticker Capture Mode */}
        <HotBtn
          delay={220}
          label="Sticker capture mode"
          active={stickerMode}
          onClick={() => setStickerMode(!stickerMode)}
        >
          <Scissors className="h-4 w-4" strokeWidth={1.5} />
        </HotBtn>

        {/* Favorites — dropdown opens LEFT */}
        <div className="relative" data-fav-panel>
          <button
            type="button"
            aria-label={favOpen ? "Close favorites" : "Open favorites (hold to quick-save)"}
            title="Favorites — tap to open, hold to save current mosh"
            data-active={favOpen || undefined}
            data-no-longpress
            className="hot-trigger"
            style={{ animationDelay: `210ms` }}
            onClick={onFavTap}
            onPointerDown={startFavHold}
            onPointerUp={endFavHold}
            onPointerLeave={endFavHold}
            onPointerCancel={endFavHold}
            onContextMenu={(e) => { e.preventDefault(); setFavOpen(true); }}
          >
            <span className="hot-trigger__glitch" aria-hidden><Star className="h-4 w-4" strokeWidth={1.5} /></span>
            <span className="hot-trigger__ico"><Star className="h-4 w-4" strokeWidth={1.5} /></span>
            {favorites.length > 0 && (
              <span className="absolute -bottom-1 -right-1 rounded-sm bg-[hsl(var(--accent))] px-1 font-mono text-[8px] leading-[10px] text-black">
                {favorites.length}
              </span>
            )}
          </button>
          {favOpen && (
            <div
              data-fav-panel
              className="absolute right-full mr-2 top-0 z-40 w-64 max-h-[70vh] overflow-y-auto rounded-md border border-white/10 bg-black/85 p-2 backdrop-blur-md panel-in-3d"
            >
              <div className="flex items-center justify-between px-1 pb-1.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--accent))]">★ favorites</span>
                <div className="flex items-center gap-2">
                  <a
                    href="/favorites"
                    className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/50 hover:text-[hsl(var(--accent))]"
                  >
                    gallery →
                  </a>
                  <button
                    type="button"
                    onClick={() => { setFavOpen(false); setRenameId(null); }}
                    className="text-white/50 hover:text-white"
                    aria-label="close"
                  >
                    <X className="h-3 w-3" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { saveFavorite(); }}
                className="mb-1.5 w-full rounded border border-dashed border-white/15 px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.15em] text-white/70 hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
              >
                + save current mosh
              </button>
              {favorites.length === 0 ? (
                <div className="px-1 py-3 text-center font-mono text-[9px] uppercase tracking-[0.15em] text-white/40">
                  no favorites yet
                </div>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {favorites.map((f) => {
                    const renaming = renameId === f.id;
                    return (
                      <li key={f.id} className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-white/5">
                        {renaming ? (
                          <input
                            autoFocus
                            value={renameVal}
                            onChange={(e) => setRenameVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { renameFavorite(f.id, renameVal); setRenameId(null); }
                              if (e.key === "Escape") { setRenameId(null); }
                            }}
                            onBlur={() => { renameFavorite(f.id, renameVal); setRenameId(null); }}
                            className="flex-1 min-w-0 rounded-sm border border-[hsl(var(--accent))]/40 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => { applyFavorite(f.id); setFavOpen(false); }}
                            className="flex-1 min-w-0 truncate text-left font-mono text-[10px] uppercase tracking-[0.12em] text-white/85 hover:text-[hsl(var(--accent))]"
                            title={`${f.layers.length} layers · ${new Date(f.createdAt).toLocaleString()}`}
                          >
                            <span className="truncate">{f.name}</span>
                            <span className="ml-1 text-white/35">·{f.layers.length}L</span>
                          </button>
                        )}
                        {!renaming && (
                          <>
                            <button
                              type="button"
                              onClick={() => { applyFavorite(f.id); setFavOpen(false); }}
                              className="text-white/40 hover:text-[hsl(var(--accent))]"
                              aria-label="apply"
                              title="apply"
                            >
                              <Play className="h-3 w-3" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setRenameId(f.id); setRenameVal(f.name); }}
                              className="text-white/40 hover:text-white opacity-0 group-hover:opacity-100"
                              aria-label="rename"
                              title="rename"
                            >
                              <Pencil className="h-3 w-3" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFavorite(f.id)}
                              className="text-white/40 hover:text-red-400 opacity-0 group-hover:opacity-100"
                              aria-label="delete"
                              title="delete"
                            >
                              <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <HotBtn delay={240} label="Freeze" onClick={onFreeze}>
          <Snowflake className="h-4 w-4" strokeWidth={1.5} />
        </HotBtn>
        <HotBtn delay={300} label="Screenshot" onClick={onScreenshot}>
          <Camera className="h-4 w-4" strokeWidth={1.5} />
        </HotBtn>

        <button
          type="button"
          onClick={() => { if (!gifBusy) onGif(); }}
          aria-label={gifBusy ? "Capturing GIF loop…" : "Capture 7s seamless GIF"}
          aria-pressed={gifBusy || undefined}
          title="Capture 7s seamless GIF loop (G)"
          data-active={gifBusy || undefined}
          data-no-longpress
          disabled={gifBusy}
          className="hot-trigger relative"
          style={{ animationDelay: `360ms` }}
        >
          <span className="hot-trigger__glitch" aria-hidden><Film className="h-4 w-4" strokeWidth={1.5} /></span>
          <span className="hot-trigger__ico"><Film className="h-4 w-4" strokeWidth={1.5} /></span>
          {gifBusy && (
            <span
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-[hsl(var(--accent))] origin-left"
              style={{ transform: `scaleX(${Math.max(0.02, gifProgress ?? 0)})`, transition: "transform 80ms linear" }}
            />
          )}
        </button>

        {onShare && (
          <HotBtn delay={400} label="Share" onClick={onShare}>
            <Share2 className="h-4 w-4" strokeWidth={1.5} />
          </HotBtn>
        )}
        {onSupport && (
          <HotBtn delay={440} label="Support MOSH" onClick={onSupport}>
            <Gem className="h-4 w-4" strokeWidth={1.5} />
          </HotBtn>
        )}
      </div>

      {isRecording && (
        <div className="pointer-events-none flex items-center gap-1 rounded-sm bg-black/55 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-red-400 backdrop-blur-sm">
          <Circle className="h-1.5 w-1.5 fill-current animate-pulse" />
          REC
        </div>
      )}
    </div>
  );
}
