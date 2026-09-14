(function(){
  if(typeof host==='undefined'||typeof layers==='undefined'||typeof activeLayer!=='function')return;

  let selectionMask=document.createElement('canvas');
  let selectionOverlay=document.createElement('canvas');
  let selCtx=selectionMask.getContext('2d',{alpha:true});
  let overlayCtx=selectionOverlay.getContext('2d',{alpha:true});
  let selectionActive=false;
  let selectionTool=false;
  let selectShape='rect';
  let combineMode='replace';
  let featherPx=0;
  let selecting=false;
  let startPoint=null;
  let livePoint=null;
  let lassoPoints=[];
  let maskSaveTimer=null;
  let strokeTemp=document.createElement('canvas');
  let strokeTempCtx=strokeTemp.getContext('2d',{alpha:true});

  function cloneCanvas(source){
    const c=document.createElement('canvas');c.width=source.width;c.height=source.height;c.getContext('2d').drawImage(source,0,0);return c;
  }
  function syncSelectionCanvasSize(clear=true){
    if(selectionMask.width===docW&&selectionMask.height===docH)return;
    selectionMask.width=docW;selectionMask.height=docH;selectionOverlay.width=docW;selectionOverlay.height=docH;strokeTemp.width=docW;strokeTemp.height=docH;
    selCtx=selectionMask.getContext('2d',{alpha:true});overlayCtx=selectionOverlay.getContext('2d',{alpha:true});strokeTempCtx=strokeTemp.getContext('2d',{alpha:true});
    if(clear){selectionActive=false;lassoPoints=[];renderSelection();}
  }
  function ensureOverlay(){
    syncSelectionCanvasSize(false);
    selectionOverlay.id='selectionOverlay';selectionOverlay.className='selection-overlay';
    selectionOverlay.style.pointerEvents=selectionTool?'auto':'none';
    if(selectionOverlay.parentNode!==host)host.appendChild(selectionOverlay);else host.appendChild(selectionOverlay);
  }
  function selectionHasPixels(){
    if(!selectionActive)return false;
    const data=selCtx.getImageData(0,0,selectionMask.width,selectionMask.height).data;
    for(let i=3;i<data.length;i+=256){if(data[i]>4)return true;}return selectionActive;
  }
  function renderSelection(preview){
    ensureOverlay();overlayCtx.clearRect(0,0,docW,docH);
    if(selectionActive){
      overlayCtx.save();overlayCtx.globalAlpha=.25;overlayCtx.drawImage(selectionMask,0,0);overlayCtx.globalCompositeOperation='source-in';overlayCtx.fillStyle='#e71d48';overlayCtx.fillRect(0,0,docW,docH);overlayCtx.restore();
    }
    if(preview){
      overlayCtx.save();overlayCtx.strokeStyle='#ffffff';overlayCtx.lineWidth=Math.max(2,docW/500);overlayCtx.setLineDash([18,12]);overlayCtx.fillStyle='rgba(231,29,72,.12)';
      if(preview.type==='rect'){
        const x=Math.min(preview.a.x,preview.b.x),y=Math.min(preview.a.y,preview.b.y),w=Math.abs(preview.b.x-preview.a.x),h=Math.abs(preview.b.y-preview.a.y);overlayCtx.fillRect(x,y,w,h);overlayCtx.strokeRect(x,y,w,h);
      }else if(preview.type==='ellipse'){
        const cx=(preview.a.x+preview.b.x)/2,cy=(preview.a.y+preview.b.y)/2,rx=Math.abs(preview.b.x-preview.a.x)/2,ry=Math.abs(preview.b.y-preview.a.y)/2;overlayCtx.beginPath();overlayCtx.ellipse(cx,cy,Math.max(1,rx),Math.max(1,ry),0,0,Math.PI*2);overlayCtx.fill();overlayCtx.stroke();
      }else if(preview.type==='lasso'&&preview.points.length>1){
        overlayCtx.beginPath();overlayCtx.moveTo(preview.points[0].x,preview.points[0].y);preview.points.slice(1).forEach(p=>overlayCtx.lineTo(p.x,p.y));overlayCtx.stroke();
      }
      overlayCtx.restore();
    }
    updateSelectionStatus();
  }
  function shapeMask(type,a,b,points){
    const c=document.createElement('canvas');c.width=docW;c.height=docH;const cctx=c.getContext('2d',{alpha:true});cctx.fillStyle='#fff';
    if(type==='rect'){
      cctx.fillRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));
    }else if(type==='ellipse'){
      const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,rx=Math.abs(b.x-a.x)/2,ry=Math.abs(b.y-a.y)/2;cctx.beginPath();cctx.ellipse(cx,cy,Math.max(1,rx),Math.max(1,ry),0,0,Math.PI*2);cctx.fill();
    }else if(type==='lasso'&&points.length>2){
      cctx.beginPath();cctx.moveTo(points[0].x,points[0].y);points.slice(1).forEach(p=>cctx.lineTo(p.x,p.y));cctx.closePath();cctx.fill();
    }
    if(featherPx>0){const softened=document.createElement('canvas');softened.width=docW;softened.height=docH;const s=softened.getContext('2d');s.filter=`blur(${featherPx}px)`;s.drawImage(c,0,0);return softened;}
    return c;
  }
  function combineSelection(mask,mode=combineMode){
    syncSelectionCanvasSize(false);
    if(mode==='replace'||!selectionActive){selCtx.clearRect(0,0,docW,docH);selCtx.globalCompositeOperation='source-over';selCtx.drawImage(mask,0,0);selectionActive=true;}
    else if(mode==='add'){selCtx.globalCompositeOperation='source-over';selCtx.drawImage(mask,0,0);}
    else if(mode==='subtract'){selCtx.globalCompositeOperation='destination-out';selCtx.drawImage(mask,0,0);}
    selCtx.globalCompositeOperation='source-over';renderSelection();scheduleMaskSave();
  }
  function autoSelect(){
    const l=activeLayer();if(!l)return;
    const c=document.createElement('canvas');c.width=docW;c.height=docH;const cctx=c.getContext('2d');cctx.drawImage(l.canvas,0,0);
    if(l.mask){cctx.globalCompositeOperation='destination-in';cctx.drawImage(l.mask,0,0);}
    cctx.globalCompositeOperation='source-in';cctx.fillStyle='#fff';cctx.fillRect(0,0,docW,docH);combineSelection(c);
  }
  function invertSelection(){
    const c=document.createElement('canvas');c.width=docW;c.height=docH;const cctx=c.getContext('2d');cctx.fillStyle='#fff';cctx.fillRect(0,0,docW,docH);if(selectionActive){cctx.globalCompositeOperation='destination-out';cctx.drawImage(selectionMask,0,0);}selCtx.clearRect(0,0,docW,docH);selCtx.globalCompositeOperation='source-over';selCtx.drawImage(c,0,0);selectionActive=true;renderSelection();scheduleMaskSave();
  }
  function clearSelection(){selCtx.clearRect(0,0,docW,docH);selectionActive=false;renderSelection();scheduleMaskSave();}
  function copySelectionToLayer(){
    if(!selectionActive)return;const source=activeLayer();if(!source)return;pushHistory();const l=makeLayer(`${source.name} — sélection`);l.ctx.drawImage(source.canvas,0,0);l.ctx.globalCompositeOperation='destination-in';l.ctx.drawImage(selectionMask,0,0);if(source.mask)l.ctx.drawImage(source.mask,0,0);l.ctx.globalCompositeOperation='source-over';scheduleSave();
  }
  function applyMaskToLayer(){
    if(!selectionActive)return;const l=activeLayer();if(!l)return;pushHistory();l.mask=cloneCanvas(selectionMask);applyLayerMaskVisual(l);renderLayers();scheduleSave();scheduleMaskSave();updateSelectionStatus('Masque non destructif appliqué ✅');
  }
  function removeLayerMask(){const l=activeLayer();if(!l||!l.mask)return;pushHistory();delete l.mask;applyLayerMaskVisual(l);renderLayers();scheduleSave();scheduleMaskSave();updateSelectionStatus('Masque retiré');}
  function applyLayerMaskVisual(l){
    if(!l?.canvas)return;
    if(!l.mask){l.canvas.style.webkitMaskImage='';l.canvas.style.maskImage='';return;}
    try{const url=l.mask.toDataURL('image/png');l.canvas.style.webkitMaskImage=`url(${url})`;l.canvas.style.maskImage=`url(${url})`;l.canvas.style.webkitMaskSize='100% 100%';l.canvas.style.maskSize='100% 100%';l.canvas.style.webkitMaskRepeat='no-repeat';l.canvas.style.maskRepeat='no-repeat';}catch{}
  }
  function applyAllMasks(){layers.forEach(applyLayerMaskVisual);}
  function updateSelectionStatus(message){const el=document.getElementById('selectionStatus');if(!el)return;const l=activeLayer();el.textContent=message||`${selectionActive?'Sélection active':'Aucune sélection'}${l?.mask?' · masque actif sur le calque':''}`;}
  function setSelectionTool(on){
    selectionTool=on;ensureOverlay();selectionOverlay.style.pointerEvents=on?'auto':'none';document.getElementById('selectBtn')?.classList.toggle('active',on);if(on){document.getElementById('brushBtn')?.classList.remove('active');document.getElementById('eraserBtn')?.classList.remove('active');document.getElementById('toolStatus').textContent='Sélection · dessine la zone sur le canvas';}else if(typeof tool!=='undefined'){document.getElementById('toolStatus').textContent=tool==='eraser'?'Gomme active':'Pinceau · pression Apple Pencil active';}
  }

  function pointerPreview(){if(!startPoint||!livePoint)return null;if(selectShape==='lasso')return{type:'lasso',points:lassoPoints};return{type:selectShape,a:startPoint,b:livePoint};}
  selectionOverlay.addEventListener('pointerdown',e=>{if(!selectionTool)return;e.preventDefault();e.stopPropagation();selectionOverlay.setPointerCapture?.(e.pointerId);selecting=true;startPoint=canvasPoint(e);livePoint=startPoint;lassoPoints=selectShape==='lasso'?[startPoint]:[];renderSelection(pointerPreview());});
  selectionOverlay.addEventListener('pointermove',e=>{if(!selecting)return;e.preventDefault();e.stopPropagation();livePoint=canvasPoint(e);if(selectShape==='lasso')lassoPoints.push(livePoint);renderSelection(pointerPreview());});
  function finishSelection(e){
    if(!selecting)return;e.preventDefault();e.stopPropagation();selecting=false;livePoint=canvasPoint(e);if(selectShape==='lasso')lassoPoints.push(livePoint);const mask=shapeMask(selectShape,startPoint,livePoint,lassoPoints);combineSelection(mask);startPoint=null;livePoint=null;lassoPoints=[];try{selectionOverlay.releasePointerCapture?.(e.pointerId)}catch{}
  }
  selectionOverlay.addEventListener('pointerup',finishSelection);selectionOverlay.addEventListener('pointercancel',e=>{selecting=false;startPoint=null;livePoint=null;lassoPoints=[];renderSelection();e.stopPropagation();});

  const coreDrawSegment=drawSegment;
  drawSegment=function(a,b){
    if(!selectionActive)return coreDrawSegment(a,b);
    const l=activeLayer();if(!l||!l.visible)return;syncSelectionCanvasSize(false);
    const pad=Math.max(32,settings.size*2.6),x=Math.max(0,Math.floor(Math.min(a.x,b.x)-pad)),y=Math.max(0,Math.floor(Math.min(a.y,b.y)-pad)),r=Math.min(docW,Math.ceil(Math.max(a.x,b.x)+pad)),btm=Math.min(docH,Math.ceil(Math.max(a.y,b.y)+pad)),w=Math.max(1,r-x),h=Math.max(1,btm-y);
    strokeTempCtx.clearRect(x,y,w,h);const originalCtx=l.ctx,originalTool=tool;l.ctx=strokeTempCtx;tool='brush';coreDrawSegment(a,b);l.ctx=originalCtx;tool=originalTool;
    strokeTempCtx.save();strokeTempCtx.beginPath();strokeTempCtx.rect(x,y,w,h);strokeTempCtx.clip();strokeTempCtx.globalCompositeOperation='destination-in';strokeTempCtx.drawImage(selectionMask,0,0);strokeTempCtx.restore();
    originalCtx.save();originalCtx.globalAlpha=1;originalCtx.globalCompositeOperation=originalTool==='eraser'?'destination-out':'source-over';originalCtx.drawImage(strokeTemp,x,y,w,h,x,y,w,h);originalCtx.restore();
  };

  const coreRenderLayers=renderLayers;
  renderLayers=function(){coreRenderLayers();ensureOverlay();applyAllMasks();updateSelectionStatus();};
  const coreUpdateStageRatio=updateStageRatio;
  updateStageRatio=function(){coreUpdateStageRatio();syncSelectionCanvasSize(true);ensureOverlay();};
  const coreResetDocument=resetDocument;
  resetDocument=function(w,h){coreResetDocument(w,h);syncSelectionCanvasSize(true);clearSelection();};

  const coreSnapshot=snapshot;
  snapshot=function(){const s=coreSnapshot();s.layers.forEach((item,i)=>{if(layers[i]?.mask)item.mask=layers[i].mask.toDataURL('image/png');});return s;};
  const coreRestoreSnapshot=restoreSnapshot;
  restoreSnapshot=async function(s){await coreRestoreSnapshot(s);for(let i=0;i<s.layers.length;i++){if(s.layers[i].mask&&layers[i]){const m=document.createElement('canvas');m.width=docW;m.height=docH;await drawDataURL(m.getContext('2d'),s.layers[i].mask);layers[i].mask=m;}}applyAllMasks();renderLayers();};

  mergeCanvas=function(){
    const out=document.createElement('canvas');out.width=docW;out.height=docH;const ctx=out.getContext('2d');
    layers.forEach(l=>{if(!l.visible)return;let source=l.canvas;if(l.mask){const c=document.createElement('canvas');c.width=docW;c.height=docH;const cctx=c.getContext('2d');cctx.drawImage(l.canvas,0,0);cctx.globalCompositeOperation='destination-in';cctx.drawImage(l.mask,0,0);source=c;}ctx.save();ctx.globalAlpha=l.opacity;ctx.drawImage(source,0,0);ctx.restore();});return out;
  };

  async function saveMaskState(){
    try{const db=await openDb(),items=[];for(const l of layers){if(l.mask)items.push({id:l.id,blob:await toBlob(l.mask)});}const selectionBlob=selectionActive?await toBlob(selectionMask):null;const tx=db.transaction('docs','readwrite');tx.objectStore('docs').put({items,selectionBlob,selectionActive},'masks');await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close();}catch{}
  }
  async function loadMaskState(){
    try{const db=await openDb();const tx=db.transaction('docs','readonly');const req=tx.objectStore('docs').get('masks');const d=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});db.close();if(!d)return;syncSelectionCanvasSize(false);for(const item of d.items||[]){const l=layers.find(x=>x.id===item.id);if(!l)continue;const m=document.createElement('canvas');m.width=docW;m.height=docH;const u=URL.createObjectURL(item.blob);await drawDataURL(m.getContext('2d'),u);URL.revokeObjectURL(u);l.mask=m;}if(d.selectionActive&&d.selectionBlob){const u=URL.createObjectURL(d.selectionBlob);selCtx.clearRect(0,0,docW,docH);await drawDataURL(selCtx,u);URL.revokeObjectURL(u);selectionActive=true;}applyAllMasks();renderSelection();}catch{}
  }
  function scheduleMaskSave(){clearTimeout(maskSaveTimer);maskSaveTimer=setTimeout(saveMaskState,900);}
  const coreScheduleSave=scheduleSave;
  scheduleSave=function(){coreScheduleSave();scheduleMaskSave();};
  const coreSaveDocument=saveDocument;
  document.getElementById('saveNowBtn').onclick=async()=>{await coreSaveDocument();await saveMaskState();};
  const coreRestoreAutosave=restoreAutosave;
  document.getElementById('restoreBtn').onclick=async()=>{await coreRestoreAutosave();await loadMaskState();};

  function installUi(){
    const brush=document.getElementById('brushBtn');
    if(brush&&!document.getElementById('selectBtn')){const b=document.createElement('button');b.className='tool';b.id='selectBtn';b.textContent='Sélection';brush.parentNode.insertBefore(b,document.getElementById('undoBtn'));b.onclick=()=>setSelectionTool(!selectionTool);}
    document.getElementById('brushBtn')?.addEventListener('click',()=>setSelectionTool(false));document.getElementById('eraserBtn')?.addEventListener('click',()=>setSelectionTool(false));
    const side=document.querySelector('.nx-side');if(!side||document.getElementById('selectionPanel'))return;
    const panel=document.createElement('section');panel.className='panel-card selection-panel';panel.id='selectionPanel';panel.innerHTML=`<div class="panel-title"><h2>Sélections & masques</h2><span class="beta-chip">BETA</span></div><label>Forme<select id="selectionShape"><option value="rect">Rectangle</option><option value="ellipse">Ellipse</option><option value="lasso">Libre / lasso</option></select></label><label>Combiner<select id="selectionCombine"><option value="replace">Remplacer</option><option value="add">Ajouter</option><option value="subtract">Retirer</option></select></label><label>Contour doux <output id="featherOut">0 px</output><input id="featherInput" type="range" min="0" max="60" value="0"></label><div class="button-grid selection-actions"><button id="autoSelectBtn">Auto contenu</button><button id="invertSelectionBtn">Inverser</button><button id="copySelectionBtn">Copier → calque</button><button id="applyMaskBtn" class="accent">Créer masque</button><button id="removeMaskBtn">Retirer masque</button><button id="clearSelectionBtn">Désélectionner</button></div><p id="selectionStatus" class="muted">Aucune sélection</p><p class="muted">Le dessin et la gomme sont limités à la sélection active. Le masque de calque est non destructif : les pixels originaux restent conservés.</p>`;
    side.insertBefore(panel,side.children[1]||null);
    document.getElementById('selectionShape').onchange=e=>selectShape=e.target.value;document.getElementById('selectionCombine').onchange=e=>combineMode=e.target.value;document.getElementById('featherInput').oninput=e=>{featherPx=+e.target.value;document.getElementById('featherOut').textContent=`${featherPx} px`;};document.getElementById('autoSelectBtn').onclick=autoSelect;document.getElementById('invertSelectionBtn').onclick=invertSelection;document.getElementById('copySelectionBtn').onclick=copySelectionToLayer;document.getElementById('applyMaskBtn').onclick=applyMaskToLayer;document.getElementById('removeMaskBtn').onclick=removeLayerMask;document.getElementById('clearSelectionBtn').onclick=clearSelection;
  }

  if(typeof runtimeState==='function'){
    const coreRuntimeState=runtimeState;runtimeState=function(featureId){if(featureId==='DRAW-SELECT-001')return['ACTIF BETA · À TESTER','live'];return coreRuntimeState(featureId);};
  }
  installUi();ensureOverlay();renderSelection();setTimeout(()=>{loadMaskState();if(typeof loadPlanStatus==='function')loadPlanStatus();},250);
})();
