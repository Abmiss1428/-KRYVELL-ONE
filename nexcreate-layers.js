(function(){
  if(typeof layers==='undefined'||typeof activeLayer!=='function'||typeof renderLayers!=='function')return;

  const groupState=[];
  const blendModes=[
    ['normal','Normal'],['multiply','Produit'],['screen','Écran'],['overlay','Incrustation'],
    ['darken','Assombrir'],['lighten','Éclaircir'],['color-dodge','Densité couleur -'],['color-burn','Densité couleur +']
  ];
  let metaSaveTimer=null;

  function gid(){return `group-${Date.now()}-${Math.random().toString(36).slice(2,7)}`}
  function groupById(id){return groupState.find(g=>g.id===id)}
  function ensureProps(l){
    if(!l)return l;
    if(typeof l.locked!=='boolean')l.locked=false;
    if(typeof l.alphaLock!=='boolean')l.alphaLock=false;
    if(typeof l.clipping!=='boolean')l.clipping=false;
    if(typeof l.reference!=='boolean')l.reference=false;
    if(!l.blendMode)l.blendMode='normal';
    if(!('groupId' in l))l.groupId=null;
    return l;
  }
  function escapeAttr(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function effectiveVisible(l){const g=l.groupId?groupById(l.groupId):null;return l.visible&&(g?g.visible!==false:true)}
  function mapComposite(mode){
    return ({normal:'source-over',multiply:'multiply',screen:'screen',overlay:'overlay',darken:'darken',lighten:'lighten','color-dodge':'color-dodge','color-burn':'color-burn'})[mode]||'source-over';
  }
  function alphaMaskFrom(canvas){
    const c=document.createElement('canvas');c.width=docW;c.height=docH;const x=c.getContext('2d');x.drawImage(canvas,0,0);x.globalCompositeOperation='source-in';x.fillStyle='#fff';x.fillRect(0,0,docW,docH);return c;
  }
  function combinedMaskFor(l,index){
    let mask=null;
    if(l.mask){mask=document.createElement('canvas');mask.width=docW;mask.height=docH;mask.getContext('2d').drawImage(l.mask,0,0);}
    if(l.clipping){
      let base=null;
      for(let i=index-1;i>=0;i--){if(effectiveVisible(layers[i])){base=layers[i];break;}}
      if(base){
        const a=alphaMaskFrom(base.canvas);
        if(mask){const mctx=mask.getContext('2d');mctx.globalCompositeOperation='destination-in';mctx.drawImage(a,0,0);}
        else mask=a;
      }
    }
    return mask;
  }
  function renderLayerCanvas(l,index){
    const c=document.createElement('canvas');c.width=docW;c.height=docH;const ctx=c.getContext('2d');ctx.drawImage(l.canvas,0,0);
    const m=combinedMaskFor(l,index);
    if(m){ctx.globalCompositeOperation='destination-in';ctx.drawImage(m,0,0);ctx.globalCompositeOperation='source-over';}
    return c;
  }
  function applyVisual(l,index){
    ensureProps(l);
    l.canvas.style.display=effectiveVisible(l)?'block':'none';
    l.canvas.style.opacity=l.opacity;
    l.canvas.style.mixBlendMode=l.blendMode==='normal'?'normal':l.blendMode;
    l.canvas.style.zIndex=String(index+1);
    const mask=combinedMaskFor(l,index);
    if(mask){
      try{const url=mask.toDataURL('image/png');l.canvas.style.webkitMaskImage=`url(${url})`;l.canvas.style.maskImage=`url(${url})`;l.canvas.style.webkitMaskSize='100% 100%';l.canvas.style.maskSize='100% 100%';l.canvas.style.webkitMaskRepeat='no-repeat';l.canvas.style.maskRepeat='no-repeat';}catch{}
    }else{
      l.canvas.style.webkitMaskImage='';l.canvas.style.maskImage='';
    }
  }
  function layerBadges(l){
    const b=[];if(l.locked)b.push('🔒');if(l.alphaLock)b.push('α');if(l.clipping)b.push('CLIP');if(l.reference)b.push('REF');if(l.mask)b.push('MASK');return b.length?`<span class="nx-layer-badges">${b.join(' ')}</span>`:'';
  }
  function layerRow(l){
    const opts=blendModes.map(([v,n])=>`<option value="${v}" ${l.blendMode===v?'selected':''}>${n}</option>`).join('');
    const groupOpts=['<option value="">Sans groupe</option>',...groupState.map(g=>`<option value="${g.id}" ${l.groupId===g.id?'selected':''}>${escapeAttr(g.name)}</option>`)].join('');
    return `<div class="nx-layer-pro ${l.id===activeId?'active':''}" data-layer-id="${l.id}">
      <div class="nx-layer-main"><input class="layer-visible" type="checkbox" ${l.visible?'checked':''}><button class="layer-select">${escapeAttr(l.name)}</button>${layerBadges(l)}<button class="layer-delete" title="Supprimer">×</button></div>
      <div class="nx-layer-mini">
        <button data-act="rename">Renommer</button><button data-act="up">↑</button><button data-act="down">↓</button><button data-act="duplicate">Dupliquer</button>
        <button data-act="lock">${l.locked?'Déverrouiller':'Verrouiller'}</button><button data-act="alpha">Alpha</button><button data-act="clip">Clipping</button><button data-act="reference">Référence</button>
      </div>
      <div class="nx-layer-fields"><label>Opacité <input class="layer-opacity" type="range" min="0" max="100" value="${Math.round(l.opacity*100)}"><output>${Math.round(l.opacity*100)}%</output></label><label>Fusion <select class="layer-blend">${opts}</select></label><label>Groupe <select class="layer-group">${groupOpts}</select></label></div>
    </div>`;
  }
  function groupRows(){
    if(!groupState.length)return '';
    return `<div class="nx-groups"><div class="nx-subtitle">Groupes</div>${groupState.map(g=>`<div class="nx-group-row" data-group-id="${g.id}"><input class="group-visible" type="checkbox" ${g.visible!==false?'checked':''}><button class="group-name">${escapeAttr(g.name)}</button><button class="group-delete">×</button></div>`).join('')}</div>`;
  }
  function bindUi(){
    layersList.querySelectorAll('.nx-layer-pro').forEach(row=>{
      const id=row.dataset.layerId,l=layers.find(x=>x.id===id);if(!l)return;
      row.querySelector('.layer-select').onclick=()=>{activeId=id;renderLayers()};
      row.querySelector('.layer-visible').onchange=e=>{l.visible=e.target.checked;renderLayers();scheduleSave()};
      row.querySelector('.layer-delete').onclick=()=>{if(layers.length<=1)return;if(!confirm(`Supprimer « ${l.name} » ?`))return;pushHistory();const i=layers.indexOf(l);l.canvas.remove();layers.splice(i,1);if(activeId===id)activeId=layers[Math.max(0,i-1)]?.id||layers[layers.length-1]?.id;renderLayers();scheduleSave()};
      row.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>layerAction(l,b.dataset.act));
      row.querySelector('.layer-opacity').oninput=e=>{l.opacity=+e.target.value/100;row.querySelector('.layer-opacity+output').textContent=`${e.target.value}%`;applyVisual(l,layers.indexOf(l));scheduleSave()};
      row.querySelector('.layer-blend').onchange=e=>{l.blendMode=e.target.value;renderLayers();scheduleSave()};
      row.querySelector('.layer-group').onchange=e=>{l.groupId=e.target.value||null;renderLayers();scheduleSave()};
    });
    layersList.querySelectorAll('.nx-group-row').forEach(row=>{
      const g=groupById(row.dataset.groupId);if(!g)return;
      row.querySelector('.group-visible').onchange=e=>{g.visible=e.target.checked;renderLayers();scheduleSave()};
      row.querySelector('.group-name').onclick=()=>{const n=prompt('Nom du groupe',g.name);if(n?.trim()){g.name=n.trim();renderLayers();scheduleSave()}};
      row.querySelector('.group-delete').onclick=()=>{layers.forEach(l=>{if(l.groupId===g.id)l.groupId=null});groupState.splice(groupState.indexOf(g),1);renderLayers();scheduleSave()};
    });
  }
  function layerAction(l,act){
    const i=layers.indexOf(l);
    if(act==='rename'){const n=prompt('Nom du calque',l.name);if(n?.trim())l.name=n.trim();}
    if(act==='up'&&i<layers.length-1){pushHistory();layers.splice(i,1);layers.splice(i+1,0,l);}
    if(act==='down'&&i>0){pushHistory();layers.splice(i,1);layers.splice(i-1,0,l);}
    if(act==='duplicate')duplicateLayer(l);
    if(act==='lock')l.locked=!l.locked;
    if(act==='alpha')l.alphaLock=!l.alphaLock;
    if(act==='clip')l.clipping=!l.clipping;
    if(act==='reference')l.reference=!l.reference;
    renderLayers();scheduleSave();
  }
  function duplicateLayer(source){
    pushHistory();const n=makeLayer(`${source.name} copie`);n.ctx.drawImage(source.canvas,0,0);n.visible=source.visible;n.opacity=source.opacity;n.blendMode=source.blendMode;n.alphaLock=source.alphaLock;n.clipping=source.clipping;n.reference=source.reference;n.groupId=source.groupId;
    if(source.mask){n.mask=document.createElement('canvas');n.mask.width=docW;n.mask.height=docH;n.mask.getContext('2d').drawImage(source.mask,0,0);}
    const from=layers.indexOf(source),current=layers.indexOf(n);layers.splice(current,1);layers.splice(from+1,0,n);activeId=n.id;
  }
  function mergeDown(){
    const top=activeLayer(),i=layers.indexOf(top);if(!top||i<=0)return alert('Il faut un calque sous le calque actif.');
    const below=layers[i-1];
    if(!confirm(`Fusionner « ${top.name} » avec « ${below.name} » ? Cette action aplatit ces deux calques. L’historique permet d’annuler.`))return;
    pushHistory();const out=document.createElement('canvas');out.width=docW;out.height=docH;const ctx=out.getContext('2d');
    [[below,i-1],[top,i]].forEach(([l,idx])=>{if(!effectiveVisible(l))return;ctx.save();ctx.globalAlpha=l.opacity;ctx.globalCompositeOperation=mapComposite(l.blendMode);ctx.drawImage(renderLayerCanvas(l,idx),0,0);ctx.restore();});
    below.ctx.clearRect(0,0,docW,docH);below.ctx.drawImage(out,0,0);below.opacity=1;below.blendMode='normal';below.clipping=false;below.alphaLock=false;if(below.mask)delete below.mask;
    top.canvas.remove();layers.splice(i,1);activeId=below.id;renderLayers();scheduleSave();
  }
  function createGroup(){
    const l=activeLayer();const g={id:gid(),name:`Groupe ${groupState.length+1}`,visible:true};groupState.push(g);if(l)l.groupId=g.id;renderLayers();scheduleSave();
  }

  const coreRenderLayers=renderLayers;
  renderLayers=function(){
    layers.forEach(ensureProps);coreRenderLayers();
    layers.forEach((l,i)=>applyVisual(l,i));
    layersList.innerHTML=groupRows()+[...layers].reverse().map(layerRow).join('');bindUi();
  };

  const coreMakeLayer=makeLayer;
  makeLayer=function(name='Calque'){const l=coreMakeLayer(name);ensureProps(l);return l};

  const coreDrawSegment=drawSegment;
  drawSegment=function(a,b){
    const l=activeLayer();if(!l)return;
    ensureProps(l);
    if(l.locked){const s=document.getElementById('toolStatus');if(s)s.textContent='Calque verrouillé 🔒';return;}
    if(!l.alphaLock||tool==='eraser')return coreDrawSegment(a,b);
    const original=l.ctx,temp=document.createElement('canvas');temp.width=docW;temp.height=docH;const tctx=temp.getContext('2d');l.ctx=tctx;coreDrawSegment(a,b);l.ctx=original;
    tctx.globalCompositeOperation='destination-in';tctx.drawImage(l.canvas,0,0);tctx.globalCompositeOperation='source-over';original.drawImage(temp,0,0);
  };

  const coreSnapshot=snapshot;
  snapshot=function(){const s=coreSnapshot();s.layerGroups=groupState.map(g=>({...g}));s.layers.forEach((item,i)=>{const l=layers[i];if(l)Object.assign(item,{locked:!!l.locked,alphaLock:!!l.alphaLock,clipping:!!l.clipping,reference:!!l.reference,blendMode:l.blendMode||'normal',groupId:l.groupId||null})});return s};
  const coreRestoreSnapshot=restoreSnapshot;
  restoreSnapshot=async function(s){await coreRestoreSnapshot(s);groupState.splice(0,groupState.length,...(s.layerGroups||[]).map(g=>({...g})));(s.layers||[]).forEach((item,i)=>{if(layers[i])Object.assign(layers[i],{locked:!!item.locked,alphaLock:!!item.alphaLock,clipping:!!item.clipping,reference:!!item.reference,blendMode:item.blendMode||'normal',groupId:item.groupId||null})});renderLayers()};

  mergeCanvas=function(){
    const out=document.createElement('canvas');out.width=docW;out.height=docH;const ctx=out.getContext('2d');
    layers.forEach((l,i)=>{ensureProps(l);if(!effectiveVisible(l))return;ctx.save();ctx.globalAlpha=l.opacity;ctx.globalCompositeOperation=mapComposite(l.blendMode);ctx.drawImage(renderLayerCanvas(l,i),0,0);ctx.restore()});return out;
  };

  async function saveLayerMeta(){
    try{const db=await openDb(),tx=db.transaction('docs','readwrite');tx.objectStore('docs').put({groups:groupState.map(g=>({...g})),layers:layers.map(l=>({id:l.id,locked:!!l.locked,alphaLock:!!l.alphaLock,clipping:!!l.clipping,reference:!!l.reference,blendMode:l.blendMode||'normal',groupId:l.groupId||null}))},'layer-meta');await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close()}catch{}
  }
  async function loadLayerMeta(){
    try{const db=await openDb(),tx=db.transaction('docs','readonly'),req=tx.objectStore('docs').get('layer-meta');const d=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});db.close();if(!d)return;groupState.splice(0,groupState.length,...(d.groups||[]));for(const m of d.layers||[]){const l=layers.find(x=>x.id===m.id);if(l)Object.assign(l,m)}renderLayers()}catch{}
  }
  function scheduleMetaSave(){clearTimeout(metaSaveTimer);metaSaveTimer=setTimeout(saveLayerMeta,800)}
  const coreScheduleSave=scheduleSave;scheduleSave=function(){coreScheduleSave();scheduleMetaSave()};

  const saveButton=document.getElementById('saveNowBtn'),oldSaveClick=saveButton?.onclick;if(saveButton)saveButton.onclick=async e=>{if(oldSaveClick)await oldSaveClick.call(saveButton,e);await saveLayerMeta()};
  const restoreButton=document.getElementById('restoreBtn'),oldRestoreClick=restoreButton?.onclick;if(restoreButton)restoreButton.onclick=async e=>{if(oldRestoreClick)await oldRestoreClick.call(restoreButton,e);await loadLayerMeta()};

  function installPanelControls(){
    const title=layersList.closest('.panel-card')?.querySelector('.panel-title');if(!title||document.getElementById('layerProTools'))return;
    const tools=document.createElement('div');tools.id='layerProTools';tools.className='nx-layer-pro-tools';tools.innerHTML='<button id="createGroupBtn">+ Groupe</button><button id="mergeDownBtn">Fusionner ↓</button>';
    title.parentNode.insertBefore(tools,layersList);document.getElementById('createGroupBtn').onclick=createGroup;document.getElementById('mergeDownBtn').onclick=mergeDown;
  }

  installPanelControls();layers.forEach(ensureProps);renderLayers();loadLayerMeta();
  window.NEXCREATE_LAYERS={createGroup,mergeDown,duplicateLayer,version:'DRAW-LAYERS-001-beta'};
})();