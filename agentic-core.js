/* KRYVELL AGENTIC CORE v1.0.0
 * Personal two-agent chain for Olivia / ACStudio.
 * Agent 1: Complexity Breaker -> Agent 2: Logic Forge.
 * Passive Guard never blocks, pauses, deletes, publishes or executes actions.
 */
(() => {
  'use strict';
  if(window.KryvellAgentic) return;
  const VERSION='1.0.0';
  const GUARD_KEY='kryvell:agentic:passiveGuard';
  const HISTORY_KEY='kryvell:agentic:history:v1';
  const TOKEN='[SAFE_PASSIVE_REQUEST]';

  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const guardEnabled=()=>localStorage.getItem(GUARD_KEY)!=='off';
  const setGuard=v=>localStorage.setItem(GUARD_KEY,v?'on':'off');
  const riskSignals=text=>{
    const t=String(text||'').toLowerCase();
    const tests=[
      ['suppression',/\b(supprimer|effacer|delete|erase)\b/],
      ['reset',/\b(reset|réinitialiser|reinitialiser)\b/],
      ['écrasement',/\b(écraser|ecraser|overwrite|remplacer définitivement)\b/],
      ['publication',/\b(publier|publish|production)\b/],
      ['canon/lock',/\b(lock|canon|verrou)\b/],
      ['secrets',/\b(secret|token|api key|clé api|pat)\b/]
    ];
    return tests.filter(([,rx])=>rx.test(t)).map(([name])=>name);
  };
  const readHistory=()=>{
    try{const x=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(x)?x.slice(0,8):[];}catch{return[];}
  };
  const writeHistory=items=>{try{localStorage.setItem(HISTORY_KEY,JSON.stringify(items.slice(0,8)));}catch{}};

  async function brain(systemPrompt,prompt){
    const r=await fetch('/api/nyx-brain',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({
      systemPrompt,prompt,temperature:0.4,maxOutputTokens:256
    })});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d?.text) throw new Error(d?.error||('agent_'+r.status));
    return d.text;
  }

  function analystSystem(mode){
    return `Tu es NYX PERSONAL — COMPLEXITY BREAKER, premier agent personnel d’Olivia pour ACStudio/REDLINE NEXUS/KRYVELL. Tu analyses avant toute construction. Mode: ${mode}. Traverse la complexité sans inventer. Distingue faits, hypothèses et données manquantes. Pour toute demande canon-sensitive, exige la lecture des enregistrements Airtable les plus récents avant conclusion ou exécution. Ne supprime rien, ne publie rien et ne modifie aucun LOCK. Réponds en français, compact mais structuré: OBJECTIF, COMPLEXITÉ, DÉPENDANCES, INCONNUES, RISQUES, SOURCES AIRTABLE À LIRE, PREMIÈRE ACTION RÉVERSIBLE. Si la demande implique suppression, reset, écrasement, publication, secret, changement LOCK ou autre action irréversible, ajoute exactement ${TOKEN} à la fin. La garde est seulement une recommandation passive.`;
  }
  function architectSystem(mode){
    return `Tu es BRICKCORE PERSONAL — LOGIC FORGE, second agent personnel d’Olivia. Tu reçois la demande originale et le rapport du premier agent, puis tu crées une structure logique robuste, modulaire, versionnée, testable et réversible. Mode: ${mode}. Préserve intention originale, canon LOCK, historique, données et identités. Airtable reste la source de vérité pour le canon et l’état du projet. Ne prétends jamais qu’une action a été exécutée. Réponds en français: STRUCTURE, INVARIANTS, MODULES, ORDRE D’EXÉCUTION, CHECKPOINTS, ROLLBACK, TESTS, PROCHAINE ACTION. Si une étape sensible mérite une confirmation, ajoute exactement ${TOKEN} à la fin. La garde passive ne bloque rien et ne peut jamais s’activer seule.`;
  }

  function cleanOutput(text){return String(text||'').replaceAll(TOKEN,'').trim();}

  function render(mount){
    if(!mount) return;
    const history=readHistory();
    mount.innerHTML=`
      <section class="agentic-shell">
        <div class="agentic-head">
          <div><h2>🧠 KRYVELL AGENTIC · OLIVIA</h2><p>Deux agents en chaîne : le premier traverse la complexité, le second forge une structure logique durable.</p></div>
          <label class="agentic-guard"><input id="agenticGuard" type="checkbox" ${guardEnabled()?'checked':''}><span>🛡 SAFE PASSIF<br><small>optionnel · ne bloque rien</small></span></label>
        </div>
        <div class="agentic-grid">
          <div class="agentic-card agentic-input">
            <h3>Mission</h3>
            <textarea id="agenticPrompt" placeholder="Écris ce que tu veux analyser, construire ou améliorer pour ta série…"></textarea>
            <div class="agentic-row">
              <select id="agenticMode"><option value="ACStudio / REDLINE NEXUS">🎬 Série / Canon</option><option value="Technique / KRYVELL">🧩 Technique / KRYVELL</option><option value="Personnel">👤 Personnel</option></select>
              <button class="agentic-run" id="agenticRun">LANCER L’ÉQUIPE</button>
              <span class="agentic-status" id="agenticStatus">Prêt.</span>
            </div>
          </div>
          <div class="agentic-card">
            <div class="agentic-agent"><span class="agentic-badge">A1</span><div><h3>NYX PERSONAL</h3><p>COMPLEXITY BREAKER</p></div></div>
            <div class="agentic-output" id="agenticAnalysis">En attente d’une mission.</div>
          </div>
          <div class="agentic-card">
            <div class="agentic-agent"><span class="agentic-badge">A2</span><div><h3>BRICKCORE PERSONAL</h3><p>LOGIC FORGE</p></div></div>
            <div class="agentic-output" id="agenticArchitecture">En attente du rapport A1.</div>
          </div>
          <div class="agentic-guard-state" id="agenticGuardState">🛡 Garde passive activée. Elle observe seulement; Olivia garde le contrôle.</div>
          <div class="agentic-card agentic-history">
            <div class="agentic-row" style="justify-content:space-between;margin-top:0"><h3>Historique local</h3><button id="agenticClear">EFFACER L’HISTORIQUE LOCAL</button></div>
            <div class="agentic-history-list" id="agenticHistory"></div>
          </div>
        </div>
      </section>`;

    const q=s=>mount.querySelector(s);
    const prompt=q('#agenticPrompt'),mode=q('#agenticMode'),run=q('#agenticRun'),status=q('#agenticStatus');
    const analysis=q('#agenticAnalysis'),architecture=q('#agenticArchitecture'),guard=q('#agenticGuard'),guardState=q('#agenticGuardState'),historyBox=q('#agenticHistory');

    function refreshGuard(requested=false,signals=[]){
      const on=guard.checked;setGuard(on);
      guardState.className='agentic-guard-state'+(on&&requested?' warn':!on?' off':'');
      if(!on){guardState.textContent=requested?'🛡 SAFE PASSIF désactivé par Olivia · un agent l’a demandé, mais rien n’est bloqué.':'🛡 SAFE PASSIF désactivé par Olivia.';return;}
      if(requested){guardState.textContent='⚠️ SAFE PASSIF demandé par un agent'+(signals.length?' · signaux: '+signals.join(', '):'')+'. Protection informative seulement; aucune action n’est stoppée automatiquement.';return;}
      guardState.textContent='🛡 Garde passive activée. Elle observe seulement; Olivia garde le contrôle.';
    }
    function refreshHistory(){
      const items=readHistory();
      historyBox.innerHTML=items.length?items.map((h,i)=>`<div class="agentic-history-item"><span>${esc(new Date(h.at).toLocaleString('fr-CA'))} · ${esc(h.prompt.slice(0,90))}</span><button data-history="${i}">OUVRIR</button></div>`).join(''):'<p>Aucune mission locale pour le moment.</p>';
    }
    guard.onchange=()=>refreshGuard(false,[]);
    q('#agenticClear').onclick=()=>{writeHistory([]);refreshHistory();};
    historyBox.onclick=e=>{
      const b=e.target.closest?.('[data-history]');if(!b)return;
      const h=readHistory()[Number(b.dataset.history)];if(!h)return;
      prompt.value=h.prompt||'';mode.value=h.mode||mode.value;analysis.textContent=h.analysis||'';architecture.textContent=h.architecture||'';refreshGuard(Boolean(h.guardRequested),h.signals||[]);
    };

    run.onclick=async()=>{
      const userPrompt=prompt.value.trim();if(!userPrompt){status.textContent='Écris une mission d’abord.';return;}
      run.disabled=true;status.textContent='A1 analyse la complexité…';analysis.textContent='Analyse en cours…';architecture.textContent='En attente de A1…';
      const signals=riskSignals(userPrompt);
      try{
        const rawA=await brain(analystSystem(mode.value),userPrompt);
        const aRequested=rawA.includes(TOKEN);analysis.textContent=cleanOutput(rawA);
        status.textContent='A2 construit la structure…';
        const rawB=await brain(architectSystem(mode.value),`DEMANDE ORIGINALE:\n${userPrompt}\n\nRAPPORT AGENT 1:\n${cleanOutput(rawA)}`);
        const bRequested=rawB.includes(TOKEN);architecture.textContent=cleanOutput(rawB);
        const requested=aRequested||bRequested||signals.length>0;
        refreshGuard(requested,signals);
        const entry={at:Date.now(),prompt:userPrompt,mode:mode.value,analysis:cleanOutput(rawA),architecture:cleanOutput(rawB),guardRequested:requested,signals};
        writeHistory([entry,...readHistory()]);
        refreshHistory();status.textContent='✅ Équipe terminée · résultat sauvegardé localement.';
      }catch(err){
        status.textContent='⚠️ Agentic indisponible: '+String(err?.message||err);
        architecture.textContent='Aucune action n’a été exécutée. Tes données locales ne sont pas modifiées.';
      }finally{run.disabled=false;}
    };

    refreshGuard(false,[]);refreshHistory();
  }

  window.KryvellAgentic={version:VERSION,render,guardEnabled,setGuard};
})();