export const INFO_WHEEL_THRESHOLD = 52;
export const INFO_SWIPE_THRESHOLD = 60;

export function isUpwardInfoWheel(deltaX: number, deltaY: number) {
  return deltaY < 0 && Math.abs(deltaY) > Math.abs(deltaX);
}

/** To reveal content conceptually above the title, the finger travels down. */
export function isInfoRevealSwipe(dx: number, dy: number) {
  return dy > INFO_SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx);
}
