export type FxBackdrop = 'black' | 'white';
export type FxShapeOptions = { stayInside: boolean; combine: 'join' | 'overlap' | 'cut'; organic?: boolean; organicSeed?: number; organicRoughness?: number };
type Provider = { configure?: (options: FxShapeOptions) => void; enable: (active: boolean) => void; read: (width: number, height: number, cutoff: number) => ImageData };
const providers = new WeakMap<HTMLCanvasElement, Provider>();
const active = new WeakSet<HTMLCanvasElement>();
const settings = new WeakMap<HTMLCanvasElement, FxShapeOptions>();
export function registerFxCapture(canvas: HTMLCanvasElement, provider: Provider) {
  providers.set(canvas, provider); provider.configure?.(settings.get(canvas) ?? { stayInside: true, combine: 'join' }); provider.enable(active.has(canvas));
  return () => { if (providers.get(canvas) === provider) providers.delete(canvas); };
}
export function configureFxCapture(canvas: HTMLCanvasElement, options: FxShapeOptions) {
  settings.set(canvas, options); providers.get(canvas)?.configure?.(options);
}
export function enableFxCapture(canvas: HTMLCanvasElement) {
  active.add(canvas); providers.get(canvas)?.enable(true);
  return () => { active.delete(canvas); providers.get(canvas)?.enable(false); };
}
/** Testable reference of the shader's coverage rule. Preserve effect RGB, not a color key. */
export function keyFxStack(frame: ImageData, before: ImageData, after: ImageData, cutoff: number): ImageData {
  if (frame.width !== before.width || frame.height !== before.height || frame.width !== after.width || frame.height !== after.height) throw Error('FX frames must match');
  const out = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const gate = Math.max(0, Math.min(.5, cutoff));
  for (let i=0;i<out.data.length;i+=4) {
    const delta = Math.max(...[0,1,2,3].map(c=>Math.abs(before.data[i+c]-after.data[i+c])/255));
    const t=Math.max(0,Math.min(1,(delta-gate)/.04));
    out.data[i+3]=Math.round(out.data[i+3]*t*t*(3-2*t));
    if(!out.data[i+3])out.data[i]=out.data[i+1]=out.data[i+2]=0;
  }
  return out;
}
export function renderFxStack(source: HTMLCanvasElement, width: number, height: number, cutoff: number): ImageData {
  const provider=providers.get(source);
  if(!provider) return new ImageData(width,height);
  return provider.read(width,height,cutoff);
}
export function paintFxFrame(ctx: CanvasRenderingContext2D, frame: ImageData, background?: FxBackdrop) {
  const canvas=document.createElement('canvas');canvas.width=frame.width;canvas.height=frame.height;
  canvas.getContext('2d')!.putImageData(frame,0,0);ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
  if(background){ctx.fillStyle=background;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);}
  ctx.drawImage(canvas,0,0,ctx.canvas.width,ctx.canvas.height);
}
/** Final sticker-only silhouette. No rectangular feathering or opaque backdrop.
 * Low irregularity keeps a restrained contour; higher values blend signed
 * distance fields with different topology. The bounded circular support keeps
 * every family clear of canvas edges, including during long crossfades. */
export const FX_DIFFERENCE_FRAG = `precision highp float; varying vec2 vUv;
uniform sampler2D uBefore,uAfter,uColor;
uniform float uCutoff,uUseShape,uOrganic,uSeed,uRoughness,uEvolution;
uniform vec2 uOutputSize;
float shapeHash(float k){ return fract(sin(k*127.1+311.7)*43758.5453); }
float evolvingCut(vec2 p,float k,float amount){
  float rotation=shapeHash(k+1.0)*6.283185;
  vec2 q=mat2(cos(rotation),-sin(rotation),sin(rotation),cos(rotation))*p;
  float scale=mix(1.0,mix(0.64,1.16,shapeHash(k+2.0)),amount);
  q/=scale;
  q+=amount*0.023*vec2(sin(q.y*17.0+k),sin(q.x*13.0-k));
  float family=floor(shapeHash(k+3.0)*5.0);
  float d;
  if(family<1.0){
    // Long bent leaf: aspect changes independently of its reach.
    q.y+=0.10*sin(q.x*7.0+k);
    d=(length(q/vec2(0.39,0.14))-1.0)*0.14;
  }else if(family<2.0){
    // Offset subtraction makes an open crescent, not another radial blob.
    d=max(length(q)-0.31,0.275-length(q-vec2(0.14,0.05)));
  }else if(family<3.0){
    // Three lobes with a narrow neck and deep concavities.
    d=min(length(q-vec2(-0.18,-0.08))-0.16,length(q-vec2(0.16,-0.11))-0.14);
    d=min(d,length(q-vec2(0.015,0.18))-0.155);
    d=min(d,length(q/vec2(0.085,0.23))*0.085-0.085);
  }else if(family<4.0){
    // Separated islands survive the morph instead of filling back to a disk.
    d=min(length(q-vec2(-0.19,0.08))-0.14,length(q-vec2(0.18,-0.10))-0.18);
    d=min(d,length(q-vec2(0.08,0.26))-0.065);
  }else{
    float a=atan(q.y,q.x);
    float radius=0.23+0.075*sin(a*3.0+k)+0.035*cos(a*5.0-k);
    d=length(q*vec2(0.85,1.2))-radius;
  }
  return d*scale;
}
void main(){
  vec2 aspect=uOutputSize/max(min(uOutputSize.x,uOutputSize.y),1.0);
  vec2 p=(vUv-0.5)*aspect;
  vec2 uv=vUv;
  float silhouette=1.0;
  if(uOrganic>0.5){
    float amount=clamp(uRoughness,0.0,1.0);
    float seed=uSeed;
    // Slider travel itself explores new specimens; time moves between them
    // continuously. No random frame state, feedback textures or CPU readbacks.
    float journey=uEvolution/(18.0+8.0*shapeHash(seed))+amount*3.0;
    float stage=floor(journey), blend=fract(journey);
    blend=blend*blend*(3.0-2.0*blend);
    // Slow through the middle so both silhouettes remain visible for a while.
    blend+=0.12*sin(blend*6.283185);
    float k0=seed+stage*5.73, k1=seed+(stage+1.0)*5.73;
    // Bend straight internal edges without adding history or changing the live FX.
    vec2 bend=vec2(sin(p.y*13.0+seed)+0.5*sin(p.x*19.0-p.y*7.0+seed*0.7),
                   cos(p.x*11.0-seed)+0.5*sin(p.y*17.0+p.x*8.0+seed*1.3));
    uv=clamp(vUv+bend*(0.012+0.018*uRoughness)/aspect,0.0,1.0);
    float angle=atan(p.y,p.x);
    vec2 direction=vec2(cos(angle),sin(angle));
    vec3 source=texture2D(uBefore,clamp(0.5+direction*0.23/aspect,0.0,1.0)).rgb;
    float content=dot(source,vec3(0.299,0.587,0.114));
    float radius=0.365+(0.018+0.055*uRoughness)*sin(angle*3.0+seed);
    radius+=(0.012+0.035*uRoughness)*cos(angle*5.0-seed*1.37);
    radius+=0.026*uRoughness*sin(angle*2.0+seed*0.63)+(content-0.5)*0.045;
    radius=clamp(radius,0.22,0.455);
    float feather=0.008+0.007*uRoughness;
    float baseDistance=length(p)-radius;
    float diversity=smoothstep(0.05,0.95,amount);
    float d0=mix(baseDistance,evolvingCut(p,k0,amount)+(content-0.5)*0.035,diversity);
    float d1=mix(baseDistance,evolvingCut(p,k1,amount)+(content-0.5)*0.035,diversity);
    float morph=1.0-smoothstep(-feather,feather,mix(d0,d1,blend));
    float dissolve=mix(1.0-smoothstep(-feather,feather,d0),1.0-smoothstep(-feather,feather,d1),blend);
    silhouette=mix(morph,dissolve,0.65*diversity);
    silhouette*=1.0-smoothstep(0.455,0.48,length(p));
  }
  vec4 before=texture2D(uBefore,uv),after=texture2D(uAfter,uv),color=texture2D(uColor,uv);
  vec4 d=abs(after-before);float change=max(max(d.r,d.g),max(d.b,d.a));
  float coverage=uUseShape>0.5?1.0:smoothstep(uCutoff,uCutoff+.04,change);
  float a=color.a*coverage*silhouette;
  gl_FragColor=vec4(a>0.?color.rgb:vec3(0.),a);
}`;
