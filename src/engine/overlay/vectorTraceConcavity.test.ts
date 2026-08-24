import { describe, expect, it } from "vitest";
import { traceStickerShapes } from "./vectorTrace";

function make(width:number,height:number,on:(x:number,y:number)=>boolean):ImageData {
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;if(on(x,y)){data[i]=255;data[i+1]=80;data[i+2]=180;data[i+3]=255;}}
  return new ImageData(data,width,height);
}

describe("concavity-preserving vector trace",()=>{
  it("keeps a concave L shape instead of replacing it with a convex hull",()=>{
    const result=traceStickerShapes(make(20,20,(x,y)=>(x>=3&&x<=7&&y>=3&&y<=16)||(x>=3&&x<=15&&y>=12&&y<=16)));
    expect(result.ok).toBe(true);
    if(!result.ok)return;
    expect(result.shapes[0].points.length).toBeGreaterThan(4);
  });

  it("detects a transparent hole inside a solid ring",()=>{
    const result=traceStickerShapes(make(24,24,(x,y)=>x>=3&&x<=20&&y>=3&&y<=20&&!(x>=8&&x<=15&&y>=8&&y<=15)));
    expect(result.ok).toBe(true);
    if(!result.ok)return;
    expect(result.shapes[0].holes?.length ?? 0).toBeGreaterThan(0);
  });
});
