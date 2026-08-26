export type TracePoint = [number, number];
export type TracedStickerShape = { points: TracePoint[]; holes?: TracePoint[][]; color: [number, number, number, number] };
export type TraceResult = { ok: true; shapes: TracedStickerShape[] } | { ok: false; reason: "too-complex" };

const MAX_SHAPES = 24;
const MAX_POINTS_PER_SHAPE = 320;
type Edge = [TracePoint, TracePoint];
const key = ([x,y]: TracePoint) => `${x},${y}`;

function area(points: TracePoint[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i+1)%points.length]; sum += a[0]*b[1]-b[0]*a[1]; }
  return sum / 2;
}

function perpendicularDistance(p: TracePoint, a: TracePoint, b: TracePoint) {
  const dx = b[0]-a[0], dy = b[1]-a[1];
  if (!dx && !dy) return Math.hypot(p[0]-a[0],p[1]-a[1]);
  return Math.abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0]) / Math.hypot(dx,dy);
}
function rdp(points: TracePoint[], epsilon: number): TracePoint[] {
  if (points.length < 3) return points;
  let max = 0, index = 0;
  for (let i=1;i<points.length-1;i++) { const d = perpendicularDistance(points[i],points[0],points[points.length-1]); if (d>max) { max=d; index=i; } }
  if (max <= epsilon) return [points[0],points[points.length-1]];
  const left = rdp(points.slice(0,index+1),epsilon), right = rdp(points.slice(index),epsilon);
  return left.slice(0,-1).concat(right);
}
function simplifyClosed(points: TracePoint[]): TracePoint[] {
  if (points.length <= 4) return points;
  let epsilon = 0.65;
  let out = points;
  while (out.length > MAX_POINTS_PER_SHAPE && epsilon < 8) { const open = points.concat([points[0]]); out = rdp(open,epsilon).slice(0,-1); epsilon *= 1.45; }
  return out.length > MAX_POINTS_PER_SHAPE ? out.filter((_,i)=>i%Math.ceil(out.length/MAX_POINTS_PER_SHAPE)===0).slice(0,MAX_POINTS_PER_SHAPE) : out;
}

function chainLoops(edges: Edge[]): TracePoint[][] {
  const byStart = new Map<string, Edge[]>();
  for (const edge of edges) { const k=key(edge[0]); const list=byStart.get(k)??[]; list.push(edge); byStart.set(k,list); }
  const used = new Set<Edge>();
  const loops: TracePoint[][] = [];
  for (const first of edges) {
    if (used.has(first)) continue;
    const loop: TracePoint[] = [first[0]];
    let edge: Edge | undefined = first;
    const start = key(first[0]);
    let guard = 0;
    while (edge && guard++ < edges.length+2) {
      used.add(edge); loop.push(edge[1]);
      if (key(edge[1])===start) break;
      edge = (byStart.get(key(edge[1]))??[]).find(candidate=>!used.has(candidate));
    }
    if (loop.length>=4 && key(loop[0])===key(loop[loop.length-1])) loops.push(simplifyClosed(loop.slice(0,-1)));
  }
  return loops.filter(loop=>loop.length>=3);
}

export function traceStickerShapes(imageData: ImageData): TraceResult {
  const { width,height,data } = imageData;
  const visited = new Uint8Array(width*height);
  const on = (x:number,y:number) => x>=0&&y>=0&&x<width&&y<height&&data[(y*width+x)*4+3]>24;
  const shapes: TracedStickerShape[] = [];

  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const idx=y*width+x; if (visited[idx]||!on(x,y)) continue;
    const queue: TracePoint[]=[[x,y]], pixels: TracePoint[]=[]; visited[idx]=1;
    let rs=0,gs=0,bs=0,as=0,count=0;
    for (let q=0;q<queue.length;q++) {
      const [cx,cy]=queue[q]; pixels.push([cx,cy]); const pi=(cy*width+cx)*4;
      rs+=data[pi];gs+=data[pi+1];bs+=data[pi+2];as+=data[pi+3];count++;
      for (const [nx,ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]] as TracePoint[]) {
        if (!on(nx,ny)) continue; const ni=ny*width+nx; if (!visited[ni]) { visited[ni]=1; queue.push([nx,ny]); }
      }
    }
    if (count<4) continue;
    const edges: Edge[]=[];
    for (const [px,py] of pixels) {
      if (!on(px,py-1)) edges.push([[px,py],[px+1,py]]);
      if (!on(px+1,py)) edges.push([[px+1,py],[px+1,py+1]]);
      if (!on(px,py+1)) edges.push([[px+1,py+1],[px,py+1]]);
      if (!on(px-1,py)) edges.push([[px,py+1],[px,py]]);
    }
    const loops=chainLoops(edges).sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)));
    if (!loops.length) continue;
    const points=loops[0], holes=loops.slice(1).filter(loop=>Math.sign(area(loop))!==Math.sign(area(points)));
    const totalPoints=points.length+holes.reduce((n,h)=>n+h.length,0);
    if (totalPoints>MAX_POINTS_PER_SHAPE*2) return { ok:false, reason:"too-complex" };
    shapes.push({ points, holes:holes.length?holes:undefined, color:[Math.round(rs/count),Math.round(gs/count),Math.round(bs/count),Math.round(as/count)] });
    if (shapes.length>MAX_SHAPES) return { ok:false, reason:"too-complex" };
  }
  return { ok:true, shapes };
}
export { MAX_SHAPES, MAX_POINTS_PER_SHAPE };
