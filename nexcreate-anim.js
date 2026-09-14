(function(){
  if(typeof host==='undefined'||typeof snapshot!=='function'||typeof restoreSnapshot!=='function'||typeof mergeCanvas!=='function')return;

  let frames=[];
  let currentFrame=-1;
  let playing=false;
  let playTimer=null;
  let playDirection=1;
  let fps=6;
  let playMode='loop';
  let onionEnabled=true;
  let timelapseFrames=[];
  const MAX_TIMELAPSE=90;
  const onion=document.createElement('canvas');
  let onionCtx=onion.getContext('2d',{alpha:true});

  function ensureOnion(){
    if(onion.width!==docW||onion.height!==docH){onion.width=docW;onion.height=docH;onionCtx=onion.getContext('2d',{alpha:true});}
    onion.id='onionOverlay';onion.className='onion-overlay';
    if(onion.parentNode!==host)host.appendChild(onion);
    else host.appendChild(onion);
  }
  function clearOnion(){ensureOnion();onionCtx.clearRect(0,0,onion.width,onion.height);}
  function drawImageUrl(ctx,url,alpha=1){return new Promise(resolve=>{const img=new Image();img.onload=()=>{ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(img,0,0,docW,docH);ctx.restore();resolve();};img.onerror=()=>resolve();img.src=url;});}
  async function renderOnion(){
    clearOnion();
    if(!onionEnabled||currentFrame<=0||!frames[currentFrame-1])return;
    await drawImageUrl(onionCtx,frames[currentFrame-1].thumb,.18);
  }
  function currentThumb(){try{return mergeCanvas().toDataURL('image/png');}catch{return ''}}
  function frameLabel(i){return `F${i+1}`}
  function updateAnimStatus(message){const el=document.getElementById('animStatus');if(el)el.textContent=message||`${frames.length} frame${frames.length!==1?'s':''} · ${fps} FPS · ${timelapseFrames.length} étape${timelapseFrames.length!==1?'s':''} timelapse`;}
  function renderTimeline(){
    const el=document.getElementById('animTimeline');if(!el)return;
    el.innerHTML=frames.length?frames.map((f,i)=>`<button class="anim-frame ${i===currentFrame?'active':''}" data-frame="${i}"><img src="${f.thumb}" alt="${frameLabel(i)}"><span>${frameLabel(i)}</span></button>`).join(''):'<p class="anim-empty">Ajoute une frame pour commencer.</p>';
    el.querySelectorAll('[data-frame]').forEach(b=>b.onclick=()=>goToFrame(Number(b.dataset.frame)));
    updateAnimStatus();
  }
  async function addFrame(copyCurrent=false){
    stopPlayback();
    const snap=copyCurrent&&currentFrame>=0?frames[currentFrame].snap:snapshot();
    const thumb=copyCurrent&&currentFrame>=0?frames[currentFrame].thumb:currentThumb();
    frames.push({snap,thumb,createdAt:new Date().toISOString()});currentFrame=frames.length-1;
    if(copyCurrent)await restoreSnapshot(snap);
    ensureOnion();renderTimeline();await renderOnion();updateAnimStatus('Frame ajoutée ✅');
  }
  async function goToFrame(index){
    if(index<0||index>=frames.length)return;stopPlayback();currentFrame=index;await restoreSnapshot(frames[index].snap);ensureOnion();renderTimeline();await renderOnion();updateAnimStatus(`${frameLabel(index)} active`);
  }
  async function updateCurrentFrame(){
    if(currentFrame<0){await addFrame(false);return;}
    frames[currentFrame]={snap:snapshot(),thumb:currentThumb(),createdAt:frames[currentFrame].createdAt,updatedAt:new Date().toISOString()};renderTimeline();await renderOnion();updateAnimStatus(`${frameLabel(currentFrame)} mise à jour ✅`);
  }
  async function deleteFrame(){
    if(currentFrame<0)return;stopPlayback();frames.splice(currentFrame,1);if(!frames.length){currentFrame=-1;clearOnion();renderTimeline();return;}currentFrame=Math.min(currentFrame,frames.length-1);await restoreSnapshot(frames[currentFrame].snap);ensureOnion();renderTimeline();await renderOnion();updateAnimStatus('Frame supprimée');
  }
  function stopPlayback(){playing=false;clearTimeout(playTimer);playTimer=null;const b=document.getElementById('playAnimBtn');if(b)b.textContent='▶ Lecture';}
  async function playbackStep(){
    if(!playing||frames.length<2)return;
    let next=currentFrame+playDirection;
    if(playMode==='pingpong'){
      if(next>=frames.length){playDirection=-1;next=Math.max(0,frames.length-2);}else if(next<0){playDirection=1;next=Math.min(frames.length-1,1);}
    }else if(next>=frames.length||next<0){next=0;playDirection=1;}
    currentFrame=next;await restoreSnapshot(frames[next].snap);ensureOnion();renderTimeline();clearOnion();
    playTimer=setTimeout(playbackStep,Math.max(42,1000/fps));
  }
  function togglePlayback(){
    if(playing){stopPlayback();renderOnion();return;}
    if(frames.length<2){updateAnimStatus('Ajoute au moins 2 frames');return;}
    playing=true;playDirection=1;const b=document.getElementById('playAnimBtn');if(b)b.textContent='■ Stop';clearOnion();playbackStep();
  }
  function captureTimelapse(){
    try{const data=currentThumb();if(!data)return;if(timelapseFrames[timelapseFrames.length-1]===data)return;timelapseFrames.push(data);if(timelapseFrames.length>MAX_TIMELAPSE)timelapseFrames.shift();updateAnimStatus();}catch{}
  }
  async function exportVideo(images,prefix){
    if(images.length<2){updateAnimStatus('Il faut au moins 2 images pour exporter une vidéo');return;}
    const out=document.createElement('canvas');out.width=docW;out.height=docH;const ctx=out.getContext('2d');
    if(!out.captureStream||typeof MediaRecorder==='undefined'){updateAnimStatus('Export vidéo non supporté sur ce navigateur');return;}
    const stream=out.captureStream(fps);let mime='';
    const candidates=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    for(const c of candidates){try{if(MediaRecorder.isTypeSupported?.(c)){mime=c;break;}}catch{}}
    let rec;try{rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);}catch{try{rec=new MediaRecorder(stream);}catch{updateAnimStatus('Export vidéo non supporté');return;}}
    const chunks=[];rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
    const done=new Promise(resolve=>{rec.onstop=resolve});rec.start();
    const delay=Math.max(80,1000/fps);
    for(const url of images){ctx.clearRect(0,0,docW,docH);await drawImageUrl(ctx,url,1);await new Promise(r=>setTimeout(r,delay));}
    rec.stop();await done;stream.getTracks().forEach(t=>t.stop());
    const type=rec.mimeType||mime||'video/webm',ext=type.includes('mp4')?'mp4':'webm';const blob=new Blob(chunks,{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${prefix}-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.${ext}`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);updateAnimStatus(`Export ${prefix} lancé ✅`);
  }
  function installUi(){
    const side=document.querySelector('.nx-side');if(!side||document.getElementById('animationPanel'))return;
    const panel=document.createElement('section');panel.className='panel-card animation-panel';panel.id='animationPanel';panel.innerHTML=`<div class="panel-title"><h2>Animation & timelapse</h2><span class="beta-chip">BETA</span></div><div class="anim-controls"><button id="addFrameBtn">+ Frame</button><button id="updateFrameBtn">Mettre à jour</button><button id="duplicateFrameBtn">Dupliquer</button><button id="deleteFrameBtn">Supprimer</button></div><div class="anim-settings"><label>FPS <output id="fpsOut">6</output><input id="fpsInput" type="range" min="1" max="24" value="6"></label><label>Lecture<select id="playMode"><option value="loop">Boucle</option><option value="pingpong">Ping-pong</option></select></label><label class="checkline"><input id="onionToggle" type="checkbox" checked> Onion skin</label></div><div class="anim-controls"><button id="playAnimBtn">▶ Lecture</button><button id="exportAnimBtn">Exporter animation</button><button id="exportTimelapseBtn">Exporter timelapse</button><button id="clearTimelapseBtn">Effacer timelapse</button></div><div id="animTimeline" class="anim-timeline"></div><p id="animStatus" class="muted">0 frame · 6 FPS · 0 étape timelapse</p>`;
    const anchor=document.getElementById('selectionPanel')||side.firstElementChild;anchor.after(panel);
    document.getElementById('addFrameBtn').onclick=()=>addFrame(false);document.getElementById('updateFrameBtn').onclick=updateCurrentFrame;document.getElementById('duplicateFrameBtn').onclick=()=>addFrame(true);document.getElementById('deleteFrameBtn').onclick=deleteFrame;document.getElementById('playAnimBtn').onclick=togglePlayback;
    document.getElementById('fpsInput').oninput=e=>{fps=Number(e.target.value);document.getElementById('fpsOut').textContent=fps;updateAnimStatus();};
    document.getElementById('playMode').onchange=e=>playMode=e.target.value;document.getElementById('onionToggle').onchange=e=>{onionEnabled=e.target.checked;renderOnion();};
    document.getElementById('exportAnimBtn').onclick=()=>exportVideo(frames.map(f=>f.thumb),'NEXCREATE-animation');
    document.getElementById('exportTimelapseBtn').onclick=()=>exportVideo(timelapseFrames,'NEXCREATE-timelapse');
    document.getElementById('clearTimelapseBtn').onclick=()=>{timelapseFrames=[];updateAnimStatus('Timelapse effacé');};
    renderTimeline();
  }

  host.addEventListener('pointerup',()=>setTimeout(captureTimelapse,40));
  const coreResetDocument=resetDocument;
  resetDocument=function(w,h){stopPlayback();frames=[];currentFrame=-1;timelapseFrames=[];coreResetDocument(w,h);ensureOnion();clearOnion();renderTimeline();};
  const coreUpdateStageRatio=updateStageRatio;
  updateStageRatio=function(){coreUpdateStageRatio();ensureOnion();renderOnion();};

  if(typeof runtimeState==='function'){
    const baseRuntimeState=runtimeState;
    runtimeState=function(featureId){if(featureId==='DRAW-ANIM-001')return['ACTIF BETA','live'];return baseRuntimeState(featureId);};
  }

  installUi();ensureOnion();setTimeout(()=>{try{loadPlanStatus?.()}catch{}},0);
  window.NEXCREATE_ANIM={addFrame,goToFrame,updateCurrentFrame,togglePlayback,exportAnimation:()=>exportVideo(frames.map(f=>f.thumb),'NEXCREATE-animation'),exportTimelapse:()=>exportVideo(timelapseFrames,'NEXCREATE-timelapse')};
})();