import { describe, expect, it } from 'vitest';
import { keyFxStack } from './fxStackCapture';

const frame = (pixels: number[]) => new ImageData(new Uint8ClampedArray(pixels), pixels.length / 4, 1);
describe('FX Stack alpha extraction', () => {
  it('preserves separated lights and the empty space between them without cropping', () => {
    const input = frame([255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 255]);
    const result = keyFxStack(input, 'black', 0);
    expect([result.width, result.height]).toEqual([3, 1]);
    expect([...result.data].filter((_, i) => i % 4 === 3)).toEqual([255, 0, 255]);
    expect(input.data[7]).toBe(255);
  });
  it('retains partial alpha on trails and unmattes grey to avoid dark fringes', () => {
    const result = keyFxStack(frame([64, 64, 64, 128]), 'black', 0);
    expect([...result.data]).toEqual([255, 255, 255, 32]);
  });
  it('removes light backgrounds and preserves dark artwork', () => {
    const result = keyFxStack(frame([255, 255, 255, 255, 0, 0, 0, 255]), 'white', 0);
    expect(result.data[3]).toBe(0);
    expect([...result.data.slice(4)]).toEqual([0, 0, 0, 255]);
  });
  it('respects the cutoff and never resurrects transparent source pixels', () => {
    const result = keyFxStack(frame([20, 20, 20, 255, 255, 50, 80, 0]), 'black', .1);
    expect(result.data[3]).toBe(0);
    expect(result.data[7]).toBe(0);
  });
});
