export type StickerLottiePreset = "float" | "pulse" | "wobble" | "spin" | "bounce" | "flicker" | "breathe" | "orbit" | "jitter" | "glitch";

type BuildStickerLottieInput = {
  name: string;
  width: number;
  height: number;
  imageDataUrl: string;
  preset: StickerLottiePreset;
  durationSeconds?: number;
  fps?: number;
};

type KeyframedValue = { a: 0 | 1; k: any };
function still(value: number[]): KeyframedValue { return { a: 0, k: value }; }

function transformForPreset(preset: StickerLottiePreset, w: number, h: number, frames: number) {
  const cx = w / 2, cy = h / 2, half = Math.max(1, Math.round(frames / 2)), quarter = Math.max(1, Math.round(frames / 4));
  const p = still([cx, cy, 0]), s = still([100,100,100]), r = still([0]), o = still([100]);
  if (preset === "float") { p.a = 1; p.k = [{ t: 0, s: [cx, cy + h*.035,0], e: [cx, cy - h*.035,0] }, { t: half, s: [cx, cy - h*.035,0], e: [cx, cy + h*.035,0] }, { t: frames, s: [cx, cy + h*.035,0] }]; }
  else if (preset === "pulse") { s.a = 1; s.k = [{ t:0,s:[94,94,100],e:[106,106,100] },{ t:half,s:[106,106,100],e:[94,94,100] },{ t:frames,s:[94,94,100] }]; }
  else if (preset === "wobble") { r.a = 1; r.k = [{ t:0,s:[-5],e:[5] },{ t:half,s:[5],e:[-5] },{ t:frames,s:[-5] }]; }
  else if (preset === "spin") { r.a = 1; r.k = [{ t:0,s:[0],e:[360] },{ t:frames,s:[360] }]; }
  else if (preset === "bounce") { p.a = 1; p.k = [{ t:0,s:[cx,cy,0],e:[cx,cy-h*.08,0] },{ t:half,s:[cx,cy-h*.08,0],e:[cx,cy,0] },{ t:frames,s:[cx,cy,0] }]; }
  else if (preset === "flicker") { o.a = 1; o.k = [{ t:0,s:[100],e:[55] },{ t:Math.max(1,Math.round(frames*.18)),s:[55],e:[100] },{ t:Math.max(2,Math.round(frames*.32)),s:[100],e:[70] },{ t:Math.max(3,Math.round(frames*.45)),s:[70],e:[100] },{ t:frames,s:[100] }]; }
  else if (preset === "breathe") { s.a = 1; s.k = [{ t:0,s:[98,98,100],e:[103,105,100] },{ t:half,s:[103,105,100],e:[98,98,100] },{ t:frames,s:[98,98,100] }]; }
  else if (preset === "orbit") { p.a = 1; p.k = [{ t:0,s:[cx+w*.035,cy,0],e:[cx,cy+h*.035,0] },{ t:quarter,s:[cx,cy+h*.035,0],e:[cx-w*.035,cy,0] },{ t:quarter*2,s:[cx-w*.035,cy,0],e:[cx,cy-h*.035,0] },{ t:quarter*3,s:[cx,cy-h*.035,0],e:[cx+w*.035,cy,0] },{ t:frames,s:[cx+w*.035,cy,0] }]; }
  else if (preset === "jitter") { p.a = 1; p.k = [{ t:0,s:[cx,cy,0],e:[cx+w*.018,cy-h*.012,0] },{ t:quarter,s:[cx+w*.018,cy-h*.012,0],e:[cx-w*.015,cy+h*.014,0] },{ t:quarter*2,s:[cx-w*.015,cy+h*.014,0],e:[cx+w*.009,cy+h*.006,0] },{ t:quarter*3,s:[cx+w*.009,cy+h*.006,0],e:[cx,cy,0] },{ t:frames,s:[cx,cy,0] }]; }
  else if (preset === "glitch") { p.a = 1; p.k = [{ t:0,s:[cx,cy,0],e:[cx+w*.025,cy,0] },{ t:Math.max(1,Math.round(frames*.08)),s:[cx+w*.025,cy,0],e:[cx-w*.02,cy,0] },{ t:Math.max(2,Math.round(frames*.14)),s:[cx-w*.02,cy,0],e:[cx,cy,0] },{ t:frames,s:[cx,cy,0] }]; o.a = 1; o.k = [{ t:0,s:[100],e:[65] },{ t:Math.max(1,Math.round(frames*.08)),s:[65],e:[100] },{ t:frames,s:[100] }]; }
  return { o, r, p, a: still([cx,cy,0]), s };
}

export function buildStickerLottie(input: BuildStickerLottieInput) {
  const fps = Math.max(1, Math.min(60, Math.round(input.fps ?? 30)));
  const durationSeconds = Math.max(.5, Math.min(12, input.durationSeconds ?? 2.4));
  const frames = Math.max(1, Math.round(fps * durationSeconds));
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));
  return { v:"5.12.2", fr:fps, ip:0, op:frames, w:width, h:height, nm:input.name || "MOSH Sticker", ddd:0, assets:[{ id:"image_0", w:width, h:height, u:"", p:input.imageDataUrl, e:1 }], layers:[{ ddd:0, ind:1, ty:2, nm:input.name || "Sticker", refId:"image_0", sr:1, ks:transformForPreset(input.preset,width,height,frames), ao:0, ip:0, op:frames, st:0, bm:0 }], markers:[] };
}

export async function blobToPngDataUrl(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas 2D unavailable");
    ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0); return canvas.toDataURL("image/png");
  } finally { bitmap.close(); }
}

export function lottieJsonBlob(lottie: object): Blob { return new Blob([JSON.stringify(lottie)], { type:"application/json" }); }
