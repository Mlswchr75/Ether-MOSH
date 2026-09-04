import { create } from "zustand";
import { EFFECTS, EFFECTS_BY_ID, type EffectCategory } from "@/engine/effects";
import { BLEND_MODES, type BlendMode } from "@/engine/blend";
import {
  relationLabel,
  skewedAffinity,
  type RelationLabel,
} from "@/engine/quadrants";
import {
  LOOKS_BY_ID as LOOKS_LOOKUP,
  analyzeSource,
  briefFrom,
  chooseLook,
  compose,
  composeRoleLayer,
  poolForRole,
  rollRoleCount,
  rollWildness,
  type FrameBrief,
  type Composition,
  type Look,
  type Role,
} from "@/engine/artDirector";
import { recencyPenalty } from "@/engine/compose";
import { generateSeed, rngFromSeed } from "@/engine/seed";
import { presetToUrl, type PresetPayload } from "@/engine/presetUrl";
import {
  groupLayersByRole,
  nextAvailableRole,
  normalizeLayerRoles,
  ROLE_ORDER,
  roleForEffect,
  resolveLayerRole,
} from "@/engine/effectRoles";
import { exportSetlist, importSetlist, setlistToJson, SETLIST_SLOTS } from "@/engine/setlist";
import type { AudioMap, Favorite, ForgeState, Intensity, IsolationMode, Layer, Modulator, PaletteProfile, SourceMode, StickerEntry } from "./types";
import { composeForgeStack, pickForgeGenerator, rollKaleidoscope } from "@/engine/forgeCompose";
import { DRIFT_FIELD } from "@/engine/forgeGenerators/driftField";
import { FORGE_PALETTES, chooseArtDirectedPalette } from "@/engine/forgePalettes";
import { facingOfTrack, type CameraFacing } from "@/lib/cameraFacing";
import { DEFAULT_TILE_UNIFORMS, type TileMode, type TileUniforms } from "@/engine/tile";
import { extractPalette } from "@/engine/imagePalette";
import { BIOME_LABELS, biomeAccentHex } from "@/engine/imagePalette";
import { upscaleImage } from "@/engine/upscaler";
import { trackPlayer } from "@/engine/trackPlayer";
import {
  loadAudioInputPreference,
  saveAudioInputPreference,
  type AudioInputChannel,
} from "@/engine/audioInput";
import { toast } from "sonner";

/**
 * Names a new favorite after what's actually in the stack (e.g. "Chroma
 * Bleed + Pixel Storm") instead of a bland timestamp, so the list stays
 * scannable as it grows. Falls back to a timestamp when there's nothing to
 * name it after (empty stack).
 */
function generateFavoriteName(layers: Layer[]): string {
  const names = [...new Set(
    layers.map(l => EFFECTS_BY_ID[l.effectId]?.name).filter((n): n is string => !!n),
  )];
  if (!names.length) return `Preset ${new Date().toLocaleTimeString()}`;
  const shown = names.slice(0, 2).join(" + ");
  return names.length > 2 ? `${shown} +${names.length - 2}` : shown;
}

export const HISTORY_LIMIT = 12;
/** Recency-memory windows feeding recencyPenalty (see compose.ts) — the
 *  same shape and the same numbers Journey mode's own memory uses (
 *  recentStructural/recentAccent in journeyDirector.ts), so a repeat is
 *  suppressed on the same curve everywhere in the app rather than one mode
 *  hard-excluding on a fixed window and another softly decaying. `form` is
 *  the load-bearing role here (Journey's "structural" equivalent) and gets
 *  the tighter, more steeply-decaying memory; everything else shares the
 *  flatter one. */
const RECENT_FORM_MEMORY = 5;
const RECENT_OTHER_MEMORY = 10;
const LOOK_MEMORY = 5;

/**
 * How many parts of the composition each intensity centres on.
 *
 * 2 = grade + finish (a straight remaster), 4 = the full sentence. These are
 * centres, not fixed depths — rollRoleCount jitters a layer either side of
 * them per mosh, so two rolls at one setting can differ in depth as well as in
 * content.
 *
 * SAVAGE is the default and now centres on the full four-part sentence rather
 * than three. Three layers meant the default stack was routinely a grade, a
 * warp and a glow with no accent at all — the corruption/signature role, which
 * is the one most people are actually pressing the button for, was the part
 * being dropped.
 */
const ROLE_COUNT: Record<Intensity, number> = {
  mild: 2,
  savage: 4,
  nuclear: 5,
  interdimensional: 7,
};

/**
 * How far the director may break its own grammar at each intensity.
 *
 * Mild stays strict — it is the setting you reach for when you want the shot
 * back, not reinvented. The top end is meant to surprise you, so it reaches
 * outside the role shelves often enough that no two stacks rhyme.
 *
 * interdimensional used to be identical to nuclear; depth and chaos are what
 * now make it a different setting rather than a different word.
 *
 * Raised across the board (bar MILD, whose 0 is a guarantee callers rely on).
 * A rule-break fires on a role at chaos x 0.5, so the old SAVAGE reached
 * outside a role shelf on roughly one slot in thirteen — rare enough that most
 * sessions never saw one at the default setting.
 */
const CHAOS: Record<Intensity, number> = {
  mild: 0,
  savage: 0.25,
  nuclear: 0.45,
  interdimensional: 0.7,
};

/**
 * Lower bound on how wild a roll may be, per intensity.
 *
 * A floor rather than a fixed value: each mosh still rolls its own wildness
 * with real spread, so even INTERDIMENSIONAL varies tap to tap. Raising the
 * setting shifts the whole distribution up instead of pinning it, which keeps
 * every setting worth pressing repeatedly.
 */
const WILD_FLOOR: Record<Intensity, number> = {
  mild: 0,
  savage: 0.18,
  nuclear: 0.42,
  interdimensional: 0.62,
};

function briefDistance(a: FrameBrief, b: FrameBrief): number {
  const keys: Array<keyof FrameBrief> = ["brightness", "contrast", "saturation", "density", "warmth", "hueSpread"];
  return keys.reduce((sum, key) => sum + Math.abs((a[key] as number) - (b[key] as number)), 0) / keys.length;
}

/**
 * One shared settings object for every export path in the app — screenshot,
 * share, GIF, video recording, print-ready stills, Forge/Motif/Seamless tile
 * export. Centralizing these (rather than each export function hardcoding
 * its own constants) is what makes a single "export settings" panel able to
 * actually change behavior everywhere at once, instead of just displaying
 * numbers nothing reads.
 */
export type ExportSettings = {
  /** GIF capture: frames/sec, longest-edge cap in px, default tap duration. */
  gifFps: number;
  gifMaxWidth: number;
  gifDefaultSeconds: number;
  /** Video recording: MediaRecorder mimeType preference order and target fps.
   *  "mp4" doesn't force MP4 — browsers that can't encode it still fall back
   *  — it just tries H.264 first for wider compatibility (editing apps, iOS
   *  share targets) instead of WebM's better-quality-per-bit default. */
  videoFormat: "webm" | "mp4";
  videoFps: number;
  /** Stamped into every print-grade raster export (print-ready stills, Forge
   *  tile export, Motif tile export, Seamless tile export) — doesn't touch
   *  pixels, just the file's density metadata a print shop reads. */
  printDpi: 150 | 300 | 600;
  /** Share-sheet JPG quality, 0..1. */
  shareQuality: number;
};

const EXPORT_SETTINGS_KEY = "cathedral_export_settings_v1";

const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  gifFps: 12,
  gifMaxWidth: 480,
  gifDefaultSeconds: 7,
  videoFormat: "webm",
  videoFps: 30,
  printDpi: 300,
  shareQuality: 0.9,
};

function loadExportSettings(): ExportSettings {
  if (typeof localStorage === "undefined") return DEFAULT_EXPORT_SETTINGS;
  try {
    const raw = localStorage.getItem(EXPORT_SETTINGS_KEY);
    if (!raw) return DEFAULT_EXPORT_SETTINGS;
    return { ...DEFAULT_EXPORT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_EXPORT_SETTINGS;
  }
}

type State = {
  imageUrl: string | null;
  imageElement: HTMLImageElement | null;
  /** Live MediaStream source (camera). When set, takes precedence over imageElement. */
  videoElement: HTMLVideoElement | null;
  videoStream: MediaStream | null;
  /** The WebGL canvas element managed by GlCanvas; used by StickerCapture. */
  glCanvas: HTMLCanvasElement | null;
  layers: Layer[];
  selectedLayerId: string | null;
  seed: string;
  intensity: Intensity;
  showBeforeAfter: boolean;
  beforeAfterSplit: number;
  bpm: number;
  beatEnabled: boolean;
  micEnabled: boolean;
  systemAudioEnabled: boolean;
  /** Browser audio-input preference. A remembered label lets us recover USB
   * interfaces whose opaque device id changes after permissions/site reset. */
  audioInputDeviceId: string | null;
  audioInputDeviceLabel: string | null;
  audioInputChannel: AudioInputChannel;
  /** Theme-track playback, mutually exclusive with mic/system audio. */
  trackEnabled: boolean;
  trackTitle: string;
  trackArtist: string;
  micSensitivity: number;
  /** Global reactivity multiplier — scales mic/device-audio sensitivity and
   *  audio-mapped modulator strength across every mode. 1 = no-op (the exact
   *  behavior before this field existed). */
  sensitivity: number;
  /** Shared config for every export path — see ExportSettings' own doc. */
  exportSettings: ExportSettings;
  isPerformanceMode: boolean;
  showMetersInPerformance: boolean;
  /** Desktop-only: constrains the canvas stage to a tall (9:16) box instead
   *  of filling the full landscape viewport width. Mobile never needs this —
   *  rotating the device already gets a portrait frame — but a desktop
   *  browser window has no equivalent, so wide "cover" framing was
   *  routinely cropping the top/bottom off portrait-oriented sources.
   *  Ignored on touch/coarse-pointer devices (see Editor.tsx). */
  desktopPortraitMode: boolean;
  /** Selective black-crush + neon-boost grade applied in the finisher, on
   *  top of whatever effect stack is running. */
  darkModeOn: boolean;
  /**
   * Set for the duration of a Lottie Sticker capture (StickerCapture.tsx's
   * exportLottieSticker) — every action that can change the mosh FX stack
   * (mosh, forgeMosh, moshNext, rerollRole, loadSlot, applyFavorite,
   * reseedForge — including Auto-Mosh's own timer, which calls mosh()
   * through the same path) no-ops while this is true, instead of checking
   * sticker-specific state itself. A capture spans several real seconds
   * across multiple frames; without this, any of those firing mid-capture
   * — a stray click, Auto-Mosh's timer, anything — would change what the
   * canvas is actually rendering partway through, so later frames in the
   * same sticker/GIF would show a different FX stack (and, for the
   * organic-mask path, a genuinely different shape) than earlier ones.
   * "Regardless of whatever other settings are enabled" only holds with
   * one central gate every stack-changing action shares, rather than each
   * capture-adjacent feature remembering to check sticker state on its
   * own. The one deliberate exception is randomiseForge() — see its own
   * doc for why: it doubles as the render loop's error-recovery fallback,
   * which needs to work regardless of capture state.
   */
  captureLocked: boolean;
  /** Hides all chrome by default; the only way back in is the deliberate
   *  hold+second-tap (touch) or hold-Shift (desktop) gesture — see
   *  Editor.tsx's pro-mode-gated input handlers. */
  proModeEnabled: boolean;
  /** Branches off the same hot trigger as Pro Mode (hold it) — shows a
   *  description of whatever's hovered/long-pressed instead of native
   *  title-attribute tooltips, which are slow and don't exist on touch. */
  helpModeEnabled: boolean;
  /** Auto-mosh shuffle interval in seconds (null = off). */
  shuffleSec: number | null;
  past: Layer[][];
  future: Layer[][];
  slots: Array<Layer[] | null>; // length 9
  activeSlot: number | null;
  lastTouchedParam: { layerId: string; key: string } | null;
  /** UI: live FPS counter visibility (toggled via command palette). */
  showFps: boolean;
  /** UI: transient SLOT N indicator (auto-clears ~1.2s). */
  slotFlash: number | null;
  /** Display name of currently loaded source (for page title). */
  sourceName: string | null;
  /** Seamless tile post-process. */
  tileMode: TileMode;
  tileUniforms: TileUniforms;
  /** Latest extracted palette/biome profile for the current image (null until extracted). */
  paletteProfile: PaletteProfile | null;
  /** Saved effect presets. */
  favorites: Favorite[];
  /** Sticker Studio content-aware cut strategy. */
  isolationMode: IsolationMode;
  /** Sticker capture mode. */
  stickerMode: boolean;
  stickerGallery: StickerEntry[];
  /** Which camera is active ('user' = front, 'environment' = rear). */
  cameraFacing: CameraFacing | null;
  /** Recently-used *form-role* effect ids — the load-bearing pick, so this
   *  is the tighter-windowed, more steeply-decaying half of recencyPenalty's
   *  input (see compose.ts). Anti-repetition, softly: see mosh()/rerollRole/
   *  addRole for how this feeds the director rather than hard-excluding. */
  recentFormEffects: string[];
  /** Recently-used effect ids from every other role — the flatter-penalty
   *  half of the same memory. */
  recentOtherEffects: string[];
  /** Recently-used look ids. Rotating the art direction — not just the
   *  effects — is what keeps consecutive moshes from reading the same. */
  recentLooks: string[];
  /** The art direction the current stack was composed under. */
  currentLook: { id: string; name: string; blurb: string } | null;
  /** Latest content analysis, for the UI to show what the director saw. */
  currentBrief: FrameBrief | null;
  /** One fully judged stack waiting behind the visible one. */
  plannedMosh: { seed: string; intensity: Intensity; brief: FrameBrief; composition: Composition } | null;
  /** Last semantic-role roll — drives the transient on-canvas readout. */
  lastRoleRoll: RoleRoll | null;
  /** The semantic role targeted by the next clean canvas tap. */
  roleCursor: Role;
  /** The role whose controls are open. Empty roles may be selected. */
  selectedRole: Role | null;
  /** Remembered active layer per semantic role. */
  selectedRoleLayers: Partial<Record<Role, string>>;
  /** Which of upload / camera / forge currently feeds the renderer. */
  sourceMode: SourceMode;
  forge: ForgeState;
  /** Layer stack from before forge mode was entered, restored on the way out
   *  so forge's generated pattern never leaks onto a photo or camera feed. */
  preForgeLayers: Layer[] | null;
};

export type RoleRoll = {
  role: Role;
  layerId: string;
  effectId: string;
  effectName: string;
  relation: RelationLabel;
  affinity: number;
  at: number;
};

type Actions = {
  setImage: (url: string, el: HTMLImageElement) => void;
  setVideoSource: (stream: MediaStream, name?: string) => void;
  clearVideoSource: () => void;
  clearImage: () => void;
  setGlCanvas: (canvas: HTMLCanvasElement | null) => void;

  addLayer: (effectId: string) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayer: (id: string, dir: -1 | 1) => void;
  toggleHidden: (id: string) => void;
  toggleLocked: (id: string) => void;
  setOpacity: (id: string, opacity: number) => void;
  setBlend: (id: string, blend: BlendMode) => void;
  setParam: (id: string, key: string, value: number) => void;
  setModulator: (id: string, key: string, mod: Modulator | null) => void;
  setAudioMap: (id: string, key: string, map: AudioMap | null) => void;
  selectLayer: (id: string | null) => void;
  selectRole: (role: Role) => void;
  selectRoleLayer: (role: Role, layerId: string) => void;
  rerollRole: (role?: Role, layerId?: string) => RoleRoll | null;
  addRole: (role: Role) => RoleRoll | null;

  mosh: (intensity?: Intensity) => void;
  /**
   * The Forge/Motif equivalent of mosh() — one tap, one coordinated shuffle
   * of everything Forge owns (generator, seed, palette, kaleidoscope) *and*
   * the effect stack, instead of mosh()'s effect-only shuffle leaving the
   * generator frozen (see forgeMosh's own doc comment for why that used to
   * be the case).
   */
  forgeMosh: (intensity?: Intensity) => void;
  reset: () => void;

  /** Re-roll the next unlocked semantic role. */
  moshNext: () => RoleRoll | null;

  /**
   * Drop every effect and stop anything that would re-apply one, leaving the
   * bare HDR-remastered source on screen. Undoable like any other change.
   */
  clearAllFx: () => void;

  setIntensity: (i: Intensity) => void;
  setBeforeAfter: (open: boolean) => void;
  setBeforeAfterSplit: (v: number) => void;
  setBpm: (bpm: number) => void;
  setBeatEnabled: (b: boolean) => void;
  setMicEnabled: (b: boolean) => void;
  setSystemAudioEnabled: (b: boolean) => void;
  setAudioInputDevice: (deviceId: string | null, label?: string | null) => void;
  setAudioInputChannel: (channel: AudioInputChannel) => void;
  setTrackEnabled: (b: boolean) => void;
  setTrackMeta: (title: string, artist: string) => void;
  setMicSensitivity: (v: number) => void;
  setSensitivity: (v: number) => void;
  setExportSettings: (patch: Partial<ExportSettings>) => void;
  setPerformanceMode: (b: boolean) => void;
  togglePerformanceMode: () => void;
  setDesktopPortraitMode: (b: boolean) => void;
  toggleDesktopPortraitMode: () => void;
  setDarkMode: (b: boolean) => void;
  toggleDarkMode: () => void;
  setCaptureLocked: (b: boolean) => void;
  setShowMetersInPerformance: (b: boolean) => void;
  setProModeEnabled: (b: boolean) => void;
  setHelpModeEnabled: (b: boolean) => void;

  shuffleSec: number | null;
  setShuffleSec: (sec: number | null) => void;

  undo: () => void;
  redo: () => void;

  saveSlot: (i: number) => void;
  loadSlot: (i: number) => boolean;
  rerollSeed: () => void;
  clearLayers: () => void;
  removeTopLayer: () => void;
  setLastTouchedParam: (p: { layerId: string; key: string } | null) => void;
  setShowFps: (b: boolean) => void;
  flashSlot: (i: number | null) => void;
  setSourceName: (s: string | null) => void;
  setTileMode: (m: TileMode) => void;
  updateTileUniforms: (u: Partial<TileUniforms>) => void;
  setPaletteProfile: (p: PaletteProfile | null) => void;
  /** Saves the current stack. Optional data-URL thumbnail for the gallery. */
  saveFavorite: (thumb?: string) => Favorite;
  applyFavorite: (id: string) => boolean;
  /** Apply a preset decoded from a shared link. */
  applyPreset: (payload: PresetPayload | null) => boolean;
  /** Encode the current stack as a shareable link. */
  presetLink: () => string;
  /** Serialise all nine cues to a portable setlist file. */
  exportSetlistJson: (name?: string) => string;
  /** Replace all nine cues from a setlist file. Returns cues loaded, or null. */
  importSetlistJson: (json: string) => { name: string; count: number } | null;
  removeFavorite: (id: string) => void;
  renameFavorite: (id: string, name: string) => void;
  moshDirected: (layers: import("@/engine/compose").DirectedLayer[]) => void;
  setLayersRaw: (layers: Layer[]) => void;
  moshStorm: (ids: string[], opts?: { explosive?: boolean; regions?: unknown }) => void;
  disrupt: (spec: DisruptSpec) => void;
  addStickerToGallery: (sticker: StickerEntry) => void;
  removeStickerFromGallery: (id: string) => void;
  setStickerMode: (b: boolean) => void;
  setIsolationMode: (m: IsolationMode) => void;

  /** Switch which source feeds the renderer. Camera's own getUserMedia call
   *  stays with the caller (needs to run inside a user gesture) — this only
   *  tracks intent and handles the actual swap for forge <-> anything. */
  setSourceMode: (mode: SourceMode) => void;
  /** New seed, new palette, new effect stack. */
  randomiseForge: () => void;
  setForgePaletteIdx: (i: number) => void;
  setForgeIntensity: (v: number) => void;
  setForgeSeamless: (b: boolean) => void;
  setForgeBaseImage: (img: HTMLImageElement | null, name: string | null) => void;
  setForgeMosaic: (enabled: boolean) => void;
  setForgeMosaicDensity: (v: number) => void;
  setForgeOverlay: (v: number) => void;
  /** New seed only — same palette, same effect stack, different source field. */
  reseedForge: () => void;
};

const newId = () => Math.random().toString(36).slice(2, 9);

/** A layer at the effect's own defaults — used when the user adds one by hand. */
export function makeLayer(effectId: string, opts: Partial<Layer> = {}): Layer {
  const def = EFFECTS_BY_ID[effectId];
  const params: Record<string, number> = {};
  const mods: Record<string, Modulator | null> = {};
  const audioMaps: Record<string, AudioMap | null> = {};
  for (const p of def.params) {
    params[p.key] = p.default;
    mods[p.key] = null;
    audioMaps[p.key] = null;
  }
  return {
    id: newId(),
    effectId,
    role: roleForEffect(effectId) ?? undefined,
    hidden: false,
    locked: false,
    opacity: 1,
    blend: "normal",
    params,
    mods,
    audioMaps,
    ...opts,
  };
}

/**
 * Forge's own randomised stack, shaped as ordinary `Layer[]` so it can sit in
 * the same `layers` field the rest of the app reads — the render loop's
 * audio-reactivity, HDR scoring and modulator code need no forge-specific
 * branch, because as far as they're concerned it's just a stack of layers.
 */
function composeForgeLayers(forge: ForgeState): Layer[] {
  const stack = composeForgeStack({
    rand: Math.random,
    seamless: forge.seamless,
    intensity: forge.intensity,
  });
  return stack.map((l): Layer => ({
    id: newId(),
    effectId: l.effectId,
    hidden: false,
    locked: false,
    opacity: l.opacity,
    blend: l.blend,
    region: l.region ?? null,
    params: l.params,
    mods: {},
  }));
}

/**
 * An alteration to the current arrangement, as opposed to a replacement of it.
 * `violence` is 0..1 and scales how far parameters are thrown.
 */
export type DisruptSpec = {
  kind: "churn" | "blend" | "swap" | "region";
  violence?: number;
  /** Required for `swap` — the effect to drop in. */
  effectId?: string;
};

/** Region modes worth masking an accent with. `none` is excluded because it is
 *  the absence of a region, and re-masking to nothing is not a disruption. */
const DISRUPT_REGIONS: import("@/engine/blend").RegionMode[] =
  ["hbands", "vbands", "radial", "shards", "foreground", "background"];

function randomRegion(rand: () => number, violence: number): import("@/engine/blend").LayerRegion {
  return {
    mode: DISRUPT_REGIONS[Math.floor(rand() * DISRUPT_REGIONS.length)],
    scale: 2 + rand() * (2 + violence * 10),
    phase: rand() * 6.283,
    gate: 0.3 + rand() * 0.4,
    // Harder edges at higher violence: a soft mask at full throw reads as haze
    // rather than as the frame being cut into.
    feather: Math.max(0.02, 0.35 - violence * 0.3) * (0.5 + rand()),
    invert: rand() < 0.5,
  };
}

/** Blend modes that READ as effects on top of an image (won't usually wipe to black/white). */
const SAFE_BLENDS: BlendMode[] = ["normal", "normal", "normal", "screen", "overlay", "hardLight"];
const EXOTIC_BLENDS: BlendMode[] = ["multiply", "difference", "additive", "screen", "overlay"];

const sampleParam = (
  rand: () => number,
  min: number,
  max: number,
  defaultV: number,
  range: number,
  step?: number,
) => {
  const span = (max - min) * range;
  let v = defaultV + (rand() - 0.5) * span;
  v = Math.max(min, Math.min(max, v));
  if (step) v = Math.round(v / step) * step;
  return v;
};

const storedAudioInput = loadAudioInputPreference();

export const useStore = create<State & Actions>((set, get) => ({
  imageUrl: null,
  imageElement: null,
  videoElement: null,
  videoStream: null,
  glCanvas: null,
  layers: [],
  selectedLayerId: null,
  seed: generateSeed(),
  intensity: "savage",
  showBeforeAfter: false,
  beforeAfterSplit: 0.5,
  bpm: 120,
  beatEnabled: false,
  micEnabled: false,
  systemAudioEnabled: false,
  audioInputDeviceId: storedAudioInput.deviceId,
  audioInputDeviceLabel: storedAudioInput.label,
  audioInputChannel: storedAudioInput.channel,
  trackEnabled: false,
  trackTitle: trackPlayer.title,
  trackArtist: trackPlayer.artist,
  micSensitivity: 1,
  sensitivity: 1,
  exportSettings: loadExportSettings(),
  isPerformanceMode: false,
  desktopPortraitMode: false,
  darkModeOn: false,
  captureLocked: false,
  showMetersInPerformance: typeof localStorage !== "undefined" && localStorage.getItem("cathedral_meters_in_perf") === "1",
  proModeEnabled: typeof localStorage !== "undefined" && localStorage.getItem("cathedral_pro_mode") === "1",
  helpModeEnabled: false,
  shuffleSec: null,
  past: [],
  future: [],
  slots: loadSlotsFromStorage(),
  activeSlot: null,
  lastTouchedParam: null,
  showFps: false,
  slotFlash: null,
  sourceName: null,
  tileMode: "none",
  tileUniforms: { ...DEFAULT_TILE_UNIFORMS },
  paletteProfile: null,
  favorites: loadFavoritesFromStorage(),
  isolationMode: "auto" as IsolationMode,
  stickerMode: false,
  stickerGallery: [],
  cameraFacing: null,
  roleCursor: "grade",
  selectedRole: null,
  selectedRoleLayers: {},
  recentFormEffects: [],
  recentOtherEffects: [],
  recentLooks: [],
  currentLook: null,
  currentBrief: null,
  plannedMosh: null,
  lastRoleRoll: null,
  sourceMode: "upload" as SourceMode,
  forge: {
    paletteIdx: 0,
    seed: Math.floor(Math.random() * 0xFFFFFF),
    intensity: 0.6,
    seamless: false,
    stack: [],
    baseImage: null,
    baseName: null,
    mosaicEnabled: false,
    mosaicDensity: 0.45,
    overlay: 0.55,
    activeGeneratorId: DRIFT_FIELD.id,
    kaleidoscopeFolds: null,
    transitionFromGeneratorId: null,
    transitionStartedAt: null,
    transitionFromSeed: null,
    transitionFromPaletteIdx: null,
  } as ForgeState,
  preForgeLayers: null,

  setGlCanvas: (canvas) => set({ glCanvas: canvas }),

  setImage: (url, el) => {
    // Picking an image kills any active live video.
    const prevStream = useStore.getState().videoStream;
    if (prevStream) { try { prevStream.getTracks().forEach(t => t.stop()); } catch {} }
    const prevVideo = useStore.getState().videoElement;
    if (prevVideo) { try { prevVideo.srcObject = null; } catch {} try { prevVideo.parentNode?.removeChild(prevVideo); } catch {} }
    // cameraFacing must go with the camera. Leaving it set meant that after one
    // front-camera session every image loaded afterwards stayed mirrored, so
    // any text in it read backwards.
    // Coming from forge mode — e.g. a drag-drop while forge was active —
    // restore the pre-forge layer stack rather than leaving forge's
    // generated-noise stack applied to the new photo.
    const wasForge = ["forge", "motif"].includes(useStore.getState().sourceMode);
    const preForge = useStore.getState().preForgeLayers;
    set({
      imageUrl: url, imageElement: el,
      videoElement: null, videoStream: null,
      cameraFacing: null,
      paletteProfile: null,
      plannedMosh: null,
      sourceMode: "upload",
      ...(wasForge ? { layers: preForge ?? [], preForgeLayers: null } : {}),
    });
    // Async upscale — runs in a worker so the render loop isn't disturbed.
    // When done, swap in the higher-res element so fullscreen / zoom stays crisp.
    upscaleImage(el).then((hi) => {
      if (!hi) return;
      if (useStore.getState().imageElement !== el) return; // a newer image won
      set({ imageElement: hi });
    }).catch((err) => console.warn("[upscale] failed — keeping original resolution:", err));
    // Async palette extraction; UI never blocks on this.
    extractPalette(el).then((profile) => {
      // Bail if a newer image has loaded since we started.
      if (useStore.getState().imageElement !== el) return;
      useStore.getState().setPaletteProfile(profile);
      try {
        const accent = biomeAccentHex(profile);
        document.documentElement.style.setProperty("--synth-accent", accent);
        toast(`Biome: ${BIOME_LABELS[profile.biome]}`, {
          duration: 2500,
          position: "top-right",
          className: "font-mono uppercase tracking-[0.2em] text-[hsl(var(--accent))]",
        });
      } catch {}
    }).catch((err) => console.warn("[palette] extraction failed:", err));
  },
  setVideoSource: (stream, name) => {
    // Switching to live video kills any prior stream + still image.
    const prevStream = useStore.getState().videoStream;
    if (prevStream && prevStream !== stream) {
      try { prevStream.getTracks().forEach(t => t.stop()); } catch {}
    }
    // Remove any previous off-screen video node.
    const prevVideo = useStore.getState().videoElement;
    if (prevVideo) { try { prevVideo.srcObject = null; } catch {} try { prevVideo.parentNode?.removeChild(prevVideo); } catch {} }
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute("playsinline", "true");
    // iOS Safari requires the <video> element to be in the DOM for MediaStream
    // autoplay to work — off-DOM video elements silently fail to play on iOS.
    Object.assign(video.style, {
      position: "fixed", top: "-9999px", left: "-9999px",
      width: "1px", height: "1px", opacity: "0", pointerEvents: "none",
    });
    document.body.appendChild(video);
    try { video.play()?.catch(() => {}); } catch {}
    // Derive facing from the TRACK, not from the label we passed in. The label
    // records what we asked for; the track records what we actually got. Trusting
    // the label let cameraFacing drift out of sync with reality, and since the
    // flip button computes the next side from it, the toggle could stick.
    const facing: CameraFacing | null =
      facingOfTrack(stream.getVideoTracks()[0])
      ?? (name === "front camera" ? "user" : name === "rear camera" ? "environment" : null);
    const wasForge = ["forge", "motif"].includes(useStore.getState().sourceMode);
    const preForge = useStore.getState().preForgeLayers;
    set({
      imageUrl: null,
      imageElement: null,
      videoElement: video,
      videoStream: stream,
      sourceName: name ?? "live camera",
      paletteProfile: null,
      plannedMosh: null,
      cameraFacing: facing,
      sourceMode: "camera",
      ...(wasForge ? { layers: preForge ?? [], preForgeLayers: null } : {}),
    });
  },
  clearVideoSource: () => {
    const s = useStore.getState();
    if (s.videoStream) { try { s.videoStream.getTracks().forEach(t => t.stop()); } catch {} }
    if (s.videoElement) {
      try { s.videoElement.srcObject = null; } catch {}
      try { s.videoElement.parentNode?.removeChild(s.videoElement); } catch {}
    }
    // Facing belongs to the stream that just stopped.
    set({ videoElement: null, videoStream: null, cameraFacing: null, plannedMosh: null });
  },
  clearImage: () => {
    try { document.documentElement.style.removeProperty("--synth-accent"); } catch {}
    const s = useStore.getState();
    if (s.videoStream) { try { s.videoStream.getTracks().forEach(t => t.stop()); } catch {} }
    if (s.videoElement) {
      try { s.videoElement.srcObject = null; } catch {}
      try { s.videoElement.parentNode?.removeChild(s.videoElement); } catch {}
    }
    set({
      imageUrl: null, imageElement: null, videoElement: null, videoStream: null,
      cameraFacing: null, sourceName: null, layers: [], past: [], future: [], paletteProfile: null, plannedMosh: null,
      ...resetRoleSelection([]),
    });
  },

  addLayer: (effectId) => {
    const l = makeLayer(effectId);
    set(s => ({
      past: pushPast(s), future: [], layers: [...s.layers, l], selectedLayerId: l.id,
      selectedRole: l.role ?? s.selectedRole,
      selectedRoleLayers: l.role ? { ...s.selectedRoleLayers, [l.role]: l.id } : s.selectedRoleLayers,
    }));
  },

  removeLayer: (id) => set(s => {
    const layers = s.layers.filter(l => l.id !== id);
    return { past: pushPast(s), future: [], layers, ...repairRoleSelection(layers, s.selectedRole, s.selectedRoleLayers) };
  }),

  duplicateLayer: (id) => set(s => {
    const l = s.layers.find(x => x.id === id);
    if (!l) return s;
    const copy: Layer = { ...l, id: newId(), params: { ...l.params }, mods: { ...l.mods }, audioMaps: { ...(l.audioMaps ?? {}) } };
    const idx = s.layers.findIndex(x => x.id === id);
    const next = [...s.layers];
    next.splice(idx + 1, 0, copy);
    const role = resolveLayerRole(copy, idx + 1);
    return {
      ...s,
      past: pushPast(s),
      future: [],
      layers: next,
      selectedLayerId: copy.id,
      selectedRole: role,
      selectedRoleLayers: { ...s.selectedRoleLayers, [role]: copy.id },
    };
  }),

  reorderLayer: (id, dir) => set(s => {
    const idx = s.layers.findIndex(l => l.id === id);
    if (idx < 0) return s;
    const j = idx + dir;
    if (j < 0 || j >= s.layers.length) return s;
    const next = [...s.layers];
    [next[idx], next[j]] = [next[j], next[idx]];
    return { ...s, past: pushPast(s), future: [], layers: next };
  }),

  toggleHidden: (id) => set(s => ({ layers: mapLayer(s.layers, id, l => ({ ...l, hidden: !l.hidden })) })),
  toggleLocked: (id) => set(s => {
    if (!s.layers.some(layer => layer.id === id)) return s;
    return { past: pushPast(s), future: [], layers: mapLayer(s.layers, id, l => ({ ...l, locked: !l.locked })) };
  }),
  setOpacity: (id, opacity) => set(s => ({ layers: mapLayer(s.layers, id, l => ({ ...l, opacity })) })),
  setBlend: (id, blend) => set(s => ({ layers: mapLayer(s.layers, id, l => ({ ...l, blend })) })),
  setParam: (id, key, value) => set(s => ({
    lastTouchedParam: { layerId: id, key },
    layers: mapLayer(s.layers, id, l => ({ ...l, params: { ...l.params, [key]: value } })),
  })),
  setModulator: (id, key, mod) => set(s => ({
    layers: mapLayer(s.layers, id, l => ({ ...l, mods: { ...l.mods, [key]: mod } })),
  })),
  setAudioMap: (id, key, map) => set(s => ({
    past: pushPast(s), future: [],
    layers: mapLayer(s.layers, id, l => ({ ...l, audioMaps: { ...(l.audioMaps ?? {}), [key]: map } })),
  })),
  selectLayer: (id) => set(s => {
    const layer = s.layers.find(item => item.id === id);
    if (!layer) return { selectedLayerId: id };
    const role = resolveLayerRole(layer, s.layers.indexOf(layer));
    return {
      selectedLayerId: id,
      selectedRole: role,
      selectedRoleLayers: { ...s.selectedRoleLayers, [role]: id },
    };
  }),
  selectRole: (role) => set(s => {
    const group = groupLayersByRole(s.layers)[role];
    const rememberedId = s.selectedRoleLayers[role];
    const selected = group.find(layer => layer.id === rememberedId) ?? group[0] ?? null;
    return {
      selectedRole: role,
      roleCursor: role,
      selectedLayerId: selected?.id ?? null,
      selectedRoleLayers: selected
        ? { ...s.selectedRoleLayers, [role]: selected.id }
        : s.selectedRoleLayers,
    };
  }),
  selectRoleLayer: (role, layerId) => set(s => {
    const group = groupLayersByRole(s.layers)[role];
    if (!group.some(layer => layer.id === layerId)) return s;
    return {
      selectedRole: role,
      selectedLayerId: layerId,
      roleCursor: role,
      selectedRoleLayers: { ...s.selectedRoleLayers, [role]: layerId },
    };
  }),

  mosh: (intensity) => set(s => {
    if (s.captureLocked) return s;
    const inten = intensity ?? s.intensity;
    const brief = briefFrom(analyzeSource(s.videoElement ?? s.imageElement ?? s.glCanvas));
    const prepared = s.plannedMosh?.intensity === inten && briefDistance(s.plannedMosh.brief, brief) < 0.16
      ? s.plannedMosh : null;
    const seed = prepared?.seed ?? generateSeed();
    const rand = rngFromSeed(seed);

    const locked = s.layers.filter(l => l.locked);
    const composition = prepared?.composition ?? compose(brief, rand, {
      roleCount: rollRoleCount(rand, ROLE_COUNT[inten]),
      chaos: CHAOS[inten],
      wildness: rollWildness(rand, WILD_FLOOR[inten]),
      // Soft, decaying suppression instead of a hard exclude — the same
      // memory Journey mode uses (see recencyPenalty in compose.ts) rather
      // than regular moshing's old fixed-window hard-avoid, which is the
      // gap that made the two shuffle noticeably differently.
      lookPenalty: recencyPenalty(s.recentLooks, []),
      effectPenalty: recencyPenalty(s.recentFormEffects, s.recentOtherEffects),
      previousLookId: s.currentLook?.id,
      // A locked layer's effect id is a real hard constraint, not a
      // preference — the director must never reach for it since it's
      // already pinned in a fixed slot.
      avoidEffects: locked.map(l => l.effectId),
    });

    const fresh: Layer[] = composition.layers.map(cl => {
      const def = EFFECTS_BY_ID[cl.effectId];
      return {
        id: newId(),
        effectId: cl.effectId,
        role: cl.role,
        hidden: false, locked: false,
        blend: cl.blend,
        opacity: cl.opacity,
        region: cl.region ?? null,
        params: cl.params,
        mods: Object.fromEntries(def.params.map(p => [p.key, null])),
        audioMaps: Object.fromEntries(def.params.map(p => [p.key, null])),
      };
    });

    const formIds = composition.layers.filter(l => l.role === "form").map(l => l.effectId);
    const otherIds = composition.layers.filter(l => l.role !== "form").map(l => l.effectId);
    const layers = [...locked, ...fresh];
    const selection = resetRoleSelection(layers);
    const paletteIdx = chooseArtDirectedPalette(brief, rand, s.forge.paletteIdx);
    const nextSeed = generateSeed();
    const nextRand = rngFromSeed(nextSeed);
    const nextForm = [...formIds, ...s.recentFormEffects].slice(0, RECENT_FORM_MEMORY);
    const nextOther = [...otherIds, ...s.recentOtherEffects].slice(0, RECENT_OTHER_MEMORY);
    const nextLooks = [composition.look.id, ...s.recentLooks].slice(0, LOOK_MEMORY);
    const plannedMosh = {
      seed: nextSeed, intensity: inten, brief,
      composition: compose(brief, nextRand, {
        roleCount: rollRoleCount(nextRand, ROLE_COUNT[inten]), chaos: CHAOS[inten],
        wildness: rollWildness(nextRand, WILD_FLOOR[inten]),
        lookPenalty: recencyPenalty(nextLooks, []),
        effectPenalty: recencyPenalty(nextForm, nextOther),
        previousLookId: composition.look.id,
        avoidEffects: locked.map(l => l.effectId),
      }),
    };
    return {
      ...s,
      past: pushPast(s), future: [],
      layers,
      seed,
      // Most-recent-first, same ordering recencyPenalty expects (see its
      // own doc: index 0 gets the strongest suppression, decaying outward).
      recentFormEffects: [...formIds, ...s.recentFormEffects].slice(0, RECENT_FORM_MEMORY),
      recentOtherEffects: [...otherIds, ...s.recentOtherEffects].slice(0, RECENT_OTHER_MEMORY),
      recentLooks: [composition.look.id, ...s.recentLooks].slice(0, LOOK_MEMORY),
      currentLook: {
        id: composition.look.id,
        name: composition.look.name,
        blurb: composition.look.blurb,
      },
      currentBrief: brief,
      forge: { ...s.forge, paletteIdx },
      plannedMosh,
      lastRoleRoll: null,
      ...selection,
    };
  }),

  /**
   * mosh() only ever shuffled the effect stack — in Forge/Motif mode that
   * left the generator, its seed, and the palette driving its actual pixels
   * completely untouched, so consecutive taps looked like minor variations
   * on the same underlying pattern rather than a real reroll (Forge review,
   * Phase 2). This coordinates both halves as one shuffle: Forge's own
   * generator/seed/kaleidoscope reroll (previously only randomiseForge()),
   * plus an effect-stack reshuffle that shares its palette choice.
   *
   * Seamless mode is the one place this still defers to Forge's own
   * composer (composeForgeLayers) for the effect stack: compose() — the
   * general Art Director — has no concept of tile-safety (see
   * tileSafety.ts / forgeCompose.ts's own seamless-pool filtering), so
   * routing seamless mode's stack through it risks picking effects that
   * don't tile. Giving the Art Director real tile-safety awareness is its
   * own piece of work, not this one — the generator/seed/palette/
   * kaleidoscope reroll below still applies in seamless mode either way.
   */
  forgeMosh: (intensity) => set(s => {
    if (s.captureLocked) return s;
    const inten = intensity ?? s.intensity;
    const brief = briefFrom(analyzeSource(s.videoElement ?? s.imageElement ?? s.glCanvas));
    const seed = generateSeed();
    const rand = rngFromSeed(seed);
    const locked = s.layers.filter(l => l.locked);

    const composition = s.forge.seamless ? null : compose(brief, rand, {
      roleCount: rollRoleCount(rand, ROLE_COUNT[inten]),
      chaos: CHAOS[inten],
      wildness: rollWildness(rand, WILD_FLOOR[inten]),
      lookPenalty: recencyPenalty(s.recentLooks, []),
      effectPenalty: recencyPenalty(s.recentFormEffects, s.recentOtherEffects),
      previousLookId: s.currentLook?.id,
      avoidEffects: locked.map(l => l.effectId),
    });
    // One palette choice shared by the effect stack's grade and the
    // generator's own colors, rather than each half rolling its own and
    // landing on two unrelated palettes.
    const paletteIdx = chooseArtDirectedPalette(brief, rand, s.forge.paletteIdx);

    const pickedGeneratorId = pickForgeGenerator(Math.random);
    const generatorChanged = pickedGeneratorId !== s.forge.activeGeneratorId;
    const nextForge: ForgeState = {
      ...s.forge,
      seed: Math.floor(Math.random() * 0xFFFFFF),
      paletteIdx,
      activeGeneratorId: pickedGeneratorId,
      kaleidoscopeFolds: rollKaleidoscope(Math.random),
      transitionFromGeneratorId: generatorChanged ? s.forge.activeGeneratorId : null,
      transitionStartedAt: generatorChanged ? performance.now() : null,
      transitionFromSeed: generatorChanged ? s.forge.seed : null,
      transitionFromPaletteIdx: generatorChanged ? s.forge.paletteIdx : null,
    };

    if (!composition) {
      // Seamless: same tile-safe composer randomiseForge() already used,
      // just folded into this one coordinated action instead of a second
      // separate tap target.
      const stack = composeForgeLayers(nextForge);
      nextForge.stack = stack;
      return {
        ...s,
        past: pushPast(s), future: [],
        forge: nextForge,
        ...(["forge", "motif"].includes(s.sourceMode) ? { layers: stack } : {}),
      };
    }

    const fresh: Layer[] = composition.layers.map(cl => {
      const def = EFFECTS_BY_ID[cl.effectId];
      return {
        id: newId(),
        effectId: cl.effectId,
        role: cl.role,
        hidden: false, locked: false,
        blend: cl.blend,
        opacity: cl.opacity,
        region: cl.region ?? null,
        params: cl.params,
        mods: Object.fromEntries(def.params.map(p => [p.key, null])),
        audioMaps: Object.fromEntries(def.params.map(p => [p.key, null])),
      };
    });
    const formIds = composition.layers.filter(l => l.role === "form").map(l => l.effectId);
    const otherIds = composition.layers.filter(l => l.role !== "form").map(l => l.effectId);
    const layers = [...locked, ...fresh];
    const selection = resetRoleSelection(layers);
    nextForge.stack = fresh;

    return {
      ...s,
      past: pushPast(s), future: [],
      layers,
      seed,
      recentFormEffects: [...formIds, ...s.recentFormEffects].slice(0, RECENT_FORM_MEMORY),
      recentOtherEffects: [...otherIds, ...s.recentOtherEffects].slice(0, RECENT_OTHER_MEMORY),
      recentLooks: [composition.look.id, ...s.recentLooks].slice(0, LOOK_MEMORY),
      currentLook: {
        id: composition.look.id,
        name: composition.look.name,
        blurb: composition.look.blurb,
      },
      currentBrief: brief,
      forge: nextForge,
      plannedMosh: null,
      lastRoleRoll: null,
      ...selection,
    };
  }),

  rerollRole: (requestedRole, requestedLayerId) => {
    const s = get();
    if (s.captureLocked) return null;
    const role = requestedRole ?? s.selectedRole ?? s.roleCursor;
    const group = groupLayersByRole(s.layers)[role];
    const rememberedId = s.selectedRoleLayers[role];
    const explicitTarget = requestedLayerId ? group.find(layer => layer.id === requestedLayerId) : undefined;
    const rememberedTarget = rememberedId ? group.find(layer => layer.id === rememberedId) : undefined;
    const target = explicitTarget
      ?? rememberedTarget
      ?? group.find(layer => !layer.locked);
    if (!target || target.locked) return null;

    const excluded = s.layers.filter(layer => layer.id !== target.id).map(layer => layer.effectId).concat(target.effectId);
    if (!poolForRole(role).some(effectId => !excluded.includes(effectId))) return null;

    const rand = rngFromSeed(generateSeed());
    const brief = s.currentBrief ?? briefFrom(analyzeSource(s.videoElement ?? s.imageElement ?? s.glCanvas));
    const look: Look = (s.currentLook && LOOKS_LOOKUP[s.currentLook.id])
      ?? chooseLook(brief, rand, [], recencyPenalty(s.recentLooks, []));
    const affinity = skewedAffinity(rand);
    const wildness = rollWildness(rand, WILD_FLOOR[s.intensity]);
    const composed = composeRoleLayer(role, look, brief, rand, {
      exclude: excluded,
      affinityTarget: affinity,
      wildness,
      existingRegion: target.region ?? null,
      penalty: recencyPenalty(s.recentFormEffects, s.recentOtherEffects),
    });
    if (!composed) return null;
    const def = EFFECTS_BY_ID[composed.effectId];
    if (!def) return null;

    const nextLayers = s.layers.map(layer => layer.id !== target.id ? layer : {
      ...layer,
      effectId: composed.effectId,
      role,
      blend: composed.blend,
      opacity: composed.opacity,
      region: composed.region ?? null,
      params: composed.params,
      mods: Object.fromEntries(def.params.map(param => [param.key, null])),
      audioMaps: Object.fromEntries(def.params.map(param => [param.key, null])),
    });
    const record: RoleRoll = {
      role,
      layerId: target.id,
      effectId: composed.effectId,
      effectName: def.name,
      relation: relationLabel(affinity),
      affinity,
      at: typeof performance !== "undefined" ? performance.now() : Date.now(),
    };
    const nextRole = nextAvailableRole(nextLayers, role) ?? role;
    set({
      past: pushPast(s), future: [], layers: nextLayers,
      selectedLayerId: target.id,
      selectedRole: role,
      selectedRoleLayers: { ...s.selectedRoleLayers, [role]: target.id },
      roleCursor: nextRole,
      ...(role === "form"
        ? { recentFormEffects: [composed.effectId, ...s.recentFormEffects].slice(0, RECENT_FORM_MEMORY) }
        : { recentOtherEffects: [composed.effectId, ...s.recentOtherEffects].slice(0, RECENT_OTHER_MEMORY) }),
      currentBrief: brief,
      currentLook: { id: look.id, name: look.name, blurb: look.blurb },
      lastRoleRoll: record,
    });
    return record;
  },

  addRole: (role) => {
    const s = get();
    if (groupLayersByRole(s.layers)[role].length) return null;
    const rand = rngFromSeed(generateSeed());
    const brief = s.currentBrief ?? briefFrom(analyzeSource(s.videoElement ?? s.imageElement ?? s.glCanvas));
    const look: Look = (s.currentLook && LOOKS_LOOKUP[s.currentLook.id])
      ?? chooseLook(brief, rand, [], recencyPenalty(s.recentLooks, []));
    const affinity = skewedAffinity(rand);
    const composed = composeRoleLayer(role, look, brief, rand, {
      exclude: s.layers.map(layer => layer.effectId),
      affinityTarget: affinity,
      wildness: rollWildness(rand, WILD_FLOOR[s.intensity]),
      existingRegion: null,
      penalty: recencyPenalty(s.recentFormEffects, s.recentOtherEffects),
    });
    if (!composed) return null;
    const def = EFFECTS_BY_ID[composed.effectId];
    if (!def) return null;
    const layer: Layer = {
      id: newId(), effectId: composed.effectId, role,
      hidden: false, locked: false, blend: composed.blend, opacity: composed.opacity,
      region: null, params: composed.params,
      mods: Object.fromEntries(def.params.map(param => [param.key, null])),
      audioMaps: Object.fromEntries(def.params.map(param => [param.key, null])),
    };
    const groups = groupLayersByRole(s.layers);
    const roleIndex = ROLE_ORDER.indexOf(role);
    const previous = ROLE_ORDER.slice(0, roleIndex).flatMap(previousRole => groups[previousRole]);
    const later = ROLE_ORDER.slice(roleIndex + 1).flatMap(nextRole => groups[nextRole]);
    const afterPrevious = previous.length
      ? s.layers.lastIndexOf(previous[previous.length - 1]) + 1
      : -1;
    const beforeLater = later.length ? s.layers.indexOf(later[0]) : s.layers.length;
    const index = afterPrevious >= 0 ? afterPrevious : beforeLater;
    const layers = s.layers.slice();
    layers.splice(index, 0, layer);
    const record: RoleRoll = {
      role, layerId: layer.id, effectId: layer.effectId, effectName: def.name,
      relation: relationLabel(affinity), affinity,
      at: typeof performance !== "undefined" ? performance.now() : Date.now(),
    };
    set({
      past: pushPast(s), future: [], layers,
      selectedLayerId: layer.id, selectedRole: role,
      selectedRoleLayers: { ...s.selectedRoleLayers, [role]: layer.id },
      roleCursor: nextAvailableRole(layers, role) ?? role,
      ...(role === "form"
        ? { recentFormEffects: [layer.effectId, ...s.recentFormEffects].slice(0, RECENT_FORM_MEMORY) }
        : { recentOtherEffects: [layer.effectId, ...s.recentOtherEffects].slice(0, RECENT_OTHER_MEMORY) }),
      currentBrief: brief,
      currentLook: { id: look.id, name: look.name, blurb: look.blurb },
      lastRoleRoll: record,
    });
    return record;
  },

  moshNext: () => {
    const s = get();
    const role = nextAvailableRole(s.layers, s.roleCursor, { includeCurrent: true });
    if (!role) return null;
    if (role !== s.roleCursor) set({ roleCursor: role });
    const layerId = groupLayersByRole(s.layers)[role].find(layer => !layer.locked)?.id;
    if (!layerId) return null;
    return get().rerollRole(role, layerId);
  },

  clearAllFx: () => set(s => ({
    ...s,
    past: pushPast(s), future: [],
    layers: [],
    selectedLayerId: null,
    // Auto-shuffle would re-mosh within seconds and undo the clear. The Smart
    // and Storm directors live in the editor's own state, so the caller has to
    // stop those — see Editor's clearAllFx handler.
    shuffleSec: null,
    // Forget the art direction too: the next mosh should start fresh rather
    // than continue composing under a look the user just cleared away.
    currentLook: null,
    lastRoleRoll: null,
    selectedRole: null,
    selectedRoleLayers: {},
    roleCursor: "grade",
  })),

  reset: () => set(s => ({ ...s, past: pushPast(s), future: [], layers: [], ...resetRoleSelection([]) })),

  setIntensity: (i) => set({ intensity: i }),
  setBeforeAfter: (open) => set({ showBeforeAfter: open }),
  setBeforeAfterSplit: (v) => set({ beforeAfterSplit: v }),
  setBpm: (bpm) => set({ bpm }),
  setBeatEnabled: (b) => set({ beatEnabled: b }),
  setMicEnabled: (b) => {
    if (b && useStore.getState().trackEnabled) trackPlayer.pause();
    set(s => b ? { micEnabled: true, systemAudioEnabled: false, trackEnabled: false } : { micEnabled: false });
  },
  setSystemAudioEnabled: (b) => {
    if (b && useStore.getState().trackEnabled) trackPlayer.pause();
    set(s => b ? { systemAudioEnabled: true, micEnabled: false, trackEnabled: false } : { systemAudioEnabled: false });
  },
  setAudioInputDevice: (deviceId, label = null) => set((state) => {
    const next = { deviceId, label: deviceId ? label : null, channel: state.audioInputChannel };
    saveAudioInputPreference(next);
    return { audioInputDeviceId: next.deviceId, audioInputDeviceLabel: next.label };
  }),
  setAudioInputChannel: (channel) => set((state) => {
    saveAudioInputPreference({
      deviceId: state.audioInputDeviceId,
      label: state.audioInputDeviceLabel,
      channel,
    });
    return { audioInputChannel: channel };
  }),
  setTrackEnabled: (b) => {
    if (b) {
      trackPlayer.play().then(() => {
        set({ trackEnabled: true, micEnabled: false, systemAudioEnabled: false });
      }).catch((err) => {
        console.error("[track] play failed:", err);
        toast.error("Couldn't play the track");
        set({ trackEnabled: false });
      });
    } else {
      trackPlayer.pause();
      set({ trackEnabled: false });
    }
  },
  setTrackMeta: (title, artist) => set({ trackTitle: title, trackArtist: artist }),
  setMicSensitivity: (v) => set({ micSensitivity: v }),
  setSensitivity: (v) => set({ sensitivity: v }),
  setExportSettings: (patch) => set(s => {
    const next = { ...s.exportSettings, ...patch };
    try { localStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify(next)); } catch {}
    return { exportSettings: next };
  }),
  setPerformanceMode: (b) => set({ isPerformanceMode: b }),
  togglePerformanceMode: () => set(s => ({ isPerformanceMode: !s.isPerformanceMode })),
  setDesktopPortraitMode: (b) => set({ desktopPortraitMode: b }),
  toggleDesktopPortraitMode: () => set(s => ({ desktopPortraitMode: !s.desktopPortraitMode })),
  setDarkMode: (b) => set({ darkModeOn: b }),
  toggleDarkMode: () => set(s => ({ darkModeOn: !s.darkModeOn })),
  setCaptureLocked: (b) => set({ captureLocked: b }),
  setShowMetersInPerformance: (b) => {
    try { localStorage.setItem("cathedral_meters_in_perf", b ? "1" : "0"); } catch {}
    set({ showMetersInPerformance: b });
  },
  setProModeEnabled: (b) => {
    try { localStorage.setItem("cathedral_pro_mode", b ? "1" : "0"); } catch {}
    set({ proModeEnabled: b });
  },
  setHelpModeEnabled: (b) => set({ helpModeEnabled: b }),

  setShuffleSec: (sec) => set({ shuffleSec: sec }),

  undo: () => set(s => {
    if (!s.past.length) return s;
    const prev = s.past[s.past.length - 1];
    return {
      ...s, layers: prev, past: s.past.slice(0, -1), future: [s.layers, ...s.future].slice(0, HISTORY_LIMIT),
      ...repairRoleSelection(prev, s.selectedRole, s.selectedRoleLayers),
    };
  }),
  redo: () => set(s => {
    if (!s.future.length) return s;
    const next = s.future[0];
    return {
      ...s, layers: next, past: [...s.past, s.layers].slice(-HISTORY_LIMIT), future: s.future.slice(1),
      ...repairRoleSelection(next, s.selectedRole, s.selectedRoleLayers),
    };
  }),

  saveSlot: (i) => set(s => {
    if (i < 0 || i > 8) return s;
    const slots = s.slots.slice();
    // deep-ish clone of layers
    slots[i] = s.layers.map(l => ({ ...l, params: { ...l.params }, mods: { ...l.mods }, audioMaps: { ...(l.audioMaps ?? {}) } }));
    saveSlotsToStorage(slots);
    return { ...s, slots, activeSlot: i };
  }),
  loadSlot: (i) => {
    const s = get();
    if (s.captureLocked) return false;
    const slot = s.slots[i];
    if (!slot) return false;
    const cloned = normalizeLayerRoles(slot).map(l => ({ ...l, id: newId(), params: { ...l.params }, mods: { ...l.mods }, audioMaps: { ...(l.audioMaps ?? {}) } }));
    set({ ...s, past: pushPast(s), future: [], layers: cloned, activeSlot: i, ...repairRoleSelection(cloned, s.selectedRole, s.selectedRoleLayers) });
    return true;
  },
  rerollSeed: () => set({ seed: generateSeed() }),
  clearLayers: () => set(s => ({ ...s, past: pushPast(s), future: [], layers: [], ...resetRoleSelection([]) })),
  removeTopLayer: () => set(s => {
    if (!s.layers.length) return s;
    const layers = s.layers.slice(0, -1);
    return {
      ...s,
      past: pushPast(s),
      future: [],
      layers,
      ...repairRoleSelection(layers, s.selectedRole, s.selectedRoleLayers),
    };
  }),
  setLastTouchedParam: (p) => set({ lastTouchedParam: p }),
  setShowFps: (b) => set({ showFps: b }),
  flashSlot: (i) => set({ slotFlash: i }),
  setSourceName: (s) => set({ sourceName: s }),
  setTileMode: (m) => set({ tileMode: m }),
  updateTileUniforms: (u) => set(s => ({ tileUniforms: { ...s.tileUniforms, ...u } })),
  setPaletteProfile: (p) => set({ paletteProfile: p }),

  saveFavorite: (thumb) => {
    const s = get();
    const layers = s.layers.map(l => ({ ...l, params: { ...l.params }, mods: { ...l.mods }, audioMaps: { ...(l.audioMaps ?? {}) } }));
    const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    // Computed at save time, against /edit specifically — favoriting from any
    // route still has to produce a link that lands back in the visualizer.
    const link = presetToUrl({ layers, seed: s.seed }, `${window.location.origin}/edit`);
    const fav: Favorite = {
      id,
      name: generateFavoriteName(layers),
      layers,
      seed: s.seed,
      createdAt: new Date().toISOString(),
      thumb,
      link,
    };
    set(st => {
      const next = [...st.favorites, fav];
      try { localStorage.setItem("cathedral_favorites_v1", JSON.stringify(next)); } catch {}
      return { favorites: next };
    });
    // Lets the favorites panel open itself and highlight the new entry,
    // regardless of which trigger (keyboard, hold-gesture, panel button)
    // called saveFavorite.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("mosh:favorite-saved", { detail: { id } }));
    }
    return fav;
  },

  applyFavorite: (id) => {
    const s = get();
    if (s.captureLocked) return false;
    const fav = s.favorites.find(f => f.id === id);
    if (!fav) return false;
    const cloned = normalizeLayerRoles(fav.layers).map(l => ({ ...l, id: newId(), params: { ...l.params }, mods: { ...l.mods }, audioMaps: { ...(l.audioMaps ?? {}) } }));
    set({ past: pushPast(s), future: [], layers: cloned, seed: fav.seed ?? s.seed, ...repairRoleSelection(cloned, s.selectedRole, s.selectedRoleLayers) });
    return true;
  },

  /** Apply a decoded preset link. Returns false if there was nothing usable. */
  applyPreset: (payload) => {
    if (!payload?.layers?.length) return false;
    const s = get();
    // Fresh ids: the decoder mints its own, but applying the same link twice
    // must not produce two layers claiming the same identity.
    const cloned = normalizeLayerRoles(payload.layers).map(l => ({
      ...l,
      id: newId(),
      params: { ...l.params },
      mods: { ...l.mods },
      audioMaps: { ...(l.audioMaps ?? {}) },
    }));
    set({
      past: pushPast(s),
      future: [],
      layers: cloned,
      seed: payload.seed ?? s.seed,
      intensity: payload.intensity ?? s.intensity,
      ...repairRoleSelection(cloned, s.selectedRole, s.selectedRoleLayers),
    });
    return true;
  },

  /** Encode the current stack as a shareable link. */
  presetLink: () => {
    const s = get();
    return presetToUrl({
      layers: s.layers,
      seed: s.seed,
      intensity: s.intensity,
      lookId: s.currentLook?.id,
    });
  },

  exportSetlistJson: (name) => setlistToJson(exportSetlist(get().slots, name)),

  importSetlistJson: (json) => {
    const parsed = importSetlist(json);
    if (!parsed) return null;
    // Fresh ids on load: the same cue can be recalled repeatedly during a set,
    // and layers sharing an identity break selection and reordering.
    const slots = parsed.slots.map(layers =>
      layers ? normalizeLayerRoles(layers).map(l => ({ ...l, id: newId(), params: { ...l.params }, mods: { ...l.mods }, audioMaps: { ...(l.audioMaps ?? {}) } })) : null,
    );
    saveSlotsToStorage(slots);
    set({ slots, activeSlot: null });
    return { name: parsed.name, count: slots.filter(s => s && s.length).length };
  },

  removeFavorite: (id) => set(st => {
    const next = st.favorites.filter(f => f.id !== id);
    try { localStorage.setItem("cathedral_favorites_v1", JSON.stringify(next)); } catch {}
    return { favorites: next };
  }),

  renameFavorite: (id, name) => set(st => {
    const next = st.favorites.map(f => f.id === id ? { ...f, name } : f);
    try { localStorage.setItem("cathedral_favorites_v1", JSON.stringify(next)); } catch {}
    return { favorites: next };
  }),

  // Takes a fully composed stack. Opacity, blend and region arrive already
  // decided by the composition grammar and are passed through untouched —
  // overwriting them here (as this used to, with a flat 0.75–1.0 opacity on
  // every layer) is exactly what flattened composed stacks back into mud.
  moshDirected: (directed) => set(s => {
    const seed = generateSeed();
    const rand = rngFromSeed(seed);
    const brief = briefFrom(analyzeSource(s.videoElement ?? s.imageElement ?? s.glCanvas));
    const locked = s.layers.filter(l => l.locked);
    const fresh = buildDirectedLayers(directed);
    const layers = [...locked, ...fresh];
    return {
      ...s, past: pushPast(s), future: [], layers, seed,
      currentBrief: brief,
      forge: { ...s.forge, paletteIdx: chooseArtDirectedPalette(brief, rand, s.forge.paletteIdx) },
      plannedMosh: null,
      ...resetRoleSelection(layers),
    };
  }),
  // Bare `set({ layers })` — no undo push, no seed regen, no role-selection
  // reset. Exists for the Journey crossfade driver (Editor.tsx), which needs
  // to write interpolated opacities to the store every animation frame
  // without spamming undo history; the transition's *end* still calls
  // moshDirected() once for the real bookkeeping.
  setLayersRaw: (layers) => set({ layers }),

  moshStorm: (ids) => set(s => {
    const seed = generateSeed();
    const rand = rngFromSeed(seed);
    const locked = s.layers.filter(l => l.locked);
    const fresh: Layer[] = ids.flatMap((eid, idx) => {
      const def = EFFECTS_BY_ID[eid];
      if (!def) return [];
      const params: Record<string, number> = {};
      for (const p of def.params) {
        params[p.key] = sampleParam(rand, p.min, p.max, p.default, 0.9, p.step);
      }
      return [{
        id: newId(),
        effectId: eid,
        role: roleForEffect(eid) ?? undefined,
        hidden: false, locked: false,
        blend: (idx === 0 ? "normal" : EXOTIC_BLENDS[Math.floor(rand() * EXOTIC_BLENDS.length)]) as import("@/engine/blend").BlendMode,
        opacity: idx === 0 ? 1 : 0.7 + rand() * 0.3,
        params,
        mods: Object.fromEntries(def.params.map(p => [p.key, null])),
        audioMaps: Object.fromEntries(def.params.map(p => [p.key, null])),
      }];
    });

    /* Storm calls this ~12.5 times a second, and it used to push an undo
       snapshot every single time — so with HISTORY_LIMIT at 20, one and a half
       seconds of Storm silently erased the user's entire undo history.

       A snapshot is only worth taking when the *arrangement* changes. Storm
       re-rolls parameters constantly but changes its effect ids every 5–60s,
       and that is the moment worth being able to return to. */
    const changed =
      s.layers.length !== fresh.length + locked.length ||
      fresh.some((l, i) => s.layers[locked.length + i]?.effectId !== l.effectId);

    const layers = [...locked, ...fresh];
    return {
      ...s,
      past: changed ? pushPast(s) : s.past,
      future: changed ? [] : s.future,
      layers,
      seed,
      ...repairRoleSelection(layers, s.selectedRole, s.selectedRoleLayers),
    };
  }),

  /**
   * Alter the arrangement in place, without replacing it.
   *
   * This is Storm's accidental behaviour made deliberate. Storm looked as good
   * as it did because the effect *identity* held steady while every parameter
   * was thrown twelve times a second: structure the eye can hold onto, detail
   * that never settles. The difference here is that the violence is a dial and
   * the caller decides when to turn it, rather than it being pinned at 90% of
   * every parameter's full range forever.
   *
   * Deliberately does NOT push undo history — these fire several times a second
   * during a surge, and that is exactly what destroyed it before. Layer ids and
   * effect ids are preserved so the renderer keeps its compiled programs and
   * the UI doesn't flicker its selection.
   */
  disrupt: (spec) => set(s => {
    if (!s.layers.length) return s;
    const rand = rngFromSeed(generateSeed());
    const violence = Math.max(0, Math.min(1, spec.violence ?? 0.5));

    const layers = s.layers.map((l, idx) => {
      // A locked layer is the user's explicit statement that it stays put.
      if (l.locked) return l;
      const def = EFFECTS_BY_ID[l.effectId];
      if (!def) return l;

      switch (spec.kind) {
        case "churn": {
          const params: Record<string, number> = { ...l.params };
          for (const p of def.params) {
            // Throw from the *current* value, not the default: churning back
            // toward the default every time would pull the look to the middle
            // and undo the drift that makes a long run interesting.
            params[p.key] = sampleParam(rand, p.min, p.max, l.params[p.key] ?? p.default, violence, p.step);
          }
          return { ...l, params };
        }
        case "blend":
          // The base layer composites normally — an exotic blend at the bottom
          // has nothing underneath to blend with.
          return idx === 0
            ? l
            : { ...l, blend: EXOTIC_BLENDS[Math.floor(rand() * EXOTIC_BLENDS.length)] };
        case "region":
          return idx === 0 ? l : { ...l, region: randomRegion(rand, violence) };
        default:
          return l;
      }
    });

    if (spec.kind !== "swap") return { ...s, layers };

    /* Swap replaces exactly one unlocked layer. Changing one voice in an
       arrangement reads as a development; changing all of them reads as a cut,
       which is what the composition clock is for. */
    const swappable = layers.map((l, i) => ({ l, i })).filter(x => !x.l.locked);
    if (!swappable.length || !spec.effectId || !EFFECTS_BY_ID[spec.effectId]) return { ...s, layers };
    const target = swappable[Math.floor(rand() * swappable.length)];
    const def = EFFECTS_BY_ID[spec.effectId];
    const params: Record<string, number> = {};
    for (const p of def.params) {
      params[p.key] = sampleParam(rand, p.min, p.max, p.default, 0.5 + violence * 0.5, p.step);
    }
    const next = layers.slice();
    next[target.i] = {
      ...target.l,
      effectId: spec.effectId,
      params,
      mods: Object.fromEntries(def.params.map(p => [p.key, null])),
      audioMaps: Object.fromEntries(def.params.map(p => [p.key, null])),
    };
    return { ...s, layers: next };
  }),

  addStickerToGallery: (sticker) => set(s => ({ stickerGallery: [...s.stickerGallery, sticker] })),
  removeStickerFromGallery: (id) => set(s => ({ stickerGallery: s.stickerGallery.filter(x => x.id !== id) })),
  setStickerMode: (b) => set({ stickerMode: b }),
  setIsolationMode: (m) => set({ isolationMode: m }),

  setSourceMode: (mode) => {
    const s = get();
    if (mode === s.sourceMode) return;

    // Leaving forge — restore whatever was active before it rather than
    // leaving forge's generated-noise stack applied to a photo or camera feed.
    if ((s.sourceMode === "forge" || s.sourceMode === "motif") && mode !== "forge" && mode !== "motif") {
      set({ sourceMode: mode, layers: s.preForgeLayers ?? [], preForgeLayers: null });
      return;
    }

    // Entering forge — stop any camera, drop any image, and remember the
    // current stack so it comes back untouched on the way out.
    if (mode === "forge" || mode === "motif") {
      if (s.videoStream) { try { s.videoStream.getTracks().forEach(t => t.stop()); } catch {} }
      if (s.videoElement) {
        try { s.videoElement.srcObject = null; } catch {}
        try { s.videoElement.parentNode?.removeChild(s.videoElement); } catch {}
      }
      const stack = s.forge.stack.length ? s.forge.stack : composeForgeLayers(s.forge);
      set({
        sourceMode: mode,
        imageUrl: null, imageElement: null, videoElement: null, videoStream: null, cameraFacing: null,
        preForgeLayers: s.layers,
        layers: stack,
        forge: { ...s.forge, stack },
      });
      return;
    }

    // Plain upload <-> camera with no forge session in play. The actual
    // camera getUserMedia call has to happen in the caller's click handler —
    // this just tracks intent (e.g. switching to Upload before anything's
    // been dropped yet).
    set({ sourceMode: mode });
  },

  // Deliberately NOT gated by captureLocked, unlike every other
  // stack-changing action here: this is also GlCanvas's own error-recovery
  // fallback when a Forge generator's render throws mid-frame ("escape a
  // poisoned in-flight generator transition"). Blocking that during a
  // capture would leave a genuinely broken render stuck broken for the
  // whole capture with no way to self-correct — worse than the rare
  // generator-swap this reseed causes when it fires as recovery. Its two
  // other call sites (SourceModeToggle, ForgeRedirect) only fire when
  // forge.stack is still empty, so they can't reach here mid-capture
  // either way — a capture in progress already has a real stack.
  randomiseForge: () => {
    const s = get();
    const brief = briefFrom(analyzeSource(s.videoElement ?? s.imageElement ?? s.glCanvas));
    const pickedGeneratorId = pickForgeGenerator(Math.random);
    const generatorChanged = pickedGeneratorId !== s.forge.activeGeneratorId;
    const nextForge: ForgeState = {
      ...s.forge,
      seed: Math.floor(Math.random() * 0xFFFFFF),
      paletteIdx: chooseArtDirectedPalette(brief, Math.random, s.forge.paletteIdx),
      activeGeneratorId: pickedGeneratorId,
      kaleidoscopeFolds: rollKaleidoscope(Math.random),
      // Only start a crossfade when the generator actually changed — a
      // same-id "transition" would render both the outgoing and incoming
      // generator every frame for TRANSITION_MS to composite two
      // pixel-identical images.
      transitionFromGeneratorId: generatorChanged ? s.forge.activeGeneratorId : null,
      transitionStartedAt: generatorChanged ? performance.now() : null,
      // Freeze the seed/palette the outgoing generator was actually drawn
      // with — s.forge.seed/paletteIdx are about to become the *incoming*
      // generator's values below, so paintForgeSource needs these to render
      // the outgoing side as the frame that was actually on screen.
      transitionFromSeed: generatorChanged ? s.forge.seed : null,
      transitionFromPaletteIdx: generatorChanged ? s.forge.paletteIdx : null,
    };
    const stack = composeForgeLayers(nextForge);
    nextForge.stack = stack;
    set({ forge: nextForge, ...(["forge", "motif"].includes(s.sourceMode) ? { layers: stack } : {}) });
  },
  setForgePaletteIdx: (i) => set(s => ({ forge: { ...s.forge, paletteIdx: i } })),
  setForgeIntensity: (v) => set(s => ({ forge: { ...s.forge, intensity: v } })),
  setForgeSeamless: (b) => {
    const s = get();
    // The tile constraint changes which effects are even eligible, so the
    // current stack may no longer be valid — re-roll under the new pool.
    const nextForge: ForgeState = { ...s.forge, seamless: b };
    const stack = composeForgeLayers(nextForge);
    nextForge.stack = stack;
    set({ forge: nextForge, ...(["forge", "motif"].includes(s.sourceMode) ? { layers: stack } : {}) });
  },
  setForgeBaseImage: (img, name) => set(s => ({ forge: { ...s.forge, baseImage: img, baseName: name } })),
  setForgeMosaic: (enabled) => set(s => ({ forge: { ...s.forge, mosaicEnabled: enabled } })),
  setForgeMosaicDensity: (v) => set(s => ({ forge: { ...s.forge, mosaicDensity: Math.max(0, Math.min(1, v)) } })),
  setForgeOverlay: (v) => set(s => ({ forge: { ...s.forge, overlay: v } })),
  reseedForge: () => set(s => s.captureLocked ? s : { forge: { ...s.forge, seed: Math.floor(Math.random() * 0xFFFFFF) } }),
}));

function mapLayer(layers: Layer[], id: string, fn: (l: Layer) => Layer): Layer[] {
  return layers.map(l => l.id === id ? fn(l) : l);
}
function pushPast(s: State): Layer[][] {
  return [...s.past, s.layers].slice(-HISTORY_LIMIT);
}

/** Turns a composed stack (opacity/blend/region already decided by the
 *  composition grammar) into real Layer objects — the construction half of
 *  moshDirected, pulled out so the Journey crossfade driver (Editor.tsx) can
 *  build the incoming arrangement once and animate its opacities in without
 *  duplicating this logic. */
export function buildDirectedLayers(directed: import("@/engine/compose").DirectedLayer[]): Layer[] {
  return directed.flatMap((d) => {
    const def = EFFECTS_BY_ID[d.effectId];
    if (!def) return [];
    const params: Record<string, number> = {};
    for (const p of def.params) params[p.key] = p.default;
    return [{
      id: newId(),
      effectId: d.effectId,
      role: roleForEffect(d.effectId) ?? undefined,
      hidden: false, locked: false,
      blend: d.blend,
      opacity: d.opacity,
      region: d.region ?? null,
      params,
      mods: Object.fromEntries(def.params.map(p => [p.key, null])),
      audioMaps: Object.fromEntries(def.params.map(p => [p.key, null])),
    }];
  });
}

function resetRoleSelection(layers: Layer[]) {
  const groups = groupLayersByRole(layers);
  const selectedRole = ROLE_ORDER.find(role => groups[role].some(layer => !layer.locked))
    ?? ROLE_ORDER.find(role => groups[role].length)
    ?? null;
  const selectedLayerId = selectedRole
    ? (groups[selectedRole].find(layer => !layer.locked) ?? groups[selectedRole][0])?.id ?? null
    : null;
  return {
    selectedRole,
    selectedLayerId,
    selectedRoleLayers: selectedRole && selectedLayerId ? { [selectedRole]: selectedLayerId } : {},
    roleCursor: selectedRole ?? "grade",
  };
}

function repairRoleSelection(
  layers: Layer[],
  selectedRole: Role | null,
  selectedRoleLayers: Partial<Record<Role, string>>,
) {
  const groups = groupLayersByRole(layers);
  const validRoleLayers = ROLE_ORDER.reduce<Partial<Record<Role, string>>>((remembered, candidate) => {
    const layerId = selectedRoleLayers[candidate];
    if (layerId && groups[candidate].some(layer => layer.id === layerId)) remembered[candidate] = layerId;
    return remembered;
  }, {});
  const role = selectedRole && groups[selectedRole].length
    ? selectedRole
    : ROLE_ORDER.find(candidate => groups[candidate].length) ?? null;
  if (!role) return resetRoleSelection(layers);
  const remembered = validRoleLayers[role];
  const selectedLayerId = groups[role].some(layer => layer.id === remembered)
    ? remembered!
    : groups[role][0].id;
  return {
    selectedRole: role,
    selectedLayerId,
    selectedRoleLayers: { ...validRoleLayers, [role]: selectedLayerId },
    roleCursor: nextAvailableRole(layers, role, { includeCurrent: true }) ?? role,
  };
}

function loadFavoritesFromStorage(): Favorite[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem("cathedral_favorites_v1");
    if (raw) {
      const favorites = JSON.parse(raw) as Favorite[];
      if (!Array.isArray(favorites)) return [];
      // Backfill: favorites saved before the shareable-link field existed
      // still deserve one, computed from data they already carry.
      const origin = typeof window !== "undefined" ? window.location.origin : "https://ether-mosh.netlify.app";
      return favorites.map(favorite => {
        const layers = normalizeLayerRoles(favorite.layers);
        const link = favorite.link ?? presetToUrl({ layers, seed: favorite.seed }, `${origin}/edit`);
        return { ...favorite, layers, link };
      });
    }
  } catch {}
  return [];
}

function loadSlotsFromStorage(): Array<Layer[] | null> {
  const out: Array<Layer[] | null> = Array(9).fill(null);
  if (typeof localStorage === "undefined") return out;
  for (let i = 0; i < 9; i++) {
    try {
      const raw = localStorage.getItem(`cathedral_slot_${i + 1}`);
      if (raw) {
        const layers = JSON.parse(raw) as Layer[];
        if (Array.isArray(layers)) out[i] = normalizeLayerRoles(layers);
      }
    } catch {}
  }
  return out;
}
function saveSlotsToStorage(slots: Array<Layer[] | null>) {
  if (typeof localStorage === "undefined") return;
  for (let i = 0; i < 9; i++) {
    try {
      const key = `cathedral_slot_${i + 1}`;
      if (slots[i]) localStorage.setItem(key, JSON.stringify(slots[i]));
      else localStorage.removeItem(key);
    } catch {}
  }
}
