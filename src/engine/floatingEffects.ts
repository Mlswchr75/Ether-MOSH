import type { ParamSchema } from './effects';

/** Localized source-bearing shapes. Only sticker capture turns coverage into alpha. */
export const FLOATING_HEADER = /* glsl */ `
uniform sampler2D uShapeSource;
uniform float uStickerShape;
uniform float uShapeStarted;
uniform float uShapeCombine;
uniform float uShapeOpacity;
vec4 floatingResult(vec4 base, vec4 artwork, float coverage) {
  float strength = clamp(uAmount, 0.0, 1.0);
  float edge = min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y));
  float m = clamp(coverage, 0.0, 1.0) * smoothstep(0.025, 0.07, edge) * strength;
  vec3 color = mix(base.rgb, artwork.rgb, m);
  if (uStickerShape < 0.5) return vec4(color, base.a);
  m *= clamp(uShapeOpacity, 0.0, 1.0) * (uShapeStarted > 0.5 ? texture2D(uShapeSource, vUv).a : artwork.a);
  float a = m;
  if (uShapeStarted > 0.5) {
    if (uShapeCombine < 0.5) a = max(base.a, m);
    else if (uShapeCombine < 1.5) a = base.a * m;
    else a = base.a * (1.0-m);
  }
  // Keep hidden RGB available to the next shape; alpha alone controls visibility.
  return vec4(color, a);
}
`;
const controls: ParamSchema[] = [
  { key: 'amount', label: 'Amount', min: 0, max: 1, default: 0.65 },
  { key: 'speed', label: 'Flow speed', min: 0, max: 2, default: 0.5 },
  { key: 'size', label: 'Reach', min: 0.2, max: 1, default: 0.65 },
  { key: 'width', label: 'Thickness', min: 0.005, max: 0.12, default: 0.035 },
  { key: 'curl', label: 'Curl', min: 0, max: 1, default: 0.6 },
];
export const FLOATING_EFFECTS: { id: string; name: string; blurb: string; params: ParamSchema[]; body: string }[] = [
  {
    id: 'ribbonCurrent', name: 'Ribbon Current',
    blurb: 'Source imagery woven into curling, tapered ribbons. Floating shape for FX Stack stickers.',
    params: controls,
    body: /* glsl */ `
      vec4 base = texture2D(uTex, vUv);
      vec2 p = (vUv-0.5) * vec2(uResolution.x/max(uResolution.y,1.0),1.0);
      float t = uTime*uSpeed;
      float coverage = 0.0;
      vec2 sampleUv = vUv;
      float shade = 1.0;
      for(int i=0;i<3;i++) {
        float k = float(i);
        float angle = (k-1.0)*0.55 + sin(t*0.3)*0.2;
        mat2 rot = mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
        vec2 q = rot*p;
        float wave = sin(q.x*9.0+t+k*2.1)*(0.025+uCurl*0.10);
        wave += sin(q.x*17.0-t*0.7+k)*uCurl*0.025;
        float center = (k-1.0)*0.13 + wave;
        float taper = 1.0-smoothstep(uSize*0.30,uSize*0.65,abs(q.x));
        float width = uWidth*(0.5+0.5*cos(q.x*6.0+t+k))*taper;
        float d = abs(q.y-center);
        float m = (1.0-smoothstep(width,width+0.006,d))*taper;
        if(m>coverage) {
          sampleUv = clamp(vUv + vec2(sin(q.x*8.0+t+k),cos(q.x*5.0-t))*uCurl*uAmount*0.045,0.0,1.0);
          shade = 0.75+0.40*cos((q.y-center)/max(width,0.002)*1.6);
        }
        coverage=max(coverage,m);
      }
      vec4 art=texture2D(uTex,sampleUv); art.rgb*=shade;
      gl_FragColor=floatingResult(base,art,coverage);
    `,
  },
  {
    id: 'liquidIslands', name: 'Liquid Islands',
    blurb: 'Droplets of source imagery merge, split and refract into liquid clusters. Floating shape for FX Stack stickers.',
    params: controls.map(p=>p.key==='width'?{...p,label:'Droplet size',default:0.065}:p),
    body: /* glsl */ `
      vec4 base=texture2D(uTex,vUv);
      vec2 aspect=vec2(uResolution.x/max(uResolution.y,1.0),1.0);
      vec2 p=(vUv-0.5)*aspect;
      float t=uTime*uSpeed;
      float field=0.0; vec2 bend=vec2(0.0);
      for(int i=0;i<7;i++) {
        float k=float(i); float a=k*2.39996+t*(0.12+0.02*k);
        float orbit=uSize*(0.10+0.23*(0.5+0.5*sin(t*0.6+k*1.7)));
        vec2 center=vec2(cos(a),sin(a*1.13))*orbit;
        vec2 d=p-center;
        float radius=(0.018+uWidth*0.55)*(0.75+0.25*sin(t+k));
        float f=radius*radius/(dot(d,d)+0.0005);
        field+=f; bend+=d*f;
      }
      float coverage=smoothstep(0.85,1.05,field);
      vec2 uv=clamp(vUv+bend*uCurl*uAmount*0.4/aspect,0.0,1.0);
      vec4 art=texture2D(uTex,uv);
      float rim=exp(-abs(field-1.05)*5.0);
      art.rgb=art.rgb*(1.0-rim*0.2)+rim*0.23;
      gl_FragColor=floatingResult(base,art,coverage);
    `,
  },
  {
    id: 'contourPeel', name: 'Contour Peel',
    blurb: 'Source tone contours peel into drifting, curled strips with open gaps. Floating shape for FX Stack stickers.',
    params: controls.map(p=>p.key==='width'?{...p,default:0.025}:p),
    body: /* glsl */ `
      vec4 base=texture2D(uTex,vUv);
      float t=uTime*uSpeed;
      vec2 p=vUv-0.5;
      vec2 offset=vec2(sin(p.y*12.0+t),cos(p.x*11.0-t*0.7))*uCurl*uAmount*0.035;
      vec2 uv=clamp(vUv+offset,0.0,1.0);
      vec4 art=texture2D(uTex,uv);
      float l=dot(art.rgb,vec3(0.299,0.587,0.114));
      vec2 px=2.0/uResolution;
      float lx=dot(texture2D(uTex,clamp(uv+vec2(px.x,0.0),0.0,1.0)).rgb,vec3(0.299,0.587,0.114));
      float ly=dot(texture2D(uTex,clamp(uv+vec2(0.0,px.y),0.0,1.0)).rgb,vec3(0.299,0.587,0.114));
      float edge=length(vec2(lx-l,ly-l));
      float bands=abs(fract(l*7.0+p.x*uCurl+sin(t*0.35)*0.1)-0.5);
      float contour=1.0-smoothstep(uWidth*2.0,uWidth*2.0+0.025,bands);
      float support=smoothstep(0.003,0.04,edge);
      float reach=1.0-smoothstep(uSize*0.28,uSize*0.58,length(p));
      float gaps=smoothstep(-0.6,0.15,sin(p.y*24.0+p.x*16.0+t));
      float coverage=max(contour,support*0.8)*reach*gaps;
      art.rgb*=0.85+0.3*sin(l*15.0+t*0.3);
      gl_FragColor=floatingResult(base,art,coverage);
    `,
  },
];
