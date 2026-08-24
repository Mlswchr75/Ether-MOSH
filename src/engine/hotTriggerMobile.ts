import "./hotTriggerMobile.css";

export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

export function nextLoopIndex(current: number, direction: -1 | 1, length: number): number {
  return wrapIndex(current + direction, length);
}

export function holdStepDelay(heldMs: number): number {
  if (heldMs >= 1400) return 72;
  if (heldMs >= 700) return 105;
  return 145;
}

function enhanceRail(rail: HTMLElement) {
  if (rail.dataset.mobileReelEnhanced === "true") return;
  rail.dataset.mobileReelEnhanced = "true";

  const shell = document.createElement("div");
  shell.className = "hot-trigger-mobile-shell";
  rail.parentNode?.insertBefore(shell, rail);
  shell.appendChild(rail);

  const makeArrow = (direction: -1 | 1) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `hot-trigger-mobile-arrow hot-trigger-mobile-arrow--${direction < 0 ? "up" : "down"}`;
    button.setAttribute("aria-label", direction < 0 ? "Previous hot triggers" : "Next hot triggers");
    button.setAttribute("title", direction < 0 ? "Previous hot triggers" : "Next hot triggers");
    button.dataset.noLongpress = "";
    button.innerHTML = `<span aria-hidden="true">${direction < 0 ? "▲" : "▼"}</span>`;

    let holdTimer = 0;
    let repeater = 0;
    let started = 0;
    let repeated = false;

    const step = () => {
      rail.dispatchEvent(new WheelEvent("wheel", {
        deltaY: direction * 60,
        bubbles: true,
        cancelable: true,
      }));
      try { (navigator as any).vibrate?.(4); } catch {}
    };

    const scheduleRepeat = () => {
      repeated = true;
      step();
      repeater = window.setTimeout(scheduleRepeat, holdStepDelay(performance.now() - started));
    };

    const clear = () => {
      if (holdTimer) window.clearTimeout(holdTimer);
      if (repeater) window.clearTimeout(repeater);
      holdTimer = 0;
      repeater = 0;
    };

    button.addEventListener("pointerdown", e => {
      e.preventDefault();
      e.stopPropagation();
      clear();
      repeated = false;
      started = performance.now();
      button.setPointerCapture?.(e.pointerId);
      holdTimer = window.setTimeout(scheduleRepeat, 360);
    });

    button.addEventListener("pointerup", e => {
      e.preventDefault();
      e.stopPropagation();
      clear();
      if (!repeated) step();
      if (button.hasPointerCapture?.(e.pointerId)) button.releasePointerCapture(e.pointerId);
    });

    button.addEventListener("pointercancel", clear);
    button.addEventListener("lostpointercapture", clear);
    return button;
  };

  shell.prepend(makeArrow(-1));
  shell.append(makeArrow(1));
}

function scan() {
  document.querySelectorAll<HTMLElement>(".hot-trigger-rail").forEach(enhanceRail);
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan, { once: true });
  } else {
    scan();
  }

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
