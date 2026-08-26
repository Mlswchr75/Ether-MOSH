import type { StickerLottiePreset } from "./stickerLottie";
import type { TracedStickerShape } from "./vectorTrace";

function motion(preset: StickerLottiePreset, w: number, h: number, frames: number) {
  const cx=w/2, cy=h/2, half=Math.max(1,Math.round(frames/2)), quarter=Math.max(1,Math.round(frames/4));
  const p:any={a:0,k:[cx,cy,0]}, s:any={a:0,k:[100,100,100]}, r:any={a:0,k:0}, o:any={a:0,k:100};
  if (preset==="float") { p.a=1; p.k=[{t:0,s:[cx,cy+h*.035,0],e:[cx,cy-h*.035,0]},{t:half,s:[cx,cy-h*.035,0],e:[cx,cy+h*.035,0]},{t:frames,s:[cx,cy+h*.035,0]}]; }
  else if (preset==="pulse") { s.a=1; s.k=[{t:0,s:[94,94,100],e:[106,106,100]},{t:half,s:[106,106,100],e:[94,94,100]},{t:frames,s:[94,94,100]}]; }
  else if (preset==="wobble") { r.a=1; r.k=[{t:0,s:[-5],e:[5]},{t:half,s:[5],e:[-5]},{t:frames,s:[-5]}]; }
  else if (preset==="spin") { r.a=1; r.k=[{t:0,s:[0],e:[360]},{t:frames,s:[360]}]; }
  else if (preset==="bounce") { p.a=1; p.k=[{t:0,s:[cx,cy,0],e:[cx,cy-h*.08,0]},{t:half,s:[cx,cy-h*.08,0],e:[cx,cy,0]},{t:frames,s:[cx,cy,0]}]; }
  else if (preset==="flicker") { o.a=1; o.k=[{t:0,s:[100],e:[55]},{t:Math.max(1,Math.round(frames*.18)),s:[55],e:[100]},{t:frames,s:[100]}]; }
  else if (preset==="breathe") { s.a=1; s.k=[{t:0,s:[98,98,100],e:[103,105,100]},{t:half,s:[103,105,100],e:[98,98,100]},{t:frames,s:[98,98,100]}]; }
  else if (preset==="orbit") { p.a=1; p.k=[{t:0,s:[cx+w*.035,cy,0],e:[cx,cy+h*.035,0]},{t:quarter,s:[cx,cy+h*.035,0],e:[cx-w*.035,cy,0]},{t:quarter*2,s:[cx-w*.035,cy,0],e:[cx,cy-h*.035,0]},{t:quarter*3,s:[cx,cy-h*.035,0],e:[cx+w*.035,cy,0]},{t:frames,s:[cx+w*.035,cy,0]}]; }
  else if (preset==="jitter") { p.a=1; p.k=[{t:0,s:[cx,cy,0],e:[cx+w*.018,cy-h*.012,0]},{t:quarter,s:[cx+w*.018,cy-h*.012,0],e:[cx-w*.015,cy+h*.014,0]},{t:quarter*2,s:[cx-w*.015,cy+h*.014,0],e:[cx+w*.009,cy+h*.006,0]},{t:frames,s:[cx,cy,0]}]; }
  else if (preset==="glitch") { p.a=1; p.k=[{t:0,s:[cx,cy,0],e:[cx+w*.025,cy,0]},{t:Math.max(1,Math.round(frames*.08)),s:[cx+w*.025,cy,0],e:[cx-w*.02,cy,0]},{t:Math.max(2,Math.round(frames*.14)),s:[cx-w*.02,cy,0],e:[cx,cy,0]},{t:frames,s:[cx,cy,0]}]; o.a=1; o.k=[{t:0,s:[100],e:[65]},{t:Math.max(1,Math.round(frames*.08)),s:[65],e:[100]},{t:frames,s:[100]}]; }
  return {o,r,p,a:{a:0,k:[cx,cy,0]},s};
}
function shapePath(points:[number,number][]) { return {ty:"sh",ks:{a:0,k:{c:true,v:points,i:points.map(()=>[0,0]),o:points.map(()=>[0,0])}},nm:"Path"}; }

export function buildVectorStickerLottie(input:{name:string;width:number;height:number;shapes:TracedStickerShape[];preset:StickerLottiePreset;durationSeconds?:number;fps?:number}) {
  const width=Math.max(1,Math.round(input.width)), height=Math.max(1,Math.round(input.height));
  const fr=Math.max(1,Math.min(60,Math.round(input.fps??30))), op=Math.max(1,Math.round(fr*Math.max(.25,Math.min(12,input.durationSeconds??2))));
  const layers=input.shapes.map((shape,index)=>{
    const paths=[shapePath(shape.points),...(shape.holes??[]).map(shapePath)];
    return {ddd:0,ind:index+1,ty:4,nm:`${input.name} ${index+1}`,sr:1,ks:motion(input.preset,width,height,op),ao:0,shapes:[...paths,{ty:"fl",c:{a:0,k:[shape.color[0]/255,shape.color[1]/255,shape.color[2]/255,1]},o:{a:0,k:Math.round(shape.color[3]/255*100)},r:2,nm:"Fill"},{ty:"tr",p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100},sk:{a:0,k:0},sa:{a:0,k:0},nm:"Transform"}],ip:0,op,st:0,bm:0};
  });
  return {v:"5.12.2",fr,ip:0,op,w:width,h:height,nm:input.name,ddd:0,assets:[],layers,markers:[]};
}
