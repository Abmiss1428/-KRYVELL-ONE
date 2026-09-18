/* NYXCORE BUTTON CONTROL v0.9.2
 * Active les boutons, charge les modules avant l'action, aucun RESET.
 */
(() => {
  'use strict';
  if (window.__NYXCORE_BUTTON_CONTROL__) return;

  const V = '0.9.2';
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function injectStyles() {
    if (document.getElementById('nyxcore-button-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'nyxcore-button-fix-style';
    style.textContent = `
      .quick button,
      .quick button[data-ready="false"],
      .quick button[data-ready="true"]{
        opacity:1!important;
        pointer-events:auto!important;
        cursor:pointer!important;
        color:#fff!important;
      }
      .quick button:disabled{opacity:.72!important;pointer-events:none!important}
      .quick button:active{transform:scale(.97);border-color:#ff4568!important}
      .quick button[data-ready="true"]{border-color:#5d2632!important}
      .quick button.nyx-loading{border-color:#8b5a20!important}
      .quick button.nyx-error{border-color:#8f1e35!important;color:#ff9caf!important}
    `;
    document.head.appendChild(style);
  }

  function setButton(id, {text, disabled=false, state='ready'}={}) {
    const b = $(id);
    if (!b) return;
    if (text) b.textContent = text;
    b.disabled = disabled;
    b.dataset.ready = state === 'ready' ? 'true' : 'false';
    b.classList.toggle('nyx-loading', state === 'loading');
    b.classList.toggle('nyx-error', state === 'error');
    b.style.opacity = '1';
    b.style.pointerEvents = disabled ? 'none' : 'auto';
  }

  async function ensureAllModes() {
    const loader = window.KryvellNyxLoader;
    if (!loader?.ensureCore) throw new Error('NYXCORE loader indisponible');
    await loader.ensureCore();
    const result = await loader.loadAllModes?.();
    // laisse les modules réussis utilisables même si un autre module optionnel échoue
    return result || {errors:[]};
  }

  async function waitFor(check, timeout=3500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const value = check();
      if (value) return value;
      await sleep(50);
    }
    return null;
  }

  async function run(id, loadingText, readyText, action) {
    setButton(id, {text:loadingText, disabled:true, state:'loading'});
    try {
      await ensureAllModes();
      await action();
      setButton(id, {text:readyText, disabled:false, state:'ready'});
    } catch (err) {
      console.error('[NYX BUTTON]', id, err);
      setButton(id, {text:'⚠ RÉESSAYER', disabled:false, state:'error'});
      setTimeout(() => setButton(id, {text:readyText, disabled:false, state:'ready'}), 1800);
    }
  }

  function setBrainUI(mode) {
    const labels = {
      qAuto:'🧠 AUTO',
      qCloud:'☁️ GEMINI',
      qLocal:'📱 LOCAL',
      qMath:'🧮 MATH'
    };
    for (const [id,label] of Object.entries(labels)) setButton(id,{text:label,state:'ready'});
    document.querySelectorAll('[data-brain]').forEach(b => {
      b.style.outline = b.dataset.brain === mode ? '2px solid #ff4568' : 'none';
    });
    const select = $('qBrain');
    if (select && document.activeElement !== select) select.value = mode;
  }

  async function chooseBrain(mode) {
    const id = {auto:'qAuto', cloud:'qCloud', local:'qLocal', math:'qMath'}[mode];
    setButton(id,{text:'⏳ CHARGEMENT…',disabled:true,state:'loading'});
    try {
      await ensureAllModes();
      localStorage.setItem('nyxcore:brainMode', mode);
      window.KryvellNyxcore?.setBrainMode?.(mode);
      const hybrid = await waitFor(() => window.__NYXCORE_HYBRID__);
      if (hybrid?.state) hybrid.state.mode = mode;
      setBrainUI(mode);
    } catch (err) {
      console.error('[NYX BRAIN]', err);
      setBrainUI(mode);
    }
  }

  function bind() {
    injectStyles();

    ['qTalk','qInside','qCamera','qSpeed','qPocket','qAuto','qCloud','qLocal','qMath','qAll']
      .forEach(id => setButton(id,{state:'ready'}));

    const qTalk = $('qTalk');
    if (qTalk) qTalk.onclick = () => run('qTalk','⏳ MICRO…','🎙 PARLER', async () => {
      const m = await waitFor(() => window.__NYXCORE_MOBILE_CONTROLS__);
      if (!m?.openTalk) throw new Error('module voix indisponible');
      m.openTalk();
    });

    const qInside = $('qInside');
    if (qInside) qInside.onclick = () => run('qInside','⏳ OUVERTURE…','🔬 INTÉRIEUR', async () => {
      const m = await waitFor(() => window.__NYXCORE_MOBILE_CONTROLS__);
      if (!m?.openInspector) throw new Error('inspecteur indisponible');
      m.openInspector();
    });

    const qCamera = $('qCamera');
    if (qCamera) qCamera.onclick = () => run('qCamera','⏳ CAMÉRA…','👁 CAMÉRA', async () => {
      const v = await waitFor(() => window.__NYXCORE_VISION__);
      if (!v?.start) throw new Error('caméra indisponible');
      if (v.state?.active) v.stop?.('arrêt manuel');
      else await v.start();
      setButton('qCamera',{text:v.state?.active?'👁 CAM ON':'👁 CAMÉRA',state:'ready'});
    });

    const qSpeed = $('qSpeed');
    if (qSpeed) qSpeed.onclick = () => run('qSpeed','⏳ VITESSE…','⚡ VITESSE', async () => {
      const s = await waitFor(() => window.__NYXCORE_SPEED__);
      if (!s?.cycle) throw new Error('module vitesse indisponible');
      s.cycle();
      await sleep(60);
      setButton('qSpeed',{text:`⚡ ×${s.state?.effective || s.state?.requested || 1}`,state:'ready'});
    });

    const qPocket = $('qPocket');
    if (qPocket) qPocket.onclick = () => { location.href = `/nyxcore-pocketpal.html?v=${V}`; };

    const qAll = $('qAll');
    if (qAll) qAll.onclick = async () => {
      setButton('qAll',{text:'⏳ CHARGEMENT…',disabled:true,state:'loading'});
      try {
        const result = await ensureAllModes();
        setButton('qAll',{text:result?.errors?.length?'⚠ MODES PARTIELS':'✅ TOUS MODES',state:result?.errors?.length?'error':'ready'});
        setTimeout(() => setButton('qAll',{text:'⚙ TOUS MODES',state:'ready'}),2200);
      } catch (err) {
        console.error('[NYX ALL MODES]',err);
        setButton('qAll',{text:'⚠ RÉESSAYER',state:'error'});
      }
    };

    const brainMap = {qAuto:'auto',qCloud:'cloud',qLocal:'local',qMath:'math'};
    for (const [id,mode] of Object.entries(brainMap)) {
      const b = $(id);
      if (b) b.onclick = () => chooseBrain(mode);
    }

    const qBrain = $('qBrain');
    if (qBrain) qBrain.onchange = e => chooseBrain(e.target.value);

    setBrainUI(localStorage.getItem('nyxcore:brainMode') || 'auto');
    console.log('✅ NYXCORE BUTTON CONTROL v0.9.2 ACTIF');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, {once:true});
  else bind();

  window.__NYXCORE_BUTTON_CONTROL__ = {version:V, bind, ensureAllModes};
})();
