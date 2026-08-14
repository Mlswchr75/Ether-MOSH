import { craftOf, type Role } from "./artDirector";
import type { Layer } from "@/store/types";

export const ROLE_ORDER: Role[] = ["grade", "form", "accent", "finish"];

export const ROLE_COPY: Record<Role, {
  label: "COLOR" | "WARP" | "GLITCH" | "GLOW";
  technical: "Grade" | "Form" | "Accent" | "Finish";
  description: string;
}> = {
  grade: { label: "COLOR", technical: "Grade", description: "Tone and palette foundation" },
  form: { label: "WARP", technical: "Form", description: "Shape, depth, and movement" },
  accent: { label: "GLITCH", technical: "Accent", description: "Corruption and signature detail" },
  finish: { label: "GLOW", technical: "Finish", description: "Atmosphere and final polish" },
};

const isRole = (value: unknown): value is Role =>
  typeof value === "string" && ROLE_ORDER.includes(value as Role);

export function roleForEffect(effectId: string): Role | null {
  return craftOf(effectId)?.role ?? null;
}

export function resolveLayerRole(layer: Layer, index: number): Role {
  if (isRole(layer.role)) return layer.role;
  return roleForEffect(layer.effectId) ?? ROLE_ORDER[index] ?? "accent";
}

export function normalizeLayerRoles(layers: Layer[]): Layer[] {
  return layers.map((layer, index) => {
    const role = resolveLayerRole(layer, index);
    return layer.role === role ? layer : { ...layer, role };
  });
}

export function groupLayersByRole(layers: Layer[]): Record<Role, Layer[]> {
  const groups: Record<Role, Layer[]> = {
    grade: [], form: [], accent: [], finish: [],
  };
  layers.forEach((layer, index) => groups[resolveLayerRole(layer, index)].push(layer));
  return groups;
}

export function nextAvailableRole(
  layers: Layer[], current: Role, options: { includeCurrent?: boolean } = {},
): Role | null {
  const groups = groupLayersByRole(layers);
  const currentIndex = ROLE_ORDER.indexOf(current);
  const start = options.includeCurrent ? 0 : 1;

  for (let offset = start; offset < ROLE_ORDER.length; offset++) {
    const role = ROLE_ORDER[(currentIndex + offset) % ROLE_ORDER.length];
    if (groups[role].some(layer => !layer.locked)) return role;
  }
  return null;
}
