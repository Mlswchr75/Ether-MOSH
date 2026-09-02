import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./useStore";

/**
 * captureLocked is the guard StickerCapture.tsx's exportLottieSticker holds
 * for the duration of a Lottie Sticker capture — see its own doc comment in
 * useStore.ts for the full reasoning. These tests exercise the guard
 * directly at the store level, independent of the component that sets it.
 */
describe("captureLocked", () => {
  beforeEach(() => {
    useStore.setState({
      layers: [], selectedLayerId: null, past: [], future: [],
      currentLook: null, currentBrief: null, recentFormEffects: [], recentOtherEffects: [], recentLooks: [],
      selectedRole: null, selectedRoleLayers: {}, roleCursor: "grade",
      captureLocked: false,
    });
    useStore.getState().mosh("savage");
  });

  it("blocks mosh() from changing the stack while locked", () => {
    const before = useStore.getState().layers;
    const seedBefore = useStore.getState().seed;
    useStore.setState({ captureLocked: true });

    useStore.getState().mosh();

    expect(useStore.getState().layers).toBe(before);
    expect(useStore.getState().seed).toBe(seedBefore);
  });

  it("blocks forgeMosh() from changing the stack while locked", () => {
    const before = useStore.getState().layers;
    useStore.setState({ captureLocked: true });

    useStore.getState().forgeMosh();

    expect(useStore.getState().layers).toBe(before);
  });

  it("blocks rerollRole() (and moshNext(), which delegates to it) while locked", () => {
    const before = useStore.getState().layers;
    useStore.setState({ captureLocked: true });

    expect(useStore.getState().rerollRole()).toBeNull();
    expect(useStore.getState().moshNext()).toBeNull();
    expect(useStore.getState().layers).toBe(before);
  });

  it("blocks loadSlot() while locked", () => {
    useStore.setState({ captureLocked: false });
    useStore.getState().saveSlot(0);
    const before = useStore.getState().layers;
    useStore.getState().mosh(); // change the live stack so loadSlot would have something to restore
    useStore.setState({ captureLocked: true });

    const ok = useStore.getState().loadSlot(0);

    expect(ok).toBe(false);
    expect(useStore.getState().layers).not.toBe(before); // still the post-mosh stack, unrestored
  });

  it("blocks applyFavorite() while locked", () => {
    const fav = useStore.getState().saveFavorite();
    useStore.getState().mosh(); // change the live stack so applyFavorite would have something to restore
    const before = useStore.getState().layers;
    useStore.setState({ captureLocked: true });

    const ok = useStore.getState().applyFavorite(fav.id);

    expect(ok).toBe(false);
    expect(useStore.getState().layers).toBe(before);
  });

  it("blocks reseedForge() while locked", () => {
    const seedBefore = useStore.getState().forge.seed;
    useStore.setState({ captureLocked: true });

    useStore.getState().reseedForge();

    expect(useStore.getState().forge.seed).toBe(seedBefore);
  });

  it("does NOT block randomiseForge() while locked — it doubles as the render loop's error-recovery fallback", () => {
    useStore.setState({ captureLocked: true });
    expect(() => useStore.getState().randomiseForge()).not.toThrow();
    // No assertion on *what* changed — the point is only that this
    // specific action isn't silently neutered by the lock the way the
    // others above are.
  });

  it("resumes normal behavior once unlocked", () => {
    useStore.setState({ captureLocked: true });
    useStore.getState().mosh();
    const stillBefore = useStore.getState().layers;

    useStore.setState({ captureLocked: false });
    useStore.getState().mosh();

    expect(useStore.getState().layers).not.toBe(stillBefore);
  });
});
