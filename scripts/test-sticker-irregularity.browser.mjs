/** GPU silhouette regression: slider range, temporal continuity and inset alpha. */
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(process.env.MOSH_TEST_URL || 'http://127.0.0.1:8084');
  const report = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { FX_DIFFERENCE_FRAG } = await import('/src/engine/overlay/fxStackCapture.ts');
    const renderer = new THREE.WebGLRenderer(); renderer.setSize(240,240);
    const source = new THREE.DataTexture(new Uint8Array([120,170,220,255]),1,1); source.needsUpdate=true;
    const uniforms = { uBefore:{value:source},uAfter:{value:source},uColor:{value:source},uCutoff:{value:0},uUseShape:{value:1},uOrganic:{value:1},uSeed:{value:0},uRoughness:{value:0},uEvolution:{value:0},uOutputSize:{value:new THREE.Vector2(240,240)} };
    const material = new THREE.ShaderMaterial({ uniforms, fragmentShader:FX_DIFFERENCE_FRAG, vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}', blending:THREE.NoBlending });
    const scene = new THREE.Scene();scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
    const target = new THREE.WebGLRenderTarget(240,240);
    const render = (rough,seed,time,w=240,h=240) => {
      target.setSize(w,h); uniforms.uOutputSize.value.set(w,h);
      uniforms.uSeed.value=seed;uniforms.uRoughness.value=rough;uniforms.uEvolution.value=time;
      renderer.setRenderTarget(target);renderer.render(scene,new THREE.Camera());
      const data=new Uint8Array(w*h*4);renderer.readRenderTargetPixels(target,0,0,w,h,data);return data;
    };
    const stats = (data,w=240,h=240) => {
      let area=0,edge=0,soft=0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const a=data[(y*w+x)*4+3];area+=a/255;
        if(a && (x<3||y<3||x>=w-3||y>=h-3))edge++;
        if(a>20&&a<235)soft++;
      }return {area,edge,soft};
    };
    const diff=(a,b)=>{let d=0;for(let i=3;i<a.length;i+=4)d+=Math.abs(a[i]-b[i])/255;return d/(a.length/4);};
    const assert=(value,message)=>{if(!value)throw Error(message);};
    document.body.innerHTML='';document.body.style.cssText='margin:0;padding:16px;background:#13121a;color:#fff;font:14px sans-serif';
    const title=document.createElement('h2');title.textContent='FX STACKS · Irregularity range';document.body.append(title);
    const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(5,1fr);gap:12px';document.body.append(grid);
    const rows=[];
    for(const seed of [0,2.39996,12.8]){
      const areas=[];let previous;
      for(const rough of [0,.25,.5,.75,1]){
        const data=render(rough,seed,0),s=stats(data);assert(!s.edge&&s.area>1000,'empty or clipped silhouette');areas.push(s.area);
        if(previous)assert(diff(previous,data)>.015,'slider interval visually inert');previous=data;
        const panel=document.createElement('div');panel.textContent=`Seed ${seed} · ${Math.round(rough*100)}%`;
        const c=document.createElement('canvas');c.width=240;c.height=240;c.style.cssText='width:100%;background:repeating-conic-gradient(#292633 0% 25%,#201e28 0% 50%) 0 0/20px 20px';
        c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data),240,240),0,0);panel.append(c);grid.append(panel);
      }
      assert(Math.max(...areas)/Math.min(...areas)>1.6,'insufficient size range');rows.push({seed,areas});
    }
    let maxFrameDelta=0,maxLongDelta=0,maxSoft=0;
    const first=render(1,0,0);
    for(let t=0;t<=100;t+=.5){
      const a=render(1,0,t),b=render(1,0,t+1/60);
      maxFrameDelta=Math.max(maxFrameDelta,diff(a,b));maxLongDelta=Math.max(maxLongDelta,diff(first,a));maxSoft=Math.max(maxSoft,stats(a).soft);
      assert(stats(a).edge===0,'evolution touches canvas edge');
    }
    assert(maxFrameDelta<.005,'abrupt transition');assert(maxLongDelta>.08,'no meaningful evolution');assert(maxSoft>4000,'crossfade does not linger');
    assert(diff(render(0,0,0),render(0,0,90))===0,'zero irregularity evolves');
    for(const [w,h] of [[180,320],[320,180]])assert(stats(render(1,12.8,18,w,h),w,h).edge===0,'aspect ratio clips');
    renderer.dispose();target.dispose();material.dispose();source.dispose();
    return {rows,maxFrameDelta,maxLongDelta,maxSoft};
  });
  await page.screenshot({path:'/tmp/sticker-irregularity-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{document.querySelector('body > div').style.gridTemplateColumns='repeat(2,1fr)';});
  await page.screenshot({path:'/tmp/sticker-irregularity-mobile.png',fullPage:true});
  await writeFile('/tmp/sticker-irregularity-report.json',JSON.stringify({report,errors},null,2));
  console.log(JSON.stringify({report,errors}));if(errors.length)throw Error('GPU console errors');
} finally {await browser.close();}
