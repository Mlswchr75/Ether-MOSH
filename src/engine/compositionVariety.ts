/** Session-only, newest first. Bounded independently of undo history. */
export const STACK_MEMORY = 12;
export type StackMemory = readonly (readonly string[])[];

export function rememberStack(history: StackMemory, ids: readonly string[]): string[][] {
  return [[...new Set(ids)], ...history.map(stack => [...stack])].slice(0, STACK_MEMORY);
}

/** A repeated partner matters more than an individual effect returning.
 * The penalty rises as a familiar stack is rebuilt, then fades across taps.
 * Single-effect frequency also gives less-used candidates room to surface.
 */
export function combinationPenalty(id: string, chosen: readonly string[], history: StackMemory): number {
  let penalty = 0;
  for (let age = 0; age < Math.min(history.length, STACK_MEMORY); age++) {
    const stack = history[age];
    if (!stack.includes(id)) continue;
    const partners = chosen.filter(effect => stack.includes(effect)).length;
    penalty += Math.pow(0.78, age) * (0.18 + partners * 1.6);
  }
  return penalty;
}
