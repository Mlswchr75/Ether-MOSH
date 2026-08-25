import { describe, expect, it } from "vitest";
import { EFFECTS, EFFECT_SAMPLER_NAMES } from "./effects";
import { EFFECT_AUDIT_THRESHOLDS, measureEffectFrame } from "./effectAudit";
import {
  AUDIT_CONTACT_SHEET,
  AUDIT_SAMPLER_NAMES,
  bindAuditUniforms,
  buildAuditContactSheet,
  buildAuditReport,
  createAuditDiagnosticPixels,
  flipAuditRows,
  normalizeAuditText,
  parseAuditOptions,
  renderEffectForAudit,
  resolveAuditSelection,
  type AuditGl,
} from "../../scripts/effect-audit";
import type { EffectAuditResult } from "./effectAudit";

function fakeGl(options: {
  failVertex?: boolean;
  failFragment?: boolean;
  failLink?: boolean;
  throwAtShaderSource?: number;
  throwAtTexture?: number;
  errors?: number[];
  readPixels?: (pixels: Uint8Array) => void;
} = {}) {
  const deletedShaders: unknown[] = [];
  const deletedPrograms: unknown[] = [];
  const deletedTextures: unknown[] = [];
  const uniform1i: Array<[unknown, number]> = [];
  const uniform1f: Array<[unknown, number]> = [];
  const errors = [...(options.errors ?? [])];
  let shaderCount = 0;
  let shaderSources = 0;
  let textureUploads = 0;
  const gl = {
    NO_ERROR: 0, VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    TEXTURE_2D: 5, TEXTURE_MIN_FILTER: 6, TEXTURE_MAG_FILTER: 7, TEXTURE_WRAP_S: 8, TEXTURE_WRAP_T: 9,
    NEAREST: 10, CLAMP_TO_EDGE: 11, UNPACK_ALIGNMENT: 12, RGBA: 13, UNSIGNED_BYTE: 14,
    TEXTURE0: 100, ARRAY_BUFFER: 15, STATIC_DRAW: 16, FLOAT: 17, COLOR_BUFFER_BIT: 18, TRIANGLES: 19,
    createShader: () => ({ kind: shaderCount++ === 0 ? "vertex" : "fragment" }),
    shaderSource: () => { shaderSources += 1; if (options.throwAtShaderSource === shaderSources) throw new Error("shader source failed"); }, compileShader: () => {}, getShaderInfoLog: () => "shader-log",
    getShaderParameter: (shader: { kind: string }) => shader.kind === "vertex" ? !options.failVertex : !options.failFragment,
    createProgram: () => ({ kind: "program" }), attachShader: () => {}, linkProgram: () => {}, getProgramInfoLog: () => "link-log",
    getProgramParameter: () => !options.failLink,
    createTexture: () => ({ kind: "texture", index: textureUploads }), bindTexture: () => {}, pixelStorei: () => {}, texParameteri: () => {},
    texImage2D: () => { textureUploads += 1; if (options.throwAtTexture === textureUploads) throw new Error("texture upload failed"); },
    getUniformLocation: (_program: unknown, name: string) => name,
    activeTexture: () => {}, uniform1i: (location: unknown, unit: number) => { uniform1i.push([location, unit]); },
    uniform1f: (location: unknown, value: number) => { uniform1f.push([location, value]); }, uniform2f: () => {},
    createBuffer: () => ({ kind: "buffer" }), bindBuffer: () => {}, bufferData: () => {}, getAttribLocation: () => 0,
    enableVertexAttribArray: () => {}, vertexAttribPointer: () => {}, viewport: () => {}, useProgram: () => {},
    clearColor: () => {}, clear: () => {}, drawArrays: () => {}, readPixels: (_x: number, _y: number, _width: number, _height: number, _format: number, _type: number, pixels: Uint8Array) => { options.readPixels?.(pixels); },
    getError: () => errors.shift() ?? 0,
    deleteTexture: (texture: unknown) => { deletedTextures.push(texture); }, deleteBuffer: () => {},
    deleteProgram: (program: unknown) => { deletedPrograms.push(program); }, deleteShader: (shader: unknown) => { deletedShaders.push(shader); },
  };
  return { gl: gl as unknown as AuditGl, deletedShaders, deletedPrograms, deletedTextures, uniform1i, uniform1f };
}

describe("effect audit metrics", () => {
  it("flags identical output as inert", () => {
    const source = new Uint8Array([20, 40, 60, 255, 80, 100, 120, 255]);

    expect(measureEffectFrame(source, source).inert).toBe(true);
  });

  it("accepts a visibly changed nonblank output", () => {
    const source = new Uint8Array([20, 40, 60, 255, 80, 100, 120, 255]);
    const output = new Uint8Array([220, 40, 60, 255, 10, 210, 120, 255]);

    const metrics = measureEffectFrame(source, output);
    expect(metrics.blank).toBe(false);
    expect(metrics.inert).toBe(false);
  });

  it("uses strict alpha, luminance, changed-pixel, and inert thresholds", () => {
    const black = new Uint8Array([0, 0, 0, 255]);
    const atLuminanceFloor = new Uint8Array([1, 1, 1, 255]);
    expect(measureEffectFrame(black, black).blank).toBe(true);
    expect(measureEffectFrame(black, atLuminanceFloor).blank).toBe(false);

    const source = new Uint8Array(100 * 4);
    source.fill(255, 3, source.length);
    const coverageAtFloor = new Uint8Array(source);
    coverageAtFloor.fill(0, 3, coverageAtFloor.length);
    coverageAtFloor[3] = 255;
    coverageAtFloor[0] = coverageAtFloor[1] = coverageAtFloor[2] = 255;
    expect(measureEffectFrame(source, coverageAtFloor).blank).toBe(false);

    const deltaAtBoundary = new Uint8Array([4, 4, 4, 255]);
    const deltaAboveBoundary = new Uint8Array([5, 4, 4, 255]);
    expect(measureEffectFrame(black, deltaAtBoundary).changedPixelRatio).toBe(0);
    expect(measureEffectFrame(black, deltaAboveBoundary).changedPixelRatio).toBe(1);
    expect(measureEffectFrame(black, new Uint8Array([2, 0, 0, 255])).meanAbsoluteDelta)
      .toBeLessThan(EFFECT_AUDIT_THRESHOLDS.inertMeanAbsoluteDelta);
  });

  it("requires exactly 118 unique effect ids and names", () => {
    expect(EFFECTS).toHaveLength(118);
    expect(new Set(EFFECTS.map((effect) => effect.id)).size).toBe(118);
    expect(new Set(EFFECTS.map((effect) => effect.name)).size).toBe(118);
  });
});

describe("effect audit harness", () => {
  it.each([
    ["vertex compile", { failVertex: true }, 0, 2, 0],
    ["fragment compile", { failFragment: true }, 0, 2, 0],
    ["shader source", { throwAtShaderSource: 1 }, 0, 2, 0],
    ["program link", { failLink: true }, 1, 2, 0],
    ["mid-texture upload", { throwAtTexture: 3 }, 1, 2, 3],
  ] as const)("drains errors and destroys resources after %s failure", (_label, options, programs, shaders, textures) => {
    const fake = fakeGl({ ...options, errors: [901, 0] });
    const rendered = renderEffectForAudit(fake.gl, EFFECTS[0]);

    expect(rendered.result.status).not.toBe("pass");
    expect(rendered.result.glError).toBe(901);
    expect(fake.deletedPrograms).toHaveLength(programs);
    expect(fake.deletedShaders).toHaveLength(shaders);
    expect(fake.deletedTextures).toHaveLength(textures);
  });

  it("binds every sampler and declared default parameter", () => {
    const fake = fakeGl();
    bindAuditUniforms(fake.gl, {} as WebGLProgram, EFFECTS[0], Array.from({ length: 8 }, () => ({} as WebGLTexture)), 0.7, 0.65);

    expect(AUDIT_SAMPLER_NAMES).toEqual(EFFECT_SAMPLER_NAMES);
    expect(fake.uniform1i.map(([location]) => location)).toEqual(EFFECT_SAMPLER_NAMES);
    expect(fake.uniform1f).toEqual(expect.arrayContaining(EFFECTS[0].params.map((param) => [
      `u${param.key[0].toUpperCase()}${param.key.slice(1)}`,
      param.default,
    ])));
  });

  it.each([
    ["blank", undefined],
    ["inert", (pixels: Uint8Array) => pixels.set(createAuditDiagnosticPixels("source"))],
  ] as const)("treats a drained GL error as webgl-fail even when metrics are otherwise %s", (_kind, readPixels) => {
    const fake = fakeGl({ errors: [901, 0], readPixels });
    const rendered = renderEffectForAudit(fake.gl, EFFECTS[0]);

    expect(rendered.result.metrics?.[_kind === "blank" ? "blank" : "inert"]).toBe(true);
    expect(rendered.result.glError).toBe(901);
    expect(rendered.result.status).toBe("webgl-fail");
  });

  it("flips rows without changing pixels within each row", () => {
    const pixels = new Uint8Array([
      1, 0, 0, 255, 2, 0, 0, 255,
      3, 0, 0, 255, 4, 0, 0, 255,
    ]);
    expect([...flipAuditRows(pixels, 2, 2)]).toEqual([
      3, 0, 0, 255, 4, 0, 0, 255,
      1, 0, 0, 255, 2, 0, 0, 255,
    ]);
  });

  it("parses valid single-effect diagnostics and assigns CLI exit 2 to invalid IDs", () => {
    expect(parseAuditOptions(["--effect", "bloom", "--out-dir", "/tmp/audit"])).toEqual({ effectId: "bloom", outDir: "/tmp/audit" });
    expect(() => parseAuditOptions(["--effect"])).toThrow("Missing value");
    expect(() => parseAuditOptions(["--not-a-real-option"])).toThrow("Unknown option");
    expect(resolveAuditSelection(EFFECTS, "not-an-effect")).toMatchObject({ exitCode: 2, effects: [] });
    expect(resolveAuditSelection(EFFECTS, "bloom")).toMatchObject({ exitCode: 0, effects: [EFFECTS.find((effect) => effect.id === "bloom")] });
  });

  it("writes a seven-column, scaled-font metadata sheet and complete report summary", () => {
    const result: EffectAuditResult = {
      id: "bloom", name: "Bloom", category: "atmosphere", status: "pass", compileLog: "", glError: 0,
      metrics: measureEffectFrame(new Uint8Array([0, 0, 0, 255]), new Uint8Array([255, 0, 0, 255])), elapsedMs: 1,
    };
    const sheet = buildAuditContactSheet(Array.from({ length: 8 }, () => ({ result, pixels: new Uint8Array(256 * 144 * 4).fill(255) })));
    const report = buildAuditReport([result], { node: "test", platform: "test", glVersion: "WebGL 1", renderer: "fake", vendor: "fake" });

    expect(AUDIT_CONTACT_SHEET.columns).toBe(7);
    expect(AUDIT_CONTACT_SHEET.fontScale).toBeGreaterThanOrEqual(2);
    expect(sheet.width).toBe(7 * 256);
    expect(sheet.height).toBe(2 * AUDIT_CONTACT_SHEET.tileHeight);
    expect(sheet.data.subarray(256 * 144 * 4, 256 * (144 + 8) * 4).some((value) => value !== 0)).toBe(true);
    expect(report).toMatchObject({ selected: 1, summary: { total: 1, pass: 1, failed: 0 }, registry: { total: 118, uniqueIds: 118, uniqueNames: 118 } });
    expect(Object.keys(report).sort()).toEqual(["date", "dimensions", "environment", "registry", "results", "samples", "selected", "summary", "thresholds"]);
    expect(Object.keys(report.results[0]).sort()).toEqual(["category", "compileLog", "elapsedMs", "glError", "id", "metrics", "name", "status"]);
    expect(Object.keys(report.results[0].metrics ?? {}).sort()).toEqual(["blank", "changedPixelRatio", "inert", "luminanceMean", "luminanceVariance", "meanAbsoluteDelta"]);
  });

  it("normalizes every registry display name to visible bitmap-font characters", () => {
    for (const effect of EFFECTS) {
      const normalized = normalizeAuditText(effect.name);
      expect(normalized, effect.name).not.toBe("");
      expect(normalized, effect.name).toMatch(/^[A-Z0-9 .:/-]+$/);
    }
    expect(normalizeAuditText("Moiré Pulse")).toBe("MOIRE PULSE");
  });
});
