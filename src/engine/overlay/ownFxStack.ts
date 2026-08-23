import type { Layer } from "@/store/types";
import { makeLayer } from "@/store/useStore";

export const MAX_OVERLAY_FX = 4;

export function addOwnFxLayer(layers: Layer[], effectId: string): Layer[] {
  if (!effectId || layers.length >= MAX_OVERLAY_FX) return layers;
  return [...layers, makeLayer(effectId)];
}

export function removeOwnFxLayer(layers: Layer[], id: string): Layer[] {
  return layers.filter(layer => layer.id !== id);
}

export function moveOwnFxLayer(layers: Layer[], id: string, direction: -1 | 1): Layer[] {
  const index = layers.findIndex(layer => layer.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= layers.length) return layers;
  const copy = [...layers];
  [copy[index], copy[next]] = [copy[next], copy[index]];
  return copy;
}

export function replaceOwnFxLayer(layers: Layer[], id: string, effectId: string): Layer[] {
  return layers.map(layer => layer.id === id ? makeLayer(effectId) : layer);
}
