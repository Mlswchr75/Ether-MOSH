import { describe, expect, it } from "vitest";
import { overlayFromUrl } from "./overlayMode";

/**
 * Overlay is configured entirely by URL because the URL is the only thing an
 * OBS browser source, an iframe embed, or a kiosk shortcut can carry. These
 * guard the parse: a link that silently fails to key leaves an opaque black
 * rectangle over the user's whole scene, which is the worst failure this
 * feature has.
 */

const U = (q: string) => `https://ether-mosh.netlify.app/?${q}`;

describe("overlay url parsing", () => {
  it("is off by default", () => {
    expect(overlayFromUrl("https://ether-mosh.netlify.app/").mode).toBe("off");
    expect(overlayFromUrl(U("foo=bar")).mode).toBe("off");
  });

  it("accepts the forms people actually type", () => {
    for (const v of ["1", "true", "on", "luma", "LUMA", "  On "]) {
      expect(overlayFromUrl(U(`overlay=${encodeURIComponent(v)}`)).mode, v).toBe("luma");
    }
  });

  it("accepts subject keying by several names", () => {
    for (const v of ["subject", "person", "depth"]) {
      expect(overlayFromUrl(U(`overlay=${v}`)).mode, v).toBe("subject");
    }
  });

  it("treats unknown values as off rather than guessing", () => {
    for (const v of ["yes", "0", "false", "chroma", "green"]) {
      expect(overlayFromUrl(U(`overlay=${v}`)).mode, v).toBe("off");
    }
  });

  it("reads gate and soft when given", () => {
    const c = overlayFromUrl(U("overlay=luma&gate=0.3&soft=0.05"));
    expect(c.gate).toBeCloseTo(0.3, 3);
    expect(c.soft).toBeCloseTo(0.05, 3);
  });

  it("clamps out-of-range tuning instead of passing it through", () => {
    const c = overlayFromUrl(U("overlay=subject&gate=5&soft=-3"));
    expect(c.gate).toBe(1);
    expect(c.soft).toBe(0);
  });

  it("omits unparseable tuning so the renderer default applies", () => {
    const c = overlayFromUrl(U("overlay=luma&gate=abc&soft="));
    expect(c.gate).toBeUndefined();
    expect(c.soft).toBeUndefined();
  });

  it("ignores tuning when overlay is off", () => {
    const c = overlayFromUrl(U("gate=0.5&soft=0.1"));
    expect(c.mode).toBe("off");
    expect(c.gate).toBeUndefined();
  });

  it("never throws on a malformed url", () => {
    for (const bad of ["", "not a url", "://", "http://[", "javascript:alert(1)"]) {
      expect(() => overlayFromUrl(bad)).not.toThrow();
      expect(overlayFromUrl(bad).mode).toBe("off");
    }
  });
});
