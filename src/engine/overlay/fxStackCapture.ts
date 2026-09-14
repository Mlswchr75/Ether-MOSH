export type FxBackdrop = 'black' | 'white';
export type FxShapeOptions = { stayInside: boolean; combine: 'join' | 'overlap' | 'cut' };
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
export const FX_DIFFERENCE_FRAG = `precision highp float; varying vec2 vUv;
uniform sampler2D uBefore,uAfter,uColor;uniform float uCutoff,uUseShape;
void main(){vec4 before=texture2D(uBefore,vUv),after=texture2D(uAfter,vUv),color=texture2D(uColor,vUv);vec4 d=abs(after-before);float change=max(max(d.r,d.g),max(d.b,d.a));float coverage=uUseShape>0.5?1.0:smoothstep(uCutoff,uCutoff+.04,change);float a=color.a*coverage;gl_FragColor=vec4(a>0.?color.rgb:vec3(0.),a);}`;
