import { describe, expect, it } from "vitest";
import { critiqueMotifPixels } from "./motifMaestro";

describe("Motif Maestro", () => {
  it("scores repeated edges as seamless", () => {
    const w=8,h=8,p=new Uint8ClampedArray(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,v=(x===0||x===w-1||y===0||y===h-1)?40:(x+y)*18;p.set([v,255-v,(v*3)%255,255],i);}
    expect(critiqueMotifPixels(p,w,h).seamless).toBeGreaterThan(.9);
  });
});
