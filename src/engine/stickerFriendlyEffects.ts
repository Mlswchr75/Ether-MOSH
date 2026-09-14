import type { ParamSchema } from './effects';

// Bounded, stateless source transformations: no feedback buffers or frame history.
// Coordinates use canvas height so shapes remain round on wide/tall exports.
const common: ParamSchema[] = [
  { key: 'amount', label: 'Amount', min: 0, max: 1, default: 0.8 },
  { key: 'speed', label: 'Speed', min: 0, max: 2, default: 0.45 },
  { key: 'motion', label: 'Motion', min: 0, max: 1, default: 0.55 },
  { key: 'size', label: 'Size', min: 0.15, max: 1.5, default: 0.85 },
  { key: 'coverage', label: 'Coverage', min: 0, max: 1, default: 0.65 },
  { key: 'softness', label: 'Edge softness', min: 0, max: 1, default: 0.15 },
  { key: 'centerX', label: 'Horizontal position', min: 0, max: 1, default: 0.5 },
  { key: 'centerY', label: 'Vertical position', min: 0, max: 1, default: 0.5 },
];
const setup = /* glsl */ `
  vec4 base = texture2D(uTex, vUv);
  vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  vec2 origin = vec2(uCenterX, uCenterY);
  if(uOrganicShape>0.5) origin=vec2(0.5)+(origin-0.5)*0.35/vec2(max(aspect.x,1.0),max(1.0/aspect.x,1.0));
  vec2 p = (vUv - origin) * aspect / max(uSize, 0.01);
  float t = uTime * uSpeed;
  float aa = max(1.25 / max(uResolution.y * uSize, 1.0), 0.001) + uSoftness * 0.025;
  float coverage = 0.0;
  vec4 art = base;
`;
const finish = /* glsl */ `
  gl_FragColor = floatingResult(base, art, coverage * smoothstep(0.0, 0.06, uCoverage));
`;
export const STICKER_FRIENDLY_EFFECTS = [
  {
    id: 'prismShards', name: 'Prism Shards',
    blurb: 'Up to twelve separated triangular fragments carry displaced source imagery. Spin and scatter the shards; spectral split offsets their red and blue channels. Try Chromatic Aberration or a gentle wave after it.',
    params: [...common,
      { key: 'scatter', label: 'Separation', min: 0, max: 1, default: 0.55 },
      { key: 'spin', label: 'Spin', min: 0, max: 1, default: 0.45 },
      { key: 'split', label: 'Spectral split', min: 0, max: 1, default: 0.4 }],
    body: setup + /* glsl */ `
      vec2 sampleUv = vUv;
      float facet = 1.0;
      for (int i=0; i<12; i++) {
        float k=float(i);
        float enabledShape=1.0-smoothstep(uCoverage*12.0,uCoverage*12.0+1.0,k);
        float a=k*2.39996;
        float orbit=(0.055+sqrt(k/12.0)*0.27)*(0.45+uScatter);
        vec2 center=vec2(cos(a),sin(a))*orbit;
        center+=vec2(sin(t+k*1.7),cos(t*0.8+k))*0.035*uMotion;
        float angle=a+uSpin*(k*0.4+t*uMotion);
        mat2 rot=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
        vec2 q=rot*(p-center);
        float radius=0.034+0.024*(0.5+0.5*sin(k*9.1));
        float d=max(q.y, max(dot(q,vec2(0.866,-0.5)),dot(q,vec2(-0.866,-0.5))))-radius;
        if(uOrganicShape>0.5) d=organicFragment(q,radius*1.5,k*3.7);
        float m=(1.0-smoothstep(-aa,aa,d))*enabledShape;
        if(m>coverage) {
          sampleUv=clamp(origin+(q+vec2(cos(a),sin(a))*0.2)*uSize/aspect,0.0,1.0);
          facet=0.8+0.35*smoothstep(-radius,radius,q.x);
        }
        coverage=max(coverage,m);
      }
      vec2 split=vec2(0.016*uSplit,0.006*uSplit);
      art=texture2D(uTex,sampleUv);
      art.r=texture2D(uTex,clamp(sampleUv+split,0.0,1.0)).r;
      art.b=texture2D(uTex,clamp(sampleUv-split,0.0,1.0)).b;
      art.rgb*=facet;
    ` + finish,
  },
  {
    id: 'inkTendrils', name: 'Ink Tendrils',
    blurb: 'Source-colored spiral arms taper into fine curling tips, with smaller branching filaments. Curl tightens the coils; branching adds offshoots. Try Liquid Islands before it and a color treatment after.',
    params: [...common,
      { key: 'curl', label: 'Curl', min: 0, max: 1, default: 0.55 },
      { key: 'width', label: 'Ink thickness', min: 0.003, max: 0.05, default: 0.018 },
      { key: 'branching', label: 'Branching', min: 0, max: 1, default: 0.5 }],
    body: setup + /* glsl */ `
      float radius=length(p);
      float theta=atan(p.y,p.x);
      float taper=1.0-smoothstep(0.12,0.43,radius);
      float bestAngle=0.0;
      for(int i=0;i<6;i++) {
        float k=float(i);
        float phase=k*1.0472+(0.5+uCurl*7.0)*radius+t*0.2*uMotion;
        phase+=sin(radius*18.0-t+k)*0.25*uMotion;
        phase+=uOrganicShape*uOrganicRoughness*(sin(k*7.3+uOrganicSeed)*0.45+sin(radius*9.0+k*2.3)*0.3);
        float delta=atan(sin(theta-phase),cos(theta-phase));
        float d=abs(delta)*max(radius,0.02);
        float width=uWidth*(0.1+0.9*taper);
        float m=(1.0-smoothstep(width,width+aa,d))*taper;
        float branchPhase=phase+sin(radius*14.0+k)*0.7;
        float bd=abs(atan(sin(theta-branchPhase),cos(theta-branchPhase)))*max(radius,0.02);
        float branch=(1.0-smoothstep(width*0.28,width*0.28+aa,bd))*smoothstep(0.09,0.18,radius)*taper*uBranching;
        m=max(m,branch)*(1.0-smoothstep(uCoverage*6.0,uCoverage*6.0+1.0,k));
        if(m>coverage) bestAngle=phase;
        coverage=max(coverage,m);
      }
      vec2 uv=origin+vec2(cos(bestAngle-radius*3.0),sin(bestAngle-radius*3.0))*radius*uSize/aspect;
      art=texture2D(uTex,clamp(uv,0.0,1.0));
      art.rgb*=0.72+0.4*taper;
    ` + finish,
  },
  {
    id: 'bubbleLenses', name: 'Bubble Lenses',
    blurb: 'Separate drifting lenses magnify source details inside circular bubbles. Refraction bends the view near each rim; rim light adds a glass highlight. Unlike Liquid Islands, these bubbles stay separate shapes.',
    params: [...common,
      { key: 'magnify', label: 'Magnification', min: 0, max: 1, default: 0.55 },
      { key: 'refraction', label: 'Refraction', min: 0, max: 1, default: 0.65 },
      { key: 'rim', label: 'Rim light', min: 0, max: 1, default: 0.6 }],
    body: setup + /* glsl */ `
      vec2 sampleUv=vUv;
      float light=0.0;
      for(int i=0;i<10;i++) {
        float k=float(i), a=k*2.39996;
        vec2 center=vec2(cos(a),sin(a))*(0.075+0.027*k);
        center+=vec2(sin(t*0.6+k),cos(t*0.5+k*2.0))*0.04*uMotion;
        float radius=0.038+0.021*(0.5+0.5*sin(k*7.3));
        vec2 q=(p-center)/radius;
        float d=length(q);
        float outline=uOrganicShape>0.5?organicFragment(p-center,radius,k*4.1):length(p-center)-radius;
        float m=(1.0-smoothstep(-aa,aa,outline))*(1.0-smoothstep(uCoverage*10.0,uCoverage*10.0+1.0,k));
        if(m>coverage) {
          float lens=1.0/(1.0+uMagnify*3.0)+pow(min(d,1.0),3.0)*uRefraction*0.8;
          sampleUv=clamp(origin+(center+q*radius*lens)*uSize/aspect,0.0,1.0);
          light=pow(clamp(d,0.0,1.0),10.0)*0.35;
          light+=exp(-dot(q-vec2(-0.32,0.4),q-vec2(-0.32,0.4))*45.0)*0.6;
        }
        coverage=max(coverage,m);
      }
      art=texture2D(uTex,sampleUv);
      art.rgb=mix(art.rgb,vec3(0.85,0.95,1.0),clamp(light*uRim,0.0,1.0));
    ` + finish,
  },
  {
    id: 'echoRibbons', name: 'Echo Ribbons',
    blurb: 'Moving source fragments trail five curved, fading echoes. Trail length stretches their paths and echo spacing separates the strands. Motion is procedural, so still photos animate too; no past video frames are stored.',
    params: [...common,
      { key: 'trail', label: 'Trail length', min: 0, max: 1, default: 0.65 },
      { key: 'spacing', label: 'Echo spacing', min: 0, max: 1, default: 0.5 },
      { key: 'width', label: 'Ribbon width', min: 0.003, max: 0.06, default: 0.022 }],
    body: setup + /* glsl */ `
      vec2 sampleUv=vUv;
      float fade=1.0;
      for(int i=0;i<5;i++) {
        float k=float(i);
        float x=p.x+(k-2.0)*0.025*uSpacing;
        float phase=x*8.0-t*uMotion+k*0.22;
        float y=sin(phase)*0.115+sin(phase*1.7+k*0.3)*0.035+(k-2.0)*0.045*uSpacing;
        float len=0.04+uTrail*0.38;
        float tail=smoothstep(-len,-len*0.3,x)*(1.0-smoothstep(len*0.7,len,x));
        float width=uWidth*(0.2+tail*0.8);
        float m=(1.0-smoothstep(width,width+aa,abs(p.y-y)))*tail;
        m*=pow(0.78,k)*(1.0-smoothstep(uCoverage*5.0,uCoverage*5.0+1.0,k));
        if(m>coverage) {
          sampleUv=clamp(origin+vec2(x+k*0.04,(p.y-y)*3.0+sin(phase)*0.18)*uSize/aspect,0.0,1.0);
          fade=1.0-k*0.085;
        }
        coverage=max(coverage,m);
      }
      art=texture2D(uTex,sampleUv);art.rgb*=fade;
    ` + finish,
  },
  {
    id: 'pixelConfetti', name: 'Pixel Confetti',
    blurb: 'Small source tiles scatter into an open cloud of rotating squares and slivers. Tile size controls the grid; scatter spreads each fragment and tumble animates rotation. Try Posterize before it for bold colored pieces.',
    params: [...common,
      { key: 'tileSize', label: 'Tile size', min: 0, max: 1, default: 0.45 },
      { key: 'scatter', label: 'Scatter', min: 0, max: 1, default: 0.6 },
      { key: 'tumble', label: 'Tumble', min: 0, max: 1, default: 0.7 }],
    body: setup + /* glsl */ `
      float cell=0.045+uTileSize*0.10;
      vec2 grid=floor(p/cell);
      vec2 sampleUv=vUv;
      // Neighbour lookup lets fragments move across cell boundaries without clipping.
      for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
        vec2 id=grid+vec2(float(x),float(y));
        float seed=fract(sin(dot(id,vec2(127.1,311.7)))*43758.5453);
        float seed2=fract(sin(dot(id,vec2(269.5,183.3)))*43758.5453);
        vec2 center=(id+0.5)*cell;
        float reach=1.0-smoothstep(0.24,0.42,length(center));
        float enabledShape=1.0-smoothstep(uCoverage*0.9,uCoverage*0.9+0.08,seed);
        vec2 shift=vec2(sin(seed*6.283+t*uMotion),cos(seed2*6.283+t*0.7*uMotion))*cell*0.42*uScatter;
        float angle=seed*6.283+t*uTumble*uMotion*(seed2-0.5)*3.0;
        mat2 rot=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
        vec2 q=rot*(p-center-shift);
        vec2 halfSize=cell*vec2(0.16+seed*0.12,0.08+seed2*0.20);
        float d=max(abs(q.x)-halfSize.x,abs(q.y)-halfSize.y);
        if(uOrganicShape>0.5) d=organicFragment(q/halfSize,1.15,seed*27.0)*min(halfSize.x,halfSize.y);
        float m=(1.0-smoothstep(-aa,aa,d))*reach*enabledShape;
        if(m>coverage) sampleUv=clamp(origin+(center+q)*uSize/aspect,0.0,1.0);
        coverage=max(coverage,m);
      }
      art=texture2D(uTex,sampleUv);
    ` + finish,
  },
  {
    id: 'electricContours', name: 'Electric Contours',
    blurb: 'Broken luminous arcs follow source edges and tone boundaries, with branching sparks and a soft halo. Sensitivity admits finer details; glow widens the light. A flat source produces sparse tone arcs rather than a solid rectangle.',
    params: [...common,
      { key: 'sensitivity', label: 'Detail sensitivity', min: 0, max: 1, default: 0.55 },
      { key: 'branching', label: 'Sparks', min: 0, max: 1, default: 0.45 },
      { key: 'glow', label: 'Glow', min: 0, max: 1, default: 0.6 }],
    body: setup + /* glsl */ `
      vec2 uv=clamp(origin+p*uSize/aspect,0.0,1.0);
      vec2 px=vec2(2.0)/max(uResolution,vec2(1.0));
      vec3 weights=vec3(0.299,0.587,0.114);
      art=texture2D(uTex,uv);
      float l=dot(art.rgb,weights);
      float dx=dot(texture2D(uTex,clamp(uv+vec2(px.x,0.0),0.0,1.0)).rgb-texture2D(uTex,clamp(uv-vec2(px.x,0.0),0.0,1.0)).rgb,weights);
      float dy=dot(texture2D(uTex,clamp(uv+vec2(0.0,px.y),0.0,1.0)).rgb-texture2D(uTex,clamp(uv-vec2(0.0,px.y),0.0,1.0)).rgb,weights);
      float edge=smoothstep(0.08*(1.0-uSensitivity)+0.002,0.14*(1.0-uSensitivity)+0.025,length(vec2(dx,dy)));
      float phase=l*(5.0+uSensitivity*7.0)+length(p)*1.3+sin(p.x*23.0+p.y*17.0+t*2.0)*0.05*uMotion;
      float band=abs(fract(phase)-0.5);
      float core=1.0-smoothstep(0.018,0.04+aa,band);
      float halo=exp(-band*(35.0-22.0*uGlow))*uGlow*0.35;
      float breaks=smoothstep(0.1,0.5,sin(p.x*37.0-p.y*29.0+t*3.0*uMotion));
      float spark=1.0-smoothstep(0.008,0.025+aa,abs(sin(p.x*34.0+p.y*21.0+sin(p.y*51.0)*0.6)));
      spark*=uBranching*smoothstep(0.25,0.6,sin(p.y*45.0-t*2.0*uMotion))*max(core,edge);
      float reach=1.0-smoothstep(0.18+uCoverage*0.08,0.28+uCoverage*0.16,length(p));
      coverage=max(max(core*breaks,edge*breaks),max(halo*breaks,spark))*reach;
      vec3 tint=normalize(art.rgb+vec3(0.08,0.12,0.18));
      art.rgb=mix(tint,vec3(0.92,0.98,1.0),clamp(core*0.5+edge*0.4,0.0,0.8))*(1.0+uGlow*0.35);
    ` + finish,
  },
];
