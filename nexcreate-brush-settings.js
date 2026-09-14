(function(){
  if(typeof settings==='undefined'||typeof drawSegment!=='function'||typeof canvasPoint!=='function'||typeof smoothPoint!=='function')return;

  const STORAGE_KEY='kryvell:brushlab003';
  const mappingVersion='NEXCREATE↔Procreate mapping 2026-09';
  const defaults={spacing:8,jitter:0,falloff:0,taper:18,flow:100,pressureCurve:100,tilt:0,speed:0,colorDynamics:0,wetMix:0,render:'standard',shape:'round',grain:'none'};
  let recipe={...defaults};
  let strokeTravel=0;

  try{Object.assign(recipe,JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{})}catch{}

  const baseCanvasPoint=canvasPoint;
  canvasPoint=function(e){const p=baseCanvasPoint(e);p.tilt=Math.min(90,Math.hypot(Number(e.tiltX)||0,Number(e.tiltY)||0));p.time=performance.now();return p};
  const baseSmoothPoint=smoothPoint;
  smoothPoint=function(p){const s=baseSmoothPoint(p);s.tilt=p.tilt||0;s.time=p.time||performance.now();return s};

  function hexToRgb(hex){const m=String(hex||'#000').replace('#','');const n=parseInt(m.length===3?m.split('').map(x=>x+x).join(''):m,16);return{r:(n>>16)&255,g:(n>>8)&255,b:n&255}}
  function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b);let h=0,s=0,l=(max+min)/2;if(max!==min){const d=max-min;s=l>.5?d/(2-max-min):d/(max+min);switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4}h/=6}return{h:h*360,s:s*100,l:l*100}}
  function hslToHex(h,s,l){h=((h%360)+360)%360;s/=100;l/=100;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;let r=0,g=0,b=0;if(h<60){r=c;g=x}else if(h<120){r=x;g=c}else if(h<180){g=c;b=x}else if(h<240){g=x;b=c}else if(h<300){r=x;b=c}else{r=c;b=x}return'#'+[r,g,b].map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('')}
  function shiftHue(hex,deg){const {r,g,b}=hexToRgb(hex),hsl=rgbToHsl(r,g,b);return hslToHex(hsl.h+deg,hsl.s,hsl.l)}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
  function renderFactor(){if(recipe.render==='glaze')return .58;if(recipe.render==='dense')return 1.15;if(recipe.render==='wet')return .72;return 1}
  function pressureValue(p){const curve=clamp(recipe.pressureCurve/100,.5,2.5);return Math.pow(clamp(p||.72,.02,1),curve)}
  function saveRecipe(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(recipe))}catch{};updateSummary()}
  function syncCore(){settings.tip=recipe.shape==='square'?'square':'round';settings.grain=recipe.grain;const t=document.getElementById('tipInput'),g=document.getElementById('grainInput');if(t)t.value=settings.tip;if(g)g.value=settings.grain;saveRecipe()}

  const baseDrawSegment=drawSegment;
  drawSegment=function(a,b){
    if(tool==='eraser')return baseDrawSegment(a,b);
    const dist=Math.max(.01,Math.hypot(b.x-a.x,b.y-a.y));
    const advanced=recipe.spacing>10||recipe.jitter>0||recipe.falloff>0||recipe.taper>0||recipe.flow<100||recipe.pressureCurve!==100||recipe.tilt>0||recipe.speed>0||recipe.colorDynamics>0||recipe.wetMix>0||recipe.render!=='standard';
    if(!advanced)return baseDrawSegment(a,b);

    const old={size:settings.size,opacity:settings.opacity,color:settings.color,tip:settings.tip,grain:settings.grain};
    const spacingPx=Math.max(1,old.size*Math.max(.04,recipe.spacing/100));
    const steps=Math.max(1,Math.ceil(dist/spacingPx));
    const speedNorm=clamp(dist/(old.size*3+1),0,1);
    for(let i=1;i<=steps;i++){
      const q=i/steps;
      let x=a.x+(b.x-a.x)*q,y=a.y+(b.y-a.y)*q;
      const jitterPx=old.size*(recipe.jitter/100)*.65;
      if(jitterPx){x+=(Math.random()-.5)*2*jitterPx;y+=(Math.random()-.5)*2*jitterPx}
      const p=pressureValue((a.p||.72)+(b.p-(a.p||.72))*q);
      const tiltBoost=1+(recipe.tilt/100)*((b.tilt||0)/90)*.45;
      const speedSize=1-(recipe.speed/100)*speedNorm*.5;
      const taperLen=Math.max(1,old.size*(1+recipe.taper/7));
      const taperFactor=recipe.taper?clamp((strokeTravel+dist*q)/taperLen,.18,1):1;
      const fallFactor=recipe.falloff?clamp(1-(strokeTravel+dist*q)/(old.size*(35-recipe.falloff*.25)+1),.15,1):1;
      const wetFactor=1-(recipe.wetMix/100)*.42;
      settings.size=Math.max(.5,old.size*tiltBoost*speedSize*taperFactor);
      settings.opacity=clamp(old.opacity*(recipe.flow/100)*fallFactor*wetFactor*renderFactor(),.02,1);
      settings.tip=recipe.shape==='square'?'square':'round';
      settings.grain=recipe.grain;
      if(recipe.colorDynamics>0)settings.color=shiftHue(old.color,(Math.random()-.5)*2*recipe.colorDynamics);
      const p1={x,y,p,tilt:b.tilt||0,time:b.time||performance.now()};
      const p2={...p1,x:x+.01,y:y+.01};
      baseDrawSegment(p1,p2);
      if(recipe.render==='dense')baseDrawSegment({...p1,x:x+.12},{...p2,x:x+.13});
    }
    strokeTravel+=dist;
    Object.assign(settings,old);
  };

  const host=document.getElementById('layersHost');
  host?.addEventListener('pointerdown',()=>{strokeTravel=0},true);

  const presets={
    clean:{name:'Clean Line',core:{size:7,opacity:1,stabilizer:.55},recipe:{spacing:5,jitter:0,falloff:0,taper:30,flow:100,pressureCurve:115,tilt:0,speed:10,colorDynamics:0,wetMix:0,render:'dense',shape:'round',grain:'none'}},
    tattoo:{name:'Tattoo Ink',core:{size:12,opacity:1,stabilizer:.48},recipe:{spacing:6,jitter:0,falloff:0,taper:20,flow:100,pressureCurve:120,tilt:0,speed:8,colorDynamics:0,wetMix:0,render:'dense',shape:'round',grain:'none'}},
    charcoal:{name:'Charcoal',core:{size:26,opacity:.72,stabilizer:.18},recipe:{spacing:15,jitter:18,falloff:8,taper:8,flow:72,pressureCurve:85,tilt:28,speed:18,colorDynamics:0,wetMix:8,render:'glaze',shape:'round',grain:'charcoal'}},
    wet:{name:'Wet Ink',core:{size:20,opacity:.78,stabilizer:.3},recipe:{spacing:8,jitter:4,falloff:12,taper:15,flow:80,pressureCurve:95,tilt:12,speed:12,colorDynamics:3,wetMix:55,render:'wet',shape:'round',grain:'none'}}
  };

  function applyPreset(id){const p=presets[id];if(!p)return;Object.assign(settings,p.core);Object.assign(recipe,p.recipe);if(typeof syncControls==='function')syncControls();renderPanelValues();syncCore();const s=document.getElementById('toolStatus');if(s)s.textContent=`Brush Lab · ${p.name}`}
  function recipePayload(){return{featureId:'BRUSH-LAB-003',engine:'NEXCREATE OMNI DRAW BETA',mappingVersion,generatedAt:new Date().toISOString(),core:{size:settings.size,opacity:Math.round(settings.opacity*100),stabilization:Math.round(settings.stabilizer*100)},recipe:{...recipe},procreateConceptMap:{spacing:'Stroke Path > Spacing',jitter:'Stroke Path > Jitter',falloff:'Properties/Rendering fall-off concept',taper:'Taper',shape:'Shape',grain:'Grain',render:'Rendering',wetMix:'Wet Mix',colorDynamics:'Color Dynamics',speed:'Dynamics > Speed',pressure:'Apple Pencil > Pressure',tilt:'Apple Pencil > Tilt',size:'Properties/Apple Pencil size response',opacity:'Properties/Apple Pencil opacity response',stabilization:'Stabilization'},testSheet:['Tracer une ligne lente puis rapide','Tester pression faible puis forte','Tester courbe courte avec taper','Comparer grain et rendu','Vérifier taille/opacité après sauvegarde']}}
  function updateSummary(){const el=document.getElementById('brushLabSummary');if(!el)return;el.innerHTML=`<strong>${recipe.shape==='square'?'Carrée':'Ronde'} · ${recipe.grain}</strong><br>Espacement ${recipe.spacing}% · Jitter ${recipe.jitter}% · Taper ${recipe.taper}% · Flow ${recipe.flow}% · Pression ${recipe.pressureCurve}% · Wet ${recipe.wetMix}% · ${recipe.render}`}
  function downloadRecipe(){const blob=new Blob([JSON.stringify(recipePayload(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`NEXCREATE-BRUSH-RECIPE-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
  async function copyRecipe(){const text=JSON.stringify(recipePayload(),null,2);try{await navigator.clipboard.writeText(text);const s=document.getElementById('toolStatus');if(s)s.textContent='Recette copiée ✅'}catch{const blob=new Blob([text],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='NEXCREATE-BRUSH-RECIPE.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}}

  function installPanel(){
    const side=document.querySelector('.nx-side');if(!side||document.getElementById('brushLab003'))return;
    const card=document.createElement('section');card.id='brushLab003';card.className='nx-brushlab-card';
    card.innerHTML=`<div class="nx-brushlab-head"><h2>Brush Lab · réglages</h2><span class="nx-brushlab-badge">BRUSH-LAB-003</span></div>
      <div class="nx-brushlab-presets"><button data-brushpreset="clean">Clean Line</button><button data-brushpreset="tattoo">Tattoo Ink</button><button data-brushpreset="charcoal">Charcoal</button><button data-brushpreset="wet">Wet Ink</button></div>
      <div class="nx-brushlab-grid">
        ${slider('spacing','Espacement',1,100,'%')}${slider('jitter','Jitter',0,100,'%')}${slider('falloff','Fall-off',0,100,'%')}${slider('taper','Taper',0,100,'%')}${slider('flow','Flow',5,100,'%')}${slider('pressureCurve','Pression',50,250,'%')}${slider('tilt','Inclinaison',0,100,'%')}${slider('speed','Dynamique vitesse',0,100,'%')}${slider('colorDynamics','Dynamique couleur',0,30,'°')}${slider('wetMix','Wet Mix',0,100,'%')}
        <label>Rendu<select data-brushfield="render"><option value="standard">Standard</option><option value="glaze">Glaze</option><option value="dense">Dense</option><option value="wet">Wet</option></select></label>
        <label>Forme<select data-brushfield="shape"><option value="round">Ronde</option><option value="square">Carrée</option></select></label>
        <label>Grain<select data-brushfield="grain"><option value="none">Aucun</option><option value="charcoal">Charbon</option><option value="stipple">Stippling</option></select></label>
      </div>
      <div class="nx-brushlab-actions"><button id="copyBrushRecipe">Copier recette</button><button id="exportBrushRecipe">Exporter JSON</button></div>
      <div id="brushLabSummary" class="nx-brushlab-summary"></div><p class="nx-brushlab-note">Correspondance Procreate versionnée. Les noms exacts peuvent varier selon la version; aucun faux fichier .brush n’est créé.</p>`;
    side.insertBefore(card,side.children[2]||null);
    card.querySelectorAll('[data-brushpreset]').forEach(b=>b.onclick=()=>applyPreset(b.dataset.brushpreset));
    card.querySelectorAll('[data-brushfield]').forEach(el=>{const k=el.dataset.brushfield;const handler=e=>{recipe[k]=el.type==='range'?Number(el.value):el.value;const out=card.querySelector(`[data-out="${k}"]`);if(out)out.textContent=`${el.value}${out.dataset.unit||''}`;syncCore()};el.oninput=handler;el.onchange=handler});
    document.getElementById('copyBrushRecipe').onclick=copyRecipe;document.getElementById('exportBrushRecipe').onclick=downloadRecipe;renderPanelValues();updateSummary();
  }
  function slider(k,label,min,max,unit){return`<label>${label} <output class="nx-brushlab-output" data-out="${k}" data-unit="${unit}"></output><input data-brushfield="${k}" type="range" min="${min}" max="${max}"></label>`}
  function renderPanelValues(){const card=document.getElementById('brushLab003');if(!card)return;card.querySelectorAll('[data-brushfield]').forEach(el=>{const k=el.dataset.brushfield;el.value=recipe[k];const out=card.querySelector(`[data-out="${k}"]`);if(out)out.textContent=`${recipe[k]}${out.dataset.unit||''}`});updateSummary()}

  installPanel();syncCore();
})();