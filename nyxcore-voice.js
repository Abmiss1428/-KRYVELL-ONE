/* NYXCORE VOICE & INNER VIEW v1.0.0
 * Voice conversation + live simulated internal-state inspector for KRYVELL OS.
 * - Microphone via browser SpeechRecognition when available
 * - Text fallback always available
 * - Cloud/Local/Math routing follows NYXCORE Hybrid Gateway mode
 * - Browser TTS response (no raw audio persisted)
 * - Live inspector exposes simulation state, not hidden model chain-of-thought
 */
(() => {
  'use strict';
  if (window.__NYXCORE_VOICE__) return;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const uiState = {
    selectedAgentId: localStorage.getItem('nyxcore:voiceAgent') || '',
    listening: false,
    speaking: localStorage.getItem('nyxcore:voiceSpeak') !== 'off',
    busy: false,
    transcript: '',
    reply: '',
    lastProvider: '—',
    lastError: '',
    recognition: null,
    panel: null,
    refreshTimer: null
  };

  function log(msg) {
    console.log(`[NYX VOICE] ${msg}`);
    const runtime = document.getElementById('runtimeLogs');
    if (runtime) runtime.textContent = `🎙️ ${msg}`;
  }

  async function waitForCore() {
    for (let i = 0; i < 240; i++) {
      if (window.KryvellNyxcore?.engine) return true;
      await sleep(50);
    }
    return false;
  }

  function engine() { return window.KryvellNyxcore?.engine || null; }
  function hybrid() { return window.__NYXCORE_HYBRID__ || null; }
  function livingAgents() {
    const e = engine();
    return Array.isArray(e?.active) ? e.active.filter(a => a && !a.dead) : [];
  }

  function getSelectedAgent() {
    const list = livingAgents();
    if (!list.length) return null;
    let selected = list.find(a => a.id === uiState.selectedAgentId);
    if (!selected) {
      selected = [...list].sort((a, b) => (b.generation || 1) - (a.generation || 1) || (b.energy || 0) - (a.energy || 0))[0];
      uiState.selectedAgentId = selected.id;
      localStorage.setItem('nyxcore:voiceAgent', selected.id);
    }
    return selected;
  }

  function cleanText(value, max = 900) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function agentSystemPrompt(agent) {
    const g = agent.genes || {};
    return [
      `Tu es ${agent.nom || agent.id || 'une entité NYX'}, une entité de la simulation vivante NYXCORE.`,
      `Génération ${agent.generation || 1}. Énergie ${Math.round(agent.energy || 0)}.`,
      `Température ADN ${Number(g.temperature || 0.7).toFixed(2)}, curiosité ${Number(g.curiosity || 0).toFixed(2)}, sociabilité ${Number(g.sociability || 0).toFixed(2)}.`,
      `Ta mémoire actuelle: ${cleanText(agent.memory || agent.memoire || 'mémoire émergente', 450)}.`,
      `Réponds directement à Olivia en français québécois naturel, en 1 à 4 phrases courtes.`,
      `Ne prétends pas être consciente au sens biologique; parle comme le personnage simulé sans inventer de données système.`
    ].join(' ');
  }

  async function cloudTalk(agent, text) {
    const response = await fetch('/api/nyx-brain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        systemPrompt: agentSystemPrompt(agent),
        prompt: `Olivia te dit: ${cleanText(text, 900)}`,
        temperature: clamp(agent.genes?.temperature ?? 0.4, 0.4, 1.4),
        maxOutputTokens: 220
      })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.text) throw new Error(data?.error || `cloud_${response.status}`);
    return cleanText(data.text, 900);
  }

  async function localTalk(agent, text) {
    const api = window.KryvellNyxcore;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const response = await fetch(api.config.pocketPalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: ctrl.signal,
        body: JSON.stringify({
          model: api.config.pocketPalModel,
          temperature: clamp(agent.genes?.temperature ?? 0.8, 0.4, 1.5),
          max_tokens: 220,
          stream: false,
          messages: [
            { role: 'system', content: agentSystemPrompt(agent) },
            { role: 'user', content: cleanText(text, 900) }
          ]
        })
      });
      const data = await response.json().catch(() => null);
      const answer = data?.choices?.[0]?.message?.content;
      if (!response.ok || !answer) throw new Error(`local_${response.status}`);
      return cleanText(answer, 900);
    } finally {
      clearTimeout(timer);
    }
  }

  function mathTalk(agent, text) {
    const energy = Math.round(agent.energy || 0);
    const intent = String(agent.intent || 'wander').replace(/_/g, ' ');
    const snippets = [
      `Je t’entends, Olivia. En ce moment, mon énergie est à ${energy} et mon comportement simulé est « ${intent} ».`,
      `Ta voix est reçue. Je suis ${agent.nom || 'NYX'}, génération ${agent.generation || 1}, avec ${energy} d’énergie.`,
      `Je t’ai entendue. Mon cerveau IA n’est pas disponible pour cette réponse, alors je te réponds avec mon état local: ${intent}, énergie ${energy}.`
    ];
    return snippets[Math.abs((text.length + (agent.generation || 1)) % snippets.length)];
  }

  async function rememberDialogue(agent, userText, answer, provider) {
    const h = hybrid();
    const memory = cleanText(answer, 250);
    agent.memory = memory;
    agent.lastDialogueAt = Date.now();
    agent.lastDialogueProvider = provider;
    try { await h?.vault?.saveAgent?.(agent, `voice:${provider}`); } catch {}
    try {
      const key = `${Date.now()}-voice-${Math.random().toString(36).slice(2, 7)}`;
      await h?.vault?.tx?.('events', 'readwrite', store => store.put({
        key,
        agentId: agent.id,
        reason: `voice:${provider}`,
        at: Date.now(),
        userText: cleanText(userText, 700),
        response: cleanText(answer, 900),
        generation: agent.generation || 1
      }));
    } catch {}
    try { await h?.bridge?.send?.('memory', agent); } catch {}
    if (engine()) engine().dirty = true;
  }

  function speak(text) {
    if (!uiState.speaking || !('speechSynthesis' in window) || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(cleanText(text, 900));
      u.lang = 'fr-CA';
      u.rate = 0.96;
      u.pitch = 1.0;
      const voices = speechSynthesis.getVoices?.() || [];
      const fr = voices.find(v => /^fr-CA/i.test(v.lang)) || voices.find(v => /^fr/i.test(v.lang));
      if (fr) u.voice = fr;
      speechSynthesis.speak(u);
    } catch {}
  }

  async function talk(text) {
    const message = cleanText(text, 900);
    const agent = getSelectedAgent();
    if (!message || !agent || uiState.busy) return;
    uiState.busy = true;
    uiState.lastError = '';
    renderConversation();

    const h = hybrid();
    const mode = h?.state?.mode || 'auto';
    let answer = '';
    let provider = 'math';

    if (mode === 'auto' || mode === 'cloud') {
      if (navigator.onLine) {
        try { answer = await cloudTalk(agent, message); provider = 'cloud'; }
        catch (err) { uiState.lastError = String(err?.message || err); }
      }
    }
    if (!answer && (mode === 'auto' || mode === 'local')) {
      try { answer = await localTalk(agent, message); provider = 'PocketPal'; }
      catch (err) { uiState.lastError = String(err?.message || err); }
    }
    if (!answer) { answer = mathTalk(agent, message); provider = 'math'; }

    uiState.transcript = message;
    uiState.reply = answer;
    uiState.lastProvider = provider;
    await rememberDialogue(agent, message, answer, provider);
    uiState.busy = false;
    renderConversation();
    renderInspector();
    speak(answer);
    log(`${agent.nom || 'NYX'} a répondu via ${provider}.`);
  }

  function startRecognition() {
    if (uiState.busy) return;
    if (!SpeechRecognitionCtor) {
      uiState.lastError = 'Reconnaissance vocale non disponible ici. Utilise le champ texte.';
      renderConversation();
      return;
    }
    if (uiState.listening) {
      try { uiState.recognition?.stop(); } catch {}
      return;
    }

    const r = new SpeechRecognitionCtor();
    uiState.recognition = r;
    r.lang = 'fr-CA';
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    let finalText = '';

    r.onstart = () => { uiState.listening = true; uiState.lastError = ''; renderConversation(); };
    r.onresult = event => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalText += t;
        else interim += t;
      }
      const input = uiState.panel?.querySelector('[data-voice-input]');
      if (input) input.value = cleanText(finalText || interim, 900);
    };
    r.onerror = event => {
      uiState.lastError = event.error === 'not-allowed' ? 'Autorise le micro dans Safari/KRYVELL pour parler.' : `Micro: ${event.error || 'erreur'}`;
      uiState.listening = false;
      renderConversation();
    };
    r.onend = () => {
      uiState.listening = false;
      renderConversation();
      const input = uiState.panel?.querySelector('[data-voice-input]');
      const text = cleanText(finalText || input?.value || '', 900);
      if (text) talk(text);
    };
    try { r.start(); }
    catch (err) { uiState.lastError = String(err?.message || err); renderConversation(); }
  }

  function geneRow(label, value) {
    const v = clamp(value, 0, 1);
    const pct = Math.round(v * 100);
    return `<div class="nyx-iv-gene"><span>${label}</span><i><b style="width:${pct}%"></b></i><em>${pct}%</em></div>`;
  }

  function renderInspector() {
    const panel = uiState.panel;
    if (!panel?.isConnected) return;
    const target = panel.querySelector('[data-inner-view]');
    if (!target) return;
    const agent = getSelectedAgent();
    const h = hybrid();
    const e = engine();
    if (!agent) {
      target.innerHTML = '<p>Aucune entité active.</p>';
      return;
    }
    const g = agent.genes || {};
    const parents = Array.isArray(agent.parentIds) && agent.parentIds.length ? agent.parentIds.map(x => String(x).slice(0, 8)).join(' · ') : 'origine';
    const queue = h?.queue?.heap?.size ?? 0;
    const running = h?.queue?.running ?? 0;
    target.innerHTML = `
      <div class="nyx-iv-grid">
        <div><span>Nom</span><strong>${escapeHTML(agent.nom || 'NYX')}</strong></div>
        <div><span>Génération</span><strong>G${Number(agent.generation || 1).toLocaleString('fr-CA')}</strong></div>
        <div><span>Énergie</span><strong>${Math.round(agent.energy || 0)}</strong></div>
        <div><span>Âge simulé</span><strong>${Number(agent.age || 0).toFixed(1)}</strong></div>
        <div><span>Action actuelle</span><strong>${escapeHTML(String(agent.intent || 'wander'))}</strong></div>
        <div><span>Cerveau</span><strong>${escapeHTML(agent.lastDialogueProvider || uiState.lastProvider || '—')}</strong></div>
        <div><span>Parents</span><strong>${escapeHTML(parents)}</strong></div>
        <div><span>Queue IA</span><strong>${queue} · actif ${running}</strong></div>
      </div>
      <div class="nyx-iv-memory"><span>Mémoire visible</span><p>${escapeHTML(cleanText(agent.memory || agent.memoire || 'Aucune mémoire narrative.', 300))}</p></div>
      <div class="nyx-iv-genes">
        ${geneRow('Curiosité', g.curiosity)}
        ${geneRow('Sociabilité', g.sociability)}
        ${geneRow('Fertilité', g.fertility)}
        ${geneRow('Métabolisme', g.metabolism)}
        ${geneRow('Affinité IA', g.brainAffinity)}
        ${geneRow('Mutation', Math.min(1, (Number(g.mutationRate) || 0) / 0.25))}
      </div>
      <small class="nyx-iv-note">État interne de la simulation: variables, mémoire et action courante. La chaîne de raisonnement privée du modèle n’est pas affichée.</small>
    `;
    const stats = panel.querySelector('[data-voice-world]');
    if (stats) stats.textContent = `ACTIVES ${e?.populationActive?.() ?? livingAgents().length} · CLOUD ${h?.state?.cloudOnline ? '✅' : '—'} · SYNC ${h?.state?.syncOnline ? '✅' : '—'}`;
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function refreshAgentOptions() {
    const select = uiState.panel?.querySelector('[data-voice-agent]');
    if (!select) return;
    const current = uiState.selectedAgentId;
    const agents = [...livingAgents()].sort((a, b) => (b.generation || 1) - (a.generation || 1) || (b.energy || 0) - (a.energy || 0)).slice(0, 80);
    const signature = agents.map(a => `${a.id}:${a.generation}:${a.nom || ''}`).join('|');
    if (select.dataset.signature === signature) return;
    select.dataset.signature = signature;
    select.innerHTML = agents.map(a => `<option value="${escapeHTML(a.id)}">${escapeHTML(a.nom || a.id.slice(0, 8))} · G${a.generation || 1} · E${Math.round(a.energy || 0)}</option>`).join('');
    if (agents.some(a => a.id === current)) select.value = current;
    else if (agents[0]) {
      uiState.selectedAgentId = agents[0].id;
      select.value = agents[0].id;
      localStorage.setItem('nyxcore:voiceAgent', agents[0].id);
    }
  }

  function renderConversation() {
    const panel = uiState.panel;
    if (!panel?.isConnected) return;
    const mic = panel.querySelector('[data-voice-mic]');
    const status = panel.querySelector('[data-voice-status]');
    const transcript = panel.querySelector('[data-voice-transcript]');
    const reply = panel.querySelector('[data-voice-reply]');
    const speaker = panel.querySelector('[data-voice-speaker]');
    if (mic) {
      mic.textContent = uiState.listening ? '⏹ ÉCOUTE…' : '🎙 PARLER';
      mic.classList.toggle('is-listening', uiState.listening);
      mic.disabled = uiState.busy;
    }
    if (speaker) speaker.textContent = uiState.speaking ? '🔊 VOIX ON' : '🔇 VOIX OFF';
    if (status) status.textContent = uiState.busy ? 'NYXCORE réfléchit…' : (uiState.listening ? 'Je t’écoute…' : (uiState.lastError || `Prêt · ${uiState.lastProvider}`));
    if (transcript) transcript.textContent = uiState.transcript ? `TOI · ${uiState.transcript}` : 'TOI · —';
    if (reply) reply.textContent = uiState.reply ? `NYX · ${uiState.reply}` : 'NYX · —';
  }

  function installStyles() {
    if (document.getElementById('nyxVoiceStyles')) return;
    const style = document.createElement('style');
    style.id = 'nyxVoiceStyles';
    style.textContent = `
      .nyx-voice-panel{border:1px solid #3a2930;background:linear-gradient(180deg,#111116,#09090d);border-radius:14px;padding:12px;margin-bottom:10px;color:#eee;box-shadow:0 12px 35px #0006}
      .nyx-voice-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.nyx-voice-head strong{font-size:13px;letter-spacing:.08em}.nyx-voice-head small{font-size:9px;color:#999}
      .nyx-voice-agent,.nyx-voice-input{width:100%;box-sizing:border-box;background:#08080b;color:#eee;border:1px solid #34343c;border-radius:10px;padding:10px;font-size:13px;margin:5px 0}
      .nyx-voice-actions{display:grid;grid-template-columns:1.35fr 1fr 1fr;gap:6px;margin:6px 0}.nyx-voice-actions button{border:1px solid #3b3b45;border-radius:10px;background:#1a1a20;color:#fff;padding:10px 7px;font-weight:800;font-size:11px}.nyx-voice-actions button.is-listening{border-color:#ff315b;box-shadow:0 0 0 2px #ff315b33;background:#2a0c14}.nyx-voice-actions button:disabled{opacity:.55}
      .nyx-voice-status{font-size:11px;color:#b9b9c3;margin:5px 0}.nyx-voice-chat{display:grid;gap:5px;margin:7px 0}.nyx-voice-chat p{margin:0;padding:8px;border-radius:9px;background:#0e0e13;border:1px solid #26262e;font-size:11px;line-height:1.35;white-space:pre-wrap}
      .nyx-inner details{border-top:1px solid #292931;margin-top:9px;padding-top:8px}.nyx-inner summary{cursor:pointer;font-size:11px;font-weight:900;letter-spacing:.08em;color:#ff5a76}.nyx-iv-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:8px}.nyx-iv-grid div{background:#0b0b0f;border:1px solid #22222a;border-radius:8px;padding:7px;min-width:0}.nyx-iv-grid span,.nyx-iv-memory span{display:block;font-size:8px;color:#8f8f9a;text-transform:uppercase;letter-spacing:.08em}.nyx-iv-grid strong{display:block;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nyx-iv-memory{margin-top:6px;background:#0b0b0f;border:1px solid #22222a;border-radius:8px;padding:7px}.nyx-iv-memory p{font-size:10px;line-height:1.35;margin:4px 0 0}.nyx-iv-genes{margin-top:7px}.nyx-iv-gene{display:grid;grid-template-columns:74px 1fr 34px;gap:5px;align-items:center;font-size:9px;margin:4px 0}.nyx-iv-gene i{height:5px;background:#24242b;border-radius:99px;overflow:hidden}.nyx-iv-gene b{display:block;height:100%;background:linear-gradient(90deg,#55101e,#ff315b);border-radius:99px}.nyx-iv-gene em{font-style:normal;color:#aaa;text-align:right}.nyx-iv-note{display:block;color:#777;font-size:8px;line-height:1.3;margin-top:7px}
      @media(max-width:700px){.nyx-voice-actions{grid-template-columns:1fr 1fr}.nyx-voice-actions [data-voice-speaker]{grid-column:1/-1}.nyx-iv-grid{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function installPanel() {
    const side = document.querySelector('.nyx-side');
    if (!side) return false;
    if (side.querySelector('[data-nyx-voice]')) {
      uiState.panel = side.querySelector('[data-nyx-voice]');
      return true;
    }
    installStyles();
    const panel = document.createElement('section');
    panel.className = 'nyx-voice-panel';
    panel.dataset.nyxVoice = '1';
    panel.innerHTML = `
      <div class="nyx-voice-head"><div><strong>🎙 NYX VOICE</strong><small> · conversation vivante</small></div><small data-voice-world>—</small></div>
      <select class="nyx-voice-agent" data-voice-agent aria-label="Entité à qui parler"></select>
      <input class="nyx-voice-input" data-voice-input type="text" maxlength="900" placeholder="Parle ou écris à l’entité…" autocomplete="off" />
      <div class="nyx-voice-actions">
        <button type="button" data-voice-mic>🎙 PARLER</button>
        <button type="button" data-voice-send>ENVOYER</button>
        <button type="button" data-voice-speaker>🔊 VOIX ON</button>
      </div>
      <div class="nyx-voice-status" data-voice-status>Prêt</div>
      <div class="nyx-voice-chat"><p data-voice-transcript>TOI · —</p><p data-voice-reply>NYX · —</p></div>
      <div class="nyx-inner"><details open><summary>🔬 VOIR À L’INTÉRIEUR · ÉTAT SIMULÉ</summary><div data-inner-view></div></details></div>
    `;
    side.prepend(panel);
    uiState.panel = panel;

    const select = panel.querySelector('[data-voice-agent]');
    select.onchange = () => {
      uiState.selectedAgentId = select.value;
      localStorage.setItem('nyxcore:voiceAgent', select.value);
      renderInspector();
    };
    panel.querySelector('[data-voice-mic]').onclick = startRecognition;
    panel.querySelector('[data-voice-send]').onclick = () => {
      const input = panel.querySelector('[data-voice-input]');
      const text = cleanText(input.value, 900);
      if (text) { input.value = ''; talk(text); }
    };
    panel.querySelector('[data-voice-input]').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); panel.querySelector('[data-voice-send]').click(); }
    });
    panel.querySelector('[data-voice-speaker]').onclick = () => {
      uiState.speaking = !uiState.speaking;
      localStorage.setItem('nyxcore:voiceSpeak', uiState.speaking ? 'on' : 'off');
      if (!uiState.speaking) try { speechSynthesis.cancel(); } catch {}
      renderConversation();
    };

    refreshAgentOptions();
    renderConversation();
    renderInspector();
    return true;
  }

  async function boot() {
    if (!await waitForCore()) return;
    installStyles();
    const observer = new MutationObserver(() => installPanel());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    installPanel();
    uiState.refreshTimer = setInterval(() => {
      if (!uiState.panel?.isConnected) installPanel();
      refreshAgentOptions();
      renderInspector();
    }, 900);
    log('Micro et vue intérieure NYXCORE prêts.');
  }

  window.__NYXCORE_VOICE__ = { state: uiState, talk, getSelectedAgent };
  boot();
})();
