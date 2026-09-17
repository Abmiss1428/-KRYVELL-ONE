/*
 * NYXCORE LIFE ENGINE v1.0.0
 * Local-first artificial-life simulation for KRYVELL OS / iOS PWA.
 * - Genetic crossover + mutation
 * - Energy / food / death / autonomous reproduction
 * - Bounded active population + virtual cohorts (BigInt counts)
 * - PocketPal-compatible local LLM priority queue (default 127.0.0.1:5001)
 * - HTML5 Canvas lineage visualization
 * - IndexedDB snapshots
 *
 * No remote cloud dependency is required for the life simulation itself.
 */
(() => {
  'use strict';

  const VERSION = '1.0.0';
  const ROOT_KEY = '__NYXCORE_LIFE_ENGINE__';
  if (window[ROOT_KEY]) return;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const nowMs = () => performance.now();
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `nyx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
  const gaussian = () => {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const hash32 = (value) => {
    const s = String(value);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  const circularHueMix = (a, b, t = 0.5) => {
    const ar = a * Math.PI / 180, br = b * Math.PI / 180;
    const x = Math.cos(ar) * (1 - t) + Math.cos(br) * t;
    const y = Math.sin(ar) * (1 - t) + Math.sin(br) * t;
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  };
  const humanBigInt = (n) => {
    const s = String(n);
    if (s.length <= 6) return Number(s).toLocaleString('fr-CA');
    const lead = s.slice(0, 3);
    return `${lead[0]},${lead.slice(1)}e${s.length - 1}`;
  };
  const log10BigInt = (n) => {
    if (n <= 0n) return 0;
    const s = n.toString();
    const head = Number(s.slice(0, Math.min(12, s.length)));
    return (s.length - 1) + Math.log10(head / 10 ** (Math.min(12, s.length) - 1));
  };

  const deviceCores = navigator.hardwareConcurrency || 4;
  const largeScreen = Math.max(innerWidth, innerHeight) >= 1000;
  const defaultActiveCap = largeScreen && deviceCores >= 8 ? 4500 : (deviceCores >= 6 ? 3000 : 1800);

  const CONFIG = {
    version: VERSION,
    worldWidth: 2400,
    worldHeight: 1400,
    initialAgents: 72,
    initialFood: 750,
    maxActiveAgents: Number(localStorage.getItem('nyxcore:maxActive') || defaultActiveCap),
    targetActiveAgents: Number(localStorage.getItem('nyxcore:targetActive') || Math.round(defaultActiveCap * 0.72)),
    maxFood: Number(localStorage.getItem('nyxcore:maxFood') || (largeScreen ? 1800 : 1200)),
    simHz: 12,
    renderHz: 30,
    backgroundHz: 1,
    agentBudgetMs: largeScreen ? 7 : 5,
    gridSize: 72,
    maxBirthLinks: 5000,
    maxBirthsPerBackgroundTick: 48,
    saveEveryMs: 15000,
    llmConcurrency: 1,
    llmQueueLimit: 28,
    llmCooldownMs: 12000,
    llmTimeoutMs: 25000,
    pocketPalUrl: localStorage.getItem('nyxcore:pocketpalUrl') || 'http://127.0.0.1:5001/v1/chat/completions',
    pocketPalModel: localStorage.getItem('nyxcore:pocketpalModel') || 'llama-3.2',
    allowLocalLLM: localStorage.getItem('nyxcore:llm') !== 'off',
    dprCap: 2,
    debug: false
  };

  const GENE_SCHEMA = {
    temperature:  { min: 0.10, max: 1.50, base: 0.72 },
    curiosity:    { min: 0.00, max: 1.00, base: 0.55 },
    sociability:  { min: 0.00, max: 1.00, base: 0.55 },
    aggression:   { min: 0.00, max: 1.00, base: 0.18 },
    metabolism:   { min: 0.12, max: 1.00, base: 0.45 },
    speed:        { min: 0.10, max: 1.00, base: 0.52 },
    fertility:    { min: 0.00, max: 1.00, base: 0.52 },
    fecundity:    { min: 0.00, max: 1.00, base: 0.22 },
    sensorRadius: { min: 0.15, max: 1.00, base: 0.55 },
    longevity:    { min: 0.20, max: 1.00, base: 0.60 },
    brainAffinity:{ min: 0.00, max: 1.00, base: 0.38 },
    mutationRate: { min: 0.005,max: 0.25, base: 0.045 }
  };

  const createDNA = (overrides = {}) => {
    const out = {};
    for (const [k, spec] of Object.entries(GENE_SCHEMA)) {
      const jitter = gaussian() * (spec.max - spec.min) * 0.07;
      out[k] = clamp(overrides[k] ?? (spec.base + jitter), spec.min, spec.max);
    }
    return out;
  };

  // LAW 1 — genetic crossover + mutation.
  function crossDNA(parentA, parentB) {
    const a = parentA.genes || parentA;
    const b = parentB.genes || parentB;
    const out = {};
    const inheritedMutation = clamp((a.mutationRate + b.mutationRate) * 0.5, GENE_SCHEMA.mutationRate.min, GENE_SCHEMA.mutationRate.max);

    for (const [key, spec] of Object.entries(GENE_SCHEMA)) {
      const blend = Math.random();
      let value = lerp(a[key] ?? spec.base, b[key] ?? spec.base, blend);
      const mutationScale = key === 'mutationRate' ? 0.18 : 0.35;
      const mutationChance = key === 'mutationRate' ? 0.55 : clamp(inheritedMutation * 2.2, 0.02, 0.65);
      if (Math.random() < mutationChance) {
        value += gaussian() * (spec.max - spec.min) * inheritedMutation * mutationScale;
      }
      out[key] = clamp(value, spec.min, spec.max);
    }
    return out;
  }

  class MaxHeap {
    constructor(scoreFn) { this.items = []; this.scoreFn = scoreFn; }
    get size() { return this.items.length; }
    push(item) {
      const a = this.items; a.push(item);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.scoreFn(a[p]) >= this.scoreFn(a[i])) break;
        [a[p], a[i]] = [a[i], a[p]]; i = p;
      }
    }
    pop() {
      const a = this.items;
      if (!a.length) return null;
      const top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          let best = i, l = i * 2 + 1, r = l + 1;
          if (l < a.length && this.scoreFn(a[l]) > this.scoreFn(a[best])) best = l;
          if (r < a.length && this.scoreFn(a[r]) > this.scoreFn(a[best])) best = r;
          if (best === i) break;
          [a[i], a[best]] = [a[best], a[i]]; i = best;
        }
      }
      return top;
    }
  }

  class CohortStore {
    constructor() { this.map = new Map(); }
    keyFor(hue, generation) {
      const hueBucket = Math.round(((hue % 360) + 360) % 360 / 12) * 12;
      const genBucket = Math.floor(Math.log2(Math.max(1, generation)));
      return `${hueBucket}:${genBucket}`;
    }
    addVirtual(agentLike, count = 1n) {
      const hue = agentLike.lineageHue ?? 0;
      const generation = Math.max(1, agentLike.generation || 1);
      const key = this.keyFor(hue, generation);
      let c = this.map.get(key);
      if (!c) {
        c = {
          key,
          count: 0n,
          lineageHue: hue,
          minGeneration: generation,
          maxGeneration: generation,
          fertility: agentLike.genes?.fertility ?? 0.5,
          metabolism: agentLike.genes?.metabolism ?? 0.5,
          longevity: agentLike.genes?.longevity ?? 0.5
        };
        this.map.set(key, c);
      }
      c.count += count;
      c.minGeneration = Math.min(c.minGeneration, generation);
      c.maxGeneration = Math.max(c.maxGeneration, generation);
      const w = Math.min(Number(c.count > 1000000n ? 1000000n : c.count), 1000000);
      const alpha = 1 / Math.max(2, w);
      c.fertility = lerp(c.fertility, agentLike.genes?.fertility ?? c.fertility, alpha);
      c.metabolism = lerp(c.metabolism, agentLike.genes?.metabolism ?? c.metabolism, alpha);
      c.longevity = lerp(c.longevity, agentLike.genes?.longevity ?? c.longevity, alpha);
    }
    total() {
      let n = 0n;
      for (const c of this.map.values()) n += c.count;
      return n;
    }
    step(dt, resourceFraction) {
      const total = this.total();
      const pressure = clamp((log10BigInt(total + 1n) - 4) / 8, 0, 0.95);
      const effectiveFood = clamp(resourceFraction * (1 - pressure * 0.82), 0.03, 1);
      for (const c of this.map.values()) {
        if (c.count <= 0n) continue;
        const birthRate = 0.00045 + c.fertility * 0.0016 * effectiveFood;
        const deathRate = 0.0002 + c.metabolism * 0.00055 + (1 - effectiveFood) * 0.0025;
        const net = clamp((birthRate - deathRate) * dt, -0.02, 0.02);
        const ppm = Math.trunc(Math.abs(net) * 1_000_000);
        if (!ppm) continue;
        let delta = (c.count * BigInt(ppm)) / 1_000_000n;
        if (delta === 0n && c.count > 20n) delta = 1n;
        if (net > 0) c.count += delta;
        else c.count = c.count > delta ? c.count - delta : 0n;
      }
      for (const [k, c] of this.map) if (c.count === 0n) this.map.delete(k);
    }
    serialize() {
      return [...this.map.values()].map(c => ({ ...c, count: c.count.toString() }));
    }
    restore(items = []) {
      this.map.clear();
      for (const raw of items) this.map.set(raw.key, { ...raw, count: BigInt(raw.count || 0) });
    }
  }

  class NyxDB {
    constructor() { this.db = null; this.available = true; }
    async open() {
      if (!('indexedDB' in window)) { this.available = false; return; }
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('nyxcore-life', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch(() => { this.available = false; return null; });
    }
    async get(key) {
      if (!this.db) return null;
      return new Promise(resolve => {
        const tx = this.db.transaction('state', 'readonly');
        const req = tx.objectStore('state').get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      });
    }
    async put(key, value) {
      if (!this.db) return false;
      return new Promise(resolve => {
        const tx = this.db.transaction('state', 'readwrite');
        tx.objectStore('state').put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    }
  }

  class LLMQueue {
    constructor(engine) {
      this.engine = engine;
      this.heap = new MaxHeap(x => x.priority);
      this.queued = new Set();
      this.running = 0;
      this.lastError = '';
      this.online = null;
    }
    enqueue(agent, priority) {
      if (!CONFIG.allowLocalLLM || agent.dead) return;
      if (this.queued.has(agent.id)) return;
      if (this.heap.size >= CONFIG.llmQueueLimit) return;
      const now = Date.now();
      if (now < (agent.nextBrainAt || 0)) return;
      this.queued.add(agent.id);
      this.heap.push({ agentId: agent.id, priority, enqueuedAt: now });
      this.pump();
    }
    async pump() {
      while (this.running < CONFIG.llmConcurrency && this.heap.size) {
        const task = this.heap.pop();
        this.queued.delete(task.agentId);
        const agent = this.engine.byId.get(task.agentId);
        if (!agent || agent.dead) continue;
        this.running++;
        this.runTask(agent).finally(() => { this.running--; this.pump(); });
      }
    }
    async runTask(agent) {
      agent.nextBrainAt = Date.now() + CONFIG.llmCooldownMs;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), CONFIG.llmTimeoutMs);
      try {
        const prompt = this.engine.brainPrompt(agent);
        const body = {
          model: CONFIG.pocketPalModel,
          temperature: agent.genes.temperature,
          max_tokens: 90,
          stream: false,
          messages: [
            { role: 'system', content: 'You are a tiny artificial-life decision module. Return ONLY compact JSON: {"action":"seek_food|wander|mate|rest|explore","dx":-1..1,"dy":-1..1,"memory":"max 40 chars"}.' },
            { role: 'user', content: prompt }
          ]
        };
        const res = await fetch(CONFIG.pocketPalUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctrl.signal,
          cache: 'no-store'
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? data?.response ?? '';
        const parsed = this.engine.parseBrainResponse(text);
        if (parsed) {
          agent.intent = parsed.action || 'wander';
          if (Number.isFinite(parsed.dx) && Number.isFinite(parsed.dy)) {
            const m = Math.hypot(parsed.dx, parsed.dy) || 1;
            agent.aiDx = clamp(parsed.dx / m, -1, 1);
            agent.aiDy = clamp(parsed.dy / m, -1, 1);
          }
          agent.memory = String(parsed.memory || '').slice(0, 80);
          agent.lastBrainAt = Date.now();
        }
        this.online = true;
        this.lastError = '';
      } catch (err) {
        this.online = false;
        this.lastError = err?.name === 'AbortError' ? 'timeout' : String(err?.message || err);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  class NyxcoreLife {
    constructor() {
      this.active = [];
      this.byId = new Map();
      this.recycledAgents = [];
      this.food = [];
      this.foodGrid = new Map();
      this.agentGrid = new Map();
      this.birthLinks = [];
      this.cohorts = new CohortStore();
      this.db = new NyxDB();
      this.llm = new LLMQueue(this);
      this.targets = new Map();
      this.boundCanvases = new WeakSet();
      this.running = true;
      this.ready = false;
      this.dirty = false;
      this.selectedId = null;
      this.focusX = CONFIG.worldWidth / 2;
      this.focusY = CONFIG.worldHeight / 2;
      this.agentCursor = 0;
      this.maxGeneration = 1;
      this.births = 0n;
      this.deaths = 0n;
      this.lastGridAt = 0;
      this.lastBgAt = 0;
      this.lastRenderAt = 0;
      this.lastSaveAt = 0;
      this.lastFpsAt = performance.now();
      this.frameCount = 0;
      this.fps = 0;
      this.uiMounts = new Set();
      this.statsSubscribers = new Set();
      this.loop = this.loop.bind(this);
    }

    async boot() {
      if (this.ready) return;
      await this.db.open();
      try { navigator.storage?.persist?.(); } catch {}
      const state = await this.db.get('latest');
      if (state?.version) this.restore(state);
      else this.seed();
      this.ready = true;
      const ambient = document.getElementById('lifeCanvas');
      if (ambient) this.attachCanvas(ambient, { ambient: true });
      requestAnimationFrame(this.loop);
      window.addEventListener('pagehide', () => this.save(true));
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.save(true);
      });
    }

    seed() {
      this.active.length = 0;
      this.byId.clear();
      this.food.length = 0;
      this.cohorts.map.clear();
      this.birthLinks.length = 0;
      this.births = 0n; this.deaths = 0n; this.maxGeneration = 1;
      for (let i = 0; i < CONFIG.initialAgents; i++) {
        const founderId = uid();
        const hue = hash32(founderId) % 360;
        this.addAgent(this.makeAgent({
          id: founderId,
          generation: 1,
          genes: createDNA(),
          lineageKey: `F-${hash32(founderId).toString(36)}`,
          lineageHue: hue,
          parentIds: [],
          x: rnd(80, CONFIG.worldWidth - 80),
          y: rnd(80, CONFIG.worldHeight - 80),
          energy: rnd(75, 125)
        }));
      }
      for (let i = 0; i < CONFIG.initialFood; i++) this.spawnFood();
      this.dirty = true;
    }

    makeAgent(data) {
      const a = this.recycledAgents.pop() || {};
      a.id = data.id || uid();
      a.generation = data.generation || 1;
      a.genes = data.genes || createDNA();
      a.lineageKey = data.lineageKey || `F-${hash32(a.id).toString(36)}`;
      a.lineageHue = Number.isFinite(data.lineageHue) ? data.lineageHue : (hash32(a.lineageKey) % 360);
      a.parentIds = data.parentIds || [];
      a.x = data.x ?? rnd(0, CONFIG.worldWidth);
      a.y = data.y ?? rnd(0, CONFIG.worldHeight);
      a.vx = data.vx ?? rnd(-1, 1);
      a.vy = data.vy ?? rnd(-1, 1);
      a.energy = data.energy ?? 90;
      a.age = data.age ?? 0;
      a.dead = false;
      a.reproCooldown = data.reproCooldown ?? rnd(4, 18);
      a.intent = data.intent || 'wander';
      a.aiDx = data.aiDx ?? rnd(-1, 1);
      a.aiDy = data.aiDy ?? rnd(-1, 1);
      a.memory = data.memory || '';
      a.nextBrainAt = data.nextBrainAt || 0;
      a.lastBrainAt = data.lastBrainAt || 0;
      a.lastSimAt = nowMs();
      a.lastIntentAt = 0;
      a.hungerTargetId = null;
      return a;
    }

    addAgent(agent) {
      this.active.push(agent);
      this.byId.set(agent.id, agent);
      this.maxGeneration = Math.max(this.maxGeneration, agent.generation || 1);
      this.dirty = true;
      return agent;
    }

    recycleAgent(agent) {
      this.byId.delete(agent.id);
      if (this.recycledAgents.length < CONFIG.maxActiveAgents) this.recycledAgents.push(agent);
    }

    populationActive() {
      let n = 0;
      for (const a of this.active) if (!a.dead) n++;
      return n;
    }

    populationTotal() {
      return BigInt(this.populationActive()) + this.cohorts.total();
    }

    spawnFood(x = rnd(0, CONFIG.worldWidth), y = rnd(0, CONFIG.worldHeight), value = rnd(18, 42)) {
      if (this.food.length >= CONFIG.maxFood) return;
      this.food.push({ id: uid(), x, y, value, alive: true, phase: rnd(0, Math.PI * 2) });
    }

    gridKey(x, y) {
      const cols = Math.ceil(CONFIG.worldWidth / CONFIG.gridSize);
      const cx = clamp(Math.floor(x / CONFIG.gridSize), 0, cols - 1);
      const cy = clamp(Math.floor(y / CONFIG.gridSize), 0, Math.ceil(CONFIG.worldHeight / CONFIG.gridSize) - 1);
      return cx + cy * cols;
    }

    rebuildSpatialGrids() {
      this.foodGrid.clear();
      this.agentGrid.clear();
      for (let i = 0; i < this.food.length; i++) {
        const f = this.food[i]; if (!f.alive) continue;
        const k = this.gridKey(f.x, f.y);
        let arr = this.foodGrid.get(k); if (!arr) this.foodGrid.set(k, arr = []);
        arr.push(i);
      }
      for (let i = 0; i < this.active.length; i++) {
        const a = this.active[i]; if (a.dead) continue;
        const k = this.gridKey(a.x, a.y);
        let arr = this.agentGrid.get(k); if (!arr) this.agentGrid.set(k, arr = []);
        arr.push(i);
      }
    }

    nearbyIndices(grid, x, y) {
      const cols = Math.ceil(CONFIG.worldWidth / CONFIG.gridSize);
      const cx = Math.floor(x / CONFIG.gridSize), cy = Math.floor(y / CONFIG.gridSize);
      const out = [];
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0) continue;
        const arr = grid.get(nx + ny * cols);
        if (arr) out.push(...arr);
      }
      return out;
    }

    findNearestFood(agent) {
      const maxR = 65 + agent.genes.sensorRadius * 145;
      let best = null, bestD2 = maxR * maxR;
      for (const idx of this.nearbyIndices(this.foodGrid, agent.x, agent.y)) {
        const f = this.food[idx]; if (!f?.alive) continue;
        const dx = f.x - agent.x, dy = f.y - agent.y, d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = f; }
      }
      return best;
    }

    findMate(agent) {
      if (agent.age < 18 || agent.reproCooldown > 0 || agent.energy < 76) return null;
      const maxR = 35 + agent.genes.sociability * 95;
      let best = null, bestScore = -Infinity;
      for (const idx of this.nearbyIndices(this.agentGrid, agent.x, agent.y)) {
        const b = this.active[idx];
        if (!b || b === agent || b.dead || b.age < 18 || b.reproCooldown > 0 || b.energy < 72) continue;
        const dx = b.x - agent.x, dy = b.y - agent.y, d = Math.hypot(dx, dy);
        if (d > maxR) continue;
        const compatibility = 1 - Math.abs(agent.genes.sociability - b.genes.sociability) * 0.35;
        const score = compatibility * (agent.genes.fertility + b.genes.fertility) - d / maxR;
        if (score > bestScore) { bestScore = score; best = b; }
      }
      return best;
    }

    cheapBrain(agent, now) {
      const food = this.findNearestFood(agent);
      const hungry = agent.energy < 68 + agent.genes.metabolism * 20;
      if (food && (hungry || agent.genes.curiosity < 0.55)) {
        const dx = food.x - agent.x, dy = food.y - agent.y, m = Math.hypot(dx, dy) || 1;
        agent.aiDx = dx / m; agent.aiDy = dy / m; agent.intent = 'seek_food'; agent.hungerTargetId = food.id;
        return;
      }
      if ((now - agent.lastIntentAt) > 1200 + (1 - agent.genes.curiosity) * 1800) {
        const angle = rnd(0, Math.PI * 2);
        agent.aiDx = Math.cos(angle); agent.aiDy = Math.sin(angle);
        agent.intent = agent.energy > 105 && agent.genes.fertility > 0.5 ? 'mate' : 'wander';
        agent.lastIntentAt = now;
      }
    }

    maybeQueueBrain(agent) {
      if (!CONFIG.allowLocalLLM || agent.dead) return;
      if (Date.now() < (agent.nextBrainAt || 0)) return;
      const dx = agent.x - this.focusX, dy = agent.y - this.focusY;
      const dist = Math.hypot(dx, dy);
      const proximity = 1 - clamp(dist / 850, 0, 1);
      const selected = agent.id === this.selectedId ? 3 : 0;
      const novelty = agent.genes.curiosity * 0.9;
      const need = clamp((75 - agent.energy) / 75, 0, 1);
      const priority = selected * 100 + proximity * 35 + novelty * 18 + need * 24 + agent.genes.brainAffinity * 20;
      if (priority > 24) this.llm.enqueue(agent, priority);
    }

    brainPrompt(agent) {
      const food = this.findNearestFood(agent);
      return `NYXCORE agent=${agent.id.slice(0,8)} gen=${agent.generation} energy=${agent.energy.toFixed(1)} age=${agent.age.toFixed(1)} intent=${agent.intent}; genes curiosity=${agent.genes.curiosity.toFixed(2)} sociability=${agent.genes.sociability.toFixed(2)} aggression=${agent.genes.aggression.toFixed(2)} fertility=${agent.genes.fertility.toFixed(2)}; nearest_food=${food ? Math.hypot(food.x-agent.x, food.y-agent.y).toFixed(1) : 'none'}; choose next action.`;
    }

    parseBrainResponse(text) {
      if (!text) return null;
      try {
        const m = String(text).match(/\{[\s\S]*\}/);
        return m ? JSON.parse(m[0]) : null;
      } catch { return null; }
    }

    reproduce(a, b) {
      if (!a || !b || a.dead || b.dead) return;
      const combinedFertility = (a.genes.fertility + b.genes.fertility) * 0.5;
      if (Math.random() > 0.20 + combinedFertility * 0.55) return;
      const count = 1 + (Math.random() < ((a.genes.fecundity + b.genes.fecundity) * 0.24) ? 1 : 0);
      const cost = 24 + count * 9;
      if (a.energy < cost || b.energy < cost) return;
      a.energy -= cost * 0.55; b.energy -= cost * 0.55;
      a.reproCooldown = 12 + (1 - a.genes.fertility) * 22;
      b.reproCooldown = 12 + (1 - b.genes.fertility) * 22;

      const allowed = Math.min(count, CONFIG.maxBirthsPerBackgroundTick);
      for (let i = 0; i < allowed; i++) {
        const genes = crossDNA(a, b);
        const generation = Math.max(a.generation, b.generation) + 1;
        const hueBase = circularHueMix(a.lineageHue, b.lineageHue, 0.5);
        const lineageHue = (hueBase + gaussian() * genes.mutationRate * 85 + 360) % 360;
        const lineageKey = a.lineageKey === b.lineageKey
          ? a.lineageKey
          : `H-${hash32([a.lineageKey, b.lineageKey].sort().join('|')).toString(36)}`;
        const childData = {
          id: uid(), generation, genes, lineageKey, lineageHue,
          parentIds: [a.id, b.id],
          x: clamp((a.x + b.x) / 2 + rnd(-18, 18), 0, CONFIG.worldWidth),
          y: clamp((a.y + b.y) / 2 + rnd(-18, 18), 0, CONFIG.worldHeight),
          energy: 42 + genes.metabolism * 18
        };
        this.births++;
        this.maxGeneration = Math.max(this.maxGeneration, generation);
        if (this.populationActive() < CONFIG.maxActiveAgents) {
          const child = this.addAgent(this.makeAgent(childData));
          this.birthLinks.push({ a: a.id, b: b.id, c: child.id, bornAt: Date.now() });
          if (this.birthLinks.length > CONFIG.maxBirthLinks) this.birthLinks.splice(0, this.birthLinks.length - CONFIG.maxBirthLinks);
        } else {
          this.cohorts.addVirtual(childData, 1n);
        }
      }
      this.dirty = true;
    }

    kill(agent, reason = 'energy') {
      if (!agent || agent.dead) return;
      agent.dead = true;
      agent.deathReason = reason;
      this.deaths++;
      if (this.selectedId === agent.id) this.selectedId = null;
      this.dirty = true;
    }

    updateAgent(agent, now) {
      if (agent.dead) return;
      const dt = clamp((now - agent.lastSimAt) / 1000, 0.016, 0.35);
      agent.lastSimAt = now;
      agent.age += dt;
      agent.reproCooldown = Math.max(0, agent.reproCooldown - dt);

      this.cheapBrain(agent, now);
      if (Math.random() < 0.008 + agent.genes.brainAffinity * 0.008) this.maybeQueueBrain(agent);

      let dx = agent.aiDx || 0, dy = agent.aiDy || 0;
      const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
      const speed = 18 + agent.genes.speed * 54;
      const smoothing = clamp(dt * 4.5, 0, 1);
      agent.vx = lerp(agent.vx, dx * speed, smoothing);
      agent.vy = lerp(agent.vy, dy * speed, smoothing);
      agent.x += agent.vx * dt; agent.y += agent.vy * dt;

      if (agent.x < 0 || agent.x > CONFIG.worldWidth) { agent.vx *= -0.75; agent.x = clamp(agent.x, 0, CONFIG.worldWidth); agent.aiDx *= -1; }
      if (agent.y < 0 || agent.y > CONFIG.worldHeight) { agent.vy *= -0.75; agent.y = clamp(agent.y, 0, CONFIG.worldHeight); agent.aiDy *= -1; }

      const basal = 0.22 + agent.genes.metabolism * 0.55;
      const move = (Math.abs(agent.vx) + Math.abs(agent.vy)) * 0.0018;
      const brain = (Date.now() - agent.lastBrainAt < 1500) ? 0.18 : 0;
      agent.energy -= (basal + move + brain) * dt;

      const food = this.findNearestFood(agent);
      if (food) {
        const dist = Math.hypot(food.x - agent.x, food.y - agent.y);
        if (dist < 13) {
          agent.energy = Math.min(165, agent.energy + food.value);
          food.alive = false;
          agent.memory = `ate:${food.value.toFixed(0)}`;
          this.dirty = true;
        }
      }

      const maxAge = 150 + agent.genes.longevity * 850;
      if (agent.energy <= 0) this.kill(agent, 'starvation');
      else if (agent.age >= maxAge) this.kill(agent, 'age');
    }

    processAgentsBudget(now) {
      const start = nowMs();
      if (!this.active.length) return;
      let processed = 0;
      while (this.active.length && (nowMs() - start) < CONFIG.agentBudgetMs) {
        if (this.agentCursor >= this.active.length) this.agentCursor = 0;
        const agent = this.active[this.agentCursor++];
        this.updateAgent(agent, now);
        processed++;
        if (processed > this.active.length) break;
      }
    }

    backgroundStep(now) {
      const dt = this.lastBgAt ? clamp((now - this.lastBgAt) / 1000, 0.5, 2.5) : 1;
      this.lastBgAt = now;
      this.rebuildSpatialGrids();

      let birthsThisTick = 0;
      const activeCount = this.populationActive();
      for (let i = 0; i < this.active.length && birthsThisTick < CONFIG.maxBirthsPerBackgroundTick; i++) {
        const a = this.active[i];
        if (!a || a.dead || a.age < 18 || a.energy < 76 || a.reproCooldown > 0) continue;
        const chance = (0.002 + a.genes.fertility * 0.008) * dt;
        if (Math.random() > chance) continue;
        const b = this.findMate(a);
        if (b) { this.reproduce(a, b); birthsThisTick++; }
      }

      let aliveFood = 0;
      for (const f of this.food) if (f.alive) aliveFood++;
      const desiredFood = Math.min(CONFIG.maxFood, Math.max(280, 420 + Math.round(activeCount * 0.28)));
      const regen = Math.min(90, Math.max(0, desiredFood - aliveFood));
      for (let i = 0; i < regen; i++) this.spawnFood();

      this.food = this.food.filter(f => f.alive);
      if (this.food.length > CONFIG.maxFood) this.food.length = CONFIG.maxFood;

      const resourceFraction = clamp((aliveFood + regen) / Math.max(1, desiredFood), 0.02, 1);
      this.cohorts.step(dt, resourceFraction);

      this.sweepDead();
      this.enforceActiveCap();
      this.rebuildSpatialGrids();
      this.notifyStats();
    }

    sweepDead() {
      if (!this.active.some(a => a.dead)) return;
      const next = [];
      for (const a of this.active) {
        if (a.dead) this.recycleAgent(a);
        else next.push(a);
      }
      this.active = next;
      this.agentCursor = Math.min(this.agentCursor, Math.max(0, this.active.length - 1));
    }

    enforceActiveCap() {
      let alive = this.populationActive();
      const limit = Math.max(64, CONFIG.targetActiveAgents);
      if (alive <= CONFIG.maxActiveAgents) return;
      for (let i = this.active.length - 1; i >= 0 && alive > limit; i--) {
        const a = this.active[i]; if (!a || a.dead || a.id === this.selectedId) continue;
        this.cohorts.addVirtual(a, 1n);
        a.dead = true; alive--;
      }
      this.sweepDead();
    }

    stats() {
      return {
        version: VERSION,
        active: this.populationActive(),
        virtual: this.cohorts.total(),
        total: this.populationTotal(),
        food: this.food.length,
        generation: this.maxGeneration,
        births: this.births,
        deaths: this.deaths,
        fps: this.fps,
        llmQueue: this.llm.heap.size,
        llmRunning: this.llm.running,
        llmOnline: this.llm.online,
        llmError: this.llm.lastError,
        running: this.running
      };
    }

    notifyStats() {
      const s = this.stats();
      for (const fn of this.statsSubscribers) { try { fn(s); } catch {} }
    }

    lineageColor(agent, alpha = 1) {
      const genLight = clamp(44 + Math.log2(agent.generation + 1) * 2.7, 44, 72);
      return `hsla(${agent.lineageHue.toFixed(0)} 82% ${genLight.toFixed(0)}% / ${alpha})`;
    }

    attachCanvas(canvas, options = {}) {
      if (!canvas) return;
      this.targets.set(canvas, { canvas, ctx: canvas.getContext('2d', { alpha: true }), ambient: !!options.ambient, lastDraw: 0 });
      if (!this.boundCanvases.has(canvas)) {
        this.boundCanvases.add(canvas);
        canvas.style.touchAction = 'none';
        canvas.addEventListener('pointerdown', (e) => this.handlePointer(canvas, e));
      }
      this.resizeCanvas(canvas);
    }

    resizeCanvas(canvas) {
      if (!canvas?.isConnected) return;
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprCap);
      const w = Math.max(1, Math.floor(r.width * dpr)), h = Math.max(1, Math.floor(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    handlePointer(canvas, e) {
      const r = canvas.getBoundingClientRect();
      const wx = ((e.clientX - r.left) / r.width) * CONFIG.worldWidth;
      const wy = ((e.clientY - r.top) / r.height) * CONFIG.worldHeight;
      this.focusX = wx; this.focusY = wy;
      let best = null, bestD2 = (75 * 75);
      for (const a of this.active) {
        if (a.dead) continue;
        const dx = a.x - wx, dy = a.y - wy, d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = a; }
      }
      this.selectedId = best?.id || null;
      if (best) this.llm.enqueue(best, 500);
      this.notifyStats();
    }

    drawTarget(target, now) {
      const { canvas, ctx, ambient } = target;
      if (!canvas.isConnected) { this.targets.delete(canvas); return; }
      if (ambient && [...this.targets.values()].some(t => !t.ambient)) {
        if (now - target.lastDraw < 180) return;
      }
      target.lastDraw = now;
      this.resizeCanvas(canvas);
      const w = canvas.width, h = canvas.height;
      const sx = w / CONFIG.worldWidth, sy = h / CONFIG.worldHeight;
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.7);
      grad.addColorStop(0, 'rgba(36,8,18,.35)'); grad.addColorStop(1, 'rgba(4,4,7,.12)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'source-over';
      for (const f of this.food) {
        if (!f.alive) continue;
        const x = f.x * sx, y = f.y * sy;
        const r = ambient ? 1.1 : 1.8 + Math.sin(now * 0.003 + f.phase) * 0.5;
        ctx.fillStyle = 'rgba(83,209,122,.72)';
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }

      if (!ambient) {
        ctx.lineWidth = 1;
        let drawnLinks = 0;
        for (let i = this.birthLinks.length - 1; i >= 0 && drawnLinks < 900; i--) {
          const l = this.birthLinks[i], c = this.byId.get(l.c);
          if (!c) continue;
          const pa = this.byId.get(l.a), pb = this.byId.get(l.b);
          ctx.strokeStyle = `hsla(${c.lineageHue} 70% 60% / .10)`;
          ctx.beginPath();
          if (pa) { ctx.moveTo(pa.x * sx, pa.y * sy); ctx.lineTo(c.x * sx, c.y * sy); }
          if (pb) { ctx.moveTo(pb.x * sx, pb.y * sy); ctx.lineTo(c.x * sx, c.y * sy); }
          ctx.stroke(); drawnLinks++;
        }
      }

      for (const a of this.active) {
        if (a.dead) continue;
        const x = a.x * sx, y = a.y * sy;
        const base = ambient ? 1.8 : 2.4;
        const r = base + clamp(Math.log2(a.generation + 1) * 0.24, 0, 2.2) + clamp(a.energy / 120, 0, 1) * 1.1;
        ctx.fillStyle = this.lineageColor(a, ambient ? 0.72 : 0.9);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        if (a.id === this.selectedId) {
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke();
        }
      }

      if (!ambient) {
        const s = this.stats();
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(12, 12, Math.min(390, w - 24), 88);
        ctx.fillStyle = '#fff'; ctx.font = `${Math.max(12, Math.round(w / 85))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillText(`ACTIVE ${s.active.toLocaleString('fr-CA')}   VIRTUAL ${humanBigInt(s.virtual)}`, 22, 38);
        ctx.fillText(`TOTAL ${humanBigInt(s.total)}   GEN ${s.generation}   FPS ${s.fps}`, 22, 62);
        ctx.fillText(`LLM ${s.llmOnline === true ? 'LOCAL✓' : s.llmOnline === false ? 'FALLBACK' : 'AUTO'}   QUEUE ${s.llmQueue}`, 22, 86);
      }
    }

    loop(now) {
      if (this.ready) {
        if (this.running && !document.hidden) this.processAgentsBudget(now);
        if (now - this.lastBgAt >= 1000 / CONFIG.backgroundHz) this.backgroundStep(now);
        if (now - this.lastRenderAt >= 1000 / CONFIG.renderHz) {
          this.lastRenderAt = now;
          for (const target of [...this.targets.values()]) this.drawTarget(target, now);
          this.frameCount++;
          if (now - this.lastFpsAt >= 1000) {
            this.fps = Math.round(this.frameCount * 1000 / (now - this.lastFpsAt));
            this.frameCount = 0; this.lastFpsAt = now;
          }
        }
        if (this.dirty && now - this.lastSaveAt >= CONFIG.saveEveryMs) {
          this.lastSaveAt = now;
          this.save(false);
        }
      }
      requestAnimationFrame(this.loop);
    }

    serialize() {
      return {
        version: VERSION,
        savedAt: Date.now(),
        births: this.births.toString(), deaths: this.deaths.toString(), maxGeneration: this.maxGeneration,
        active: this.active.filter(a => !a.dead).map(a => ({
          id: a.id, generation: a.generation, genes: a.genes, lineageKey: a.lineageKey, lineageHue: a.lineageHue,
          parentIds: a.parentIds, x: a.x, y: a.y, vx: a.vx, vy: a.vy, energy: a.energy, age: a.age,
          reproCooldown: a.reproCooldown, intent: a.intent, aiDx: a.aiDx, aiDy: a.aiDy,
          memory: a.memory, nextBrainAt: a.nextBrainAt, lastBrainAt: a.lastBrainAt
        })),
        food: this.food.filter(f => f.alive).slice(0, CONFIG.maxFood),
        cohorts: this.cohorts.serialize()
      };
    }

    restore(state) {
      this.active.length = 0; this.byId.clear(); this.food.length = 0;
      this.births = BigInt(state.births || 0); this.deaths = BigInt(state.deaths || 0);
      this.maxGeneration = state.maxGeneration || 1;
      for (const raw of state.active || []) this.addAgent(this.makeAgent(raw));
      this.food = (state.food || []).map(f => ({ ...f, alive: true, phase: f.phase ?? rnd(0, Math.PI * 2) })).slice(0, CONFIG.maxFood);
      this.cohorts.restore(state.cohorts || []);
      if (!this.active.length) this.seed();
      while (this.food.length < Math.min(CONFIG.initialFood, CONFIG.maxFood)) this.spawnFood();
      this.dirty = false;
    }

    async save(force = false) {
      if (!this.ready || (!this.dirty && !force)) return false;
      const ok = await this.db.put('latest', this.serialize());
      if (ok) this.dirty = false;
      return ok;
    }

    reset() {
      this.seed();
      this.rebuildSpatialGrids();
      this.notifyStats();
      this.save(true);
    }

    addRandomAgent() {
      const id = uid();
      const a = this.makeAgent({
        id, generation: 1, genes: createDNA(), lineageKey: `F-${hash32(id).toString(36)}`,
        lineageHue: hash32(id) % 360, parentIds: [], x: this.focusX + rnd(-40, 40), y: this.focusY + rnd(-40, 40), energy: 110
      });
      if (this.populationActive() < CONFIG.maxActiveAgents) this.addAgent(a); else this.cohorts.addVirtual(a, 1n);
      this.notifyStats();
    }

    addFoodBurst(n = 80) {
      for (let i = 0; i < n && this.food.length < CONFIG.maxFood; i++) this.spawnFood(this.focusX + rnd(-150, 150), this.focusY + rnd(-150, 150));
      this.dirty = true;
    }

    setPocketPal(url, model) {
      if (url) { CONFIG.pocketPalUrl = url; localStorage.setItem('nyxcore:pocketpalUrl', url); }
      if (model) { CONFIG.pocketPalModel = model; localStorage.setItem('nyxcore:pocketpalModel', model); }
      CONFIG.allowLocalLLM = true; localStorage.setItem('nyxcore:llm', 'on');
      this.llm.online = null; this.llm.lastError = '';
    }

    selectedAgent() { return this.selectedId ? this.byId.get(this.selectedId) || null : null; }

    render(mount) {
      if (!mount) return;
      const id = `nyx-${Math.random().toString(36).slice(2, 8)}`;
      mount.innerHTML = `
        <div class="nyx-life" id="${id}">
          <div class="nyx-toolbar">
            <div><span class="nyx-kicker">NYXCORE LIFE ENGINE ${VERSION}</span><strong>Écosystème vivant local</strong></div>
            <div class="nyx-actions">
              <button data-nyx="toggle">${this.running ? 'PAUSE' : 'REPRENDRE'}</button>
              <button data-nyx="agent">+ ENTITÉ</button>
              <button data-nyx="food">+ NOURRITURE</button>
              <button data-nyx="save">SAUVER</button>
            </div>
          </div>
          <div class="nyx-grid">
            <section class="nyx-stage"><canvas class="nyx-detail-canvas"></canvas></section>
            <aside class="nyx-side">
              <div class="nyx-stat"><span>Population active</span><strong data-stat="active">—</strong></div>
              <div class="nyx-stat"><span>Population virtuelle</span><strong data-stat="virtual">—</strong></div>
              <div class="nyx-stat"><span>Population totale</span><strong data-stat="total">—</strong></div>
              <div class="nyx-stat"><span>Génération max</span><strong data-stat="generation">—</strong></div>
              <div class="nyx-stat"><span>Nourriture</span><strong data-stat="food">—</strong></div>
              <div class="nyx-stat"><span>Cerveau local</span><strong data-stat="llm">AUTO</strong></div>
              <div class="nyx-selected" data-selected><span>TOUCHE UNE CELLULE</span><p>La couleur = lignée génétique. La luminosité et la taille augmentent avec la génération.</p></div>
              <label class="nyx-field"><span>PocketPal / API locale</span><input data-nyx-url value="${CONFIG.pocketPalUrl.replace(/"/g,'&quot;')}" /></label>
              <label class="nyx-field"><span>Modèle local</span><input data-nyx-model value="${CONFIG.pocketPalModel.replace(/"/g,'&quot;')}" /></label>
              <div class="nyx-actions nyx-actions-stack"><button data-nyx="brain">APPLIQUER / TESTER LE CERVEAU</button><button data-nyx="reset" class="danger">RESET ÉCOSYSTÈME</button></div>
            </aside>
          </div>
        </div>`;
      this.ensureStyles();
      const root = mount.querySelector(`#${id}`);
      const canvas = root.querySelector('.nyx-detail-canvas');
      this.attachCanvas(canvas, { ambient: false });
      const update = (s) => {
        if (!root.isConnected) { this.statsSubscribers.delete(update); return; }
        root.querySelector('[data-stat="active"]').textContent = s.active.toLocaleString('fr-CA');
        root.querySelector('[data-stat="virtual"]').textContent = humanBigInt(s.virtual);
        root.querySelector('[data-stat="total"]').textContent = humanBigInt(s.total);
        root.querySelector('[data-stat="generation"]').textContent = s.generation.toLocaleString('fr-CA');
        root.querySelector('[data-stat="food"]').textContent = s.food.toLocaleString('fr-CA');
        root.querySelector('[data-stat="llm"]').textContent = s.llmOnline === true ? `LOCAL ✅ · Q${s.llmQueue}` : s.llmOnline === false ? `MATH FALLBACK · ${s.llmError || 'offline'}` : `AUTO · Q${s.llmQueue}`;
        const a = this.selectedAgent();
        const box = root.querySelector('[data-selected]');
        if (a) box.innerHTML = `<span>ENTITÉ ${a.id.slice(0,8)} · G${a.generation}</span><p>Énergie ${a.energy.toFixed(1)} · âge ${a.age.toFixed(1)} · ${a.intent}<br>Parents: ${a.parentIds.length ? a.parentIds.map(x=>x.slice(0,6)).join(' + ') : 'fondateur'}<br>Temp ${a.genes.temperature.toFixed(2)} · Curiosité ${a.genes.curiosity.toFixed(2)} · Fertilité ${a.genes.fertility.toFixed(2)} · Mutation ${(a.genes.mutationRate*100).toFixed(1)}%</p>`;
      };
      this.statsSubscribers.add(update); update(this.stats());
      root.addEventListener('click', async (e) => {
        const action = e.target.closest('[data-nyx]')?.dataset.nyx;
        if (!action) return;
        if (action === 'toggle') { this.running = !this.running; e.target.textContent = this.running ? 'PAUSE' : 'REPRENDRE'; this.notifyStats(); }
        if (action === 'agent') this.addRandomAgent();
        if (action === 'food') this.addFoodBurst(120);
        if (action === 'save') { e.target.textContent = await this.save(true) ? 'SAUVÉ ✅' : 'SAUVEGARDE LOCALE'; setTimeout(()=>e.target.textContent='SAUVER',1400); }
        if (action === 'brain') {
          this.setPocketPal(root.querySelector('[data-nyx-url]').value.trim(), root.querySelector('[data-nyx-model]').value.trim());
          const target = this.selectedAgent() || this.active.find(a=>!a.dead);
          if (target) this.llm.enqueue(target, 999);
          this.notifyStats();
        }
        if (action === 'reset') {
          if (confirm('Réinitialiser la population NYXCORE locale ? Cette action remplace le snapshot local actuel.')) this.reset();
        }
      });
      this.uiMounts.add(root);
      return root;
    }

    ensureStyles() {
      if (document.getElementById('nyxcore-life-styles')) return;
      const style = document.createElement('style');
      style.id = 'nyxcore-life-styles';
      style.textContent = `
        .agent-world{position:relative;height:clamp(220px,31vh,350px);margin:0 0 18px;overflow:hidden;border:1px solid #2b2026;border-radius:24px;background:radial-gradient(circle at 50% 40%,rgba(215,25,63,.12),transparent 45%),#08080b;box-shadow:inset 0 0 80px rgba(0,0,0,.45)}
        .agent-world:after{content:'NYXCORE · LIVING LOCAL ECOSYSTEM';position:absolute;left:16px;bottom:12px;color:#9e8f95;font:700 9px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em;pointer-events:none}
        .agent-world canvas{display:block;width:100%;height:100%;touch-action:none}
        .nyx-life{height:100%;min-height:560px;background:#09090c;color:#f7f7f8;display:flex;flex-direction:column}
        .nyx-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid #282830;background:#101015;position:sticky;top:0;z-index:2}
        .nyx-toolbar strong,.nyx-kicker{display:block}.nyx-kicker{font:700 9px ui-monospace,SFMono-Regular,Menlo,monospace;color:#b26d7b;letter-spacing:.12em;margin-bottom:3px}.nyx-actions{display:flex;gap:7px;flex-wrap:wrap}.nyx-actions button{border:1px solid #35353e;background:#19191f;color:#f4f4f6;border-radius:10px;padding:8px 10px;font-weight:800;font-size:11px}.nyx-actions .danger{border-color:#682438;color:#ff8aa0}.nyx-grid{min-height:0;flex:1;display:grid;grid-template-columns:minmax(0,1fr) 285px}.nyx-stage{min-width:0;min-height:430px;background:#060608}.nyx-detail-canvas{display:block;width:100%;height:100%;min-height:430px;touch-action:none}.nyx-side{border-left:1px solid #282830;background:#101015;padding:12px;overflow:auto}.nyx-stat{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #27272e;padding:9px 2px}.nyx-stat span{color:#95959f;font-size:11px}.nyx-stat strong{font:800 12px ui-monospace,SFMono-Regular,Menlo,monospace;text-align:right}.nyx-selected{margin:12px 0;padding:11px;border:1px solid #38232b;border-radius:14px;background:#160e12}.nyx-selected span{font:800 10px ui-monospace,SFMono-Regular,Menlo,monospace;color:#ff5b78}.nyx-selected p{font-size:11px;line-height:1.5;color:#bbb7bb;margin:7px 0 0}.nyx-field{display:block;margin:10px 0}.nyx-field span{display:block;color:#8f8f99;font-size:10px;margin-bottom:5px}.nyx-field input{width:100%;border:1px solid #303039;border-radius:10px;background:#09090d;color:#eee;padding:9px;font:11px ui-monospace,SFMono-Regular,Menlo,monospace}.nyx-actions-stack{display:grid;margin-top:10px}.nyx-actions-stack button{width:100%}@media(max-width:760px){.nyx-grid{grid-template-columns:1fr}.nyx-side{border-left:0;border-top:1px solid #282830}.nyx-stage,.nyx-detail-canvas{min-height:370px}.nyx-toolbar{align-items:flex-start;flex-direction:column}}
      `;
      document.head.appendChild(style);
    }
  }

  const engine = new NyxcoreLife();
  window[ROOT_KEY] = engine;
  window.KryvellNyxcore = {
    version: VERSION,
    config: CONFIG,
    crossDNA,
    createDNA,
    render: (mount) => engine.render(mount),
    start: () => { engine.running = true; engine.notifyStats(); },
    stop: () => { engine.running = false; engine.notifyStats(); },
    save: () => engine.save(true),
    reset: () => engine.reset(),
    addAgent: () => engine.addRandomAgent(),
    addFood: (n) => engine.addFoodBurst(n),
    stats: () => engine.stats(),
    setPocketPal: (url, model) => engine.setPocketPal(url, model),
    engine
  };

  engine.ensureStyles();
  engine.boot();
})();
