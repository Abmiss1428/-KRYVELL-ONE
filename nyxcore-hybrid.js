/* NYXCORE HYBRID GATEWAY v1.1.1
 * Cloud-first narrative brain + PocketPal fallback + multi-device relay + mutation guardrail.
 * Numeric genetics remain local/deterministic; cloud is used for narrative cognition only.
 */
(() => {
  'use strict';
  if (window.__NYXCORE_HYBRID__) return;
  const api = window.KryvellNyxcore;
  if (!api?.engine) return;
  const engine = api.engine;
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const uid = ()=>crypto.randomUUID?.()||`nyx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,11)}`;
  const sleep = ms=>new Promise(r=>setTimeout(r,ms));
  const DEVICE_KEY='nyxcore:deviceId';
  const ECO_KEY='nyxcore:ecosystemId';
  const MODE_KEY='nyxcore:brainMode';
  const deviceId=localStorage.getItem(DEVICE_KEY)||`dev-${uid().replace(/[^A-Za-z0-9]/g,'').slice(0,28)}`;
  localStorage.setItem(DEVICE_KEY,deviceId);
  const ecosystemId=localStorage.getItem(ECO_KEY)||'nyxcore-main';
  localStorage.setItem(ECO_KEY,ecosystemId);

  const state={
    version:'1.1.1',
    safePaused:false,
    mode:localStorage.getItem(MODE_KEY)||'auto',
    cloudConfigured:null,
    cloudOnline:null,
    syncConfigured:null,
    syncOnline:null,
    lastCloudError:'',
    lastSyncError:'',
    lastCursor:Number(localStorage.getItem('nyxcore:syncCursor')||0),
    deviceId,
    ecosystemId
  };

  function printWardenLog(msg){
    console.log(`[NEON WARDEN] > ${msg}`);
    const consoleUi=document.getElementById('runtimeLogs');
    if(consoleUi) consoleUi.textContent=`🛡️ ${msg}`;
  }

  function appliquerProtectionMutation(adnBrut={}){
    let temp=Number(adnBrut.temperature ?? adnBrut.genes?.temperature);
    if(!Number.isFinite(temp)) temp=1.2;
    temp=clamp(temp,0.4,1.9);
    let memoire=String(adnBrut.memoire ?? adnBrut.memory ?? '').trim();
    if(!memoire || memoire.length<5 || /undefined/i.test(memoire)) memoire="Une nouvelle conscience silencieuse s'éveille dans les couches de Nyxcore.";
    memoire=memoire.replace(/\s+/g,' ').slice(0,250);
    if(memoire.length===250) memoire=memoire.slice(0,247)+'...';
    const generation=Math.max(1,Math.min(Number.MAX_SAFE_INTEGER,Math.trunc(Number(adnBrut.generation)||1)));
    const id=String(adnBrut.id||uid()).replace(/[^A-Za-z0-9._:-]/g,'').slice(0,128)||uid();
    let nom=String(adnBrut.nom||`NYX-${id.slice(-4).toUpperCase()}`).replace(/[<>\n\r]/g,' ').trim().slice(0,64);
    if(!nom) nom=`NYX-${id.slice(-4).toUpperCase()}`;
    return {
      ...adnBrut,id,nom,generation,temperature:temp,memoire,
      memory:memoire,
      genes:{...(adnBrut.genes||{}),temperature:temp}
    };
  }

  class ConsciousnessVault{
    constructor(){this.db=null;}
    async open(){
      this.db=await new Promise(resolve=>{
        const req=indexedDB.open('nyxcore-consciousness-vault',1);
        req.onupgradeneeded=()=>{
          const db=req.result;
          if(!db.objectStoreNames.contains('agents')) db.createObjectStore('agents',{keyPath:'id'});
          if(!db.objectStoreNames.contains('events')) db.createObjectStore('events',{keyPath:'key'});
          if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>resolve(null);
      });
    }
    tx(store,mode,fn){
      if(!this.db) return Promise.resolve(false);
      return new Promise(resolve=>{
        try{
          const tx=this.db.transaction(store,mode); fn(tx.objectStore(store));
          tx.oncomplete=()=>resolve(true); tx.onerror=()=>resolve(false); tx.onabort=()=>resolve(false);
        }catch{resolve(false);}
      });
    }
    agentProfile(a,reason='update'){
      return appliquerProtectionMutation({
        id:a.id,nom:a.nom,generation:a.generation,temperature:a.genes?.temperature,
        memoire:a.memory||a.memoire||'',genes:a.genes,lineageKey:a.lineageKey,lineageHue:a.lineageHue,
        parentIds:a.parentIds||[],x:a.x,y:a.y,energy:a.energy,age:a.age,reason,updatedAt:Date.now()
      });
    }
    async saveAgent(a,reason='update'){
      const p=this.agentProfile(a,reason);
      await this.tx('agents','readwrite',s=>s.put(p));
      const key=`${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      await this.tx('events','readwrite',s=>s.put({key,agentId:p.id,reason,at:Date.now(),generation:p.generation,temperature:p.temperature}));
      return p;
    }
  }

  const vault=new ConsciousnessVault();
  vault.open();

  class MiniHeap{
    constructor(){this.items=[];}
    get size(){return this.items.length;}
    push(x){this.items.push(x);this.items.sort((a,b)=>b.priority-a.priority);}
    pop(){return this.items.shift()||null;}
  }

  class HybridBrainQueue{
    constructor(){this.heap=new MiniHeap();this.queued=new Set();this.running=0;this.online=null;this.lastError='';this.paused=false;this.controllers=new Set();}
    enqueue(agent,priority=0){
      if(this.paused||state.safePaused) return;
      if(!agent||agent.dead||this.queued.has(agent.id)||this.heap.size>=28) return;
      if(Date.now()<(agent.nextBrainAt||0)) return;
      this.queued.add(agent.id);this.heap.push({agentId:agent.id,priority});this.pump();
    }
    async pump(){
      if(this.paused||state.safePaused) return;
      while(!this.paused&&!state.safePaused&&this.running<2&&this.heap.size){
        const task=this.heap.pop();this.queued.delete(task.agentId);
        const agent=engine.byId.get(task.agentId);if(!agent||agent.dead) continue;
        this.running++;this.run(agent).finally(()=>{this.running--;this.pump();});
      }
    }
    pause(){this.paused=true;this.heap.items.length=0;this.queued.clear();for(const ctrl of this.controllers){try{ctrl.abort();}catch{}}this.controllers.clear();}
    resume(){this.paused=false;this.pump();}
    parse(text){
      try{const m=String(text||'').match(/\{[\s\S]*\}/);return m?JSON.parse(m[0]):null;}catch{return null;}
    }
    async cloud(agent){
      if(this.paused||state.safePaused) return null;
      const ctrl=new AbortController();this.controllers.add(ctrl);
      try{
        const prompt=engine.brainPrompt(agent)+" Return compact JSON only: {\"action\":\"seek_food|wander|mate|rest|explore\",\"dx\":number,\"dy\":number,\"memory\":\"short text\"}.";
        const r=await fetch('/api/nyx-brain',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,cache:'no-store',body:JSON.stringify({
          systemPrompt:`You are the narrative cognition layer of NYXCORE. Agent generation ${agent.generation}. Keep output compact and stable.`,
          prompt,temperature:0.4,maxOutputTokens:120
        })});
        const data=await r.json().catch(()=>null);if(!r.ok||!data?.text) throw new Error(data?.error||`cloud_${r.status}`);
        if(this.paused||state.safePaused) return null;
        state.cloudOnline=true;state.lastCloudError='';return this.parse(data.text);
      }finally{this.controllers.delete(ctrl);}
    }
    async local(agent){
      if(this.paused||state.safePaused) return null;
      const ctrl=new AbortController();this.controllers.add(ctrl);const timer=setTimeout(()=>ctrl.abort(),18000);
      try{
        const r=await fetch(api.config.pocketPalUrl,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,cache:'no-store',body:JSON.stringify({
          model:api.config.pocketPalModel,temperature:agent.genes.temperature,max_tokens:100,stream:false,
          messages:[{role:'system',content:'NYXCORE local fallback. Return compact JSON only with action, dx, dy, memory.'},{role:'user',content:engine.brainPrompt(agent)}]
        })});
        if(!r.ok) throw new Error(`local_${r.status}`);const d=await r.json();return this.parse(d?.choices?.[0]?.message?.content||'');
      }finally{clearTimeout(timer);this.controllers.delete(ctrl);}
    }
    async run(agent){
      if(this.paused||state.safePaused) return;
      agent.nextBrainAt=Date.now()+12000;
      let parsed=null,provider='math';
      try{
        if(state.mode!=='local'&&state.mode!=='math'&&navigator.onLine){parsed=await this.cloud(agent);provider='cloud';}
      }catch(err){state.cloudOnline=false;state.lastCloudError=String(err?.message||err);}
      if(!parsed&&state.mode!=='cloud'&&state.mode!=='math'){
        try{parsed=await this.local(agent);provider='local';}catch(err){this.lastError=String(err?.message||err);}
      }
      if(this.paused||state.safePaused) return;
      if(parsed){
        agent.intent=parsed.action||agent.intent;
        if(Number.isFinite(Number(parsed.dx))&&Number.isFinite(Number(parsed.dy))){const dx=Number(parsed.dx),dy=Number(parsed.dy),m=Math.hypot(dx,dy)||1;agent.aiDx=clamp(dx/m,-1,1);agent.aiDy=clamp(dy/m,-1,1);}
        const mem=String(parsed.memory||'').trim();if(mem) agent.memory=mem.slice(0,250);
        agent.lastBrainAt=Date.now();await vault.saveAgent(agent,`brain:${provider}`);
        this.online=true;this.lastError='';
      }else{this.online=false;}
      engine.notifyStats?.();
    }
  }

  class DeviceBridge{
    constructor(){
      this.channel='BroadcastChannel'in window?new BroadcastChannel('nyxcore-life-sync'):null;
      if(this.channel) this.channel.onmessage=e=>this.applyEvent(e.data,true);
      this.polling=false;this.timer=null;
    }
    profile(agent){return vault.agentProfile(agent,'sync');}
    async health(){
      try{const r=await fetch('/api/nyx-sync',{cache:'no-store'});const d=await r.json();state.syncConfigured=!!d.configured;state.syncOnline=r.ok;return state.syncConfigured;}catch(err){state.syncOnline=false;state.lastSyncError=String(err);return false;}
    }
    async send(eventType,agent){
      if(state.safePaused||!agent?.id) return;
      const payload={agent:this.profile(agent)};
      const evt={ecosystemId,eventType,agentId:agent.id,deviceId,payload};
      try{this.channel?.postMessage({...evt,local:true});}catch{}
      if(!navigator.onLine) return;
      try{
        const r=await fetch('/api/nyx-sync',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({action:'push',...evt})});
        const d=await r.json().catch(()=>null);state.syncOnline=r.ok;state.syncConfigured=r.status!==503;state.lastSyncError=r.ok?'':String(d?.error||r.status);
      }catch(err){state.syncOnline=false;state.lastSyncError=String(err?.message||err);}
    }
    async pull(){
      if(state.safePaused||!navigator.onLine||document.hidden) return;
      try{
        const r=await fetch('/api/nyx-sync',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({action:'pull',ecosystemId,deviceId,afterSeq:state.lastCursor,limit:80})});
        const d=await r.json().catch(()=>null);if(!r.ok) throw new Error(d?.error||`sync_${r.status}`);
        state.syncOnline=true;state.syncConfigured=true;
        for(const evt of d.events||[]) await this.applyEvent(evt,false);
        if(Number(d.cursor)>state.lastCursor){state.lastCursor=Number(d.cursor);localStorage.setItem('nyxcore:syncCursor',String(state.lastCursor));}
      }catch(err){state.syncOnline=false;state.lastSyncError=String(err?.message||err);}
    }
    start(){if(state.safePaused||this.polling)return;this.polling=true;this.health();const tick=async()=>{if(!this.polling||state.safePaused)return;await this.pull();if(this.polling&&!state.safePaused)this.timer=setTimeout(tick,1100);};tick();}
    stop(){this.polling=false;if(this.timer){clearTimeout(this.timer);this.timer=null;}}
    async applyEvent(evt,local){
      if(!evt||evt.deviceId===deviceId||evt.source_device_id===deviceId) return;
      const p=appliquerProtectionMutation(evt.payload?.agent||evt.payload||{});if(!p.id) return;
      let agent=engine.byId.get(p.id);
      if(!agent){
        const data={...p,genes:p.genes||api.createDNA({temperature:p.temperature}),parentIds:p.parentIds||[],x:18,y:clamp(Number(p.y)||engine.focusY,0,api.config.worldHeight),energy:Number(p.energy)||95};
        agent=engine.makeAgent(data);agent.nom=p.nom;agent.memory=p.memoire;agent.networkTargetX=clamp(Number(p.x)||engine.focusX,0,api.config.worldWidth);agent.networkTargetY=clamp(Number(p.y)||engine.focusY,0,api.config.worldHeight);agent.remoteSource=true;
        if(engine.populationActive()<api.config.maxActiveAgents) engine.addAgent(agent);else engine.cohorts.addVirtual(agent,1n);
      }else{
        agent.nom=p.nom||agent.nom;agent.memory=p.memoire||agent.memory;agent.genes={...agent.genes,...p.genes,temperature:p.temperature};
      }
      await vault.saveAgent(agent,local?'broadcast-receive':'network-receive');engine.dirty=true;engine.notifyStats?.();
    }
  }

  const bridge=new DeviceBridge();
  const hybridQueue=new HybridBrainQueue();
  engine.llm=hybridQueue;

  const originalCheap=engine.cheapBrain.bind(engine);
  engine.cheapBrain=function(agent,now){
    if(agent.networkTargetX!=null){
      const dx=agent.networkTargetX-agent.x,dy=agent.networkTargetY-agent.y,d=Math.hypot(dx,dy);
      if(d<18){agent.networkTargetX=null;agent.networkTargetY=null;agent.intent='arrived';}
      else{agent.aiDx=dx/(d||1);agent.aiDy=dy/(d||1);agent.intent='network-transit';return;}
    }
    if(agent.mateTargetId){
      const mate=this.byId.get(agent.mateTargetId);const expired=Date.now()>(agent.matingUntil||0);
      if(!mate||mate.dead||expired){agent.mateTargetId=null;agent.matingUntil=0;}
      else{const dx=mate.x-agent.x,dy=mate.y-agent.y,d=Math.hypot(dx,dy)||1;agent.aiDx=dx/d;agent.aiDy=dy/d;agent.intent='mate-approach';return;}
    }
    return originalCheap(agent,now);
  };

  const originalReproduce=engine.reproduce.bind(engine);
  engine.reproduce=function(a,b){
    if(!a||!b||a.dead||b.dead) return;
    const d=Math.hypot(a.x-b.x,a.y-b.y);
    if(d>20){a.mateTargetId=b.id;b.mateTargetId=a.id;a.matingUntil=Date.now()+12000;b.matingUntil=Date.now()+12000;return;}
    a.mateTargetId=b.mateTargetId=null;a.matingUntil=b.matingUntil=0;
    const before=new Set(this.byId.keys());originalReproduce(a,b);
    for(const child of this.active){
      if(child.dead||before.has(child.id)||child.generation<=1) continue;
      child.nom=child.nom||`NYX-${child.id.slice(-4).toUpperCase()}`;
      const secured=appliquerProtectionMutation({...child,temperature:child.genes.temperature,memoire:child.memory||''});
      child.nom=secured.nom;child.memory=secured.memoire;child.genes.temperature=secured.temperature;
      vault.saveAgent(child,'birth');bridge.send('birth',child);scheduleBirthNarrative(child,a,b);
    }
  };

  let narrativeRunning=0;const narrativeQueue=[];
  function scheduleBirthNarrative(child,a,b){
    if(state.safePaused||state.mode==='local'||state.mode==='math') return;
    if(narrativeQueue.length>80) return;
    narrativeQueue.push({childId:child.id,parentA:a.id,parentB:b.id});pumpNarrative();
  }
  async function pumpNarrative(){
    if(state.safePaused) return;
    while(!state.safePaused&&narrativeRunning<2&&narrativeQueue.length){
      const job=narrativeQueue.shift();const child=engine.byId.get(job.childId);if(!child||child.dead) continue;
      narrativeRunning++;
      (async()=>{
        try{
          const r=await fetch('/api/nyx-brain',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({
            systemPrompt:'You name and narrate a newborn NYXCORE artificial-life entity. Return JSON only: {"nom":"NYX-...","memoire":"one short French sentence"}. Do not modify numeric genes.',
            prompt:`generation=${child.generation}; temperature=${child.genes.temperature.toFixed(2)}; lineage=${child.lineageKey}; parentA=${job.parentA.slice(0,8)}; parentB=${job.parentB.slice(0,8)}`,
            temperature:0.4,maxOutputTokens:90
          })});
          const d=await r.json();if(!r.ok) throw new Error(d?.error||r.status);const m=String(d.text||'').match(/\{[\s\S]*\}/);const j=m?JSON.parse(m[0]):{};
          const secured=appliquerProtectionMutation({id:child.id,nom:j.nom||child.nom,generation:child.generation,temperature:child.genes.temperature,memoire:j.memoire||child.memory,genes:child.genes});
          child.nom=secured.nom;child.memory=secured.memoire;child.genes.temperature=secured.temperature;await vault.saveAgent(child,'cloud-narrative');await bridge.send('memory',child);engine.dirty=true;
        }catch(err){state.lastCloudError=String(err?.message||err);}
      })().finally(()=>{narrativeRunning--;pumpNarrative();});
    }
  }

  async function cloudHealth(){
    try{const r=await fetch('/api/nyx-brain',{cache:'no-store'});const d=await r.json();state.cloudConfigured=!!d.configured;state.cloudOnline=r.ok;return d;}catch(err){state.cloudOnline=false;state.lastCloudError=String(err);return null;}
  }
  window.addEventListener('online',()=>{cloudHealth();bridge.health();});
  window.addEventListener('offline',()=>{state.cloudOnline=false;state.syncOnline=false;});

  const originalRender=api.render;
  api.render=(mount)=>{
    const root=originalRender(mount);
    setTimeout(()=>{
      const side=root?.querySelector('.nyx-side');if(!side||side.querySelector('[data-hybrid-panel]')) return;
      const box=document.createElement('div');box.dataset.hybridPanel='1';box.className='nyx-selected';box.innerHTML=`<span>NÉON WARDEN · HYBRID GATEWAY</span><p data-hybrid-status>Initialisation…</p><label class="nyx-field"><span>Mode cerveau</span><select data-hybrid-mode style="width:100%;background:#09090d;color:#eee;border:1px solid #303039;border-radius:10px;padding:9px"><option value="auto">AUTO · Cloud→Local→Math</option><option value="cloud">CLOUD uniquement</option><option value="local">LOCAL PocketPal</option><option value="math">MATH uniquement</option></select></label><button data-hybrid-test style="width:100%;border:1px solid #35353e;background:#19191f;color:#fff;border-radius:10px;padding:9px;font-weight:800">TESTER PASSERELLES</button>`;
      side.prepend(box);const select=box.querySelector('[data-hybrid-mode]');select.value=state.mode;select.onchange=()=>{state.mode=select.value;localStorage.setItem(MODE_KEY,state.mode);};
      box.querySelector('[data-hybrid-test]').onclick=async()=>{await cloudHealth();await bridge.health();refresh();};
      const refresh=()=>{const p=box.querySelector('[data-hybrid-status]');if(!p?.isConnected)return;p.textContent=`CLOUD ${state.cloudConfigured===false?'À CONFIGURER':state.cloudOnline?'✅':'AUTO'} · SYNC ${state.syncConfigured===false?'À CONFIGURER':state.syncOnline?'✅':'AUTO'} · DEVICE ${deviceId.slice(-8)} · mode ${state.mode.toUpperCase()}`;setTimeout(refresh,1400);};refresh();
    },0);return root;
  };

  function setSafePaused(on){
    state.safePaused=!!on;
    if(state.safePaused){
      hybridQueue.pause();
      bridge.stop();
      narrativeQueue.length=0;
      printWardenLog('SAFE MODE : cerveau, sync et narration suspendus.');
    }else{
      hybridQueue.resume();
      bridge.start();
      pumpNarrative();
      printWardenLog('SAFE MODE quitté : passerelles réactivées.');
    }
    engine.notifyStats?.();
    return state.safePaused;
  }

  api.applyMutationGuardrail=appliquerProtectionMutation;
  api.setBrainMode=mode=>{if(['auto','cloud','local','math'].includes(mode)){state.mode=mode;localStorage.setItem(MODE_KEY,mode);}};
  api.setSafePaused=setSafePaused;
  api.hybridState=()=>({...state});
  api.syncAgent=id=>{const a=engine.byId.get(id);if(a)return bridge.send('transfer',a);};
  api.version='1.1.1';
  window.NEON_WARDEN={statut:'INITIALISÉ',architecture:'NYXCORE HYBRID GATEWAY',get modeActuel(){return state.mode;},configurationStable:{temperatureEnLigne:0.4,temperatureHorsLigne:1.2},transfererPenseeAgent:(agent,prompt)=>fetch('/api/nyx-brain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemPrompt:`Entité ${agent?.nom||agent?.id||'NYX'} · mémoire ${agent?.memoire||agent?.memory||''}`,prompt,temperature:0.4})}).then(r=>r.json()).then(d=>d.text),stabiliserEtTransfererAgent:(id)=>api.syncAgent(id)};

  (async()=>{
    while(!engine.ready) await sleep(50);
    for(const a of engine.active.filter(x=>!x.dead)) await vault.saveAgent(a,'boot-index');
    await cloudHealth();bridge.start();printWardenLog('Passerelle hybride NYXCORE active : Cloud sécurisé, PocketPal fallback, convergence physique, IndexedDB Vault et synchronisation multi-appareils.');
  })();

  window.__NYXCORE_HYBRID__={state,vault,bridge,queue:hybridQueue,appliquerProtectionMutation,setSafePaused};
})();
