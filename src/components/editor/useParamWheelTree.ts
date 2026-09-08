import { useMemo } from "react";
import { useStore } from "@/store/useStore";
import { EFFECTS_BY_ID, PUBLIC_EFFECTS, CATEGORY_LABELS, type EffectCategory } from "@/engine/effects";
import { BLEND_MODES } from "@/engine/blend";
import { TILE_MODE_LABELS, type TileMode } from "@/engine/tile";
import { toggleSystemAudio } from "@/engine/systemAudio";
import type { AudioSource, ModulatorType } from "@/store/types";
import type { WheelItem, WheelTree } from "./paramWheelModel";

const CATEGORIES: EffectCategory[] = ["corruption", "color", "geometry", "atmosphere"];

const MOD_TYPES: { id: ModulatorType; label: string; glyph: string }[] = [
  { id: "sine", label: "Sine", glyph: "∿" },
  { id: "triangle", label: "Triangle", glyph: "△" },
  { id: "saw", label: "Saw", glyph: "◺" },
  { id: "perlin", label: "Perlin", glyph: "≈" },
  { id: "random", label: "Random", glyph: "⁂" },
  { id: "beat", label: "Beat", glyph: "♥" },
];

const AUDIO_SOURCES: { id: AudioSource; label: string; glyph: string }[] = [
  { id: "bass", label: "Bass", glyph: "BAS" },
  { id: "mid", label: "Mid", glyph: "MID" },
  { id: "treble", label: "Treble", glyph: "TRB" },
  { id: "overall", label: "Overall", glyph: "ALL" },
  { id: "beat", label: "Beat", glyph: "BPM" },
];

const TILE_MODES: TileMode[] = ["none", "seamless", "mirror"];

/** Short, ring-legible stand-in for a name too long for a 44px slot. */
export function glyphFor(name: string): string {
  const words = name.trim().split(/[\s\-_/]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 3).toUpperCase();
}

/**
 * Every control the below-the-fold menu rack used to hold, as a tree of rings.
 *
 * `engagedKey` is the parameter the outer arc scrubber is currently bound to;
 * the modulator and audio-map branches read it so they don't each need a node
 * per parameter.
 */
export function useParamWheelTree(engagedKey: string | null): WheelTree {
  const layers = useStore(s => s.layers);
  const selectedLayerId = useStore(s => s.selectedLayerId);
  const selectLayer = useStore(s => s.selectLayer);
  const addLayer = useStore(s => s.addLayer);
  const removeLayer = useStore(s => s.removeLayer);
  const duplicateLayer = useStore(s => s.duplicateLayer);
  const reorderLayer = useStore(s => s.reorderLayer);
  const toggleHidden = useStore(s => s.toggleHidden);
  const toggleLocked = useStore(s => s.toggleLocked);
  const setOpacity = useStore(s => s.setOpacity);
  const setBlend = useStore(s => s.setBlend);
  const setParam = useStore(s => s.setParam);
  const setModulator = useStore(s => s.setModulator);
  const setAudioMap = useStore(s => s.setAudioMap);

  const bpm = useStore(s => s.bpm);
  const setBpm = useStore(s => s.setBpm);
  const beatEnabled = useStore(s => s.beatEnabled);
  const setBeatEnabled = useStore(s => s.setBeatEnabled);
  const micEnabled = useStore(s => s.micEnabled);
  const setMicEnabled = useStore(s => s.setMicEnabled);
  const systemAudioEnabled = useStore(s => s.systemAudioEnabled);
  const micSensitivity = useStore(s => s.micSensitivity);
  const setMicSensitivity = useStore(s => s.setMicSensitivity);
  const tileMode = useStore(s => s.tileMode);
  const setTileMode = useStore(s => s.setTileMode);

  return useMemo<WheelTree>(() => {
    const layer = layers.find(l => l.id === selectedLayerId) ?? null;
    const def = layer ? EFFECTS_BY_ID[layer.effectId] : null;
    const engagedParam = def && engagedKey ? def.params.find(p => p.key === engagedKey) ?? null : null;
    const mod = layer && engagedKey ? layer.mods[engagedKey] ?? null : null;
    const audioMap = layer && engagedKey ? layer.audioMaps?.[engagedKey] ?? null : null;

    const tree: WheelTree = {};

    // ── root ───────────────────────────────────────────────────────────────
    tree.root = {
      id: "root",
      title: def?.name ?? "No layer",
      subtitle: layer ? `${layers.length} layer${layers.length === 1 ? "" : "s"}` : "add an effect to begin",
      items: [
        { id: "tune", label: "Tune", glyph: "TUN", branch: "tune", disabled: !def?.params.length,
          detail: def ? `${def.params.length} param${def.params.length === 1 ? "" : "s"}` : undefined },
        { id: "fx", label: "Add FX", glyph: "FX", branch: "fx" },
        { id: "layers", label: "Layers", glyph: "LYR", branch: "layers", detail: String(layers.length) },
        { id: "stack", label: "Layer", glyph: "STK", branch: "stack", disabled: !layer },
        { id: "audio", label: "Audio Map", glyph: "AUD", branch: "audio", disabled: !engagedParam },
        { id: "beat", label: "Beat & Mic", glyph: "BPM", branch: "beat", active: beatEnabled || micEnabled },
        { id: "tile", label: "Tiling", glyph: "TIL", branch: "tile", active: tileMode !== "none" },
      ],
    };

    // ── layers ─────────────────────────────────────────────────────────────
    tree.layers = {
      id: "layers", title: "Layers", parent: "root",
      subtitle: layers.length ? "tap to select · hold to delete" : "no layers yet",
      items: layers.length
        ? [...layers].reverse().map<WheelItem>(l => {
            const layerDef = EFFECTS_BY_ID[l.effectId];
            return {
              id: l.id,
              label: layerDef?.name ?? l.effectId,
              glyph: glyphFor(layerDef?.name ?? l.effectId),
              detail: l.hidden ? "hidden" : `${Math.round(l.opacity * 100)}%`,
              active: l.id === selectedLayerId,
              action: () => selectLayer(l.id),
              scalar: {
                value: l.opacity, min: 0, max: 1,
                format: v => `${Math.round(v * 100)}%`,
                set: v => setOpacity(l.id, v),
                reset: () => removeLayer(l.id),
              },
            };
          })
        : [{ id: "layers-empty", label: "Add FX", glyph: "FX", branch: "fx" }],
    };

    // ── FX: categories, then a paged ring of effects ───────────────────────
    tree.fx = {
      id: "fx", title: "Add FX", parent: "root", subtitle: `${PUBLIC_EFFECTS.length} effects`,
      items: CATEGORIES.map<WheelItem>(category => ({
        id: `fx-${category}`,
        label: CATEGORY_LABELS[category],
        glyph: glyphFor(CATEGORY_LABELS[category]),
        branch: `fx:${category}`,
        detail: String(PUBLIC_EFFECTS.filter(e => e.category === category).length),
      })),
    };
    for (const category of CATEGORIES) {
      const effects = PUBLIC_EFFECTS.filter(e => e.category === category);
      tree[`fx:${category}`] = {
        id: `fx:${category}`, title: CATEGORY_LABELS[category], parent: "fx",
        subtitle: "tap to add a layer",
        items: effects.map<WheelItem>(effect => ({
          id: effect.id,
          label: effect.name,
          glyph: glyphFor(effect.name),
          detail: effect.blurb,
          action: () => addLayer(effect.id),
        })),
      };
    }

    // ── tune: the selected layer's parameters ──────────────────────────────
    tree.tune = {
      id: "tune", title: def ? `Tune · ${def.name}` : "Tune", parent: "root",
      subtitle: def?.params.length ? "tap a param, then sweep the rim" : "this effect has no parameters",
      items: (def?.params ?? []).map<WheelItem>(param => {
        const value = layer?.params[param.key] ?? param.default;
        const paramMod = layer?.mods[param.key] ?? null;
        const paramMap = layer?.audioMaps?.[param.key] ?? null;
        return {
          id: param.key,
          label: param.label,
          glyph: glyphFor(param.label),
          detail: paramMap ? `~${paramMap.source}` : paramMod ? paramMod.type : value.toFixed(2),
          active: engagedKey === param.key,
          tone: paramMod || paramMap ? "accent" : undefined,
          scalar: layer
            ? {
                value, min: param.min, max: param.max, step: param.step,
                set: v => setParam(layer.id, param.key, v),
                reset: () => setParam(layer.id, param.key, param.default),
              }
            : undefined,
        };
      }),
    };

    // ── modulator for the engaged parameter ────────────────────────────────
    const modItems: WheelItem[] = [
      {
        id: "mod-off", label: "No modulator", glyph: "OFF", active: !mod, tone: mod ? undefined : "accent",
        action: () => { if (layer && engagedKey) setModulator(layer.id, engagedKey, null); },
      },
      ...MOD_TYPES.map<WheelItem>(type => ({
        id: `mod-${type.id}`, label: type.label, glyph: type.glyph,
        active: mod?.type === type.id,
        action: () => {
          if (!layer || !engagedKey || !engagedParam) return;
          setModulator(layer.id, engagedKey, mod?.type === type.id ? null : {
            type: type.id,
            speed: mod?.speed ?? 0.5,
            depth: mod?.depth ?? (engagedParam.max - engagedParam.min) * 0.2,
            offset: mod?.offset ?? 0,
          });
        },
      })),
    ];
    if (mod && layer && engagedKey && engagedParam) {
      const span = engagedParam.max - engagedParam.min;
      modItems.push(
        { id: "mod-speed", label: "Speed", glyph: "SPD", detail: mod.speed.toFixed(2),
          scalar: { value: mod.speed, min: 0, max: 4, set: v => setModulator(layer.id, engagedKey, { ...mod, speed: v }), reset: () => setModulator(layer.id, engagedKey, { ...mod, speed: 0.5 }) } },
        { id: "mod-depth", label: "Depth", glyph: "DPT", detail: mod.depth.toFixed(2),
          scalar: { value: mod.depth, min: 0, max: span, set: v => setModulator(layer.id, engagedKey, { ...mod, depth: v }), reset: () => setModulator(layer.id, engagedKey, { ...mod, depth: span * 0.2 }) } },
        { id: "mod-offset", label: "Offset", glyph: "OFS", detail: mod.offset.toFixed(2),
          scalar: { value: mod.offset, min: -span / 2, max: span / 2, set: v => setModulator(layer.id, engagedKey, { ...mod, offset: v }), reset: () => setModulator(layer.id, engagedKey, { ...mod, offset: 0 }) } },
      );
    }
    tree.mod = {
      id: "mod", title: engagedParam ? `Mod · ${engagedParam.label}` : "Modulator", parent: "tune",
      subtitle: engagedParam ? undefined : "pick a parameter first",
      items: engagedParam ? modItems : [],
    };

    // ── audio mapping for the engaged parameter ────────────────────────────
    const audioItems: WheelItem[] = [
      {
        id: "audio-off", label: "No mapping", glyph: "OFF", active: !audioMap,
        action: () => { if (layer && engagedKey) setAudioMap(layer.id, engagedKey, null); },
      },
      ...AUDIO_SOURCES.map<WheelItem>(source => ({
        id: `audio-${source.id}`, label: source.label, glyph: source.glyph,
        active: audioMap?.source === source.id,
        action: () => {
          if (!layer || !engagedKey) return;
          setAudioMap(layer.id, engagedKey, audioMap?.source === source.id
            ? null
            : { source: source.id, amount: audioMap?.amount ?? 0.6, smoothing: audioMap?.smoothing ?? 0.3 });
        },
      })),
    ];
    if (audioMap && layer && engagedKey) {
      audioItems.push(
        { id: "audio-amount", label: "Amount", glyph: "AMT", detail: `${Math.round(audioMap.amount * 100)}%`,
          scalar: { value: audioMap.amount, min: -1, max: 1, format: v => `${Math.round(v * 100)}%`, set: v => setAudioMap(layer.id, engagedKey, { ...audioMap, amount: v }), reset: () => setAudioMap(layer.id, engagedKey, { ...audioMap, amount: 0.6 }) } },
        { id: "audio-smoothing", label: "Smoothing", glyph: "SMO", detail: `${Math.round(audioMap.smoothing * 100)}%`,
          scalar: { value: audioMap.smoothing, min: 0, max: 1, format: v => `${Math.round(v * 100)}%`, set: v => setAudioMap(layer.id, engagedKey, { ...audioMap, smoothing: v }), reset: () => setAudioMap(layer.id, engagedKey, { ...audioMap, smoothing: 0.3 }) } },
      );
    }
    tree.audio = {
      id: "audio", title: engagedParam ? `Audio · ${engagedParam.label}` : "Audio Map", parent: "root",
      subtitle: engagedParam ? "wire a frequency band to this param" : "pick a parameter in Tune first",
      items: engagedParam ? audioItems : [],
    };

    // ── the selected layer itself ──────────────────────────────────────────
    tree.stack = {
      id: "stack", title: def ? `Layer · ${def.name}` : "Layer", parent: "root",
      subtitle: layer ? "opacity, blend and stack order" : "no layer selected",
      items: layer
        ? [
            { id: "stack-opacity", label: "Opacity", glyph: "OPA", detail: `${Math.round(layer.opacity * 100)}%`,
              scalar: { value: layer.opacity, min: 0, max: 1, format: v => `${Math.round(v * 100)}%`, set: v => setOpacity(layer.id, v), reset: () => setOpacity(layer.id, 1) } },
            { id: "stack-blend", label: `Blend · ${layer.blend}`, glyph: "BLN", detail: layer.blend,
              action: () => {
                const index = BLEND_MODES.indexOf(layer.blend);
                setBlend(layer.id, BLEND_MODES[(index + 1) % BLEND_MODES.length]);
              } },
            { id: "stack-hidden", label: layer.hidden ? "Show" : "Hide", glyph: layer.hidden ? "SHW" : "HID",
              active: layer.hidden, action: () => toggleHidden(layer.id) },
            { id: "stack-locked", label: layer.locked ? "Unlock" : "Lock", glyph: layer.locked ? "ULK" : "LCK",
              active: layer.locked, action: () => toggleLocked(layer.id) },
            { id: "stack-up", label: "Move up", glyph: "▲", action: () => reorderLayer(layer.id, 1) },
            { id: "stack-down", label: "Move down", glyph: "▼", action: () => reorderLayer(layer.id, -1) },
            { id: "stack-duplicate", label: "Duplicate", glyph: "DUP", action: () => duplicateLayer(layer.id) },
            { id: "stack-delete", label: "Delete layer", glyph: "DEL", tone: "danger", action: () => removeLayer(layer.id) },
          ]
        : [{ id: "stack-empty", label: "Add FX", glyph: "FX", branch: "fx" }],
    };

    // ── beat, mic and device audio ─────────────────────────────────────────
    tree.beat = {
      id: "beat", title: "Beat & Mic", parent: "root", subtitle: "what the visuals listen to",
      items: [
        { id: "beat-sync", label: beatEnabled ? "Beat sync on" : "Beat sync off", glyph: "SYN",
          active: beatEnabled, action: () => setBeatEnabled(!beatEnabled) },
        { id: "beat-bpm", label: "BPM", glyph: "BPM", detail: String(bpm),
          scalar: { value: bpm, min: 40, max: 240, step: 1, format: v => String(Math.round(v)), set: v => setBpm(Math.round(v)), reset: () => setBpm(120) } },
        { id: "beat-mic", label: micEnabled ? "Mic on" : "Mic off", glyph: "MIC",
          active: micEnabled, action: () => setMicEnabled(!micEnabled) },
        { id: "beat-device", label: systemAudioEnabled ? "Device audio on" : "Device audio", glyph: "DEV",
          active: systemAudioEnabled, action: () => { void toggleSystemAudio(); } },
        { id: "beat-sensitivity", label: "Mic sensitivity", glyph: "SEN", detail: micSensitivity.toFixed(2),
          scalar: { value: micSensitivity, min: 0.2, max: 3, set: setMicSensitivity, reset: () => setMicSensitivity(1) } },
      ],
    };

    // ── tiling ─────────────────────────────────────────────────────────────
    tree.tile = {
      id: "tile", title: "Tiling", parent: "root", subtitle: "seamless repeat and mirroring",
      items: TILE_MODES.map<WheelItem>(mode => ({
        id: `tile-${mode}`, label: TILE_MODE_LABELS[mode], glyph: glyphFor(TILE_MODE_LABELS[mode]),
        active: tileMode === mode, action: () => setTileMode(mode),
      })),
    };

    return tree;
  }, [
    layers, selectedLayerId, engagedKey, bpm, beatEnabled, micEnabled, systemAudioEnabled,
    micSensitivity, tileMode,
    selectLayer, addLayer, removeLayer, duplicateLayer, reorderLayer, toggleHidden, toggleLocked,
    setOpacity, setBlend, setParam, setModulator, setAudioMap, setBpm, setBeatEnabled,
    setMicEnabled, setMicSensitivity, setTileMode,
  ]);
}
