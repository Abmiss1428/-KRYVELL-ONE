/* NYXCORE VISUAL MATRIX v1.0.0
 * RNX visual-cleanup layer for the living Canvas.
 * Keeps lineage colors readable while using charcoal structure + controlled crimson accents.
 * Adds a PocketPal companion entry point without exposing or copying PocketPal internals.
 */
(() => {
  'use strict';
  if (window.__NYXCORE_VISUAL_MATRIX__) return;

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function ensureStyles(){
    if (document.getElementById('nyx-visual-matrix-style')) return;
    const s = document.createElement('style');
    s.id = 'nyx-visual-matrix-style';
    s.textContent = `
      .nyx-visual-chip{border:1px solid #5d2632!important;background:linear-gradient(180deg,#261016,#150b0f)!important;color:#fff!important}
      .nyx-visual-chip strong{color:#ff4868}
      .nyx-pocketpal-note{margin:10px 0 0;padding:9px 10px;border:1px solid #3a2730;border-radius:12px;background:#120c10;color:#b8b2b5;font-size:11px;line-height:1.45}
    `;
    document.head.appendChild(s);
  }

  function drawMatrixOverlay(engine, target, now){
    const { canvas, ctx, ambient } = target || {};
    if (!canvas || !ctx || !canvas.isConnected) return;
    const w = canvas.width, h = canvas.height;
    const sx = w / engine.constructor?.CONFIG?.worldWidth;
    const sy = h / engine.constructor?.CONFIG?.worldHeight;
    // CONFIG is module-private in the core, so derive world space from known engine conventions.
    const worldW = 2400, worldH = 1400;
    const xScale = w / worldW, yScale = h / worldH;

    ctx.save();

    // Structured charcoal grid: subtle enough to preserve silhouettes.
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1;
    ctx.strokeStyle = ambient ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.035)';
    const grid = ambient ? 120 : 96;
    for (let x = 0; x <= worldW; x += grid) {
      const px = x * xScale; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    }
    for (let y = 0; y <= worldH; y += grid) {
      const py = y * yScale; ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
    }

    const agents = engine.active || [];
    const cap = ambient ? 900 : 1600;
    const stride = Math.max(1, Math.ceil(agents.length / cap));
    const selectedId = engine.selectedId;

    // Recent lineage threads: cleaner and brighter than the base renderer, but still restrained.
    if (!ambient && Array.isArray(engine.birthLinks)) {
      ctx.lineWidth = Math.max(1, Math.min(1.6, (window.devicePixelRatio || 1)));
      let n = 0;
      for (let i = engine.birthLinks.length - 1; i >= 0 && n < 180; i--) {
        const l = engine.birthLinks[i];
        const c = engine.byId?.get?.(l.c); if (!c) continue;
        const a = engine.byId?.get?.(l.a), b = engine.byId?.get?.(l.b);
        ctx.strokeStyle = `hsla(${c.lineageHue || 0} 80% 62% / .16)`;
        if (a) { ctx.beginPath(); ctx.moveTo(a.x*xScale,a.y*yScale); ctx.lineTo(c.x*xScale,c.y*yScale); ctx.stroke(); }
        if (b) { ctx.beginPath(); ctx.moveTo(b.x*xScale,b.y*yScale); ctx.lineTo(c.x*xScale,c.y*yScale); ctx.stroke(); }
        n++;
      }
    }

    // Living-cell overlay: membrane + nucleus + direction vector.
    for (let i = 0; i < agents.length; i += stride) {
      const a = agents[i]; if (!a || a.dead) continue;
      const x = a.x * xScale, y = a.y * yScale;
      const gen = Math.max(1, Number(a.generation || 1));
      const energy = clamp(Number(a.energy || 0) / 140, 0, 1);
      const hue = Number.isFinite(a.lineageHue) ? a.lineageHue : 0;
      const r = (ambient ? 2.5 : 3.5) + clamp(Math.log2(gen + 1) * .34, 0, 2.7);

      // Small directional tail makes autonomous movement readable.
      if (!ambient && (Math.abs(a.vx || 0) + Math.abs(a.vy || 0)) > 4) {
        const vm = Math.hypot(a.vx || 0, a.vy || 0) || 1;
        const len = 8 + energy * 11;
        ctx.strokeStyle = `hsla(${hue} 76% 58% / .20)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - (a.vx/vm)*len, y - (a.vy/vm)*len);
        ctx.stroke();
      }

      // Charcoal core keeps the cell from looking like a flat neon dot.
      ctx.fillStyle = 'rgba(7,7,10,.82)';
      ctx.beginPath(); ctx.arc(x, y, r*1.45, 0, Math.PI*2); ctx.fill();

      // Genetic membrane preserves lineage color.
      ctx.strokeStyle = `hsla(${hue} 86% ${50 + energy*16}% / ${ambient ? .64 : .88})`;
      ctx.lineWidth = ambient ? 1 : 1.4;
      ctx.beginPath(); ctx.arc(x, y, r*1.35, 0, Math.PI*2); ctx.stroke();

      // Energy nucleus.
      ctx.fillStyle = `hsla(${hue} 92% ${60 + energy*20}% / .92)`;
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.1, r*.48 + energy*.9), 0, Math.PI*2); ctx.fill();

      // Controlled crimson signal marks high-generation cells without replacing lineage hue.
      if (gen >= 4 && !ambient) {
        ctx.strokeStyle = `rgba(255,35,72,${clamp(.08 + Math.log2(gen)*.025,.08,.22)})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, r*1.85, 0, Math.PI*2); ctx.stroke();
      }
    }

    const sel = selectedId ? engine.byId?.get?.(selectedId) : null;
    if (sel && !sel.dead) {
      const x = sel.x*xScale, y = sel.y*yScale;
      const pulse = 13 + Math.sin(now*.006)*2.5;
      ctx.shadowBlur = 18; ctx.shadowColor = 'rgba(255,25,63,.52)';
      ctx.strokeStyle = 'rgba(255,49,85,.88)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x,y,pulse,0,Math.PI*2); ctx.stroke();
      ctx.shadowBlur = 0;
      if (!ambient) {
        ctx.font = '700 10px ui-monospace,SFMono-Regular,Menlo,monospace';
        ctx.fillStyle = 'rgba(255,210,220,.95)';
        ctx.fillText(`G${sel.generation || 1} · E${Math.round(sel.energy || 0)} · ${String(sel.intent || 'wander').toUpperCase()}`, x+16, y-12);
      }
    }

    if (!ambient) {
      ctx.fillStyle = 'rgba(5,5,8,.68)';
      ctx.fillRect(14, h-48, Math.min(370, w-28), 31);
      ctx.font = '700 9px ui-monospace,SFMono-Regular,Menlo,monospace';
      ctx.fillStyle = 'rgba(220,210,214,.78)';
      ctx.fillText('MEMBRANE = LIGNÉE  ·  NOYAU = ÉNERGIE  ·  TRACE = MOUVEMENT', 24, h-29);
    }

    ctx.restore();
  }

  function installPocketPalButton(){
    ensureStyles();
    const actions = document.querySelector('.nyx-life .nyx-actions');
    if (!actions || actions.querySelector('[data-nyx-pocketpal]')) return false;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nyx-visual-chip';
    b.dataset.nyxPocketpal = '1';
    b.innerHTML = '🧠 POCKETPAL';
    b.addEventListener('click', () => { location.href = '/nyxcore-pocketpal.html'; });
    actions.appendChild(b);
    return true;
  }

  async function install(){
    ensureStyles();
    for (let i=0;i<240;i++) {
      const api = window.KryvellNyxcore;
      const engine = api?.engine;
      if (engine && typeof engine.drawTarget === 'function') {
        if (!engine.__visualMatrixPatched) {
          const base = engine.drawTarget.bind(engine);
          engine.drawTarget = function(target, now){
            base(target, now);
            try { drawMatrixOverlay(engine, target, now); } catch {}
          };
          engine.__visualMatrixPatched = true;
        }
        installPocketPalButton();
        window.__NYXCORE_VISUAL_MATRIX__ = { version:'1.0.0', installPocketPalButton };
        return true;
      }
      await wait(50);
    }
    return false;
  }

  const obs = new MutationObserver(() => installPocketPalButton());
  obs.observe(document.documentElement,{childList:true,subtree:true});
  install();
})();
