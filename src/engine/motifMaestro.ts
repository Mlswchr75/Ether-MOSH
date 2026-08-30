import { seamScore } from "./tileSafety";

export type MotifDirection = "all" | "horizontal" | "vertical";
export type MotifSymmetry = "mirror" | "rotate" | "kaleidoscope";
export type MotifCritique = { seamless: number; composition: number; contrast: number; motif: number };

function canvas(size: number) {
  const c = document.createElement("canvas"); c.width = c.height = size; return c;
}

/** Build a by-construction seamless tile from the strongest central material.
 * Opposite edges are paired copies, so the result remains exact after PNG encoding. */
export function buildMotifTile(source: HTMLCanvasElement, size = 2048, direction: MotifDirection = "all", symmetry: MotifSymmetry = "mirror") {
  const out = canvas(size), ctx = out.getContext("2d")!;
  const cols = direction === "vertical" ? 1 : 2;
  const rows = direction === "horizontal" ? 1 : 2;
  const cw = size / cols, ch = size / rows;
  const sw = source.width * (symmetry === "kaleidoscope" ? 0.58 : 0.72);
  const sh = source.height * (symmetry === "kaleidoscope" ? 0.58 : 0.72);
  const sx = (source.width - sw) / 2, sy = (source.height - sh) / 2;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    ctx.save();
    ctx.translate(x * cw + cw / 2, y * ch + ch / 2);
    const flipX = x % 2 ? -1 : 1, flipY = y % 2 ? -1 : 1;
    ctx.scale(flipX, flipY);
    if (symmetry === "rotate") ctx.rotate(((x + y) % 2) * Math.PI);
    if (symmetry === "kaleidoscope") ctx.rotate((x - y) * Math.PI / 2);
    ctx.drawImage(source, sx, sy, sw, sh, -cw / 2 - 1, -ch / 2 - 1, cw + 2, ch + 2);
    ctx.restore();
  }
  return out;
}

export function buildRepeatProof(tile: HTMLCanvasElement, repeats = 3) {
  const out = canvas(tile.width * repeats), ctx = out.getContext("2d")!;
  for (let y=0;y<repeats;y++) for (let x=0;x<repeats;x++) ctx.drawImage(tile,x*tile.width,y*tile.height);
  return out;
}

export function critiqueMotif(tile: HTMLCanvasElement): MotifCritique {
  const probe = canvas(128), ctx = probe.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(tile,0,0,128,128); const image = ctx.getImageData(0,0,128,128), p=image.data;
  return critiqueMotifPixels(p,128,128);
}

export function critiqueMotifPixels(p: Uint8ClampedArray, width: number, height: number): MotifCritique {
  let lum=0, lum2=0, sat=0, edges=0, n=0;
  for(let y=0;y<height;y+=2) for(let x=0;x<width;x+=2){ const i=(y*width+x)*4,r=p[i],g=p[i+1],b=p[i+2],l=.2126*r+.7152*g+.0722*b; lum+=l;lum2+=l*l;sat+=(Math.max(r,g,b)-Math.min(r,g,b))/255;n++; if(x<width-2){const j=i+8;edges+=(Math.abs(r-p[j])+Math.abs(g-p[j+1])+Math.abs(b-p[j+2]))/765;} }
  const variance=Math.sqrt(Math.max(0,lum2/n-(lum/n)**2))/64;
  const contrast=Math.min(1,variance); const detail=Math.min(1,(edges/n)*3.2); const color=Math.min(1,(sat/n)*1.8);
  const seamless=seamScore(p,width,height).worst;
  return { seamless, contrast, composition: Math.min(1,.42*contrast+.34*detail+.24*color), motif: Math.min(1,.5*detail+.3*color+.2*contrast) };
}
