/**
 * One source of truth for radial-wheel layout *and* hit-testing.
 *
 * The mobile hot-trigger wheel used to compute these separately: it rendered
 * slots at fractional radii (`.29` / `.43` of the wheel's diameter) but
 * flick-selected them against a hard-coded `distance < 112` pixel boundary.
 * Those two agree only when the wheel happens to be about 600px across, so on
 * a phone the ring you could see and the ring you could hit were different
 * rings. Everything here works in **normalized wheel space** — distances as a
 * fraction of the wheel's diameter, origin at the centre, +y downward — so
 * layout and hit-testing cannot drift apart at any viewport size.
 *
 * Ring breadth is capped at `PER_RING` because pie-menu research is
 * consistent that breadth past ~8 items costs accuracy, while depth costs
 * only reaction time: when a surface has more items than fit, the answer is
 * another level, not another item. See docs/MOBILE_UX_AUDIT.md §8.
 */

export type WheelSlot = {
  index: number;
  /** 0 = outermost ring. */
  ring: number;
  /** Degrees clockwise from twelve o'clock. */
  angleDeg: number;
  /** Distance from centre, as a fraction of the wheel's diameter. */
  radius: number;
};

export type WheelPlanOptions = {
  /** Max items on one ring before a second ring is opened. */
  perRing?: number;
  /** Radius of the outermost ring, as a fraction of diameter. */
  outerRadius?: number;
  /** Radial gap between rings, as a fraction of diameter. */
  ringGap?: number;
  /** Whole-wheel rotation in degrees, applied to every slot. */
  rotationDeg?: number;
};

export const PER_RING = 8;
const OUTER_RADIUS = 0.42;
const RING_GAP = 0.13;
/** Nothing inside this fraction of the diameter belongs to a slot — it's the
 *  hub, and on this wheel the hub is a control of its own. */
export const HUB_RADIUS = 0.15;

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

/**
 * How many items sit on each ring, outermost first. Rings fill outward-in and
 * the *outer* ring takes the overflow, because an outer ring has more
 * circumference to spend: putting the remainder inside (as the old code did)
 * crowds the smallest circle with the most items.
 */
export function ringPlan(total: number, perRing = PER_RING): number[] {
  if (total <= 0) return [];
  if (total <= perRing) return [total];
  const rings = Math.ceil(total / perRing);
  const counts: number[] = [];
  let left = total;
  for (let ring = 0; ring < rings; ring++) {
    // Spread as evenly as possible, then give any remainder to the outer rings.
    const share = Math.ceil(left / (rings - ring));
    counts.push(Math.min(share, perRing));
    left -= counts[ring];
  }
  return counts;
}

export function wheelSlots(total: number, options: WheelPlanOptions = {}): WheelSlot[] {
  const {
    perRing = PER_RING,
    outerRadius = OUTER_RADIUS,
    ringGap = RING_GAP,
    rotationDeg = 0,
  } = options;
  const counts = ringPlan(total, perRing);
  const slots: WheelSlot[] = [];
  let index = 0;
  counts.forEach((count, ring) => {
    const radius = Math.max(HUB_RADIUS + 0.04, outerRadius - ring * ringGap);
    // Stagger every other ring by half a step so an inner slot never hides
    // directly beneath an outer one along the same radial line.
    const stagger = ring % 2 === 0 ? 0 : 180 / Math.max(1, count);
    for (let i = 0; i < count; i++) {
      slots.push({
        index: index++,
        ring,
        angleDeg: normalizeDegrees(i * 360 / count + stagger + rotationDeg),
        radius,
      });
    }
  });
  return slots;
}

/** Centre offset of a slot in normalized wheel space (+y downward). */
export function slotOffset(slot: WheelSlot): { x: number; y: number } {
  const radians = (slot.angleDeg - 90) * Math.PI / 180;
  return { x: Math.cos(radians) * slot.radius, y: Math.sin(radians) * slot.radius };
}

/**
 * Which slot a point falls in, or -1. Nearest-centre rather than
 * wedge-by-angle: it degrades gracefully (a point between two rings picks the
 * closer one instead of a ring that isn't there), and it is exactly the test
 * the desktop wheel already uses, so both wheels now behave the same way.
 *
 * `tolerance` is a fraction of the diameter. It defaults to just under half
 * the angular spacing of the busiest ring, so the dead space between
 * neighbours stays dead instead of snapping to whichever is a hair closer.
 */
export function hitSlot(
  nx: number,
  ny: number,
  slots: WheelSlot[],
  tolerance?: number,
): number {
  if (!slots.length) return -1;
  if (Math.hypot(nx, ny) < HUB_RADIUS) return -1;
  const limit = tolerance ?? defaultTolerance(slots);
  let best = -1;
  let bestDistance = limit;
  for (const slot of slots) {
    const offset = slotOffset(slot);
    const distance = Math.hypot(nx - offset.x, ny - offset.y);
    if (distance <= bestDistance) {
      best = slot.index;
      bestDistance = distance;
    }
  }
  return best;
}

function defaultTolerance(slots: WheelSlot[]): number {
  let tightest = Infinity;
  const perRing = new Map<number, WheelSlot[]>();
  for (const slot of slots) {
    const list = perRing.get(slot.ring);
    if (list) list.push(slot); else perRing.set(slot.ring, [slot]);
  }
  for (const [, list] of perRing) {
    if (list.length < 2) continue;
    // Chord between neighbours on this ring: 2r·sin(π/n).
    const chord = 2 * list[0].radius * Math.sin(Math.PI / list.length);
    tightest = Math.min(tightest, chord);
  }
  if (!Number.isFinite(tightest)) return 0.22;
  return Math.max(0.08, Math.min(0.22, tightest * 0.62));
}

/**
 * Angle of a pointer around the wheel centre, in degrees clockwise from
 * twelve o'clock. Shared by rotation drags and by arc sliders.
 */
export function pointerAngle(dx: number, dy: number): number {
  return normalizeDegrees(Math.atan2(dy, dx) * 180 / Math.PI + 90);
}

/**
 * Shortest signed angular delta from `from` to `to`, in (-180, 180]. Rotation
 * drags accumulate these, so crossing twelve o'clock mustn't read as a 359°
 * jump backwards.
 */
export function angleDelta(from: number, to: number): number {
  let delta = normalizeDegrees(to - from);
  if (delta > 180) delta -= 360;
  return delta;
}

/**
 * Value change per degree of angular travel, scaled by how far the finger is
 * from the centre. Physical rotary controls get finer the wider you hold
 * them, and the same trick is what makes a touch arc-slider usable for both
 * "swing it across the range" and "nudge it a hair": near the ring the whole
 * range is a comfortable sweep, out near the rim it's a vernier.
 *
 * `radius` is normalized wheel space. Returns a multiplier in [0.18, 1].
 */
export function precisionForRadius(radius: number): number {
  const near = 0.30;
  const far = 0.70;
  if (radius <= near) return 1;
  if (radius >= far) return 0.18;
  const t = (radius - near) / (far - near);
  return 1 + t * (0.18 - 1);
}

/**
 * Spread `total` items across rings of the given radii, in proportion to each
 * ring's circumference.
 *
 * This is the counterpart to `ringPlan` for a wheel whose ring *count* is
 * fixed by an existing design rather than derived from a breadth budget — the
 * hot-trigger wheel, which has always been two concentric rings and whose
 * users have the muscle memory to prove it.
 *
 * Splitting such a wheel evenly is the wrong instinct: an inner ring has
 * markedly less circumference to spend, so an even split makes the *inner*
 * ring the crowded one. On a 390px phone the old fixed 14-outer / 12-inner
 * split put the inner slots ~50px apart centre-to-centre, which is barely
 * more than one 44px target. Weighting by circumference evens the gaps out
 * instead of the counts.
 */
export function proportionalRingPlan(total: number, radii: number[]): number[] {
  if (total <= 0 || radii.length === 0) return [];
  if (radii.length === 1) return [total];
  const weights = radii.map(r => Math.max(0.0001, r));
  const sum = weights.reduce((a, b) => a + b, 0);
  const counts = weights.map(w => Math.floor((total * w) / sum));
  // Hand out what rounding dropped, largest ring first — it has the room.
  let remainder = total - counts.reduce((a, b) => a + b, 0);
  const order = radii.map((r, i) => [r, i] as const).sort((a, b) => b[0] - a[0]);
  let cursor = 0;
  while (remainder > 0) {
    counts[order[cursor % order.length][1]]++;
    remainder--;
    cursor++;
  }
  // A ring with nothing on it is a ring that shouldn't be drawn.
  return counts.filter(count => count > 0);
}

/**
 * Slots for a wheel with a fixed set of ring radii, filled proportionally.
 * Same normalized space, same hit-test, as `wheelSlots`.
 */
export function fixedRingSlots(
  total: number,
  radii: number[],
  rotationDeg = 0,
): WheelSlot[] {
  const counts = proportionalRingPlan(total, radii);
  const slots: WheelSlot[] = [];
  let index = 0;
  counts.forEach((count, ring) => {
    const radius = radii[ring] ?? radii[radii.length - 1];
    const stagger = ring % 2 === 0 ? 0 : 180 / Math.max(1, count);
    for (let i = 0; i < count; i++) {
      slots.push({
        index: index++,
        ring,
        angleDeg: normalizeDegrees(i * 360 / count + stagger + rotationDeg),
        radius,
      });
    }
  });
  return slots;
}

/**
 * Centre-to-centre spacing between neighbours on a ring, in pixels, for a
 * wheel of `diameter`. Used to sanity-check that a layout can actually be
 * touched — a ring whose spacing drops below a target's own width is a ring
 * of overlapping buttons however good it looks in a screenshot.
 */
export function ringSpacingPx(radius: number, count: number, diameter: number): number {
  if (count < 2) return Infinity;
  return 2 * radius * diameter * Math.sin(Math.PI / count);
}

/**
 * Undo a wheel's rotation for a point in normalized wheel space.
 *
 * Both wheels apply their rotation in CSS, on the container. That means slot
 * geometry can be built once and reused across a whole spin — but it also
 * means a pointer position has to be rotated *back* before it is hit-tested
 * against that unrotated geometry. Baking the rotation into the slots
 * instead applies it twice: once in the layout, once again in CSS.
 */
export function unrotatePoint(nx: number, ny: number, rotationDeg: number): { x: number; y: number } {
  if (!rotationDeg) return { x: nx, y: ny };
  const radians = -rotationDeg * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: nx * cos - ny * sin, y: nx * sin + ny * cos };
}
