/** GPU integration test. Run against a Vite dev server with Playwright installed:
 * MOSH_TEST_URL=http://127.0.0.1:8082 PLAYWRIGHT_MODULE=playwright node scripts/test-floating-effects.browser.mjs
 * Optionally point PLAYWRIGHT_MODULE at an existing Playwright installation.
 */
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1050, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(process.env.MOSH_TEST_URL || 'http://127.0.0.1:8082');
  const result = await page.evaluate(async () => {
    const { MoshRenderer } = await import('/src/engine/Renderer.ts');
    const { enableFxCapture, configureFxCapture, renderFxStack } = await import('/src/engine/overlay/fxStackCapture.ts');
    const { EFFECTS_BY_ID, PUBLIC_EFFECTS } = await import('/src/engine/effects.ts');
    const ids = ['prismShards', 'inkTendrils', 'bubbleLenses', 'echoRibbons', 'pixelConfetti', 'electricContours'];
    const canvas = document.createElement('canvas');
    const renderer = new MoshRenderer(canvas);
    renderer.setWarmupEffects([]);
    renderer.resize(320, 240);
    renderer.setHdr(0);
    const source = document.createElement('canvas');
    source.width = 320; source.height = 240;
    const ctx = source.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 320, 240);
    gradient.addColorStop(0, '#ff3254'); gradient.addColorStop(0.5, '#00cee7'); gradient.addColorStop(1, '#d42bff');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 320, 240);
    for (let y = 0; y < 240; y += 20) for (let x = 0; x < 320; x += 20) {
      ctx.fillStyle = (x + y) % 40 ? '#101536' : '#ffce55';
      ctx.beginPath(); ctx.arc(x + 10, y + 10, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(155, 120, 65, 0, Math.PI * 2); ctx.stroke();
    renderer.setSourceCanvas(source);
    const stop = enableFxCapture(canvas);
    const layer = id => ({ id, effectId: id, params: Object.fromEntries(EFFECTS_BY_ID[id].params.map(p => [p.key, p.default])), opacity: 1, hidden: false, blend: 'normal' });
    const frame = layers => { renderer.render(layers); return renderFxStack(canvas, 320, 240, 0.02); };
    const stats = f => {
      let visible = 0, clear = 0, edge = 0;
      for (let i = 3; i < f.data.length; i += 4) {
        if (f.data[i]) {
          visible++;
          const x = ((i - 3) / 4) % 320, y = Math.floor((i - 3) / 1280);
          if (x < 5 || x > 314 || y < 5 || y > 234) edge++;
        } else clear++;
      }
      return { visible, clear, edge };
    };
    const difference = (a, b, alphaOnly = false) => {
      let delta = 0;
      for (let i = alphaOnly ? 3 : 0; i < a.data.length; i += alphaOnly ? 4 : 1) delta += Math.abs(a.data[i] - b.data[i]);
      return delta;
    };
    const assert = (condition, message) => { if (!condition) throw Error(message); };
    const realNow = performance.now.bind(performance);
    let time = realNow();
    Object.defineProperty(performance, 'now', { configurable: true, value: () => time });
    const cards = [], report = {};
    let pairs = 0, blends = 0;
    for (const id of ids) {
      const shape = layer(id);
      const f = frame([shape]); const s = stats(f);
      assert(s.visible && s.clear && !s.edge, `${id}: floating silhouette missing`);
      cards.push({ name: EFFECTS_BY_ID[id].name, pixels: Array.from(f.data) });
      const color = frame([shape, layer('thermal')]);
      assert(difference(f, color, true) === 0, `${id}: color effect changed alpha`);
      for (const key of ['amount', 'coverage']) {
        assert(stats(frame([{ ...shape, params: { ...shape.params, [key]: 0 } }])).visible === 0, `${id}: ${key} zero leaks`);
      }
      const still = { ...shape, params: { ...shape.params, motion: 0 } };
      const frozen = frame([still]); time += 2000;
      assert(difference(frozen, frame([still])) === 0, `${id}: zero motion animates`);
      const moving = frame([shape]); time += 2000;
      const motionDelta = difference(moving, frame([shape]));
      assert(motionDelta > 1000, `${id}: no motion`);
      const stopped = { ...shape, params: { ...shape.params, speed: 0 } };
      const stoppedFrame = frame([stopped]); time += 2000;
      assert(difference(stoppedFrame, frame([stopped])) === 0, `${id}: zero speed animates`);
      const small = frame([{ ...stopped, params: { ...stopped.params, size: 0.3 } }]);
      const large = frame([{ ...stopped, params: { ...stopped.params, size: 1.2 } }]);
      assert(stats(large).visible > stats(small).visible * 2, `${id}: size does not expand`);
      for (const param of EFFECTS_BY_ID[id].params) {
        if (['amount', 'coverage', 'speed', 'motion'].includes(param.key)) continue;
        const low = frame([{ ...shape, params: { ...shape.params, [param.key]: param.min } }]);
        const high = frame([{ ...shape, params: { ...shape.params, [param.key]: param.max } }]);
        assert(difference(low, high) > 100, `${id}: inert ${param.key} control`);
      }
      for (const blend of ['normal', 'screen', 'multiply', 'difference', 'overlay', 'hardLight', 'additive']) {
        const b = stats(frame([{ ...shape, opacity: 0.5, blend }, { ...layer('thermal'), opacity: 0.6, blend }]));
        assert(b.visible && b.clear, `${id}: ${blend} loses silhouette`); blends++;
      }
      for (const effect of PUBLIC_EFFECTS) {
        const other = layer(effect.id);
        for (const stack of [[shape, other], [other, shape]]) {
          const s = stats(frame(stack));
          assert(s.clear > 0, `${id} / ${effect.id}: filled entire frame`);
          // Some temporal sources are intentionally empty before history exists.
          if (stack[0] === shape && !effect.stickerShape) assert(s.visible, `${id} / ${effect.id}: lost shape`);
          pairs++;
        }
      }
      report[id] = { ...s, motionDelta };
    }
    // A full-frame treatment must become an irregular, inset sticker, not a rectangle.
    configureFxCapture(canvas, { stayInside: true, combine: 'join', organic: true, organicSeed: 0 });
    const fullColor = layer('thermal');
    const originalCut = frame([fullColor]);
    const perimeter = stats(originalCut);
    assert(perimeter.visible && perimeter.clear && !perimeter.edge, 'Organic fallback retains canvas boundaries');
    configureFxCapture(canvas, { stayInside: true, combine: 'join', organic: true, organicSeed: 2.39996 });
    const variant = frame([fullColor]);
    assert(difference(originalCut, variant, true) > 10000, 'New silhouette does not change the outline');
    assert(difference(variant, frame([fullColor]), true) === 0, 'Still-source silhouette flickers');
    for (const id of ['prismShards', 'pixelConfetti', 'bubbleLenses']) {
      const shape = layer(id); shape.params.speed = 0;
      configureFxCapture(canvas, { stayInside: true, combine: 'join', organic: false });
      const geometric = frame([shape]);
      configureFxCapture(canvas, { stayInside: true, combine: 'join', organic: true });
      assert(difference(geometric, frame([shape]), true) > 10000, `${id}: angular silhouette unchanged`);
    }
    // Different source content also contributes to the final perimeter.
    const colorful = frame([fullColor]);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 320, 240); renderer.setSourceCanvas(source);
    assert(difference(colorful, frame([fullColor]), true) > 10000, 'Source content does not influence silhouette');
    report.organic = { ...perimeter, variants: true, sourceResponsive: true, stillStable: true };
    const combined = ids.map(layer);
    for (const combine of ['join', 'overlap', 'cut']) {
      configureFxCapture(canvas, { stayInside: true, combine });
      const s = stats(frame(combined));
      assert(s.clear > 0, `${combine}: opaque background`);
      if (combine === 'join') assert(s.visible, 'Joined shapes disappeared');
      report[combine] = s;
    }
    stop();
    const normalShape=layer('prismShards'); normalShape.params.speed=0;
    const normalFrame=()=>{ renderer.render([normalShape]); const c=document.createElement('canvas');c.width=320;c.height=240;const x=c.getContext('2d');x.drawImage(canvas,0,0);return x.getImageData(0,0,320,240); };
    configureFxCapture(canvas,{stayInside:true,combine:'join',organic:false});const normal=normalFrame();
    configureFxCapture(canvas,{stayInside:true,combine:'join',organic:true,organicSeed:9});
    assert(difference(normal,normalFrame())===0,'Organic settings changed normal MOSH rendering');
    renderer.dispose();
    Object.defineProperty(performance, 'now', { configurable: true, value: realNow });
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;background:#111;color:white;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font:14px sans-serif';
    for (const card of cards) {
      const panel = document.createElement('div'); panel.textContent = card.name;
      const c = document.createElement('canvas'); c.width = 320; c.height = 240;
      c.style.cssText = 'display:block;background:repeating-conic-gradient(#20202a 0% 25%,#292933 0% 50%) 0 0/20px 20px';
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(card.pixels), 320, 240), 0, 0);
      panel.append(c); document.body.append(panel);
    }
    return { report, pairs, blends };
  });
  await page.screenshot({ path: '/tmp/six-floating-effects.png' });
  await writeFile('/tmp/six-floating-effects-report.json', JSON.stringify({ ...result, errors }, null, 2));
  console.log(JSON.stringify({ ...result, errors }));
  if (errors.length) throw Error('Browser errors during GPU tests');
} finally {
  await browser.close();
}
