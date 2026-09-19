/* NEXTRÉAL CIVILIZATION ENGINE v0.1.0
 * KRYVELL ONE / NYXCORE
 * Converts population pressure into housing, districts and virtual residents.
 * Preserves the existing NYXCORE population: NO RESET, NO deletion of IndexedDB state.
 */
(() => {
  'use strict';
  if (window.__NEXTRAL_CITY__) return;

  const VERSION = '0.1.0';
  const STORE_KEY = 'nextral-city-v1';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const CONFIG = {
    tickMs: 3000,
    saveMs: 15000,
    formationPopulation: 90,
    formationGeneration: 5,
    outdoorTarget: 140,
    outdoorMinimum: 72,
    maxBuildings: 72,
    buildCooldownMs: 12000,
    reserveCap: 250000
  };

  const BUILDINGS = {
    SHELTER: { capacity: 36, cost: 0, district: 'CORE' },
    HABITAT: { capacity: 90, cost: 24, district: 'HABITAT' },
    BLOCK: { capacity: 180, cost: 55, district: 'HABITAT' },
    TOWER: { capacity: 420, cost: 125, district: 'HABITAT' },
    FARM: { capacity: 0, cost: 18, district: 'FOOD', foodPerTick: 4.5 },
    STORAGE: { capacity: 0, cost: 12, district: 'FOOD', reserveBonus: 180 },
    CLINIC: { capacity: 0, cost: 38, district: 'SERVICES' },
    LAB: { capacity: 0, cost: 70, district: 'RESEARCH' },
    TRANSIT: { capacity: 0, cost: 90, district: 'TRANSIT' },
    ARCHIVE: { capacity: 0, cost: 65, district: 'ARCHIVE' }
  };

  const state = {
    formed: false,
    name: 'NEXTRÉAL',
    phase: 'BIOME',
    residents: 0n,
    capacity: 0,
    storedFood: 0,
    districts: [],
    buildings: [],
    foundedAtGeneration: null,
    foundedAt: null,
    lastBuildAt: 0,
    lastSaveAt: 0,
    dirty: false,
    patched: false,
    originalReproduce: null,
    originalStats: null,
    timer: null,
    uiTimer: null,
    lastPressure: 0,
    lastFertilityMultiplier: 1
  };

  function engine() { return window.KryvellNyxcore?.engine || null; }
  function lifeConfig() { return window.KryvellNyxcore?.config || null; }

  function toNumber(big) {
    try {
      if (typeof big !== 'bigint') return Number(big || 0);
      return big > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(big);
    } catch { return 0; }
  }

  function formatBig(n) {
    try {
      const b = typeof n === 'bigint' ? n : BigInt(n || 0);
      const s = b.toString();
      if (s.length <= 6) return Number(s).toLocaleString('fr-CA');
      return `${s.slice(0,1)},${s.slice(1,3)}e${s.length - 1}`;
    } catch { return '0'; }
  }

  function totalPopulation() {
    const e = engine();
    return e?.populationTotal?.() ?? BigInt(e?.populationActive?.() || 0);
  }

  function phaseFor(total, generation) {
    if (!state.formed) return 'BIOME';
    if (total < 180 && generation < 10) return 'CAMP';
    if (total < 500 && generation < 22) return 'VILLAGE';
    if (total < 1800 && generation < 45) return 'CITY';
    return 'METROPOLIS';
  }

  function ensureDistrict(name) {
    if (!state.districts.includes(name)) {
      state.districts.push(name);
      state.dirty = true;
    }
  }

  function recalcCapacity() {
    state.capacity = state.buildings.reduce((sum, b) => sum + (BUILDINGS[b.type]?.capacity || 0), 0);
    return state.capacity;
  }

  function addBuilding(type, free = false) {
    const spec = BUILDINGS[type];
    if (!spec || state.buildings.length >= CONFIG.maxBuildings) return false;
    if (!free && state.storedFood < spec.cost) return false;
    if (!free) state.storedFood -= spec.cost;
    ensureDistrict(spec.district);
    state.buildings.push({
      id: `NX-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,
      type,
      district: spec.district,
      createdAt: Date.now()
    });
    state.lastBuildAt = Date.now();
    recalcCapacity();
    state.dirty = true;
    return true;
  }

  function bootstrapCity() {
    const e = engine();
    if (!e || state.formed) return;
    const total = toNumber(totalPopulation());
    const generation = Number(e.maxGeneration || e.stats?.().generation || 1);
    if (total < CONFIG.formationPopulation && generation < CONFIG.formationGeneration) return;

    state.formed = true;
    state.foundedAt = Date.now();
    state.foundedAtGeneration = generation;
    ensureDistrict('CORE');
    ensureDistrict('HABITAT');
    ensureDistrict('FOOD');
    addBuilding('SHELTER', true);
    addBuilding('HABITAT', true);
    addBuilding('FARM', true);
    addBuilding('STORAGE', true);
    state.phase = phaseFor(total, generation);
    state.dirty = true;
    window.dispatchEvent(new CustomEvent('nextral:founded', { detail: publicState() }));
  }

  function housingCapacity() {
    // Outdoor population remains part of the living world; buildings absorb the rest.
    return Math.max(CONFIG.outdoorMinimum, CONFIG.outdoorTarget) + Math.max(0, state.capacity);
  }

  function carryingPressure() {
    const total = toNumber(totalPopulation());
    const cap = Math.max(1, housingCapacity());
    return clamp(total / cap, 0, 8);
  }

  function fertilityMultiplier() {
    if (!state.formed) return 1;
    const pressure = carryingPressure();
    const e = engine();
    const c = lifeConfig();
    const foodRatio = clamp((e?.food?.length || 0) / Math.max(1, c?.maxFood || 1200), 0, 1);
    let m = 1;
    if (pressure >= 1.15) m = 0.06;
    else if (pressure >= 1.0) m = 0.12;
    else if (pressure >= 0.88) m = 0.28;
    else if (pressure >= 0.72) m = 0.55;
    if (foodRatio < 0.25) m *= 0.45;
    else if (foodRatio < 0.4) m *= 0.7;
    return clamp(m, 0.03, 1);
  }

  function patchReproduction() {
    const e = engine();
    if (!e || state.patched || typeof e.reproduce !== 'function') return false;
    state.originalReproduce = e.reproduce.bind(e);
    e.reproduce = function(a, b) {
      const m = fertilityMultiplier();
      state.lastFertilityMultiplier = m;
      if (Math.random() > m) return;
      return state.originalReproduce(a, b);
    };

    if (typeof e.stats === 'function') {
      state.originalStats = e.stats.bind(e);
      e.stats = function() {
        const base = state.originalStats();
        return {
          ...base,
          nextralPhase: state.phase,
          nextralResidents: state.residents,
          nextralCapacity: state.capacity,
          nextralBuildings: state.buildings.length,
          nextralDistricts: state.districts.length,
          nextralPressure: state.lastPressure,
          nextralFertilityMultiplier: state.lastFertilityMultiplier
        };
      };
    }
    state.patched = true;
    return true;
  }

  function cityFoodEconomy() {
    if (!state.formed) return;
    const e = engine();
    const c = lifeConfig();
    if (!e || !c) return;
    const farms = state.buildings.filter(b => b.type === 'FARM').length;
    const stores = state.buildings.filter(b => b.type === 'STORAGE').length;
    const maxFood = Math.max(1, Number(c.maxFood || 1200));
    const fieldFood = Number(e.food?.length || 0);
    const surplus = Math.max(0, fieldFood - maxFood * 0.42);
    const production = farms * 4.5 + surplus * 0.012;
    const residentUse = Math.min(70, toNumber(state.residents) * 0.0015);
    const cap = CONFIG.reserveCap + stores * 180;
    state.storedFood = clamp(state.storedFood + production - residentUse, 0, cap);
  }

  function chooseBuilding(total, generation) {
    const pressure = carryingPressure();
    const phase = phaseFor(total, generation);
    if (state.storedFood < 20 && state.buildings.filter(b => b.type === 'FARM').length < 4) return 'FARM';
    if (pressure < 0.66) return null;
    if (phase === 'CAMP') return state.buildings.filter(b => b.type === 'HABITAT').length < 2 ? 'HABITAT' : 'FARM';
    if (phase === 'VILLAGE') return pressure > 0.82 ? 'BLOCK' : (Math.random() < 0.35 ? 'STORAGE' : 'FARM');
    if (phase === 'CITY') {
      if (!state.districts.includes('SERVICES')) return 'CLINIC';
      if (!state.districts.includes('RESEARCH')) return 'LAB';
      return pressure > 0.82 ? 'TOWER' : (Math.random() < 0.25 ? 'FARM' : 'BLOCK');
    }
    if (!state.districts.includes('TRANSIT')) return 'TRANSIT';
    if (!state.districts.includes('ARCHIVE')) return 'ARCHIVE';
    return pressure > 0.76 ? 'TOWER' : (Math.random() < 0.2 ? 'FARM' : 'BLOCK');
  }

  function developCity() {
    if (!state.formed) return;
    const e = engine();
    if (!e) return;
    const total = toNumber(totalPopulation());
    const generation = Number(e.maxGeneration || 1);
    const nextPhase = phaseFor(total, generation);
    if (nextPhase !== state.phase) {
      state.phase = nextPhase;
      state.dirty = true;
      window.dispatchEvent(new CustomEvent('nextral:phase', { detail: publicState() }));
    }
    if (Date.now() - state.lastBuildAt < CONFIG.buildCooldownMs) return;
    const type = chooseBuilding(total, generation);
    if (type && addBuilding(type)) {
      window.dispatchEvent(new CustomEvent('nextral:building', { detail: { type, city: publicState() } }));
    }
  }

  function absorbPopulation() {
    const e = engine();
    if (!e || !state.formed || !Array.isArray(e.active) || !e.cohorts?.addVirtual) return;
    const active = e.populationActive?.() || e.active.length;
    const pressure = carryingPressure();
    let outdoorTarget = CONFIG.outdoorTarget;
    if (state.phase === 'CAMP') outdoorTarget = 110;
    if (state.phase === 'VILLAGE') outdoorTarget = 125;
    if (state.phase === 'CITY') outdoorTarget = 150;
    if (state.phase === 'METROPOLIS') outdoorTarget = 180;
    outdoorTarget = Math.max(CONFIG.outdoorMinimum, outdoorTarget);
    if (active <= outdoorTarget || pressure < 0.58) return;

    const moveCount = Math.min(24, Math.max(1, active - outdoorTarget));
    let moved = 0;
    for (let i = e.active.length - 1; i >= 0 && moved < moveCount; i--) {
      const a = e.active[i];
      if (!a || a.dead || a.id === e.selectedId) continue;
      e.cohorts.addVirtual(a, 1n);
      a.dead = true;
      state.residents += 1n;
      moved++;
    }
    if (moved) {
      e.sweepDead?.();
      e.rebuildSpatialGrids?.();
      e.dirty = true;
      state.dirty = true;
    }
  }

  function publicState() {
    return {
      version: VERSION,
      name: state.name,
      formed: state.formed,
      phase: state.phase,
      residents: state.residents,
      capacity: state.capacity,
      totalHousing: housingCapacity(),
      storedFood: Math.round(state.storedFood),
      districts: [...state.districts],
      buildings: state.buildings.length,
      foundedAtGeneration: state.foundedAtGeneration,
      pressure: state.lastPressure,
      fertilityMultiplier: state.lastFertilityMultiplier
    };
  }

  function serialize() {
    return {
      version: VERSION,
      formed: state.formed,
      name: state.name,
      phase: state.phase,
      residents: state.residents.toString(),
      capacity: state.capacity,
      storedFood: state.storedFood,
      districts: state.districts,
      buildings: state.buildings,
      foundedAtGeneration: state.foundedAtGeneration,
      foundedAt: state.foundedAt,
      lastBuildAt: state.lastBuildAt
    };
  }

  function restore(raw) {
    if (!raw || typeof raw !== 'object') return;
    state.formed = !!raw.formed;
    state.name = raw.name || 'NEXTRÉAL';
    state.phase = raw.phase || 'BIOME';
    try { state.residents = BigInt(raw.residents || 0); } catch { state.residents = 0n; }
    state.capacity = Number(raw.capacity || 0);
    state.storedFood = Number(raw.storedFood || 0);
    state.districts = Array.isArray(raw.districts) ? raw.districts : [];
    state.buildings = Array.isArray(raw.buildings) ? raw.buildings : [];
    state.foundedAtGeneration = raw.foundedAtGeneration ?? null;
    state.foundedAt = raw.foundedAt ?? null;
    state.lastBuildAt = Number(raw.lastBuildAt || 0);
    recalcCapacity();
  }

  async function save(force = false) {
    const e = engine();
    if (!e?.db?.put || (!state.dirty && !force)) return false;
    const ok = await e.db.put(STORE_KEY, serialize());
    if (ok) {
      state.dirty = false;
      state.lastSaveAt = Date.now();
    }
    return !!ok;
  }

  async function load() {
    const e = engine();
    if (!e?.db?.get) return;
    const raw = await e.db.get(STORE_KEY);
    if (raw) restore(raw);
  }

  function installStyles() {
    if (document.getElementById('nextral-city-styles')) return;
    const style = document.createElement('style');
    style.id = 'nextral-city-styles';
    style.textContent = `
      .nextral-card{border:1px solid #54202d;background:linear-gradient(180deg,rgba(55,15,27,.74),rgba(14,10,13,.82));border-radius:12px;padding:10px;margin:8px 0;color:#eee}
      .nextral-card .nx-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}
      .nextral-card .nx-head strong{color:#ff617e;font-size:11px;letter-spacing:.08em}
      .nextral-card .nx-phase{font-size:9px;border:1px solid #703044;border-radius:999px;padding:3px 6px;color:#ffc0cc}
      .nextral-card .nx-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
      .nextral-card .nx-stat{background:rgba(0,0,0,.22);border-radius:8px;padding:6px;min-width:0}
      .nextral-card .nx-stat span{display:block;color:#9e9196;font-size:8px;text-transform:uppercase}.nextral-card .nx-stat b{font-size:11px;color:#fff}
      .nextral-card .nx-note{font-size:8px;color:#8e8589;margin-top:7px;line-height:1.35}
    `;
    document.head.appendChild(style);
  }

  function installUI() {
    installStyles();
    document.querySelectorAll('.nyx-life').forEach(root => {
      const side = root.querySelector('.nyx-side');
      if (!side || side.querySelector('[data-nextral-card]')) return;
      const card = document.createElement('section');
      card.className = 'nextral-card';
      card.dataset.nextralCard = '1';
      card.innerHTML = `
        <div class="nx-head"><strong>🏙 NEXTRÉAL</strong><span class="nx-phase" data-nx-phase>BIOME</span></div>
        <div class="nx-grid">
          <div class="nx-stat"><span>Résidents</span><b data-nx-residents>0</b></div>
          <div class="nx-stat"><span>Capacité</span><b data-nx-capacity>0</b></div>
          <div class="nx-stat"><span>Bâtiments</span><b data-nx-buildings>0</b></div>
          <div class="nx-stat"><span>Districts</span><b data-nx-districts>0</b></div>
          <div class="nx-stat"><span>Réserve</span><b data-nx-food>0</b></div>
          <div class="nx-stat"><span>Pression</span><b data-nx-pressure>0%</b></div>
        </div>
        <div class="nx-note">La ville absorbe une partie de la population en résidents virtuels et réduit automatiquement la reproduction quand la capacité approche de la saturation.</div>`;
      side.prepend(card);
    });
    refreshUI();
  }

  function refreshUI() {
    const s = publicState();
    document.querySelectorAll('[data-nextral-card]').forEach(card => {
      card.querySelector('[data-nx-phase]').textContent = s.formed ? s.phase : 'BIOME';
      card.querySelector('[data-nx-residents]').textContent = formatBig(s.residents);
      card.querySelector('[data-nx-capacity]').textContent = Number(s.totalHousing || 0).toLocaleString('fr-CA');
      card.querySelector('[data-nx-buildings]').textContent = String(s.buildings);
      card.querySelector('[data-nx-districts]').textContent = String(s.districts.length);
      card.querySelector('[data-nx-food]').textContent = Number(s.storedFood || 0).toLocaleString('fr-CA');
      card.querySelector('[data-nx-pressure]').textContent = `${Math.round(s.pressure * 100)}%`;
    });
  }

  async function tick() {
    const e = engine();
    if (!e?.ready) return;
    bootstrapCity();
    patchReproduction();
    cityFoodEconomy();
    state.lastPressure = carryingPressure();
    state.lastFertilityMultiplier = fertilityMultiplier();
    developCity();
    absorbPopulation();
    installUI();
    refreshUI();
    e.notifyStats?.();
    if (state.dirty && Date.now() - state.lastSaveAt >= CONFIG.saveMs) await save(false);
  }

  async function boot() {
    for (let i = 0; i < 240; i++) {
      if (engine()?.ready) break;
      await sleep(50);
    }
    const e = engine();
    if (!e) return;
    await load();
    patchReproduction();
    bootstrapCity();
    installUI();
    await tick();
    state.timer = setInterval(tick, CONFIG.tickMs);
    const observer = new MutationObserver(() => installUI());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('pagehide', () => save(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
    window.dispatchEvent(new CustomEvent('nextral:ready', { detail: publicState() }));
    console.log(`✅ NEXTRÉAL CIVILIZATION ENGINE ${VERSION} ACTIF`);
  }

  window.__NEXTRAL_CITY__ = {
    version: VERSION,
    state,
    config: CONFIG,
    get stats(){ return publicState(); },
    save,
    tick,
    build: addBuilding
  };

  boot();
})();
