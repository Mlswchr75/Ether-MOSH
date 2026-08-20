/**
 * Standalone, camera-free storefront background: Forge's Canvas2D
 * procedural generators, cycled over time with seed-derived palettes —
 * "journey-lite". No React, no Zustand store, no WebGL, no auth, no
 * network calls after this script itself loads. Boots into
 * `#mosh-bg-root` (created by the theme) and runs until the tab closes.
 *
 * This is Bundle A of the two-bundle design in
 * docs/superpowers/specs/2026-08-20-sitewide-forge-journey-background-design.md.
 * Bundle B (the full WebGL Journey engine) is a separate follow-up and is
 * not wired in here yet — this file is self-contained and doesn't assume
 * Bundle B exists.
 */
import { paintForgeSource, createForgeRuntime, type ForgeRuntime } from "../engine/forgeSource";
import { FORGE_PALETTES } from "../engine/forgePalettes";
import { DRIFT_FIELD } from "../engine/forgeGenerators/driftField";
import { SHATTER_FIELD } from "../engine/forgeGenerators/shatterField";
import { POUR_BLOOM } from "../engine/forgeGenerators/pourBloom";
import type { ForgeState } from "../store/types";

const GENERATOR_IDS = [DRIFT_FIELD.id, SHATTER_FIELD.id, POUR_BLOOM.id];
const MAX_DPR = 1.5;
const CYCLE_MIN_MS = 20_000;
const CYCLE_MAX_MS = 40_000;

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffff);
}

function pickGenerator(excluding?: string): string {
  const pool = GENERATOR_IDS.filter((id) => id !== excluding);
  return pool[Math.floor(Math.random() * pool.length)] ?? GENERATOR_IDS[0]!;
}

function nextCycleDelay(): number {
  return CYCLE_MIN_MS + Math.random() * (CYCLE_MAX_MS - CYCLE_MIN_MS);
}

function boot() {
  const root = document.getElementById("mosh-bg-root");
  if (!root) return; // theme markup not present — nothing to mount into

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
  root.insertBefore(canvas, root.firstChild);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const runtime: ForgeRuntime = createForgeRuntime();

  const forge: ForgeState = {
    paletteIdx: Math.floor(Math.random() * FORGE_PALETTES.length),
    seed: randomSeed(),
    intensity: 0.5,
    seamless: false,
    stack: [],
    baseImage: null,
    baseName: null,
    overlay: 0,
    activeGeneratorId: pickGenerator(),
    kaleidoscopeFolds: null,
    transitionFromGeneratorId: null,
    transitionStartedAt: null,
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, Math.round(window.innerWidth * dpr));
    const h = Math.max(1, Math.round(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });

  function cycle() {
    forge.transitionFromGeneratorId = forge.activeGeneratorId;
    forge.transitionStartedAt = performance.now();
    forge.activeGeneratorId = pickGenerator(forge.activeGeneratorId);
    forge.paletteIdx = Math.floor(Math.random() * FORGE_PALETTES.length);
    forge.seed = randomSeed();
    window.setTimeout(cycle, nextCycleDelay());
  }
  window.setTimeout(cycle, nextCycleDelay());

  const start = performance.now();
  let failures = 0;
  function frame() {
    try {
      const t = (performance.now() - start) / 1000;
      paintForgeSource(ctx!, canvas.width, canvas.height, t, forge, {}, runtime);
      failures = 0;
    } catch {
      failures++;
      if (failures > 5) return; // stop looping rather than spam a broken frame forever
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

try {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
} catch {
  // Never let a background-visual failure surface to the rest of the page.
}
