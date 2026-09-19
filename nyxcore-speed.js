/* NYXCORE EVOLUTION SPEED v1.0.1
 * Movement-safe biological time acceleration for iOS/PWA.
 * - Speeds movement, aging, metabolism and reproduction without increasing LLM concurrency.
 * - Adaptive FPS guard lowers effective speed if the device slows down.
 * - Never pauses the life engine; the dedicated thermal guard throttles load instead.
 * - Requested speed persists locally. Default: x5.
 */
(() => {
  'use strict';
  if (window.__NYXCORE_SPEED__) return;

  const PRESETS = [1, 2, 5, 10, 25];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const normalize = value => PRESETS.includes(Number(value)) ? Number(value) : 5;

  const state = {
    requested: normalize(localStorage.getItem('nyxcore:evolutionSpeed') || 5),
    effective: 1,
    lowFpsHits: 0,
    highFpsHits: 0,
    patched: false,
    panel: null,
    pulseTimer: null,
    guardTimer: null
  };

  function engine() { return window.KryvellNyxcore?.engine || null; }
  function log(msg) {
    console.log(`[NYX SPEED] ${msg}`);
    const runtime = document.getElementById('runtimeLogs');
    if (runtime) runtime.textContent = `⚡ ${msg}`;
  }

  function previousPreset(value) {
    const i = Math.max(0, PRESETS.indexOf(value));
    return PRESETS[Math.max(0, i - 1)] || 1;
  }
  function nextPreset(value) {
    const i = Math.max(0, PRESETS.indexOf(value));
    return PRESETS[Math.min(PRESETS.length - 1, i + 1)] || value;
  }

  function applyRequested(value) {
    state.requested = normalize(value);
    state.effective = Math.min(state.effective || 1, state.requested);
    if (state.effective < 1) state.effective = 1;
    if (state.requested > state.effective && (engine()?.fps || 30) >= 20) state.effective = state.requested;
    localStorage.setItem('nyxcore:evolutionSpeed', String(state.requested));
    renderControls();
    log(`Vitesse d’évolution demandée ×${state.requested}.`);
  }

  function cycleSpeed() {
    const idx = PRESETS.indexOf(state.requested);
    applyRequested(PRESETS[(idx + 1) % PRESETS.length]);
  }

  function patchEngine() {
    const e = engine();
    if (!e || state.patched) return false;

    const originalUpdateAgent = e.updateAgent.bind(e);
    e.updateAgent = function(agent, now) {
      if (!agent?.dead && state.effective > 1 && Number.isFinite(agent.lastSimAt)) {
        const realElapsed = clamp(now - agent.lastSimAt, 0, 350);
        const scaledElapsed = clamp(realElapsed * state.effective, 16, 350);
        agent.lastSimAt = now - scaledElapsed;
      }
      return originalUpdateAgent(agent, now);
    };

    const originalStats = e.stats.bind(e);
    e.stats = function() {
      return {
        ...originalStats(),
        evolutionSpeedRequested: state.requested,
        evolutionSpeedEffective: state.effective
      };
    };

    state.patched = true;
    state.effective = state.requested;
    return true;
  }

  function evolutionPulse() {
    const e = engine();
    if (!e?.ready || !e.running || document.hidden || state.effective <= 1) return;

    const speed = state.effective;
    const active = Array.isArray(e.active) ? e.active : [];
    if (!active.length) return;

    // Extra mating opportunities are sampled, never full O(n²) scans.
    const sampleBudget = Math.min(72, Math.max(4, Math.round((speed - 1) * 4)));
    let attempts = 0;
    const len = active.length;
    for (let k = 0; k < sampleBudget; k++) {
      const a = active[(Math.random() * len) | 0];
      if (!a || a.dead || a.age < 18 || a.energy < 76 || a.reproCooldown > 0) continue;
      const chance = clamp((0.004 + (a.genes?.fertility || 0.5) * 0.008) * Math.sqrt(speed), 0, 0.18);
      if (Math.random() > chance) continue;
      const b = e.findMate?.(a);
      if (b) {
        e.reproduce?.(a, b);
        attempts++;
        if (attempts >= 8) break;
      }
    }

    // Keep resource regeneration roughly proportional while staying capped.
    const foodBonus = Math.min(48, Math.max(0, Math.round((speed - 1) * 2)));
    for (let i = 0; i < foodBonus && e.food?.length < window.KryvellNyxcore.config.maxFood; i++) e.spawnFood?.();

    // Virtual cohorts can advance cheaply without materializing every agent.
    if (e.cohorts?.total?.() > 0n && speed > 2) {
      const activeCount = e.populationActive?.() || active.length;
      const desiredFood = Math.min(window.KryvellNyxcore.config.maxFood, Math.max(280, 420 + Math.round(activeCount * 0.28)));
      const resourceFraction = clamp((e.food?.length || 0) / Math.max(1, desiredFood), 0.02, 1);
      e.cohorts.step(Math.min(6, (speed - 1) * 0.35), resourceFraction);
    }

    e.dirty = true;
    e.notifyStats?.();
  }

  function adaptiveGuard() {
    const e = engine();
    if (!e?.ready || document.hidden) return;
    const fps = Number(e.fps || 0);
    if (!fps) return;

    if (fps < 17 && state.effective > 1) {
      state.lowFpsHits++;
      state.highFpsHits = 0;
      if (state.lowFpsHits >= 2) {
        state.effective = previousPreset(state.effective);
        state.lowFpsHits = 0;
        log(`Protection iOS: vitesse réduite à ×${state.effective} (${fps} FPS).`);
        renderControls();
      }
      return;
    }

    if (fps >= 25 && state.effective < state.requested) {
      state.highFpsHits++;
      state.lowFpsHits = 0;
      if (state.highFpsHits >= 3) {
        state.effective = Math.min(state.requested, nextPreset(state.effective));
        state.highFpsHits = 0;
        log(`Performance stable: retour à ×${state.effective}.`);
        renderControls();
      }
      return;
    }

    state.lowFpsHits = 0;
    state.highFpsHits = 0;
  }

  function installStyles() {
    if (document.getElementById('nyxcore-speed-styles')) return;
    const style = document.createElement('style');
    style.id = 'nyxcore-speed-styles';
    style.textContent = `
      .nyx-speed-btn{border-color:#7a263e!important;background:linear-gradient(180deg,#2a1018,#170b10)!important;color:#ff7891!important;box-shadow:0 0 0 1px rgba(255,45,82,.07) inset}
      .nyx-speed-btn[data-throttled="true"]{border-color:#8a6a2c!important;color:#ffd36a!important}
      .nyx-speed-stat strong{color:#ff6f8a!important}
      .nyx-speed-hint{font-size:9px;color:#777783;line-height:1.35;margin:5px 0 8px}
    `;
    document.head.appendChild(style);
  }

  function renderControls() {
    document.querySelectorAll('[data-nyx-speed]').forEach(btn => {
      btn.textContent = `⚡ ×${state.effective}`;
      btn.dataset.throttled = String(state.effective < state.requested);
      btn.title = state.effective < state.requested
        ? `Demandé ×${state.requested}; protection performance active`
        : `Vitesse d’évolution ×${state.effective} — toucher pour changer`;
    });
    document.querySelectorAll('[data-speed-stat]').forEach(el => {
      el.textContent = state.effective < state.requested ? `×${state.effective} AUTO / ×${state.requested}` : `×${state.effective}`;
    });
  }

  function installControls() {
    installStyles();
    document.querySelectorAll('.nyx-life').forEach(root => {
      const actions = root.querySelector('.nyx-actions');
      if (actions && !actions.querySelector('[data-nyx-speed]')) {
        const btn = document.createElement('button');
        btn.className = 'nyx-speed-btn';
        btn.dataset.nyxSpeed = '1';
        btn.type = 'button';
        btn.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); cycleSpeed(); });
        actions.appendChild(btn);
      }
      const side = root.querySelector('.nyx-side');
      if (side && !side.querySelector('[data-speed-stat]')) {
        const row = document.createElement('div');
        row.className = 'nyx-stat nyx-speed-stat';
        row.innerHTML = '<span>Vitesse évolution</span><strong data-speed-stat>—</strong>';
        side.insertBefore(row, side.firstChild);
        const hint = document.createElement('div');
        hint.className = 'nyx-speed-hint';
        hint.textContent = 'Accélère la biologie et les générations; la file LLM reste limitée pour protéger l’iPhone/iPad.';
        row.insertAdjacentElement('afterend', hint);
      }
    });
    renderControls();
  }

  async function boot() {
    for (let i = 0; i < 240; i++) {
      if (window.KryvellNyxcore?.engine) break;
      await sleep(50);
    }
    if (!patchEngine()) return;
    installControls();
    const observer = new MutationObserver(installControls);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    state.pulseTimer = setInterval(evolutionPulse, 1000);
    state.guardTimer = setInterval(adaptiveGuard, 3000);
    window.addEventListener('pageshow', installControls);
    log(`Évolution accélérée active ×${state.requested}.`);
  }

  window.__NYXCORE_SPEED__ = {
    version: '1.0.1',
    state,
    presets: PRESETS,
    setSpeed: applyRequested,
    cycle: cycleSpeed
  };
  boot();
})();