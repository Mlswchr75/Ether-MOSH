import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Toaster } from "sonner";
import { RoleControlRail } from "./RoleControlRail";
import { EFFECTS_BY_ID } from "@/engine/effects";
import { poolForRole } from "@/engine/artDirector";
import { groupLayersByRole } from "@/engine/effectRoles";
import { useStore } from "@/store/useStore";

const resetStore = () => {
  useStore.setState({
    layers: [], selectedLayerId: null, selectedRole: null,
    selectedRoleLayers: {}, roleCursor: "grade", past: [], future: [],
    currentLook: null, currentBrief: null, recentEffects: [], recentLooks: [],
    imageElement: document.createElement("img"), videoElement: null,
  });
};

function pointer(
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  pointerType: "mouse" | "touch",
  pointerId = 1,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
  });
  fireEvent(target, event);
}

const touch = (target: Element, type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel", pointerId = 1) =>
  pointer(target, type, "touch", pointerId);

describe("RoleControlRail", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStore();
    useStore.getState().mosh("nuclear");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders four understandable role buttons", () => {
    render(<RoleControlRail onTune={() => {}} />);

    expect(screen.getByRole("button", { name: /Color.*Grade/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Warp.*Form/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Glitch.*Accent/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Glow.*Finish/i })).not.toBeNull();
  });

  it("selects Glow without changing layers and opens its explanation", () => {
    render(<RoleControlRail onTune={() => {}} />);
    const before = structuredClone(useStore.getState().layers);

    fireEvent.click(screen.getByRole("button", { name: /Glow.*Finish/i }));

    expect(useStore.getState().layers).toEqual(before);
    expect(screen.getByText("Atmosphere and final polish")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Glow.*Finish/i }).getAttribute("aria-expanded")).toBe("true");
  });

  it("targets a repeated Glitch chip for reroll, lock, and tune", () => {
    const onTune = vi.fn();
    render(<RoleControlRail onTune={onTune} />);
    const accents = groupLayersByRole(useStore.getState().layers).accent;
    const target = accents[1];
    const before = useStore.getState().layers.map(layer => ({ id: layer.id, effectId: layer.effectId }));

    fireEvent.click(screen.getByRole("button", { name: /Glitch.*Accent/i }));
    fireEvent.click(screen.getByRole("button", { name: EFFECTS_BY_ID[target.effectId].name }));
    fireEvent.click(screen.getByRole("button", { name: "Reroll" }));

    expect(useStore.getState().layers
      .map((layer, index) => layer.effectId === before[index].effectId ? null : layer.id)
      .filter(Boolean)).toEqual([target.id]);

    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(useStore.getState().layers.find(layer => layer.id === target.id)?.locked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Tune" }));
    expect(onTune).toHaveBeenCalledWith(target.id);
  });

  it("exposes selected, next, locked, and empty states outside color", () => {
    render(<RoleControlRail onTune={() => {}} />);
    const form = groupLayersByRole(useStore.getState().layers).form[0];
    act(() => {
      useStore.getState().toggleLocked(form.id);
      useStore.setState({ roleCursor: "form" });
    });

    expect(screen.getByRole("button", { name: /Warp.*Form.*locked/i }).getAttribute("data-next")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Glow.*Finish/i }));

    expect(screen.getByRole("button", { name: /Glow.*Finish/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Warp.*Form.*locked/i })).not.toBeNull();
  });

  it("offers a source-gated Add action for an empty role", () => {
    useStore.getState().mosh("mild");
    useStore.setState({ imageElement: null });
    render(<RoleControlRail onTune={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Warp.*Form.*empty/i }));
    expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true);

    act(() => useStore.setState({ imageElement: document.createElement("img") }));
    expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("dismisses the first-use hint permanently", () => {
    const { unmount } = render(<RoleControlRail onTune={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss role controls hint" }));

    expect(window.localStorage.getItem("cathedral_role_rail_seen_v1")).toBe("1");
    unmount();
    render(<RoleControlRail onTune={() => {}} />);
    expect(screen.queryByText("Select a role - tap to evolve - drag to tune")).toBeNull();
  });

  it("opens the touch description only after a 450ms hold without rerolling", () => {
    vi.useFakeTimers();
    render(<RoleControlRail onTune={() => {}} />);
    const color = screen.getByRole("button", { name: /Color.*Grade/i });
    const before = structuredClone(useStore.getState().layers);

    touch(color, "pointerdown");
    act(() => vi.advanceTimersByTime(449));
    expect(screen.queryByRole("tooltip")).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tooltip").textContent).toContain("Tone and palette foundation");
    touch(color, "pointerup");

    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(useStore.getState().layers).toEqual(before);
  });

  it.each(["pointerMove", "pointerCancel", "pointerUp"])("cancels a pending touch description on %s", (eventName) => {
    vi.useFakeTimers();
    render(<RoleControlRail onTune={() => {}} />);
    const color = screen.getByRole("button", { name: /Color.*Grade/i });
    const before = structuredClone(useStore.getState().layers);

    touch(color, "pointerdown");
    touch(color, eventName.toLowerCase() as "pointermove" | "pointercancel" | "pointerup");
    act(() => vi.advanceTimersByTime(450));

    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(useStore.getState().layers).toEqual(before);
  });

  it("exposes the role description through the Radix tooltip on focus", () => {
    vi.useFakeTimers();
    render(<RoleControlRail onTune={() => {}} />);
    fireEvent.focus(screen.getByRole("button", { name: /Glow.*Finish/i }));
    act(() => vi.advanceTimersByTime(700));

    expect(screen.getByRole("tooltip").textContent).toContain("Atmosphere and final polish");
  });

  it("exposes the role description through the Radix tooltip on hover", () => {
    vi.useFakeTimers();
    render(<RoleControlRail onTune={() => {}} />);
    pointer(screen.getByRole("button", { name: /Glow.*Finish/i }), "pointermove", "mouse");
    act(() => vi.advanceTimersByTime(700));

    expect(screen.getByRole("tooltip").textContent).toContain("Atmosphere and final polish");
  });

  it("reports a locked reroll through Sonner", async () => {
    render(<><RoleControlRail onTune={() => {}} /><Toaster /></>);
    fireEvent.click(screen.getByRole("button", { name: /Warp.*Form/i }));
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    fireEvent.click(screen.getByRole("button", { name: "Reroll" }));

    expect(await screen.findByText("Role locked")).not.toBeNull();
  });

  it("reports an exhausted role through Sonner without mutating the stack", async () => {
    const template = groupLayersByRole(useStore.getState().layers).grade[0];
    const blocked = poolForRole("grade").map((effectId, index) => ({
      ...template,
      id: `all-grade-effects-${index}`,
      effectId,
      role: "grade" as const,
      locked: false,
    }));
    act(() => useStore.setState({
      layers: blocked,
      selectedLayerId: blocked[0].id,
      selectedRole: "grade",
      selectedRoleLayers: { grade: blocked[0].id },
      roleCursor: "grade",
    }));
    const before = structuredClone(useStore.getState().layers);
    render(<><RoleControlRail onTune={() => {}} /><Toaster /></>);

    fireEvent.click(screen.getByRole("button", { name: "Reroll" }));

    expect(await screen.findByText("No alternate effect available")).not.toBeNull();
    expect(useStore.getState().layers).toEqual(before);
  });
});
