import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EFFECTS, EFFECT_SAMPLER_NAMES, type EffectDef } from "../src/engine/effects";
import {
  EFFECT_AUDIT_THRESHOLDS,
  measureEffectFrame,
  type EffectAuditResult,
  type EffectAuditStatus,
} from "../src/engine/effectAudit";
import { PASSTHROUGH_VERT } from "../src/engine/blend";
import { PNG } from "pngjs";

const require = createRequire(import.meta.url);
const WIDTH = 256;
const HEIGHT = 144;
function todayReportDate(): string {
  return new Date().toISOString().slice(0, 10);
}
const REPORT_DATE = todayReportDate();
const SAMPLE_TIMES = [0, 0.7, 1.4] as const;
const SAMPLE_PULSES = [0, 0.65, 1] as const;
export const AUDIT_SAMPLER_NAMES = EFFECT_SAMPLER_NAMES;
// Three.js injects these declarations before PASSTHROUGH_VERT in production;
// raw WebGL1 needs the identical declarations written explicitly.
const AUDIT_PASSTHROUGH_VERT = "attribute vec3 position;\nattribute vec2 uv;\n" + PASSTHROUGH_VERT;

export type AuditGl = WebGLRenderingContext & {
  getExtension(name: "STACKGL_destroy_context"): { destroy(): void } | null;
};

type AuditOptions = {
  effectId?: string;
  outDir: string;
};

export type RenderedEffect = {
  result: EffectAuditResult;
  pixels: Uint8Array | null;
};

const usage = "Usage: npm run audit:effects -- [--effect EFFECT_ID] [--out-dir DIRECTORY]";

export function parseAuditOptions(args: string[]): AuditOptions | null {
  let effectId: string | undefined;
  let outDir = "docs/effect-audit";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--effect") {
      effectId = args[++index];
    } else if (arg === "--out-dir") {
      outDir = args[++index];
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage);
      return null;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (!args[index]) throw new Error(`Missing value for ${arg}`);
  }
  return { effectId, outDir };
}

function compileShader(gl: AuditGl, type: number, source: string): { shader: WebGLShader | null; compiled: boolean; log: string } {
  const shader = gl.createShader(type);
  if (!shader) return { shader: null, compiled: false, log: "Unable to allocate shader." };
  try {
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const log = gl.getShaderInfoLog(shader) ?? "";
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS)
      ? { shader, compiled: true, log }
      : { shader, compiled: false, log: log || "Shader compilation failed without an info log." };
  } catch (error) {
    return { shader, compiled: false, log: `Shader setup failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function drainErrors(gl: AuditGl): number {
  let first: number = gl.NO_ERROR;
  for (let error = gl.getError(); error !== gl.NO_ERROR; error = gl.getError()) {
    if (first === gl.NO_ERROR) first = error;
  }
  return first;
}

function createTexture(gl: AuditGl, pixels: Uint8Array, resources: WebGLTexture[]): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Unable to allocate audit texture.");
  // Register immediately: a later bind/upload exception must not leak it.
  resources.push(texture);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, WIDTH, HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return texture;
}

export function createAuditDiagnosticPixels(kind: "source" | "feedback" | "depth" | "flow" | "history", historyIndex = 0): Uint8Array {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      const u = x / (WIDTH - 1);
      const v = y / (HEIGHT - 1);
      const checker = ((Math.floor(x / 12) + Math.floor(y / 12)) & 1) === 0 ? 1 : 0;
      const diagonal = Math.abs(y - (x * 0.53 + 17)) < 1.5;
      const circle = (x - 182) ** 2 + (y - 92) ** 2 < 29 ** 2;
      const wedge = x > 34 && x < 113 && y > 39 && y < 104 && y > 0.43 * x - 3;
      let red = 0;
      let green = 0;
      let blue = 0;
      if (kind === "source") {
        red = 25 + Math.round(180 * u) + (checker ? 24 : 0);
        green = 20 + Math.round(165 * v) + (diagonal ? 60 : 0);
        blue = 45 + Math.round(135 * (1 - u * v));
        if (circle) { red = 250; green = 76; blue = 22; }
        if (wedge) { red = 18; green = 218; blue = 246; }
        if (x % 31 === 0 || y % 23 === 0) { red = 245; green = 240; blue = 232; }
      } else if (kind === "depth") {
        const d = Math.max(0, 1 - Math.hypot(x - 128, y - 72) / 115);
        red = green = blue = Math.round(d * 255);
      } else if (kind === "flow") {
        red = Math.round(255 * u);
        green = Math.round(255 * (1 - v));
        blue = 128;
      } else {
        const shift = kind === "feedback" ? 0.17 : (historyIndex + 1) * 0.09;
        red = Math.round(255 * ((u + shift) % 1));
        green = Math.round(255 * ((v * 0.72 + shift) % 1));
        blue = checker ? 204 - historyIndex * 18 : 46 + historyIndex * 22;
      }
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

export function bindAuditUniforms(gl: AuditGl, program: WebGLProgram, effect: EffectDef, textures: WebGLTexture[], time: number, pulse: number) {
  AUDIT_SAMPLER_NAMES.forEach((name, unit) => {
    const location = gl.getUniformLocation(program, name);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
    if (location) gl.uniform1i(location, unit);
  });
  const resolution = gl.getUniformLocation(program, "uResolution");
  const uTime = gl.getUniformLocation(program, "uTime");
  const uPulse = gl.getUniformLocation(program, "uPulse");
  const histDepth = gl.getUniformLocation(program, "uHistDepth");
  if (resolution) gl.uniform2f(resolution, WIDTH, HEIGHT);
  if (uTime) gl.uniform1f(uTime, time);
  if (uPulse) gl.uniform1f(uPulse, pulse);
  if (histDepth) gl.uniform1f(histDepth, 4);
  for (const param of effect.params) {
    const name = `u${param.key[0].toUpperCase()}${param.key.slice(1)}`;
    const location = gl.getUniformLocation(program, name);
    if (location) gl.uniform1f(location, param.default);
  }
}

function bindFullscreenQuad(gl: AuditGl, program: WebGLProgram): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("Unable to allocate audit fullscreen geometry.");
  // position.xy, uv.xy — two explicit triangles keep this valid on WebGL1.
  const vertices = new Float32Array([
    -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1,
    -1, 1, 0, 1, 1, -1, 1, 0, 1, 1, 1, 1,
  ]);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  const uv = gl.getAttribLocation(program, "uv");
  if (position < 0 || uv < 0) throw new Error("Audit vertex shader is missing position or uv attributes.");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(uv);
  gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
  return buffer;
}

export function renderEffectForAudit(gl: AuditGl, effect: EffectDef): RenderedEffect {
  const startedAt = performance.now();
  let vertex: ReturnType<typeof compileShader> = { shader: null, compiled: false, log: "not attempted" };
  let fragment: ReturnType<typeof compileShader> = { shader: null, compiled: false, log: "not attempted" };
  let compileLog = "vertex:\nnot attempted\nfragment:\nnot attempted";
  const textures: WebGLTexture[] = [];
  let program: WebGLProgram | null = null;
  let quad: WebGLBuffer | null = null;
  let metrics: EffectAuditResult["metrics"] = null;
  let image: Uint8Array | null = null;
  let rendered: RenderedEffect | null = null;

  try {
    vertex = compileShader(gl, gl.VERTEX_SHADER, AUDIT_PASSTHROUGH_VERT);
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, effect.frag);
    compileLog = `vertex:\n${vertex.log}\nfragment:\n${fragment.log}`;
    if (!vertex.compiled || !fragment.compiled || !vertex.shader || !fragment.shader) {
      rendered = { result: { id: effect.id, name: effect.name, category: effect.category, status: "compile-fail", compileLog, glError: gl.NO_ERROR, metrics: null, elapsedMs: 0 }, pixels: null };
    } else {
      program = gl.createProgram();
      if (!program) throw new Error("Unable to allocate program.");
      gl.attachShader(program, vertex.shader);
      gl.attachShader(program, fragment.shader);
      gl.linkProgram(program);
      const linkLog = gl.getProgramInfoLog(program) ?? "";
      compileLog += `\nlink:\n${linkLog}`;
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        rendered = { result: { id: effect.id, name: effect.name, category: effect.category, status: "compile-fail", compileLog, glError: gl.NO_ERROR, metrics: null, elapsedMs: 0 }, pixels: null };
      } else {
        createTexture(gl, createAuditDiagnosticPixels("source"), textures);
        createTexture(gl, createAuditDiagnosticPixels("feedback"), textures);
        createTexture(gl, createAuditDiagnosticPixels("depth"), textures);
        createTexture(gl, createAuditDiagnosticPixels("flow"), textures);
        createTexture(gl, createAuditDiagnosticPixels("history", 0), textures);
        createTexture(gl, createAuditDiagnosticPixels("history", 1), textures);
        createTexture(gl, createAuditDiagnosticPixels("history", 2), textures);
        createTexture(gl, createAuditDiagnosticPixels("history", 3), textures);
        const source = createAuditDiagnosticPixels("source");
        gl.viewport(0, 0, WIDTH, HEIGHT);
        gl.useProgram(program);
        quad = bindFullscreenQuad(gl, program);
        let best: { pixels: Uint8Array; delta: number } | null = null;
        for (let index = 0; index < SAMPLE_TIMES.length; index += 1) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          bindAuditUniforms(gl, program, effect, textures, SAMPLE_TIMES[index], SAMPLE_PULSES[index]);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
          gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          const sampleMetrics = measureEffectFrame(source, pixels);
          if (!best || sampleMetrics.meanAbsoluteDelta > best.delta) best = { pixels, delta: sampleMetrics.meanAbsoluteDelta };
        }
        image = best?.pixels ?? null;
        metrics = image ? measureEffectFrame(source, image) : null;
        const status: EffectAuditStatus = metrics?.blank ? "blank" : metrics?.inert ? "inert" : "pass";
        rendered = { result: { id: effect.id, name: effect.name, category: effect.category, status, compileLog, glError: gl.NO_ERROR, metrics, elapsedMs: 0 }, pixels: image };
      }
    }
  } catch (error) {
    rendered = { result: { id: effect.id, name: effect.name, category: effect.category, status: "webgl-fail", compileLog: `${compileLog}\nruntime:\n${error instanceof Error ? error.stack ?? error.message : String(error)}`, glError: gl.NO_ERROR, metrics, elapsedMs: 0 }, pixels: image };
  } finally {
    // This executes for shader compile/link failures and partially-created
    // texture sets as well as successful draws.
    const glError = drainErrors(gl);
    for (const texture of textures) gl.deleteTexture(texture);
    if (quad) gl.deleteBuffer(quad);
    if (program) gl.deleteProgram(program);
    if (vertex.shader) gl.deleteShader(vertex.shader);
    if (fragment.shader) gl.deleteShader(fragment.shader);
    if (!rendered) {
      rendered = { result: { id: effect.id, name: effect.name, category: effect.category, status: "webgl-fail", compileLog, glError, metrics, elapsedMs: 0 }, pixels: image };
    }
    rendered.result.glError = glError;
    rendered.result.elapsedMs = performance.now() - startedAt;
    if (glError !== gl.NO_ERROR) rendered.result.status = "webgl-fail";
  }
  return rendered;
}

export function flipAuditRows(pixels: Uint8Array, width = WIDTH, height = HEIGHT): Uint8Array {
  const flipped = new Uint8Array(pixels.length);
  const rowSize = width * 4;
  for (let row = 0; row < height; row += 1) {
    flipped.set(pixels.subarray(row * rowSize, row * rowSize + rowSize), (height - row - 1) * rowSize);
  }
  return flipped;
}

const FONT: Record<string, readonly string[]> = {
  "A": ["010", "101", "111", "101", "101"], "B": ["110", "101", "110", "101", "110"], "C": ["011", "100", "100", "100", "011"], "D": ["110", "101", "101", "101", "110"], "E": ["111", "100", "110", "100", "111"], "F": ["111", "100", "110", "100", "100"], "G": ["011", "100", "101", "101", "011"], "H": ["101", "101", "111", "101", "101"], "I": ["111", "010", "010", "010", "111"], "J": ["001", "001", "001", "101", "010"], "K": ["101", "101", "110", "101", "101"], "L": ["100", "100", "100", "100", "111"], "M": ["101", "111", "111", "101", "101"], "N": ["101", "111", "111", "111", "101"], "O": ["010", "101", "101", "101", "010"], "P": ["110", "101", "110", "100", "100"], "Q": ["010", "101", "101", "111", "011"], "R": ["110", "101", "110", "101", "101"], "S": ["011", "100", "010", "001", "110"], "T": ["111", "010", "010", "010", "010"], "U": ["101", "101", "101", "101", "111"], "V": ["101", "101", "101", "101", "010"], "W": ["101", "101", "111", "111", "101"], "X": ["101", "101", "010", "101", "101"], "Y": ["101", "101", "010", "010", "010"], "Z": ["111", "001", "010", "100", "111"],
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"], "2": ["110", "001", "111", "100", "111"], "3": ["110", "001", "011", "001", "110"], "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "110", "001", "110"], "6": ["011", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"], "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "110"],
  "-": ["000", "000", "111", "000", "000"], "/": ["001", "001", "010", "100", "100"], ".": ["000", "000", "000", "000", "010"], ":": ["000", "010", "000", "010", "000"], " ": ["000", "000", "000", "000", "000"],
};

/** Converts labels to the embedded font's deliberately small visible alphabet. */
export function normalizeAuditText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9 .:/-]/g, " ");
}

export const AUDIT_CONTACT_SHEET = {
  columns: 7,
  fontScale: 2,
  glyphWidth: 3,
  glyphHeight: 5,
  labelLineHeight: 12,
  tileHeight: HEIGHT + 52,
} as const;

function drawText(png: PNG, text: string, x: number, y: number, color: [number, number, number], maxCharacters: number) {
  for (const [index, character] of [...normalizeAuditText(text).slice(0, maxCharacters)].entries()) {
    const glyph = FONT[character] ?? FONT[" "];
    for (let row = 0; row < glyph.length; row += 1) for (let column = 0; column < glyph[row].length; column += 1) {
      if (glyph[row][column] !== "1") continue;
      for (let scaleY = 0; scaleY < AUDIT_CONTACT_SHEET.fontScale; scaleY += 1) for (let scaleX = 0; scaleX < AUDIT_CONTACT_SHEET.fontScale; scaleX += 1) {
        const offset = ((y + row * AUDIT_CONTACT_SHEET.fontScale + scaleY) * png.width
          + x + index * 4 * AUDIT_CONTACT_SHEET.fontScale + column * AUDIT_CONTACT_SHEET.fontScale + scaleX) * 4;
        png.data[offset] = color[0]; png.data[offset + 1] = color[1]; png.data[offset + 2] = color[2]; png.data[offset + 3] = 255;
      }
    }
  }
}

export function buildAuditContactSheet(rendered: RenderedEffect[]): PNG {
  const { columns, tileHeight, labelLineHeight } = AUDIT_CONTACT_SHEET;
  const rows = Math.ceil(rendered.length / columns);
  const png = new PNG({ width: columns * WIDTH, height: rows * tileHeight, colorType: 6 });
  png.data.fill(0);
  rendered.forEach(({ result, pixels }, index) => {
    const x = (index % columns) * WIDTH;
    const y = Math.floor(index / columns) * tileHeight;
    if (pixels) {
      const image = flipAuditRows(pixels);
      for (let row = 0; row < HEIGHT; row += 1) png.data.set(image.subarray(row * WIDTH * 4, (row + 1) * WIDTH * 4), ((y + row) * png.width + x) * 4);
    }
    const statusColor: [number, number, number] = result.status === "pass" ? [100, 255, 159] : [255, 75, 94];
    // Four explicit metadata rows keep every required field visible. Names are
    // deliberately clipped to the tile width; IDs and categories receive their
    // own full rows rather than competing for the same 256px label band.
    drawText(png, result.name, x + 3, y + HEIGHT + 2, [255, 255, 255], 31);
    drawText(png, result.id, x + 3, y + HEIGHT + 2 + labelLineHeight, [160, 198, 255], 31);
    drawText(png, result.category, x + 3, y + HEIGHT + 2 + labelLineHeight * 2, [160, 198, 255], 31);
    drawText(png, result.status === "pass" ? "PASS" : `FAIL ${result.status}`, x + 3, y + HEIGHT + 2 + labelLineHeight * 3, statusColor, 31);
  });
  return png;
}

export function resolveAuditSelection(effects: EffectDef[], effectId?: string): { effects: EffectDef[]; exitCode: 0 | 2; error?: string } {
  if (!effectId) return { effects, exitCode: 0 };
  const selected = effects.filter((effect) => effect.id === effectId);
  return selected.length === 1
    ? { effects: selected, exitCode: 0 }
    : { effects: [], exitCode: 2, error: `Unknown effect ID: ${effectId}` };
}

export function buildAuditReport(results: EffectAuditResult[], environment: { node: string; platform: string; glVersion: string; renderer: string; vendor: string }) {
  const summary = results.reduce((counts, result) => {
    counts.total += 1;
    counts[result.status] += 1;
    if (result.status !== "pass") counts.failed += 1;
    return counts;
  }, { total: 0, pass: 0, "compile-fail": 0, "webgl-fail": 0, blank: 0, inert: 0, failed: 0 } as Record<EffectAuditStatus | "total" | "failed", number>);
  return {
    date: REPORT_DATE,
    registry: { total: EFFECTS.length, uniqueIds: new Set(EFFECTS.map((effect) => effect.id)).size, uniqueNames: new Set(EFFECTS.map((effect) => effect.name)).size },
    selected: results.length,
    environment,
    dimensions: { width: WIDTH, height: HEIGHT },
    samples: SAMPLE_TIMES.map((time, index) => ({ time, pulse: SAMPLE_PULSES[index] })),
    thresholds: EFFECT_AUDIT_THRESHOLDS,
    summary,
    results,
  };
}

async function main() {
  let options: AuditOptions | null;
  try {
    options = parseAuditOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exitCode = 2;
    return;
  }
  if (!options) return;
  const registry = {
    total: EFFECTS.length,
    uniqueIds: new Set(EFFECTS.map((effect) => effect.id)).size,
    uniqueNames: new Set(EFFECTS.map((effect) => effect.name)).size,
  };
  if (registry.total !== 108 || registry.uniqueIds !== 108 || registry.uniqueNames !== 108) {
    console.error(`Effect registry gate failed: expected 108 total/unique IDs/unique names; received ${registry.total}/${registry.uniqueIds}/${registry.uniqueNames}.`);
    process.exitCode = 1;
    return;
  }
  const selection = resolveAuditSelection(EFFECTS, options.effectId);
  if (selection.exitCode !== 0) {
    console.error(selection.error);
    process.exitCode = selection.exitCode;
    return;
  }
  const selected = selection.effects;

  let createGl: (width: number, height: number, options?: WebGLContextAttributes) => AuditGl | null;
  try {
    createGl = require("gl") as typeof createGl;
  } catch (error) {
    console.error(`Unable to load native headless WebGL (gl): ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }
  const gl = createGl(WIDTH, HEIGHT, { preserveDrawingBuffer: true, alpha: true, antialias: false });
  if (!gl) {
    console.error("Unable to create a 256x144 WebGL1 context via gl.");
    process.exitCode = 1;
    return;
  }
  try {
    const rendered = selected.map((effect) => renderEffectForAudit(gl, effect));
    const results = rendered.map((entry) => entry.result);
    const report = buildAuditReport(results, { node: process.version, platform: process.platform, glVersion: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER), vendor: gl.getParameter(gl.VENDOR) });
    await mkdir(options.outDir, { recursive: true });
    await writeFile(path.join(options.outDir, `${REPORT_DATE}-results.json`), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(path.join(options.outDir, `${REPORT_DATE}-contact-sheet.png`), PNG.sync.write(buildAuditContactSheet(rendered)));
    console.log(`Audited ${report.summary.total} effect${report.summary.total === 1 ? "" : "s"}: ${report.summary.pass} pass, ${report.summary.failed} failed.`);
    if (report.summary.failed > 0) process.exitCode = 1;
  } finally {
    gl.getExtension("STACKGL_destroy_context")?.destroy();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
