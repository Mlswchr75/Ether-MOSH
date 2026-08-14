/**
 * The hero headline, cycling through what MOSH does.
 *
 * The page's primary call to action still has to read as one — so "DROP AN
 * IMAGE" is not merely weighted, it is every other slot. The instrument's other
 * verbs fill the gaps between, which is what keeps the headline alive without
 * ever leaving a visitor looking at an upload icon captioned "FORGE".
 *
 * The current word is reported upward so the surrounding word field can avoid
 * showing the same word at the same time.
 */
import { useEffect, useRef, useState } from "react";
import { createWordBag } from "./wordField";

export const HERO_ANCHOR = "DROP AN IMAGE";

/** The verbs that take the off-beats between anchors. */
const HERO_ROTATION = [
  "MOSH",
  "GO LIVE",
  "BROWSE",
  "PASTE",
  "FORGE",
  "LINK",
  "WARP",
  "START CAMERA",
] as const;

const HOLD_MS = 2600;

export function HeroWord({ onWordChange }: { onWordChange?: (word: string) => void }) {
  const [word, setWord] = useState<string>(HERO_ANCHOR);
  const changeRef = useRef(onWordChange);
  changeRef.current = onWordChange;

  useEffect(() => {
    changeRef.current?.(HERO_ANCHOR);

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced) return; // Hold the call to action still.

    const bag = createWordBag(HERO_ROTATION);
    let onAnchor = true;
    const id = window.setInterval(() => {
      onAnchor = !onAnchor;
      // The rotation pool excludes nothing, so a null draw is impossible;
      // falling back to the anchor keeps the headline filled regardless.
      const next = onAnchor ? HERO_ANCHOR : (bag.next() ?? HERO_ANCHOR);
      setWord(next);
      changeRef.current?.(next);
    }, HOLD_MS);

    return () => window.clearInterval(id);
  }, []);

  return (
    // Two elements, not one: the wrapper owns the swap animation and the child
    // owns the RGB split. Both animate `transform`, so on a single element the
    // later rule would simply win and one effect would vanish.
    <div
      // Keying on the word restarts the glitch-in every swap, so the change
      // reads as corruption resolving rather than as a crossfade.
      key={word}
      aria-hidden="true"
      className="mosh-hero-swap"
    >
      <div
        className="mosh-text font-sans font-black uppercase text-[9vw] leading-[0.9] tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl"
        data-text={word}
      >
        {word}
      </div>
    </div>
  );
}
