/* NYXCORE IA — ROUTEUR D'INTENTION  v1.0.0
 *
 * Tu parles, ou tu touches. NYXCORE IA comprend et confie la tâche au bon agent.
 *
 * Chaîne complète :
 *   micro  →  transcription  →  /api/nyx-brain (Gemini)  →  commande JSON
 *          →  agent du module concerné  →  exécution  →  réponse parlée
 *
 * Chaque module déclare ce qu'il sait faire avec NyxcoreIA.register(...).
 * Le routeur ne connaît aucun module à l'avance : il lit le registre.
 * Ajouter une capacité = enregistrer un agent, rien d'autre à modifier.
 *
 * Hors ligne ou sans Gemini : un interpréteur local par mots-clés prend le
 * relais, et les raccourcis tactiles fonctionnent toujours. Aucune donnée
 * NYXCORE n'est lue ni modifiée par ce fichier.
 */
(() => {
  'use strict';
  if (window.NyxcoreIA) return;

  const VERSION = '1.0.0';
  const LANG = 'fr-CA';
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  const registry = new Map();
  const journal = [];
  let listening = false;
  let recognition = null;
  let voiceOn = true;

  /* ================================================================ */
  /* REGISTRE DES AGENTS                                              */
  /* ================================================================ */

  function register(agent) {
    if (!agent || !agent.id || typeof agent.run !== 'function') return false;
    registry.set(agent.id, {
      id: agent.id,
      nom: agent.nom || agent.id,
      domaine: agent.domaine || '',
      actions: Array.isArray(agent.actions) ? agent.actions : [],
      run: agent.run
    });
    paintAgents();
    paintChips();
    return true;
  }

  function catalogue() {
    return [...registry.values()].map(a => ({
      agent: a.id,
      domaine: a.domaine,
      actions: a.actions.map(x => ({
        action: x.id,
        fait: x.description || '',
        params: x.params || []
      }))
    }));
  }

  /* ================================================================ */
  /* INTERPRÉTATION — cerveau distant, repli local                    */
  /* ================================================================ */

  function routerSystem() {
    return [
      "Tu es NYXCORE IA, le routeur d'intention de KRYVELL ONE (univers REDLINE NEXUS).",
      "On te donne la phrase d'Olivia et le catalogue des agents disponibles.",
      "Choisis UN agent et UNE action du catalogue, et extrais les paramètres.",
      "Réponds UNIQUEMENT par du JSON strict, sans texte autour, sans balises :",
      '{"agent":"<id>","action":"<id>","params":{},"reponse":"<une phrase courte en français>"}',
      "Si aucune action du catalogue ne convient, réponds :",
      '{"agent":"conversation","action":"repondre","params":{},"reponse":"<ta réponse courte>"}',
      "La réponse est toujours en français, tutoiement, une phrase maximum.",
      "CATALOGUE :",
      JSON.stringify(catalogue())
    ].join('\n');
  }

  function extractJSON(text) {
    if (!text) return null;
    const s = String(text);
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(s.slice(start, end + 1)); } catch (_) { return null; }
  }

  async function askBrain(phrase) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch('/api/nyx-brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: ctrl.signal,
        body: JSON.stringify({
          systemPrompt: routerSystem(),
          prompt: phrase,
          temperature: 0.4,
          maxOutputTokens: 220
        })
      });
      if (!r.ok) return null;
      const data = await r.json().catch(() => null);
      return extractJSON(data?.text);
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /* Repli sans réseau : correspondance par mots-clés sur le registre. */
  const ACCENTS = /[\u0300-\u036f]/g;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(ACCENTS, '');

  function localIntent(phrase) {
    const p = norm(phrase);

    for (const a of registry.values()) {
      for (const act of a.actions) {
        const mots = (act.mots || []).map(norm);
        if (mots.some(m => m && p.includes(m))) {
          const params = {};
          (act.params || []).forEach(nom => {
            if (nom === 'module') {
              const cible = trouverModule(p);
              if (cible) params.module = cible;
            } else if (nom === 'texte') {
              params.texte = phrase;
            }
          });
          return {
            agent: a.id,
            action: act.id,
            params,
            reponse: act.confirmation || 'Je m\u2019en occupe.',
            local: true
          };
        }
      }
    }
    return null;
  }

  const MODULES = {
    nyxcore: ['nyxcore', 'nyx core', 'vie', 'tansian', 'tansians', 'population'],
    inkarnyx: ['inkarnyx', 'dessin', 'tatouage', 'tattoo', 'stencil', 'nexcreate'],
    storyverse: ['storyverse', 'recit', 'histoire', 'ecriture'],
    nexarcana: ['nexarcana', 'tarot', 'tirage', 'carte'],
    redline: ['redline', 'nexus', 'canon', 'lore'],
    fusion: ['fusion', 'absorb', 'services'],
    agentic: ['agentic', 'analyse', 'architecture'],
    live: ['live', 'synchronisation', 'donnees', 'airtable'],
    settings: ['parametres', 'reglages', 'systeme'],
    'kryvell-one': ['kryvell one', 'hub', 'accueil']
  };

  function trouverModule(p) {
    for (const [cle, mots] of Object.entries(MODULES)) {
      if (mots.some(m => p.includes(m))) return cle;
    }
    return null;
  }

  /* ================================================================ */
  /* EXÉCUTION                                                        */
  /* ================================================================ */

  async function command(phrase) {
    const texte = String(phrase || '').trim();
    if (!texte) return null;

    const entree = { at: Date.now(), phrase: texte, etat: 'reflexion' };
    journal.unshift(entree);
    paintJournal();

    let intent = navigator.onLine ? await askBrain(texte) : null;
    let source = intent ? 'gemini' : null;
    if (!intent) { intent = localIntent(texte); source = intent ? 'local' : null; }

    if (!intent) {
      entree.etat = 'incompris';
      entree.reponse = "Je n\u2019ai pas compris. Reformule autrement ?";
      paintJournal();
      speak(entree.reponse);
      return entree;
    }

    entree.agent = intent.agent;
    entree.action = intent.action;
    entree.params = intent.params || {};
    entree.source = source;
    entree.etat = 'delegation';
    paintJournal();

    const agent = registry.get(intent.agent);
    if (!agent) {
      entree.etat = 'reponse';
      entree.reponse = intent.reponse || 'Je n\u2019ai pas d\u2019agent pour ça.';
      paintJournal();
      speak(entree.reponse);
      return entree;
    }

    try {
      const res = await agent.run(intent.action, intent.params || {}, texte);
      entree.etat = 'reponse';
      entree.reponse = (res && res.reponse) || intent.reponse || 'C\u2019est fait.';
    } catch (err) {
      entree.etat = 'erreur';
      entree.reponse = 'L\u2019agent ' + agent.nom + ' n\u2019a pas pu exécuter ça.';
      console.warn('[NYXCORE IA]', err);
    }
    paintJournal();
    speak(entree.reponse);
    return entree;
  }

  /* ================================================================ */
  /* VOIX                                                             */
  /* ================================================================ */

  function speak(texte) {
    if (!voiceOn || !texte || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(texte).slice(0, 320));
      u.lang = LANG;
      u.rate = 1.02;
      const v = (speechSynthesis.getVoices?.() || []).find(x => /fr/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (_) {}
  }

  function listen() {
    if (!SR) {
      setStatus('Micro non disponible dans ce navigateur. Écris ta commande.');
      return false;
    }
    if (listening) { stopListening(); return false; }
    try {
      const r = new SR();
      recognition = r;
      r.lang = LANG;
      r.interimResults = true;
      r.continuous = false;
      r.onstart = () => { listening = true; paintMic(); setStatus('Je t\u2019écoute…'); };
      r.onerror = e => {
        listening = false; paintMic();
        setStatus(e?.error === 'not-allowed'
          ? 'Micro refusé. Autorise-le dans Réglages → Safari.'
          : 'Le micro s\u2019est arrêté.');
      };
      r.onend = () => { listening = false; paintMic(); };
      r.onresult = ev => {
        let final = '', partiel = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) final += t; else partiel += t;
        }
        if (partiel) setStatus('… ' + partiel);
        if (final.trim()) { setStatus(''); command(final.trim()); }
      };
      r.start();
      return true;
    } catch (_) {
      listening = false; paintMic();
      setStatus('Impossible de démarrer le micro.');
      return false;
    }
  }

  function stopListening() {
    try { recognition?.stop(); } catch (_) {}
    listening = false;
    paintMic();
  }

  /* ================================================================ */
  /* INTERFACE                                                        */
  /* ================================================================ */

  function styles() {
    if (document.getElementById('nyxcore-ia-style')) return;
    const s = document.createElement('style');
    s.id = 'nyxcore-ia-style';
    s.textContent = `
      #iaMicButton{
        position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom,0px));
        z-index:9000;width:62px;height:62px;border-radius:50%;
        border:2px solid #5a1b2c;background:#17121a;color:#ff4568;
        font-size:25px;display:grid;place-items:center;cursor:pointer;
        box-shadow:0 10px 26px rgba(0,0,0,.5);
      }
      #iaMicButton[data-on="1"]{background:#ff4568;color:#16060b;border-color:#ff4568}
      #iaMicButton:active{transform:scale(.94)}
      #iaPanel{
        position:fixed;inset:auto 0 0 0;z-index:9001;
        max-height:76vh;overflow:auto;
        background:#0d0c11;border-top:2px solid #ff4568;
        border-radius:20px 20px 0 0;
        padding:18px 16px calc(20px + env(safe-area-inset-bottom,0px));
        color:#f2eff1;font:500 15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        box-shadow:0 -14px 40px rgba(0,0,0,.6);
      }
      #iaPanel[hidden]{display:none!important}
      .ia-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
      .ia-head strong{font-size:17px;letter-spacing:.02em}
      .ia-head .eyebrow{font-size:11px;letter-spacing:.16em;color:#ff4568;display:block}
      .ia-x{background:#1d1a22;border:1px solid #3a2f3a;color:#f2eff1;border-radius:10px;
        min-width:40px;min-height:40px;font-size:18px;cursor:pointer}
      .ia-row{display:flex;gap:8px;margin-bottom:12px}
      .ia-row input{flex:1;min-width:0;background:#17161c;border:1px solid #332a35;
        border-radius:12px;padding:12px 14px;color:#f2eff1;font-size:16px}
      .ia-row button{background:#ff4568;border:0;color:#16060b;font-weight:800;
        border-radius:12px;padding:12px 18px;font-size:15px;cursor:pointer;min-height:46px}
      .ia-status{color:#a99fa6;font-size:14px;min-height:22px;margin-bottom:10px}
      .ia-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
      .ia-chip{background:#1b1720;border:1px solid #3d2c38;color:#f2eff1;
        border-radius:999px;padding:11px 16px;font-size:14px;font-weight:700;
        min-height:44px;cursor:pointer}
      .ia-chip:active{transform:scale(.96);border-color:#ff4568}
      .ia-chips-title{font-size:11px;letter-spacing:.16em;text-transform:uppercase;
        color:#6d616b;margin:2px 0 8px;font-weight:800}
      .ia-entry{border:1px solid #2a2330;border-radius:14px;padding:12px 14px;margin-bottom:10px;background:#141219}
      .ia-said{color:#f2eff1;font-weight:700;margin-bottom:8px}
      .ia-chain{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}
      .ia-pill{font-size:12px;font-weight:800;letter-spacing:.04em;padding:4px 10px;border-radius:999px;
        background:#241a22;color:#ff8aa0;border:1px solid #4a2230;text-transform:uppercase}
      .ia-pill.done{background:#14331f;color:#8fe3b0;border-color:#27563a}
      .ia-arrow{color:#6d616b;font-weight:800}
      .ia-answer{color:#d8ccd2}
      .ia-agents{margin-top:6px;padding-top:12px;border-top:1px solid #241f28;
        color:#a99fa6;font-size:13px}
      .ia-agents b{color:#f2eff1}
    `;
    document.head.appendChild(s);
  }

  function ui() {
    styles();
    if (document.getElementById('iaMicButton')) return;

    const mic = document.createElement('button');
    mic.id = 'iaMicButton';
    mic.type = 'button';
    mic.setAttribute('aria-label', 'Parler à NYXCORE IA');
    mic.textContent = '🎙';
    mic.addEventListener('click', () => { openPanel(); listen(); });
    document.body.appendChild(mic);

    const panel = document.createElement('section');
    panel.id = 'iaPanel';
    panel.hidden = true;
    panel.innerHTML =
      '<div class="ia-head"><div><span class="eyebrow">KRYVELL ONE</span>' +
      '<strong>NYXCORE IA</strong></div>' +
      '<button class="ia-x" id="iaClose" aria-label="Fermer">×</button></div>' +
      '<div class="ia-row"><input id="iaInput" type="text" placeholder="Parle ou écris ta commande…" ' +
      'autocomplete="off" enterkeyhint="send"><button id="iaSend">ENVOYER</button></div>' +
      '<div class="ia-status" id="iaStatus"></div>' +
      '<div class="ia-chips-title">À toucher, sans parler</div>' +
      '<div class="ia-chips" id="iaChips"></div>' +
      '<div id="iaJournal"></div>' +
      '<div class="ia-agents" id="iaAgents"></div>';
    document.body.appendChild(panel);

    document.getElementById('iaClose').addEventListener('click', () => {
      panel.hidden = true; stopListening();
    });
    const input = document.getElementById('iaInput');
    const send = () => {
      const v = input.value.trim();
      if (!v) return;
      input.value = '';
      command(v);
    };
    document.getElementById('iaSend').addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

    /* Un seul écouteur pour tous les raccourcis, présents et à venir. */
    panel.addEventListener('click', e => {
      const chip = e.target.closest?.('[data-ia-chip]');
      if (!chip) return;
      const r = raccourcis()[Number(chip.dataset.iaChip)];
      if (r) runDirect(r.agent, r.action, r.params, r.label);
    });

    paintAgents();
    paintChips();
  }

  function openPanel() {
    const p = document.getElementById('iaPanel');
    if (p) p.hidden = false;
  }

  function setStatus(t) {
    const el = document.getElementById('iaStatus');
    if (el) el.textContent = t || '';
  }

  function paintMic() {
    const m = document.getElementById('iaMicButton');
    if (m) m.dataset.on = listening ? '1' : '0';
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function paintJournal() {
    const el = document.getElementById('iaJournal');
    if (!el) return;
    el.innerHTML = journal.slice(0, 8).map(e => {
      const chaine = [];
      chaine.push('<span class="ia-pill done">tu as dit</span>');
      if (e.agent) {
        chaine.push('<span class="ia-arrow">→</span>');
        chaine.push('<span class="ia-pill' + (e.etat === 'reponse' ? ' done' : '') + '">' +
          esc(e.agent) + (e.action ? ' · ' + esc(e.action) : '') + '</span>');
      }
      if (e.source) {
        chaine.push('<span class="ia-arrow">·</span>');
        chaine.push('<span class="ia-pill">' + (e.source === 'local' ? 'local' : 'gemini') + '</span>');
      }
      return '<div class="ia-entry"><div class="ia-said">' + esc(e.phrase) + '</div>' +
        '<div class="ia-chain">' + chaine.join('') + '</div>' +
        '<div class="ia-answer">' + esc(e.reponse || (e.etat === 'reflexion' ? '…' : '')) + '</div></div>';
    }).join('');
  }

  function paintAgents() {
    const el = document.getElementById('iaAgents');
    if (!el) return;
    const noms = [...registry.values()].map(a => esc(a.nom)).join(' · ');
    el.innerHTML = '<b>' + registry.size + ' agents branchés</b>' + (noms ? ' — ' + noms : '');
  }

  /* Raccourcis tactiles : construits depuis le registre, donc un nouvel agent
     qui déclare des raccourcis voit ses boutons apparaître tout seuls.
     Un toucher exécute directement, sans passer par le cerveau : instantané,
     et ça marche hors ligne. */
  function raccourcis() {
    const out = [];
    for (const a of registry.values()) {
      for (const act of a.actions) {
        for (const r of (act.raccourcis || [])) {
          out.push({ agent: a.id, action: act.id, label: r.label, params: r.params || {} });
        }
      }
    }
    return out;
  }

  function paintChips() {
    const el = document.getElementById('iaChips');
    if (!el) return;
    el.innerHTML = raccourcis().map((r, i) =>
      '<button class="ia-chip" type="button" data-ia-chip="' + i + '">' + esc(r.label) + '</button>'
    ).join('');
  }

  async function runDirect(agentId, actionId, params, label) {
    const agent = registry.get(agentId);
    const entree = {
      at: Date.now(), phrase: label || (agentId + ' · ' + actionId),
      agent: agentId, action: actionId, params: params || {},
      source: 'toucher', etat: 'delegation'
    };
    journal.unshift(entree);
    paintJournal();
    if (!agent) {
      entree.etat = 'erreur';
      entree.reponse = 'Agent introuvable.';
      paintJournal();
      return entree;
    }
    try {
      const res = await agent.run(actionId, params || {}, label || '');
      entree.etat = 'reponse';
      entree.reponse = (res && res.reponse) || 'C\u2019est fait.';
    } catch (err) {
      entree.etat = 'erreur';
      entree.reponse = 'L\u2019agent ' + agent.nom + ' n\u2019a pas pu exécuter ça.';
      console.warn('[NYXCORE IA]', err);
    }
    paintJournal();
    speak(entree.reponse);
    return entree;
  }

  /* ================================================================ */
  /* AGENTS DE BASE                                                   */
  /* ================================================================ */

  function agentsDeBase() {
    register({
      id: 'systeme',
      nom: 'Système',
      domaine: "ouvrir les modules de KRYVELL OS et donner l'état de l'app",
      actions: [
        { id: 'ouvrir_module', description: 'ouvre un module (nyxcore, inkarnyx, storyverse, nexarcana, redline, fusion, agentic, live, settings)',
          params: ['module'], mots: ['ouvre', 'ouvrir', 'lance', 'montre'], confirmation: "J'ouvre.",
          raccourcis: [
            { label: 'NYXCORE', params: { module: 'nyxcore' } },
            { label: 'INKARNYX', params: { module: 'inkarnyx' } },
            { label: 'STORYVERSE', params: { module: 'storyverse' } },
            { label: 'NEXARCANA', params: { module: 'nexarcana' } },
            { label: 'REDLINE', params: { module: 'redline' } },
            { label: 'FUSION', params: { module: 'fusion' } }
          ] },
        { id: 'etat', description: "donne l'état du système, réseau et modules chargés",
          params: [], mots: ['etat', 'statut', 'diagnostic'], confirmation: 'Voici l\u2019état.',
          raccourcis: [{ label: 'État système', params: {} }] }
      ],
      run(action, params) {
        if (action === 'ouvrir_module') {
          const cible = params.module;
          const bouton = cible && document.querySelector('[data-app="' + cible + '"]');
          if (bouton) { bouton.click(); return { reponse: "J'ouvre " + cible + '.' }; }
          return { reponse: "Je ne trouve pas ce module." };
        }
        if (action === 'etat') {
          const n = window.KryvellNyxcore && !window.KryvellNyxcore.__lazyStub ? 'chargé' : 'en veille';
          return { reponse: 'Réseau ' + (navigator.onLine ? 'en ligne' : 'hors ligne') +
            ', NYXCORE ' + n + ', ' + registry.size + ' agents branchés.' };
        }
        return { reponse: 'Action inconnue.' };
      }
    });

    register({
      id: 'nyxcore',
      nom: 'NYXCORE',
      domaine: 'la vie artificielle : population de Tansians, cerveau, vitesse',
      actions: [
        { id: 'population', description: 'donne le nombre de Tansians vivants et la génération',
          params: [], mots: ['combien', 'population', 'tansian'], confirmation: 'Je regarde la population.',
          raccourcis: [{ label: 'Population', params: {} }] },
        { id: 'mode_cerveau', description: 'change le mode du cerveau : auto, cloud, local ou math',
          params: ['mode'], mots: ['mode cerveau', 'cerveau'], confirmation: 'Je change le cerveau.',
          raccourcis: [
            { label: 'Cerveau AUTO', params: { mode: 'auto' } },
            { label: 'Cerveau LOCAL', params: { mode: 'local' } }
          ] },
        { id: 'parler_tansian', description: 'parle au Tansian sélectionné', params: ['texte'], mots: ['parle a', 'dis a'], confirmation: 'Je transmets.' }
      ],
      async run(action, params, phrase) {
        if (action === 'population') {
          const s = window.KryvellNyxcore?.stats?.();
          if (!s) return { reponse: 'NYXCORE n\u2019est pas encore chargé. Ouvre-le d\u2019abord.' };
          const vivants = s.alive ?? s.population ?? s.count ?? '?';
          const gen = s.generation ?? s.gen ?? '?';
          return { reponse: vivants + ' Tansians vivants, génération ' + gen + '.' };
        }
        if (action === 'mode_cerveau') {
          const h = window.__NYXCORE_HYBRID__;
          const m = String(params.mode || '').toLowerCase();
          if (!h) return { reponse: 'Le cerveau hybride n\u2019est pas chargé.' };
          if (!['auto', 'cloud', 'local', 'math'].includes(m)) return { reponse: 'Mode inconnu.' };
          h.state.mode = m;
          try { localStorage.setItem('nyxcore:brainMode', m); } catch (_) {}
          return { reponse: 'Cerveau en mode ' + m + '.' };
        }
        if (action === 'parler_tansian') {
          const v = window.__NYXCORE_VOICE__;
          if (!v?.talk) return { reponse: 'Ouvre NYXCORE d\u2019abord, puis choisis un Tansian.' };
          await v.talk(params.texte || phrase);
          return { reponse: 'Message transmis au Tansian.' };
        }
        return { reponse: 'Action inconnue.' };
      }
    });

    register({
      id: 'agentic',
      nom: 'Agentic',
      domaine: 'analyser une idée et la transformer en architecture',
      actions: [
        { id: 'analyser', description: 'analyse une idée ou un projet et propose une structure', params: ['texte'], mots: ['analyse', 'structure', 'architecture'], confirmation: 'J\u2019ouvre l\u2019analyse.' }
      ],
      run(action, params, phrase) {
        const b = document.querySelector('[data-app="agentic"]');
        if (b) b.click();
        const champ = document.getElementById('agenticPrompt');
        if (champ) champ.value = params.texte || phrase;
        return { reponse: 'Agentic est ouvert avec ta demande.' };
      }
    });

    register({
      id: 'conversation',
      nom: 'Conversation',
      domaine: 'répondre quand aucune action précise ne convient',
      actions: [{ id: 'repondre', description: 'répond simplement', params: [], mots: [], confirmation: '' }],
      run(action, params, phrase) { return { reponse: null }; }
    });
  }

  /* ================================================================ */
  /* DÉMARRAGE                                                        */
  /* ================================================================ */

  function boot() {
    ui();
    agentsDeBase();
    paintAgents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.NyxcoreIA = {
    version: VERSION,
    register,
    agents: () => [...registry.values()].map(a => ({ id: a.id, nom: a.nom, actions: a.actions.length })),
    catalogue,
    command,
    executer: runDirect,
    raccourcis,
    listen,
    stop: stopListening,
    speak,
    open: openPanel,
    journal: () => journal.slice(),
    setVoice(on) { voiceOn = Boolean(on); },
    micDisponible: Boolean(SR)
  };
})();
