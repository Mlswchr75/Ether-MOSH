import { useId } from "react";

/**
 * Custom, maximalist/vaporwave hot-trigger icons — replacing lucide's plain
 * outline glyphs for the wheel's most-seen actions. Each one is deliberately
 * built from layered, gradient-filled shapes (not a single-color stroke
 * outline) so it reads as its own small piece of the app's aesthetic rather
 * than a generic UI icon, and each is geometrically distinct from the
 * others — no two share a silhouette family (burst vs. lens vs. chevron
 * stack vs. flame vs. mandala) — so the wheel reads as a legend of genuinely
 * different functions at a glance, the same job the per-trigger `tint`
 * color was already doing one layer up.
 *
 * `useId()` gives every instance's gradients their own ids — these render
 * simultaneously in more than one place (a ring slot's real icon AND its
 * `.hot-trigger__glitch` chromatic-offset ghost, sometimes the always-mounted
 * hidden XR registry copy too), and SVG gradient ids are global to the
 * document, so two instances sharing one id would silently steal each
 * other's fill.
 */

type IconProps = { className?: string };

/** Center-hub / Mosh — a three-armed flame-burst vortex around a glowing
 *  core, with small jagged energy shards interleaved between the arms.
 *  Suggests an explosive, instant morph — exactly what pressing it does. */
export function MoshVortexIcon({ className = "h-4 w-4" }: IconProps) {
  const uid = useId();
  const coreId = `mosh-core-${uid}`;
  const armId = `mosh-arm-${uid}`;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <radialGradient id={coreId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff7d6" />
          <stop offset="35%" stopColor="#ffd23f" />
          <stop offset="70%" stopColor="#ff6a3d" />
          <stop offset="100%" stopColor="#ff2d92" />
        </radialGradient>
        <linearGradient id={armId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff2d92" />
          <stop offset="50%" stopColor="#ff6a3d" />
          <stop offset="100%" stopColor="#ffd23f" />
        </linearGradient>
      </defs>
      {[0, 120, 240].map(angle => (
        <path
          key={angle}
          d="M12 12 C 12 7, 15 3, 19 2 C 16 6, 15.5 10, 12 12 Z"
          fill={`url(#${armId})`}
          opacity={0.92}
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
      {[60, 180, 300].map(angle => (
        <polygon
          key={angle}
          points="12,12 13.4,9.6 12,7.4 10.6,9.6"
          fill="#fff7d6"
          opacity={0.82}
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="3.1" fill={`url(#${coreId})`} />
    </svg>
  );
}

/** Live camera / feed — a scanning lens-eye inside a viewfinder reticle,
 *  with a satellite "on air" ping badge — a broadcast, not a snapshot. */
export function LiveFeedIcon({ className = "h-4 w-4" }: IconProps) {
  const uid = useId();
  const irisId = `feed-iris-${uid}`;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <radialGradient id={irisId} cx="42%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#e8fffb" />
          <stop offset="30%" stopColor="#5eead4" />
          <stop offset="70%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0891b2" />
        </radialGradient>
      </defs>
      {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
        <rect key={angle} x="11.4" y="0.9" width="1.2" height="2.6" rx="0.5" fill="#67e8f9" opacity={0.75} transform={`rotate(${angle} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="7.2" fill={`url(#${irisId})`} stroke="#083344" strokeWidth={0.6} />
      <circle cx="12" cy="12" r="3" fill="#031014" />
      <circle cx="10.1" cy="9.9" r="1.1" fill="#ffffff" opacity={0.9} />
      <circle cx="19" cy="5" r="2.1" fill="none" stroke="#22d3ee" strokeWidth={1} opacity={0.85} />
      <circle cx="19" cy="5" r="0.9" fill="#5eead4" />
    </svg>
  );
}

/** Upload — three ascending, glitch-trailing chevrons dissolving into
 *  scattered pixel-particles, feeding a beam column at the base. */
export function UploadBeamIcon({ className = "h-4 w-4" }: IconProps) {
  const uid = useId();
  const beamId = `upload-beam-${uid}`;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={beamId} x1="50%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor="#ff2d92" />
          <stop offset="55%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#fdf4ff" />
        </linearGradient>
      </defs>
      <rect x="10.4" y="1.3" width="1.3" height="1.3" fill="#fbcfe8" opacity={0.9} transform="rotate(18 11 2)" />
      <rect x="13" y="2.5" width="1" height="1" fill="#fdf4ff" opacity={0.75} transform="rotate(-12 13.5 3)" />
      <rect x="8.6" y="3.3" width="0.9" height="0.9" fill="#f9a8d4" opacity={0.7} />
      <path d="M6.4 9.6 L12 4.4 L17.6 9.6" stroke={`url(#${beamId})`} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M6.9 13.4 L12 8.6 L17.1 13.4" stroke="#ff2d92" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.72} />
      <path d="M7.4 17.2 L12 12.8 L16.6 17.2" stroke="#c026a3" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.5} />
      <rect x="11.15" y="16.4" width="1.7" height="5.7" rx="0.85" fill={`url(#${beamId})`} opacity={0.9} />
    </svg>
  );
}

/** Forge — a layered flame (outer lick + brighter inner lick) with floating
 *  embers and a molten drip at the base — built, not just lit. */
export function ForgeFlameIcon({ className = "h-4 w-4" }: IconProps) {
  const uid = useId();
  const outerId = `forge-outer-${uid}`;
  const innerId = `forge-inner-${uid}`;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={outerId} x1="50%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor="#7c2d12" />
          <stop offset="35%" stopColor="#ea580c" />
          <stop offset="75%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id={innerId} x1="50%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="60%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#fffbeb" />
        </linearGradient>
      </defs>
      <path
        d="M12 21.5c-3.6 0-6.2-2.5-6.2-5.9 0-2.4 1.3-3.9 2.5-5.6.4 1.3 1.1 2.1 1.9 2.5-.5-2.8.2-5.8 2.6-8 .2 2.1 1 3.5 2.3 4.9 1.6 1.7 3.1 3.4 3.1 6 0 3.5-2.7 6.1-6.2 6.1Z"
        fill={`url(#${outerId})`}
      />
      <path
        d="M12 19c-1.9 0-3.3-1.3-3.3-3.1 0-1.1.6-1.9 1.2-2.7.2.7.6 1.1 1 1.3-.3-1.5.1-3 1.4-4.2.1 1.1.6 1.8 1.2 2.5.8.9 1.6 1.8 1.6 3.1 0 1.8-1.4 3.1-3.1 3.1Z"
        fill={`url(#${innerId})`}
        opacity={0.95}
      />
      <circle cx="17.4" cy="4.6" r="0.9" fill="#fde047" opacity={0.9} />
      <circle cx="15.6" cy="2.4" r="0.55" fill="#fdba74" opacity={0.8} />
      <path d="M9.6 21.6c.3 1 1.1 1.6 2.1 1.6.9 0 1.7-.5 2-1.4" stroke="#c2410c" strokeWidth={1.1} strokeLinecap="round" opacity={0.8} fill="none" />
    </svg>
  );
}

/** Motif / pattern — a six-petal mandala radiating from a bright ringed
 *  center, standing in for seamless pattern generation. */
export function MotifMandalaIcon({ className = "h-4 w-4" }: IconProps) {
  const uid = useId();
  const petalId = `motif-petal-${uid}`;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={petalId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="55%" stopColor="#e879f9" />
          <stop offset="100%" stopColor="#fbcfe8" />
        </linearGradient>
      </defs>
      {[0, 60, 120, 180, 240, 300].map(angle => (
        <ellipse
          key={angle}
          cx="12" cy="7.4"
          rx="2.05" ry="4.1"
          fill={`url(#${petalId})`}
          opacity={0.82}
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="1.9" fill="#fdf4ff" />
      <circle cx="12" cy="12" r="1.9" fill="none" stroke="#a855f7" strokeWidth={0.6} />
    </svg>
  );
}

/** Home — a homing beacon: a gradient-filled house silhouette pulsing
 *  inside two concentric return-signal rings, with a glowing door/window. */
export function HomeBeaconIcon({ className = "h-4 w-4" }: IconProps) {
  const uid = useId();
  const bodyId = `home-body-${uid}`;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={bodyId} x1="50%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="55%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#e0e7ff" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12.5" r="9.2" fill="none" stroke="#818cf8" strokeWidth={0.6} opacity={0.35} />
      <circle cx="12" cy="12.5" r="6.6" fill="none" stroke="#a5b4fc" strokeWidth={0.6} opacity={0.45} />
      <path d="M12 3.6 L20.5 11 H17.6 V20 H6.4 V11 H3.5 Z" fill={`url(#${bodyId})`} />
      <rect x="10.4" y="14.2" width="3.2" height="5.8" rx="0.6" fill="#1e1b4b" opacity={0.85} />
      <circle cx="12" cy="9.8" r="1.15" fill="#fef9c3" opacity={0.9} />
    </svg>
  );
}

/** Account — a faceted, low-poly crystal bust: a gemstone head above a
 *  robed-shoulder body, standing in for "you" without drawing a literal
 *  face. */
export function AccountCrystalIcon({ className = "h-4 w-4" }: IconProps) {
  const uid = useId();
  const headId = `account-head-${uid}`;
  const bodyId = `account-body-${uid}`;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={headId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e9d5ff" />
          <stop offset="45%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#7e22ce" />
        </linearGradient>
        <linearGradient id={bodyId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#f0abfc" />
        </linearGradient>
      </defs>
      <polygon points="12,2.6 16.4,6 15,10.4 9,10.4 7.6,6" fill={`url(#${headId})`} />
      <polygon points="12,2.6 16.4,6 12,7.4" fill="#f5d0fe" opacity={0.55} />
      <path d="M5.4 21.4 C5.8 15.6 8.3 12.6 12 12.6 C15.7 12.6 18.2 15.6 18.6 21.4 Z" fill={`url(#${bodyId})`} />
      <polygon points="12,12.6 15.6,15.4 12,18.6 8.4,15.4" fill="#e9d5ff" opacity={0.4} />
    </svg>
  );
}
