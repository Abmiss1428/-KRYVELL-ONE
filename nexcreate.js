const $=s=>document.querySelector(s);
const host=$('#layersHost'),stage=$('#stageShell'),layersList=$('#layersList');
let docW=1600,docH=1600,layers=[],activeId='',tool='brush',drawing=false,lastPoint=null,saveTimer=null;
let history=[],redoStack=[],strokeLog=[];
const settings={color:'#e71d48',size:18,opacity:1,stabilizer:.35,tip:'round',grain:'none'};

function uid(){return `layer-${Date.now()}-${Math.random().toString(36).slice(2,7)}`}
function activeLayer(){return layers.find(l=>l.id===activeId)||layers[layers.length-1]}
function updateStageRatio(){stage.style.aspectRatio=`${docW}/${docH}`;host.style.aspectRatio=`${docW}/${docH}`;$('#docStatus').textContent=`${docW} × ${docH}`}
function makeLayer(name='Calque'){
  const canvas=document.createElement('canvas');canvas.width=docW;canvas.height=docH;canvas.dataset.layer='1';
  const layer={id:uid(),name,canvas,ctx:canvas.getContext('2d',{alpha:true}),visible:true,opacity:1};
  layers.push(layer);host.appendChild(canvas);activeId=layer.id;renderLayers();return layer;
}
function renderLayers(){
  layers.forEach(l=>{l.canvas.style.display=l.visible?'block':'none';l.canvas.style.opacity=l.opacity});
  layersList.innerHTML=[...layers].reverse().map(l=>`<div class="layer-row ${l.id===activeId?'active':''}" data-layer-id="${l.id}"><input class="layer-visible" type="checkbox" ${l.visible?'checked':''}><button class="layer-select">${escapeHtml(l.name)}</button><button class="layer-delete">×</button></div>`).join('');
  layersList.querySelectorAll('.layer-row').forEach(row=>{
    const id=row.dataset.layerId;
    row.querySelector('.layer-select').onclick=()=>{activeId=id;renderLayers()};
    row.querySelector('.layer-visible').onchange=e=>{const l=layers.find(x=>x.id===id);if(l){l.visible=e.target.checked;renderLayers();scheduleSave()}};
    row.querySelector('.layer-delete').onclick=()=>{if(layers.length<=1)return;pushHistory();const i=layers.findIndex(x=>x.id===id);if(i<0)return;layers[i].canvas.remove();layers.splice(i,1);if(activeId===id)activeId=layers[layers.length-1].id;renderLayers();scheduleSave()};
  });
}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function canvasPoint(e){const r=host.getBoundingClientRect();return{x:(e.clientX-r.left)*docW/r.width,y:(e.clientY-r.top)*docH/r.height,p:e.pointerType==='pen'&&e.pressure>0?e.pressure:.72}}
function smoothPoint(p){if(!lastPoint)return p;const s=settings.stabilizer;return{x:lastPoint.x*s+p.x*(1-s),y:lastPoint.y*s+p.y*(1-s),p:p.p}}
function strokeSize(p){return settings.size*(.32+Math.max(.05,p||.72)*.95)}
function prepCtx(ctx,p){ctx.globalAlpha=settings.opacity;ctx.globalCompositeOperation=tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=settings.color;ctx.fillStyle=settings.color;ctx.lineCap=settings.tip==='round'?'round':'butt';ctx.lineJoin='round';ctx.lineWidth=strokeSize(p)}
function drawSegment(a,b){
  const l=activeLayer();if(!l||!l.visible)return;const ctx=l.ctx;prepCtx(ctx,b.p);
  if(settings.grain==='stipple'&&tool!=='eraser'){
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy)),step=Math.max(3,settings.size*.45);
    for(let t=0;t<=d;t+=step){const q=t/d,j=settings.size*.3;ctx.beginPath();ctx.arc(a.x+dx*q+(Math.random()-.5)*j,a.y+dy*q+(Math.random()-.5)*j,Math.max(1,strokeSize(b.p)*.16),0,Math.PI*2);ctx.fill()}
    return;
  }
  if(settings.tip==='square'&&tool!=='eraser'){
    const s=strokeSize(b.p);ctx.fillRect(b.x-s/2,b.y-s/2,s,s);return;
  }
  const passes=settings.grain==='charcoal'&&tool!=='eraser'?3:1;
  for(let i=0;i<passes;i++){
    const j=passes>1?settings.size*.14:0,ox=(Math.random()-.5)*j,oy=(Math.random()-.5)*j;
    ctx.globalAlpha=settings.opacity/(passes>1?1.8:1);ctx.beginPath();ctx.moveTo(a.x+ox,a.y+oy);ctx.lineTo(b.x+ox,b.y+oy);ctx.stroke();
  }
}
function snapshot(){return{w:docW,h:docH,activeId,layers:layers.map(l=>({id:l.id,name:l.name,visible:l.visible,opacity:l.opacity,data:l.canvas.toDataURL('image/png')}))}}
function pushHistory(){try{history.push(snapshot());if(history.length>8)history.shift();redoStack=[]}catch{} }
async function restoreSnapshot(s){
  docW=s.w;docH=s.h;host.innerHTML='';layers=[];updateStageRatio();
  for(const item of s.layers){const l=makeLayer(item.name);l.id=item.id;l.visible=item.visible;l.opacity=item.opacity;await drawDataURL(l.ctx,item.data)}
  activeId=s.activeId||layers[layers.length-1]?.id;renderLayers();
}
function drawDataURL(ctx,url){return new Promise(resolve=>{const img=new Image();img.onload=()=>{ctx.drawImage(img,0,0,docW,docH);resolve()};img.onerror=()=>resolve();img.src=url})}
async function undo(){if(!history.length)return;redoStack.push(snapshot());await restoreSnapshot(history.pop());scheduleSave()}
async function redo(){if(!redoStack.length)return;history.push(snapshot());await restoreSnapshot(redoStack.pop());scheduleSave()}
function resetDocument(w,h){docW=w;docH=h;host.innerHTML='';layers=[];history=[];redoStack=[];strokeLog=[];updateStageRatio();makeLayer('Calque 1');scheduleSave()}

host.addEventListener('pointerdown',e=>{if(!activeLayer())return;e.preventDefault();host.setPointerCapture?.(e.pointerId);pushHistory();drawing=true;let p=canvasPoint(e);lastPoint=p;drawSegment(p,{...p,x:p.x+.01,y:p.y+.01});strokeLog.push({time:Date.now(),layerId:activeId,tool,color:settings.color,size:settings.size,opacity:settings.opacity,tip:settings.tip,grain:settings.grain,points:[p]})});
host.addEventListener('pointermove',e=>{if(!drawing)return;e.preventDefault();let p=smoothPoint(canvasPoint(e));drawSegment(lastPoint,p);lastPoint=p;strokeLog[strokeLog.length-1]?.points.push(p);$('#toolStatus').textContent=`${tool==='brush'?'Pinceau':'Gomme'} · pression ${Math.round((e.pressure||.72)*100)}%`});
function finishStroke(e){if(!drawing)return;drawing=false;lastPoint=null;try{host.releasePointerCapture?.(e.pointerId)}catch{}scheduleSave()}
host.addEventListener('pointerup',finishStroke);host.addEventListener('pointercancel',finishStroke);

function setTool(next){tool=next;$('#brushBtn').classList.toggle('active',next==='brush');$('#eraserBtn').classList.toggle('active',next==='eraser');$('#toolStatus').textContent=next==='brush'?'Pinceau · pression Apple Pencil active':'Gomme active'}
$('#brushBtn').onclick=()=>setTool('brush');$('#eraserBtn').onclick=()=>setTool('eraser');$('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;
$('#colorInput').oninput=e=>settings.color=e.target.value;
$('#sizeInput').oninput=e=>{settings.size=+e.target.value;$('#sizeOut').textContent=e.target.value};
$('#opacityInput').oninput=e=>{settings.opacity=+e.target.value/100;$('#opacityOut').textContent=`${e.target.value}%`};
$('#stabilizerInput').oninput=e=>{settings.stabilizer=+e.target.value/100;$('#stabilizerOut').textContent=`${e.target.value}%`};
$('#tipInput').onchange=e=>settings.tip=e.target.value;$('#grainInput').onchange=e=>settings.grain=e.target.value;
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const p=b.dataset.preset;if(p==='linework'){settings.size=7;settings.opacity=1;settings.grain='none'}if(p==='tribal'){settings.size=34;settings.opacity=1;settings.grain='none'}if(p==='stipple'){settings.size=12;settings.opacity=.8;settings.grain='stipple'}if(p==='marker'){settings.size=22;settings.opacity=.65;settings.grain='none'};$('#sizeInput').value=settings.size;$('#sizeOut').textContent=settings.size;$('#opacityInput').value=Math.round(settings.opacity*100);$('#opacityOut').textContent=`${Math.round(settings.opacity*100)}%`;$('#grainInput').value=settings.grain});

$('#addLayerBtn').onclick=()=>{pushHistory();makeLayer(`Calque ${layers.length+1}`);scheduleSave()};
$('#clearLayerBtn').onclick=()=>{const l=activeLayer();if(!l)return;pushHistory();l.ctx.clearRect(0,0,docW,docH);scheduleSave()};
$('#newCanvasBtn').onclick=()=>{const [w,h]=$('#canvasPreset').value.split('x').map(Number);if(confirm('Créer un nouveau canvas ? Le document courant reste dans l’autosave seulement si tu le sauvegardes avant.'))resetDocument(w,h)};
$('#importBtn').onclick=()=>$('#importInput').click();
$('#importInput').onchange=e=>{const file=e.target.files?.[0];if(!file)return;pushHistory();const img=new Image();img.onload=()=>{const l=makeLayer(file.name||`Image ${layers.length+1}`),scale=Math.min(docW/img.width,docH/img.height),w=img.width*scale,h=img.height*scale;l.ctx.drawImage(img,(docW-w)/2,(docH-h)/2,w,h);URL.revokeObjectURL(img.src);scheduleSave()};img.src=URL.createObjectURL(file);e.target.value=''};

document.querySelectorAll('[data-transform]').forEach(b=>b.onclick=()=>transformActive(b.dataset.transform));
function transformActive(kind){const l=activeLayer();if(!l)return;pushHistory();const copy=document.createElement('canvas');copy.width=docW;copy.height=docH;copy.getContext('2d').drawImage(l.canvas,0,0);l.ctx.clearRect(0,0,docW,docH);l.ctx.save();if(kind==='flipH'){l.ctx.translate(docW,0);l.ctx.scale(-1,1);l.ctx.drawImage(copy,0,0)}else if(kind==='flipV'){l.ctx.translate(0,docH);l.ctx.scale(1,-1);l.ctx.drawImage(copy,0,0)}else{const scale=Math.min(docW/docH,docH/docW);l.ctx.translate(docW/2,docH/2);l.ctx.rotate(Math.PI/2);l.ctx.scale(scale,scale);l.ctx.drawImage(copy,-docW/2,-docH/2)}l.ctx.restore();scheduleSave()}

function mergeCanvas(){const out=document.createElement('canvas');out.width=docW;out.height=docH;const ctx=out.getContext('2d');layers.forEach(l=>{if(!l.visible)return;ctx.save();ctx.globalAlpha=l.opacity;ctx.drawImage(l.canvas,0,0);ctx.restore()});return out}
$('#exportBtn').onclick=()=>{mergeCanvas().toBlob(blob=>{if(!blob)return;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`NEXCREATE-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)},'image/png')};

function openDb(){return new Promise((resolve,reject)=>{const q=indexedDB.open('kryvell-nexcreate',1);q.onupgradeneeded=()=>q.result.createObjectStore('docs');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
function toBlob(canvas){return new Promise(resolve=>canvas.toBlob(resolve,'image/png'))}
async function saveDocument(){
  $('#saveState').textContent='Sauvegarde…';try{const db=await openDb();const blobs=await Promise.all(layers.map(async l=>({id:l.id,name:l.name,visible:l.visible,opacity:l.opacity,blob:await toBlob(l.canvas)})));const tx=db.transaction('docs','readwrite');tx.objectStore('docs').put({w:docW,h:docH,activeId,layers:blobs,settings:{...settings},strokeLog,updatedAt:new Date().toISOString()},'current');await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close();$('#saveState').textContent='Autosave ✅'}catch{$('#saveState').textContent='Autosave local indisponible'}}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveDocument,700)}
async function loadSaved(){try{const db=await openDb();const tx=db.transaction('docs','readonly');const req=tx.objectStore('docs').get('current');const d=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});db.close();return d}catch{return null}}
async function restoreAutosave(){const d=await loadSaved();if(!d){$('#saveState').textContent='Aucun autosave';return}docW=d.w;docH=d.h;host.innerHTML='';layers=[];updateStageRatio();for(const item of d.layers){const l=makeLayer(item.name);l.id=item.id;l.visible=item.visible;l.opacity=item.opacity;const url=URL.createObjectURL(item.blob);await drawDataURL(l.ctx,url);URL.revokeObjectURL(url)}activeId=d.activeId||layers[layers.length-1]?.id;Object.assign(settings,d.settings||{});strokeLog=d.strokeLog||[];syncControls();renderLayers();$('#saveState').textContent='Autosave restauré ✅'}
$('#saveNowBtn').onclick=saveDocument;$('#restoreBtn').onclick=restoreAutosave;
function syncControls(){$('#colorInput').value=settings.color;$('#sizeInput').value=settings.size;$('#sizeOut').textContent=settings.size;$('#opacityInput').value=Math.round(settings.opacity*100);$('#opacityOut').textContent=`${Math.round(settings.opacity*100)}%`;$('#stabilizerInput').value=Math.round(settings.stabilizer*100);$('#stabilizerOut').textContent=`${Math.round(settings.stabilizer*100)}%`;$('#tipInput').value=settings.tip;$('#grainInput').value=settings.grain}
$('#exportSessionBtn').onclick=()=>{const plan=getPlan();const payload={app:'NEXCREATE OMNI DRAW BETA',exportedAt:new Date().toISOString(),canvas:{width:docW,height:docH},settings,plan:plan.map(x=>({id:x.fields?.['Feature ID']||x.id,title:x.title})),strokeCount:strokeLog.length};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='NEXCREATE-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)};

function getPlan(){try{return JSON.parse(localStorage.getItem('kryvell:creation-plan')||'[]')||[]}catch{return []}}
function runtimeState(featureId){if(featureId==='BRUSH-LAB-005')return['BRIDGE REQUIS','bridge'];if(['DRAW-SELECT-001','DRAW-ANIM-001'].includes(featureId))return['À DÉVELOPPER','partial'];if(['BRUSH-LAB-001','BRUSH-LAB-002','DRAW-TRANSFORM-001','DRAW-EXPORT-001'].includes(featureId))return['BETA PARTIELLE','partial'];return['ACTIF BETA','live']}
async function loadPlanStatus(){let plan=getPlan();if(!plan.length){try{const d=await fetch('/api/module-data?module=nexcreate',{cache:'no-store'}).then(r=>r.json());plan=(d.sections?.[0]?.records||[]).map(r=>({id:r.id,title:r.fields?.Module||r.fields?.['Feature ID']||'Fonction',fields:r.fields||{}}))}catch{plan=[]}}
  $('#planCount').textContent=`${plan.length} modules`;$('#planSummary').textContent=`${plan.length} fonction${plan.length!==1?'s':''} du plan chargée${plan.length!==1?'s':''}. Le moteur exécute ce qui est réellement codé et marque le reste sans le simuler.`;
  $('#featureStatus').innerHTML=plan.map(x=>{const id=x.fields?.['Feature ID']||'',s=runtimeState(id);return `<div class="feature-row"><span>${escapeHtml(x.title||x.fields?.Module||id||'Fonction')}</span><span class="status-chip ${s[1]}">${s[0]}</span></div>`}).join('')||'<p class="muted">Aucun plan chargé.</p>';
}

async function init(){updateStageRatio();makeLayer('Calque 1');syncControls();loadPlanStatus();const saved=await loadSaved();if(saved)$('#saveState').textContent='Autosave disponible';else $('#saveState').textContent='Autosave prêt'}
init();
