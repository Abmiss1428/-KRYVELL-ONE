/* NYXCORE VISUAL MATRIX v1.2.0
 * iPhone-first entity renderer for the living Canvas.
 * Replaces the tiny-dot detailed view with readable organisms while preserving LIFE state.
 */
(() => {
  'use strict';
  if (window.__NYXCORE_VISUAL_MATRIX__) return;

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const WORLD_W = 2400;
  const WORLD_H = 1400;

  function ensureStyles(){
    if (document.getElementById('nyx-visual-matrix-style')) return;
    const s = document.createElement('style');
    s.id = 'nyx-visual-matrix-style';
    s.textContent = `
      .nyx-visual-chip{border:1px solid #6b2638!important;background:linear-gradient(180deg,#2a1018,#150b10)!important;color:#fff!important}
      .nyx-visual-chip strong{color:#ff4868}
      .nyx-pocketpal-note{margin:10px 0 0;padding:9px 10px;border:1px solid #3a2730;border-radius:12px;background:#120c10;color:#b8b2b5;font-size:11px;line-height:1.45}
      .nyx-stage{min-height:58vh!important}
      .nyx-detail-canvas{min-height:58vh!important;width:100%!important;display:block!important;background:#06070a!important}
      @media(max-width:640px){.nyx-stage,.nyx-detail-canvas{min-height:62vh!important}}
    `;
    document.head.appendChild(s);
  }

  function pixelRatio(canvas){
    const rect = canvas.getBoundingClientRect();
    return clamp(canvas.width / Math.max(1, rect.width), 1, 3);
  }

  function drawBackground(ctx,w,h,ratio){
    const grad=ctx.createRadialGradient(w*.52,h*.42,0,w*.52,h*.42,Math.max(w,h)*.72);
    grad.addColorStop(0,'rgba(38,8,18,.48)');
    grad.addColorStop(.55,'rgba(10,9,14,.82)');
    grad.addColorStop(1,'rgba(3,4,7,.98)');
    ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(255,255,255,.025)';ctx.lineWidth=Math.max(1,.55*ratio);
    const step=72*ratio;
    for(let x=0;x<w;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let y=0;y<h;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  }

  function drawFood(ctx,engine,xScale,yScale,ratio){
    const food=engine.food||[];
    const max=Math.min(food.length,180);
    const stride=Math.max(1,Math.ceil(food.length/Math.max(1,max)));
    for(let i=0;i<food.length;i+=stride){
      const f=food[i]; if(!f||!f.alive) continue;
      const x=f.x*xScale,y=f.y*yScale;
      const r=Math.max(1.2*ratio,1.7*ratio+Math.sin((f.phase||0)+(performance.now()*.002))*.25*ratio);
      ctx.fillStyle='rgba(72,210,116,.42)';
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
  }

  function drawLinks(ctx,engine,xScale,yScale,ratio){
    if(!Array.isArray(engine.birthLinks))return;
    ctx.lineWidth=Math.max(1,.75*ratio);
    let n=0;
    for(let i=engine.birthLinks.length-1;i>=0&&n<90;i--){
      const l=engine.birthLinks[i],c=engine.byId?.get?.(l.c); if(!c)continue;
      const a=engine.byId?.get?.(l.a),b=engine.byId?.get?.(l.b);
      ctx.strokeStyle=`hsla(${c.lineageHue||0} 76% 60% / .13)`;
      if(a){ctx.beginPath();ctx.moveTo(a.x*xScale,a.y*yScale);ctx.lineTo(c.x*xScale,c.y*yScale);ctx.stroke();}
      if(b){ctx.beginPath();ctx.moveTo(b.x*xScale,b.y*yScale);ctx.lineTo(c.x*xScale,c.y*yScale);ctx.stroke();}
      n++;
    }
  }

  function drawOrganism(ctx,a,x,y,ratio,selected){
    const gen=Math.max(1,Number(a.generation||1));
    const energy=clamp(Number(a.energy||0)/140,0,1);
    const hue=Number.isFinite(a.lineageHue)?a.lineageHue:0;
    const vx=Number(a.vx||0),vy=Number(a.vy||0),speed=Math.hypot(vx,vy);
    const angle=speed>.001?Math.atan2(vy,vx):0;
    const body=(7.5+clamp(Math.log2(gen+1)*1.25,1,5.5)+energy*2.7)*ratio;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);

    if(speed>1){
      ctx.strokeStyle=`hsla(${hue} 78% 60% / .30)`;ctx.lineWidth=Math.max(1,1.1*ratio);
      ctx.beginPath();ctx.moveTo(-body*.75,0);ctx.quadraticCurveTo(-body*1.5,body*.35,-body*2.1,0);ctx.stroke();
    }

    if(selected){
      ctx.shadowBlur=18*ratio;ctx.shadowColor='rgba(255,31,72,.72)';
    }
    ctx.fillStyle='rgba(6,7,10,.97)';
    ctx.beginPath();ctx.ellipse(0,0,body*1.35,body*.88,0,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;

    ctx.strokeStyle=`hsla(${hue} 90% ${54+energy*17}% / .98)`;
    ctx.lineWidth=Math.max(1.3,1.6*ratio);
    ctx.beginPath();ctx.ellipse(0,0,body*1.3,body*.84,0,0,Math.PI*2);ctx.stroke();

    ctx.fillStyle=`hsla(${hue} 96% ${64+energy*20}% / .98)`;
    ctx.beginPath();ctx.ellipse(body*.18,0,body*.34,body*.26,0,0,Math.PI*2);ctx.fill();

    if((a.genes?.curiosity??.5)>.42){
      const px=body*.88,pr=Math.max(1.4*ratio,body*.11);
      ctx.fillStyle='rgba(250,244,247,.96)';
      ctx.beginPath();ctx.arc(px,-body*.22,pr,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(px, body*.22,pr,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(15,10,14,.95)';
      ctx.beginPath();ctx.arc(px+pr*.25,-body*.22,pr*.42,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(px+pr*.25, body*.22,pr*.42,0,Math.PI*2);ctx.fill();
    }

    if(gen>=4){
      ctx.strokeStyle=`rgba(255,46,82,${clamp(.22+Math.log2(gen)*.045,.22,.45)})`;
      ctx.lineWidth=Math.max(1,1.05*ratio);
      ctx.beginPath();ctx.ellipse(0,0,body*1.65,body*1.08,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  }

  function drawStats(ctx,engine,w,h,ratio){
    let s={};try{s=engine.stats?.()||{};}catch{}
    const boxW=Math.min(w-20*ratio,355*ratio),boxH=78*ratio;
    ctx.fillStyle='rgba(2,3,6,.80)';ctx.fillRect(10*ratio,10*ratio,boxW,boxH);
    ctx.font=`800 ${Math.round(10*ratio)}px ui-monospace,SFMono-Regular,Menlo,monospace`;
    ctx.fillStyle='rgba(244,238,241,.95)';
    const active=Number(s.active??engine.active?.filter(a=>!a.dead).length??0);
    const virtual=String(s.virtual??0),total=String(s.total??active),gen=Number(s.generation??engine.maxGeneration??1);
    const fps=Number(s.fps||0)>0?String(s.fps):'MESURE…';
    ctx.fillText(`ACTIVE ${active}   VIRTUAL ${virtual}`,18*ratio,30*ratio);
    ctx.fillText(`TOTAL ${total}   GEN ${gen}   FPS ${fps}`,18*ratio,49*ratio);
    const brain=s.llmOnline===true?'LOCAL✓':s.llmOnline===false?'FALLBACK':'AUTO';
    ctx.fillText(`LLM ${brain}   QUEUE ${s.llmQueue??0}`,18*ratio,68*ratio);

    const legendY=h-34*ratio;
    ctx.fillStyle='rgba(2,3,6,.78)';ctx.fillRect(10*ratio,legendY-18*ratio,Math.min(w-20*ratio,430*ratio),29*ratio);
    ctx.font=`700 ${Math.round(8.5*ratio)}px ui-monospace,SFMono-Regular,Menlo,monospace`;
    ctx.fillStyle='rgba(232,220,225,.86)';
    ctx.fillText('CORPS = ENTITÉ  ·  COULEUR = LIGNÉE  ·  NOYAU = ÉNERGIE',18*ratio,legendY);
  }

  function drawDetailed(engine,target,now){
    const {canvas,ctx}=target||{};if(!canvas||!ctx||!canvas.isConnected)return;
    const w=canvas.width,h=canvas.height,ratio=pixelRatio(canvas);
    const xScale=w/WORLD_W,yScale=h/WORLD_H;
    ctx.save();ctx.globalCompositeOperation='source-over';
    drawBackground(ctx,w,h,ratio);
    drawFood(ctx,engine,xScale,yScale,ratio);
    drawLinks(ctx,engine,xScale,yScale,ratio);
    const agents=engine.active||[];
    for(const a of agents){if(!a||a.dead)continue;drawOrganism(ctx,a,a.x*xScale,a.y*yScale,ratio,a.id===engine.selectedId);}
    const sel=engine.selectedId?engine.byId?.get?.(engine.selectedId):null;
    if(sel&&!sel.dead){
      const x=sel.x*xScale,y=sel.y*yScale,p=(22+Math.sin(now*.007)*3)*ratio;
      ctx.strokeStyle='rgba(255,65,98,.96)';ctx.lineWidth=Math.max(2,1.8*ratio);ctx.beginPath();ctx.arc(x,y,p,0,Math.PI*2);ctx.stroke();
    }
    drawStats(ctx,engine,w,h,ratio);
    ctx.restore();
  }

  function installPocketPalButton(){
    ensureStyles();
    const actions=document.querySelector('.nyx-life .nyx-actions');
    if(!actions||actions.querySelector('[data-nyx-pocketpal]'))return false;
    const b=document.createElement('button');b.type='button';b.className='nyx-visual-chip';b.dataset.nyxPocketpal='1';b.textContent='🧠 POCKETPAL';
    b.addEventListener('click',()=>{location.href='/nyxcore-pocketpal.html?v=0.9.1';});actions.appendChild(b);return true;
  }

  async function install(){
    ensureStyles();
    for(let i=0;i<300;i++){
      const api=window.KryvellNyxcore,engine=api?.engine;
      if(engine&&typeof engine.drawTarget==='function'){
        if(!engine.__visualMatrixPatchedV12){
          const base=engine.drawTarget.bind(engine);
          engine.drawTarget=function(target,now){
            if(target?.ambient){base(target,now);return;}
            try{drawDetailed(engine,target,now);}catch(err){console.warn('[NYX VISUAL V1.2]',err);base(target,now);}
          };
          engine.__visualMatrixPatchedV12=true;
          engine.__visualMatrixPatched=true;
        }
        installPocketPalButton();
        window.__NYXCORE_VISUAL_MATRIX__={version:'1.2.0',installPocketPalButton};
        window.dispatchEvent(new CustomEvent('nyxcore:visual-ready',{detail:{version:'1.2.0'}}));
        return true;
      }
      await wait(40);
    }
    return false;
  }

  const obs=new MutationObserver(()=>installPocketPalButton());
  obs.observe(document.documentElement,{childList:true,subtree:true});
  install();
})();
