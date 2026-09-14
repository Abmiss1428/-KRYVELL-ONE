(function(){
  function plan(){
    try{return JSON.parse(localStorage.getItem('kryvell:creation-plan')||'[]')||[];}catch{return [];}
  }
  function save(value){localStorage.setItem('kryvell:creation-plan',JSON.stringify(value));}
  function render(){
    const current=plan();
    const items=current.length?current.map((x,i)=>`<div class="plan-row"><span>${i+1}</span><strong>${escapeHtml(x.title||'Fonction NEXCREATE')}</strong><button class="ghost nx-remove" data-id="${escapeHtml(x.id)}">Retirer</button></div>`).join(''):'<p class="output">Ton plan est vide. Ajoute des fonctions NEXCREATE avant de le lancer.</p>';
    showModalBlock(`<span class="tag">NEXCREATE</span><h4>Plan de création</h4><p class="output"><strong>${current.length} fonction${current.length!==1?'s':''} sélectionnée${current.length!==1?'s':''}</strong></p>${items}<button class="primary" id="launchNexcreatePlan" ${current.length?'':'disabled'}>LANCER LE PLAN DANS NEXCREATE</button><button class="ghost" id="copyNexcreatePlan" ${current.length?'':'disabled'}>COPIER LE PLAN</button><p class="output">Le lancement ouvre le vrai canvas NEXCREATE Beta. Les modules déjà codés deviennent utilisables; les fonctions encore en développement restent indiquées comme telles.</p>`);
    document.querySelectorAll('.nx-remove').forEach(b=>b.onclick=()=>{save(plan().filter(x=>x.id!==b.dataset.id));render();});
    const launch=document.getElementById('launchNexcreatePlan');
    if(launch)launch.onclick=()=>{localStorage.setItem('kryvell:nexcreate-launch',JSON.stringify({launchedAt:new Date().toISOString(),count:plan().length}));location.href='/nexcreate.html';};
    const copy=document.getElementById('copyNexcreatePlan');
    if(copy)copy.onclick=async()=>{const txt=plan().map((x,i)=>`${i+1}. ${x.title}`).join('\n');try{await navigator.clipboard.writeText(txt);copy.textContent='PLAN COPIÉ ✅';}catch{showModalBlock(`<pre>${escapeHtml(txt)}</pre>`);}};
  }
  window.openNexcreatePlan=render;
  window.openCreationPlan=render;
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('[data-quick="creation"],#openPlanNow');
    if(!target)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    render();
  },true);
})();
