/* NYXCORE EVOLUTION SPEED v1.1.0
 * Safe biological time acceleration for iOS/PWA.
 * - Speeds movement, aging, metabolism and reproduction without increasing LLM concurrency.
 * - Adaptive FPS + event-loop thermal guard lowers load if the device slows down.
 * - iPad protection can suspend LLM work and temporarily pause the life engine under sustained overload.
 * - Requested speed persists locally. Default: x5.
 */
(() => {
  'use strict';
  if (window.__NYXCORE_SPEED__) return;

  const PRESETS = [1, 2, 5, 10, 25];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const normalize = value => PRESETS.includes(Number(value)) ? Number(value) : 5;
  const IS_IPAD = /iPad/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);

  const state = {
    requested: normalize(localStorage.getItem('nyxcore:evolutionSpeed') || 5),
    effective: 1,
    lowFpsHits: 0,
    highFpsHits: 0,
    patched: false,
    panel: null,
    pulseTimer: null,
    guardTimer: null,
    lagTimer: null,
    thermalLevel: 'cool',
    thermalScore: 0,
    eventLoopLagMs: 0,
    lastLagProbeAt: performance.now(),
    autoPaused: false,
    isIPad: IS_IPAD,
    baseRenderHz: null,
    baseBackgroundHz: null,
    baseAgentBudgetMs: null,
    brainQueueRef: null
  };

  function engine() { return window.KryvellNyxcore?.engine || null; }
  function config() { return window.KryvellNyxcore?.config || null; }
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
    if (state.thermalLevel === 'cool' && state.requested > state.effective && (engine()?.fps || 30) >= 20) state.effective = state.requested;
    localStorage.setItem('nyxcore:evolutionSpeed', String(state.requested));
    renderControls();
    log(`Vitesse d’évolution demandée ×${state.requested}.`);
  }

  function cycleSpeed() {
    const idx = PRESETS.indexOf(state.requested);
    applyRequested(PRESETS[(idx + 1) % PRESETS.length]);
  }

  function patchBrainQueue() {
    const e = engine();
    const q = e?.llm;
    if (!q || q === state.brainQueueRef && q.__nyxThermalGuarded) return;
    if (typeof q.enqueue !== 'function') return;
    const original = q.enqueue.bind(q);
    q.enqueue = function(agent, priority) {
      if (state.thermalLevel === 'hot' || state.thermalLevel === 'critical' || document.hidden) return;
      return original(agent, priority);
    };
    q.__nyxThermalGuarded = true;
    state.brainQueueRef = q;
  }

  function patchEngine() {
    const e = engine();
    const c = config();
    if (!e || !c || state.patched) return false;

    state.baseRenderHz = Number(c.renderHz || 30);
    state.baseBackgroundHz = Number(c.backgroundHz || 1);
    state.baseAgentBudgetMs = Number(c.agentBudgetMs || 5);

    const originalUpdateAgent = e.updateAgent.bind(e);
    e.updateAgent = function(agent, now) {
      if (!agent?.dead && state.effective > 1 && Number.isFinite(agent.lastSimAt)) {
        const realElapsed = clamp(now - agent.lastSimAt, 0, 350);
        const scaledElapsed = clamp(realElapsed * state.effective, 16, 350);
        agent.lastSimAt = now - scaledElapsed;
      }
      return originalUpdateAgent(agent, now);
    };

    if (typeof e.maybeQueueBrain === 'function') {
      const originalMaybeQueueBrain = e.maybeQueueBrain.bind(e);
      e.maybeQueueBrain = function(agent) {
        if (state.thermalLevel === 'hot' || state.thermalLevel === 'critical' || document.hidden) return;
        return originalMaybeQueueBrain(agent);
      };
    }

    const originalStats = e.stats.bind(e);
    e.stats = function() {
      return {
        ...originalStats(),
        evolutionSpeedRequested: state.requested,
        evolutionSpeedEffective: state.effective,
        thermalLevel: state.thermalLevel,
        thermalScore: state.thermalScore,
        eventLoopLagMs: Math.round(state.eventLoopLagMs),
        thermalAutoPaused: state.autoPaused,
        isIPad: state.isIPad
      };
    };

    state.patched = true;
    state.effective = state.requested;
    patchBrainQueue();
    return true;
  }

  function evolutionPulse() {
    const e = engine();
    if (!e?.ready || !e.running || document.hidden || state.effective <= 1) return;
    if (state.thermalLevel === 'hot' || state.thermalLevel === 'critical') return;

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
    for (let i = 0; i < foodBonus && e.food?.length < config().maxFood; i++) e.spawnFood?.();

    // Virtual cohorts can advance cheaply without materializing every agent.
    if (e.cohorts?.total?.() > 0n && speed > 2) {
      const activeCount = e.populationActive?.() || active.length;
      const desiredFood = Math.min(config().maxFood, Math.max(280, 420 + Math.round(activeCount * 0.28)));
      const resourceFraction = clamp((e.food?.length || 0) / Math.max(1, desiredFood), 0.02, 1);
      e.cohorts.step(Math.min(6, (speed - 1) * 0.35), resourceFraction);
    }

    e.dirty = true;
    e.notifyStats?.();
  }

  function applyThermalLevel(level) {
    const e = engine();
    const c = config();
    if (!e || !c) return;
    const previous = state.thermalLevel;
    state.thermalLevel = level;

    if (level === 'critical') {
      state.effective = 1;
      c.renderHz = 8;
      c.backgroundHz = 0.25;
      c.agentBudgetMs = Math.min(1.6, state.baseAgentBudgetMs || 5);
      if (e.running) {
        e.running = false;
        state.autoPaused = true;
      }
    } else if (level === 'hot') {
      state.effective = 1;
      c.renderHz = 12;
      c.backgroundHz = 0.5;
      c.agentBudgetMs = Math.min(2.2, state.baseAgentBudgetMs || 5);
    } else if (level === 'warm') {
      state.effective = Math.min(state.requested, IS_IPAD ? 2 : 5);
      c.renderHz = Math.min(20, state.baseRenderHz || 30);
      c.backgroundHz = Math.min(0.75, state.baseBackgroundHz || 1);
      c.agentBudgetMs = Math.min(3.2, state.baseAgentBudgetMs || 5);
    } else {
      c.renderHz = state.baseRenderHz || 30;
      c.backgroundHz = state.baseBackgroundHz || 1;
      c.agentBudgetMs = state.baseAgentBudgetMs || 5;
      state.effective = state.requested;
      if (state.autoPaused) {
        e.running = true;
        state.autoPaused = false;
      }
    }

    patchBrainQueue();
    if (previous !== level) {
      const labels = { cool: 'NORMAL', warm: 'PROTECTION', hot: 'CHAUD', critical: 'PAUSE THERMIQUE' };
      log(`Protection iPad: ${labels[level] || level}.`);
    }
    renderControls();
    e.notifyStats?.();
  }

  function lagProbe() {
    const now = performance.now();
    const expected = 1000;
    const elapsed = now - state.lastLagProbeAt;
    state.lastLagProbeAt = now;
    const lag = Math.max(0, elapsed - expected);
    state.eventLoopLagMs = state.eventLoopLagMs * 0.72 + lag * 0.28;
  }

  function adaptiveGuard() {
    const e = engine();
    if (!e?.ready) return;
    patchBrainQueue();

    if (document.hidden) {
      state.thermalScore = Math.max(0, state.thermalScore - 2);
      state.effective = 1;
      renderControls();
      return;
    }

    const fps = Number(e.fps || 0);
    const lag = Number(state.eventLoopLagMs || 0);
    let pressure = 0;

    if (fps > 0 && fps < 14) pressure += 4;
    else if (fps > 0 && fps < 19) pressure += 3;
    else if (fps > 0 && fps < 24) pressure += 1;

    if (lag > 450) pressure += 4;
    else if (lag > 250) pressure += 3;
    else if (lag > 120) pressure += 1;

    if (IS_IPAD && state.effective >= 10) pressure += 2;
    else if (IS_IPAD && state.effective >= 5) pressure += 1;

    if (pressure > 0) state.thermalScore = clamp(state.thermalScore + pressure, 0, 16);
    else state.thermalScore = clamp(state.thermalScore - 1, 0, 16);

    if (state.thermalScore >= 11) applyThermalLevel('critical');
    else if (state.thermalScore >= 7) applyThermalLevel('hot');
    else if (state.thermalScore >= 3) applyThermalLevel('warm');
    else applyThermalLevel('cool');

    if (fps < 17 && state.effective > 1) {
      state.lowFpsHits++;
      state.highFpsHits = 0;
      if (state.lowFpsHits >= 2) {
        state.effective = previousPreset(state.effective);
        state.lowFpsHits = 0;
        log(`Protection performance: vitesse réduite à ×${state.effective} (${fps} FPS).`);
        renderControls();
      }
      return;
    }

    if (state.thermalLevel === 'cool' && fps >= 25 && state.effective < state.requested) {
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
      .nyx-thermal-stat strong[data-level="warm"]{color:#ffd36a!important}.nyx-thermal-stat strong[data-level="hot"]{color:#ff8a64!important}.nyx-thermal-stat strong[data-level="critical"]{color:#ff4f72!important}
    `;
    document.head.appendChild(style);
  }

  function thermalLabel() {
    if (state.thermalLevel === 'critical') return '⛔ PAUSE THERMIQUE';
    if (state.thermalLevel === 'hot') return '🔴 CHAUD';
    if (state.thermalLevel === 'warm') return '🟡 PROTECTION';
    return '🟢 NORMAL';
  }

  function renderControls() {
    document.querySelectorAll('[data-nyx-speed]').forEach(btn => {
      btn.textContent = `⚡ ×${state.effective}`;
      btn.dataset.throttled = String(state.effective < state.requested || state.thermalLevel !== 'cool');
      btn.title = state.thermalLevel !== 'cool'
        ? `Protection thermique ${state.thermalLevel}; demandé ×${state.requested}`
        : state.effective < state.requested
          ? `Demandé ×${state.requested}; protection performance active`
          : `Vitesse d’évolution ×${state.effective} — toucher pour changer`;
    });
    document.querySelectorAll('[data-speed-stat]').forEach(el => {
      el.textContent = state.effective < state.requested ? `×${state.effective} AUTO / ×${state.requested}` : `×${state.effective}`;
    });
    document.querySelectorAll('[data-thermal-stat]').forEach(el => {
      el.textContent = `${thermalLabel()} · ${Math.round(state.eventLoopLagMs)}ms`;
      el.dataset.level = state.thermalLevel;
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
      if (side && !side.querySelector('[data-thermal-stat]')) {
        const row = document.createElement('div');
        row.className = 'nyx-stat nyx-thermal-stat';
        row.innerHTML = `<span>Protection ${IS_IPAD ? 'iPad' : 'thermique'}</span><strong data-thermal-stat data-level="cool">🟢 NORMAL</strong>`;
        const firstStat = side.querySelector('.nyx-stat');
        if (firstStat) firstStat.insertAdjacentElement('afterend', row); else side.prepend(row);
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
    state.guardTimer = setInterval(adaptiveGuard, 2000);
    state.lagTimer = setInterval(lagProbe, 1000);
    window.addEventListener('pageshow', installControls);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        state.effective = 1;
        patchBrainQueue();
      }
      renderControls();
    });
    log(`Évolution accélérée active ×${state.requested}${IS_IPAD ? ' · protection iPad active' : ''}.`);
  }

  window.__NYXCORE_SPEED__ = {
    version: '1.1.0',
    state,
    presets: PRESETS,
    setSpeed: applyRequested,
    cycle: cycleSpeed,
    setThermalLevel: applyThermalLevel
  };
  window.__NYXCORE_THERMAL__ = {
    version: '1.0.0',
    state,
    get level(){ return state.thermalLevel; },
    get protected(){ return state.thermalLevel !== 'cool'; }
  };
  boot();
})();