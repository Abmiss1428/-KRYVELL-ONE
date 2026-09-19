/* RNX CANON LOCK v1.0.0
 * REDLINE NEXUS / KRYVELL ONE
 * Read-only canon guard: reads Airtable canon through the existing server route,
 * never writes, deletes or changes Airtable LOCK records.
 */
(() => {
  'use strict';
  if (window.RNXCanonLock) return;

  const VERSION = '1.0.0';
  const STORAGE_KEY = 'kryvell:rnx-canon-lock:v1';
  const DEFAULT_PROTECTED = ['face', 'body-proportions', 'species', 'hair-identity'];
  const DEFAULT_EDITABLE = ['pose', 'expression', 'clothing', 'environment', 'lighting'];

  let canonData = null;
  let lastSnapshot = null;

  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        enabled: saved.enabled !== false,
        protectedRegions: Array.isArray(saved.protectedRegions) && saved.protectedRegions.length
          ? saved.protectedRegions : DEFAULT_PROTECTED,
        editableRegions: Array.isArray(saved.editableRegions) && saved.editableRegions.length
          ? saved.editableRegions : DEFAULT_EDITABLE,
        castMap: Array.isArray(saved.castMap) ? saved.castMap : []
      };
    } catch {
      return { enabled: true, protectedRegions: DEFAULT_PROTECTED, editableRegions: DEFAULT_EDITABLE, castMap: [] };
    }
  }

  function writeState(next) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
    return next;
  }

  function allRecords(data) {
    return (data?.sections || []).flatMap(section =>
      (section.records || []).map(record => ({ ...record, sectionName: section.name }))
    );
  }

  function asText(value) {
    if (Array.isArray(value)) return value.join(' · ');
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value);
  }

  function recordName(fields = {}) {
    for (const key of ['Nom', 'Nom officiel', 'Character Name', 'Character ID', 'Canon ID', 'Module']) {
      if (fields[key]) return asText(fields[key]);
    }
    return 'Entrée canon';
  }

  function isLocked(record) {
    const f = record?.fields || {};
    if (f.LOCK === true || f.Lock === true || f.lock === true) return true;
    const status = [f['Statut canon'], f.Statut, f.Status, f['Statut réel']]
      .filter(Boolean).map(v => asText(v).toLowerCase()).join(' ');
    return /lock|verrou|canonique|canonical/.test(status);
  }

  function compactFields(fields = {}) {
    const out = {};
    const ignored = /^(created|updated|attachment|image|photo|url)$/i;
    for (const [key, value] of Object.entries(fields)) {
      if (ignored.test(key)) continue;
      const txt = asText(value).trim();
      if (!txt) continue;
      out[key] = txt.length > 500 ? txt.slice(0, 500) + '…' : txt;
    }
    return out;
  }

  function buildSnapshot(data = canonData) {
    const state = readState();
    const records = allRecords(data || {});
    const locked = records.filter(isLocked);
    const sourceRecords = locked.length ? locked : records;

    const snapshot = {
      engine: 'RNX CANON LOCK',
      version: VERSION,
      enabled: state.enabled,
      source: data?.ok ? 'Airtable /api/module-data?module=redline' : 'local/no-live-canon',
      loadedAt: new Date().toISOString(),
      protectedRegions: state.protectedRegions,
      editableRegions: state.editableRegions,
      castMap: state.castMap,
      canonCount: sourceRecords.length,
      lockedCount: locked.length,
      canon: sourceRecords.map(record => ({
        id: record.id,
        section: record.sectionName || '',
        name: recordName(record.fields),
        locked: isLocked(record),
        fields: compactFields(record.fields)
      }))
    };
    lastSnapshot = snapshot;
    return snapshot;
  }

  async function loadCanon(force = false) {
    if (canonData && !force) return buildSnapshot(canonData);
    const response = await fetch('/api/module-data?module=redline', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data?.ok) throw new Error(data?.error || `canon_${response.status}`);
    canonData = data;
    return buildSnapshot(data);
  }

  function setEnabled(enabled) {
    const state = readState();
    state.enabled = Boolean(enabled);
    writeState(state);
    return state.enabled;
  }

  function setCastMap(castMap) {
    const state = readState();
    state.castMap = Array.isArray(castMap) ? castMap : [];
    writeState(state);
    return state.castMap;
  }

  function compileMission(mission, options = {}) {
    const state = readState();
    const snapshot = lastSnapshot || buildSnapshot(canonData || {});
    const text = String(mission || '').trim();
    if (!text) return '';
    if (!state.enabled) return text;

    const cast = Array.isArray(options.castMap) ? options.castMap : state.castMap;
    const castBlock = cast.length
      ? cast.map((x, i) => `${i + 1}. ${x.id || x.name || 'CHARACTER'} -> ${x.position || 'position libre'} · identity=${x.identity || x.id || 'canon'} · FACE=LOCK`).join('\n')
      : 'Utiliser les identités canoniques disponibles; ne jamais fusionner deux identités.';

    const canonBlock = snapshot.canon.slice(0, 20).map(item => {
      const essentials = Object.entries(item.fields || {}).slice(0, 12)
        .map(([k, v]) => `${k}: ${v}`).join(' | ');
      return `- ${item.name}${item.locked ? ' [LOCK]' : ''}${essentials ? ` :: ${essentials}` : ''}`;
    }).join('\n') || '- Aucun enregistrement canon live chargé: ne rien inventer; demander/charger la source canon avant rendu final.';

    return [
      'RNX-CANON-LOCK',
      'IDENTITY=ABSOLUTE',
      'FACE=LOCK',
      'BODY=LOCK',
      'HAIR=LOCK',
      'SPECIES=LOCK',
      'POSITION=BOUND',
      'EDIT-ONLY=REQUESTED',
      'DRIFT=AUTO-REPAIR',
      'VALIDATE=BEFORE-CANON',
      '',
      `PROTECTED=${state.protectedRegions.join(',')}`,
      `EDITABLE=${state.editableRegions.join(',')}`,
      '',
      'CAST MAP:',
      castBlock,
      '',
      'CANON SOURCE (READ ONLY):',
      canonBlock,
      '',
      'USER CHANGE REQUEST:',
      text,
      '',
      'RULE: modify only what the USER CHANGE REQUEST explicitly asks to change. Preserve every protected identity/canon attribute otherwise.'
    ].join('\n');
  }

  function validateStructuredCandidate(candidate = {}) {
    const state = readState();
    const issues = [];
    const changed = new Set((candidate.changedRegions || []).map(v => String(v).toLowerCase()));
    for (const region of state.protectedRegions) {
      if (changed.has(String(region).toLowerCase())) issues.push(`Protected region changed: ${region}`);
    }

    const expectedCast = state.castMap || [];
    const receivedCast = Array.isArray(candidate.castMap) ? candidate.castMap : [];
    for (const expected of expectedCast) {
      const found = receivedCast.find(x => (x.id || x.name) === (expected.id || expected.name));
      if (!found) {
        issues.push(`Missing identity: ${expected.id || expected.name || 'unknown'}`);
        continue;
      }
      if (expected.position && found.position && expected.position !== found.position) {
        issues.push(`Position drift: ${expected.id || expected.name} (${expected.position} -> ${found.position})`);
      }
    }

    return {
      passed: issues.length === 0,
      action: issues.length ? 'REPAIR' : 'ACCEPT',
      issues,
      checkedAt: new Date().toISOString()
    };
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea');
    area.value = text; document.body.appendChild(area); area.select();
    try { document.execCommand('copy'); } finally { area.remove(); }
    return Promise.resolve();
  }

  function injectStyles() {
    if (document.getElementById('rnxCanonLockStyle')) return;
    const style = document.createElement('style');
    style.id = 'rnxCanonLockStyle';
    style.textContent = `
      .rnx-lock-shell{margin:14px 0;padding:16px;border:1px solid rgba(255,70,95,.42);border-radius:18px;background:linear-gradient(180deg,rgba(70,5,18,.42),rgba(15,15,19,.78));box-shadow:0 0 28px rgba(255,25,65,.08)}
      .rnx-lock-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.rnx-lock-head h4{margin:0;font-size:1.05rem}.rnx-lock-badge{display:inline-flex;gap:7px;align-items:center;padding:7px 10px;border-radius:999px;background:rgba(255,35,70,.13);border:1px solid rgba(255,70,95,.35);font-size:.78rem;font-weight:800}
      .rnx-lock-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px;margin:12px 0}.rnx-lock-stat{padding:10px;border-radius:12px;background:rgba(255,255,255,.045)}.rnx-lock-stat span{display:block;opacity:.65;font-size:.72rem}.rnx-lock-stat strong{display:block;margin-top:3px}
      .rnx-lock-shell textarea{width:100%;box-sizing:border-box;min-height:92px;margin:8px 0;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:#0c0c10;color:#fff;resize:vertical}.rnx-lock-actions{display:flex;gap:8px;flex-wrap:wrap}.rnx-lock-actions button{cursor:pointer;border-radius:12px;padding:10px 12px;border:1px solid rgba(255,255,255,.15);background:#17171d;color:#fff;font-weight:800}.rnx-lock-actions button.primary-lock{background:#a80f2b;border-color:#d43b55}.rnx-lock-output{margin-top:10px;padding:10px;border-radius:12px;background:#0b0b0e;white-space:pre-wrap;overflow:auto;max-height:260px;font-size:.78rem;line-height:1.45}.rnx-lock-mini{opacity:.68;font-size:.78rem;margin:7px 0 0}
    `;
    document.head.appendChild(style);
  }

  function renderPanel() {
    const host = document.getElementById('moduleActions');
    const title = document.getElementById('moduleTitle');
    if (!host || !title || !/REDLINE NEXUS/i.test(title.textContent || '')) return;
    if (host.querySelector('#rnxCanonLockPanel')) return;

    injectStyles();
    const state = readState();
    const panel = document.createElement('section');
    panel.id = 'rnxCanonLockPanel';
    panel.className = 'rnx-lock-shell';
    panel.innerHTML = `
      <div class="rnx-lock-head">
        <div><span class="rnx-lock-badge">🔒 RNX CANON LOCK v${VERSION}</span><h4>Identité canonique séparée du prompt</h4></div>
        <label><input id="rnxLockEnabled" type="checkbox" ${state.enabled ? 'checked' : ''}> actif</label>
      </div>
      <div class="rnx-lock-grid">
        <div class="rnx-lock-stat"><span>CANON</span><strong id="rnxCanonCount">—</strong></div>
        <div class="rnx-lock-stat"><span>LOCK</span><strong id="rnxLockedCount">—</strong></div>
        <div class="rnx-lock-stat"><span>SOURCE</span><strong id="rnxCanonSource">Chargement…</strong></div>
      </div>
      <p class="rnx-lock-mini"><strong>Protégé :</strong> ${esc(state.protectedRegions.join(' · '))}<br><strong>Éditable :</strong> ${esc(state.editableRegions.join(' · '))}</p>
      <textarea id="rnxMission" placeholder="Décris seulement ce que tu veux changer dans la scène…"></textarea>
      <div class="rnx-lock-actions">
        <button class="primary-lock" id="rnxCompile">RNX 🔒 COMPILER</button>
        <button id="rnxCopy" disabled>COPIER</button>
        <button id="rnxRefresh">ACTUALISER CANON</button>
      </div>
      <div class="rnx-lock-output" id="rnxLockOutput">Le moteur lit le canon Airtable en lecture seule. Aucun LOCK Airtable ne sera modifié.</div>`;
    host.prepend(panel);

    const enabled = panel.querySelector('#rnxLockEnabled');
    const mission = panel.querySelector('#rnxMission');
    const output = panel.querySelector('#rnxLockOutput');
    const copy = panel.querySelector('#rnxCopy');
    let compiled = '';

    async function refresh(force = false) {
      panel.querySelector('#rnxCanonSource').textContent = 'Chargement…';
      try {
        const snap = await loadCanon(force);
        panel.querySelector('#rnxCanonCount').textContent = String(snap.canonCount);
        panel.querySelector('#rnxLockedCount').textContent = String(snap.lockedCount);
        panel.querySelector('#rnxCanonSource').textContent = 'AIRTABLE LIVE ✅';
        if (!compiled) output.textContent = `Canon chargé ✅ · ${snap.canonCount} entrées · ${snap.lockedCount} LOCK détectés.\nProtection active: ${readState().protectedRegions.join(', ')}.`;
      } catch (err) {
        panel.querySelector('#rnxCanonSource').textContent = 'LOCAL / À VÉRIFIER';
        output.textContent = `⚠️ Canon live indisponible: ${String(err?.message || err)}\nLe moteur n'invente pas les données manquantes.`;
      }
    }

    enabled.onchange = () => {
      setEnabled(enabled.checked);
      output.textContent = enabled.checked ? 'RNX CANON LOCK activé 🔒' : 'RNX CANON LOCK désactivé localement.';
    };

    panel.querySelector('#rnxCompile').onclick = async () => {
      if (!mission.value.trim()) { output.textContent = 'Écris d’abord ce que tu veux modifier.'; return; }
      try { await loadCanon(false); } catch (_) {}
      compiled = compileMission(mission.value);
      output.textContent = compiled;
      copy.disabled = !compiled;
    };

    copy.onclick = async () => {
      if (!compiled) return;
      await copyText(compiled);
      copy.textContent = 'COPIÉ ✅';
      setTimeout(() => { copy.textContent = 'COPIER'; }, 1200);
    };

    panel.querySelector('#rnxRefresh').onclick = () => refresh(true);
    refresh(false);
  }

  function watchRedlinePanel() {
    const target = document.getElementById('modulePanel') || document.body;
    const observer = new MutationObserver(() => queueMicrotask(renderPanel));
    observer.observe(target, { childList: true, subtree: true, characterData: true, attributes: true });
    document.querySelectorAll('[data-module="redline"]').forEach(btn =>
      btn.addEventListener('click', () => setTimeout(renderPanel, 50))
    );
    renderPanel();
  }

  window.RNXCanonLock = {
    version: VERSION,
    loadCanon,
    snapshot: () => lastSnapshot || buildSnapshot(canonData || {}),
    compileMission,
    validateStructuredCandidate,
    setEnabled,
    isEnabled: () => readState().enabled,
    setCastMap,
    getState: readState
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchRedlinePanel, { once: true });
  } else {
    watchRedlinePanel();
  }
})();