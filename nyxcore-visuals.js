/* NYXCORE VISUAL MATRIX v1.1.0
 * Mobile-readable entity renderer for the living Canvas.
 * Keeps lineage colors, makes organisms visible on iPhone, and preserves LIFE state.
 */
(() => {
  'use strict';
  if (window.__NYXCORE_VISUAL_MATRIX__) return;

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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

  function canvasScale(canvas){
    const rect = canvas.getBoundingClientRect();
    return clamp(canvas.width / Math.max(1, rect.width), 1, 3);
  }

  function drawOrganism(ctx, canvas, a, x, y, ambient, selected){
    const scale = canvasScale(canvas);
    const gen = Math.max(1, Number(a.generation || 1));
    const energy = clamp(Number(a.energy || 0) / 140, 0, 1);
    const hue = Number.isFinite(a.lineageHue) ? a.lineageHue : 0;
    const vx = Number(a.vx || 0), vy = Number(a.vy || 0);
    const speed = Math.hypot(vx, vy);
    const angle = speed > .001 ? Math.atan2(vy, vx) : 0;
    const baseCss = ambient ? 2.9 : 5.4;
    const genCss = clamp(Math.log2(gen + 1) * .85, .7, 3.8);
    const energyCss = energy * 1.9;
    const r = (baseCss + genCss + energyCss) * scale;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    if (!ambient && speed > 1.5) {
      const tail = r * (1.25 + clamp(speed / 12, 0, .8));
      ctx.strokeStyle = `hsla(${hue} 78% 60% / .28)`;
      ctx.lineWidth = Math.max(1, 1.05 * scale);
      ctx.beginPath();
      ctx.moveTo(-r * .8, 0);
      ctx.quadraticCurveTo(-tail * .55, r * .34, -tail, 0);
      ctx.stroke();
    }

    ctx.fillStyle = selected ? 'rgba(18,8,13,.98)' : 'rgba(6,7,10,.94)';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.55, r * 1.03, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `hsla(${hue} 88% ${52 + energy * 18}% / ${ambient ? .72 : .96})`;
    ctx.lineWidth = Math.max(1, (ambient ? .9 : 1.45) * scale);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.46, r * .96, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = `hsla(${hue} 94% ${60 + energy * 22}% / .97)`;
    ctx.beginPath();
    ctx.ellipse(r * .22, 0, Math.max(1.4 * scale, r * .42), Math.max(1.1 * scale, r * .31), 0, 0, Math.PI * 2);
    ctx.fill();

    if (!ambient && (a.genes?.curiosity ?? .5) > .48) {
      const sensorX = r * 1.05;
      ctx.fillStyle = 'rgba(245,235,239,.92)';
      ctx.beginPath(); ctx.arc(sensorX, -r * .22, Math.max(1.05 * scale, r * .13), 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sensorX,  r * .22, Math.max(1.05 * scale, r * .13), 0, Math.PI * 2); ctx.fill();
    }

    if (gen >= 4 && !ambient) {
      ctx.strokeStyle = `rgba(255,42,78,${clamp(.18 + Math.log2(gen) * .04, .18, .38)})`;
      ctx.lineWidth = Math.max(1, 1.05 * scale);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.82, r * 1.22, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawMatrixOverlay(engine, target, now){
    const { canvas, ctx, ambient } = target || {};
    if (!canvas || !ctx || !canvas.isConnected) return;
    const w = canvas.width, h = canvas.height;
    const worldW = 2400, worldH = 1400;
    const xScale = w / worldW, yScale = h / worldH;
    const scale = canvasScale(canvas);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    ctx.lineWidth = Math.max(1, .7 * scale);
    ctx.strokeStyle = ambient ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.035)';
    const grid = ambient ? 120 : 96;
    for (let x = 0; x <= worldW; x += grid) {
      const px = x * xScale; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    }
    for (let y = 0; y <= worldH; y += grid) {
      const py = y * yScale; ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
    }

    const agents = engine.active || [];
    const cap = ambient ? 700 : 1200;
    const stride = Math.max(1, Math.ceil(agents.length / cap));
    const selectedId = engine.selectedId;

    if (!ambient && Array.isArray(engine.birthLinks)) {
      ctx.lineWidth = Math.max(1, .8 * scale);
      let n = 0;
      for (let i = engine.birthLinks.length - 1; i >= 0 && n < 140; i--) {
        const l = engine.birthLinks[i];
        const c = engine.byId?.get?.(l.c); if (!c) continue;
        const a = engine.byId?.get?.(l.a), b = engine.byId?.get?.(l.b);
        ctx.strokeStyle = `hsla(${c.lineageHue || 0} 80% 62% / .14)`;
        if (a) { ctx.beginPath(); ctx.moveTo(a.x*xScale,a.y*yScale); ctx.lineTo(c.x*xScale,c.y*yScale); ctx.stroke(); }
        if (b) { ctx.beginPath(); ctx.moveTo(b.x*xScale,b.y*yScale); ctx.lineTo(c.x*xScale,c.y*yScale); ctx.stroke(); }
        n++;
      }
    }

    for (let i = 0; i < agents.length; i += stride) {
      const a = agents[i];
      if (!a || a.dead) continue;
      drawOrganism(ctx, canvas, a, a.x * xScale, a.y * yScale, ambient, a.id === selectedId);
    }

    const sel = selectedId ? engine.byId?.get?.(selectedId) : null;
    if (sel && !sel.dead) {
      const x = sel.x*xScale, y = sel.y*yScale;
      const pulse = (15 + Math.sin(now*.006)*2.5) * scale;
      ctx.shadowBlur = 12 * scale;
      ctx.shadowColor = 'rgba(255,25,63,.50)';
      ctx.strokeStyle = 'rgba(255,65,96,.96)';
      ctx.lineWidth = Math.max(2, 1.6 * scale);
      ctx.beginPath(); ctx.arc(x,y,pulse,0,Math.PI*2); ctx.stroke();
      ctx.shadowBlur = 0;
      if (!ambient) {
        ctx.font = `700 ${Math.round(10.5*scale)}px ui-monospace,SFMono-Regular,Menlo,monospace`;
        ctx.fillStyle = 'rgba(255,224,232,.98)';
        ctx.fillText(`G${sel.generation || 1} · E${Math.round(sel.energy || 0)} · ${String(sel.intent || 'wander').toUpperCase()}`, x+18*scale, y-12*scale);
      }
    }

    if (!ambient) {
      const barH = 30 * scale;
      ctx.fillStyle = 'rgba(5,5,8,.76)';
      ctx.fillRect(12*scale, h-(48*scale), Math.min(390*scale, w-24*scale), barH);
      ctx.font = `700 ${Math.round(9.5*scale)}px ui-monospace,SFMono-Regular,Menlo,monospace`;
      ctx.fillStyle = 'rgba(230,219,224,.88)';
      ctx.fillText('ENTITÉ = CORPS  ·  COULEUR = LIGNÉE  ·  NOYAU = ÉNERGIE', 22*scale, h-(29*scale));
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
            try { drawMatrixOverlay(engine, target, now); } catch (err) { console.warn('[NYX VISUAL]', err); }
          };
          engine.__visualMatrixPatched = true;
        }
        installPocketPalButton();
        window.__NYXCORE_VISUAL_MATRIX__ = { version:'1.1.0', installPocketPalButton };
        window.dispatchEvent(new CustomEvent('nyxcore:visual-ready',{detail:{version:'1.1.0'}}));
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
