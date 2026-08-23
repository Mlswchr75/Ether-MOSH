export const FORGE_JOURNEY_PREVIEW_MS = 5 * 60 * 1000;
export const FORGE_JOURNEY_WARNING_MS = 60 * 1000;
export const FORGE_JOURNEY_STORAGE_KEY = "mosh_forge_journey_preview_v1";

export type ForgeJourneyPreview = {
  usedMs: number;
  startedAt: number | null;
};

const emptyPreview = (): ForgeJourneyPreview => ({ usedMs: 0, startedAt: null });

function clampUsedMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(FORGE_JOURNEY_PREVIEW_MS, Math.max(0, value))
    : 0;
}

export function readForgeJourneyPreview(raw: string | null): ForgeJourneyPreview {
  if (!raw) return emptyPreview();
  try {
    const parsed = JSON.parse(raw) as Partial<ForgeJourneyPreview>;
    return {
      usedMs: clampUsedMs(parsed.usedMs),
      startedAt: typeof parsed.startedAt === "number" && Number.isFinite(parsed.startedAt)
        ? parsed.startedAt
        : null,
    };
  } catch {
    return emptyPreview();
  }
}

export function elapsedForgeJourneyMs(preview: ForgeJourneyPreview, now = Date.now()): number {
  const activeMs = preview.startedAt == null ? 0 : Math.max(0, now - preview.startedAt);
  return Math.min(FORGE_JOURNEY_PREVIEW_MS, preview.usedMs + activeMs);
}

export function remainingForgeJourneyMs(preview: ForgeJourneyPreview, now = Date.now()): number {
  return Math.max(0, FORGE_JOURNEY_PREVIEW_MS - elapsedForgeJourneyMs(preview, now));
}

export function startForgeJourneyPreview(preview: ForgeJourneyPreview, now = Date.now()): ForgeJourneyPreview {
  if (remainingForgeJourneyMs(preview, now) === 0) {
    return { usedMs: FORGE_JOURNEY_PREVIEW_MS, startedAt: null };
  }
  return preview.startedAt == null ? { ...preview, startedAt: now } : preview;
}

export function stopForgeJourneyPreview(preview: ForgeJourneyPreview, now = Date.now()): ForgeJourneyPreview {
  return { usedMs: elapsedForgeJourneyMs(preview, now), startedAt: null };
}

export function formatForgeJourneyRemaining(remainingMs: number): string {
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}
