import type { Layer } from "@/store/types";

export function patchOwnFxParam(layers: Layer[], layerId: string, key: string, value: number): Layer[] {
  return layers.map(layer => layer.id === layerId
    ? { ...layer, params: { ...layer.params, [key]: value } }
    : layer);
}
