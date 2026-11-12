(() => {
  'use strict';
  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d');
  const ui = {
    joystick: document.getElementById('joystick'), knob: document.getElementById('joystickKnob'),
    interact: document.getElementById('interactButton'), hint: document.getElementById('interactHint'),
    dialogue: document.getElementById('dialogue'), close: document.getElementById('closeDialogue'),
    speaker: document.getElementById('speakerName'), role: document.getElementById('speakerRole'),
    avatar: document.getElementById('speakerAvatar'), speech: document.getElementById('speechText'),
    location: document.getElementById('locationName'), quest: document.getElementById('questCheck'),
    toast: document.getElementById('toast'), sound: document.getElementById('soundButton'), soundIcon: document.getElementById('soundIcon'),
    soundText: document.querySelector('.sound-text')
  };
  const world = { unit: 20, w: 0, h: 0, dpr: 1, camX: 0, camZ: 5 };
  const player = { x: 0, z: 5, faceX: 0, faceZ: -1, walk: 0, greeting: false };
  const input = { x: 0, z: 0, keys: new Set(), pointer: null };
  const palette = { grass: ['#9fc17e','#a8c985','#96b977','#a3c47e','#accb87'], road: ['#d4bd91','#cbb58a','#d9c49a','#c7b184'], leaf: ['#79a765','#8ab372','#6f995e','#99bd79'] };
  const buildings = [
    {type:'castle',x:0,z:-10,w:6,d:4,name:'Castle Hill'},
    {type:'house',x:-8,z:-6,w:3,d:3,wall:'#efd69d',roof:'#c6684e'},
    {type:'house',x:8,z:-6,w:3.3,d:3,wall:'#e8c78f',roof:'#789269'},
    {type:'house',x:-9,z:3,w:3.5,d:3,wall:'#e7c89e',roof:'#a95d4d'},
    {type:'house',x:9,z:3,w:3.4,d:3,wall:'#f0d7a5',roof:'#c4774c'},
    {type:'house',x:-6,z:9,w:3,d:3,wall:'#e9cf9d',roof:'#71875d'},
    {type:'house',x:6,z:10,w:3.4,d:3,wall:'#f0d6a5',roof:'#b9684d'}
  ];
  const stalls = [
    {x:-4,z:-2,color:'#d77d59',label:'APPLES'}, {x:4,z:-2,color:'#71966d',label:'HERBS'},
    {x:-4,z:3,color:'#d4a84e',label:'BREAD'}, {x:4,z:3,color:'#7897a0',label:'CRAFTS'}
  ];
  const trees = [
    [-11,-10],[-8,-11],[8,-11],[11,-9],[-12,-3],[12,-2],[-12,6],[12,7],[-9,12],[-3,12],[2,12],[10,12],[-6,-3],[7,7]
  ].map(([x,z],i)=>({x,z,variant:i%4,scale:.82+(i%3)*.1}));
  const npcData = [
    ['Mira','Merchant',-3,-3,'🧺','#d37858'],['Tomas','Guard',2,-5,'⚔','#6c84a1'],['Pip','Villager',6,1,'✿','#cf9d54'],
    ['Elsie','Villager',-6,5,'✿','#8e9f69'],['Bram','Merchant',3,5,'🧺','#b781a0'],['Hugo','Guard',-2,-8,'⚔','#6f8ca0'],
    ['Nell','Villager',8,8,'✿','#d1886d'],['Oren','Villager',-8,0,'✿','#769a81']
  ];
  const npcLines = {
    Merchant:['Fresh honey cakes, Your Majesty! Still warm from the oven.','The west road is lined with wildflowers this time of year.','I saved the juiciest apples for the castle kitchen!'],
    Guard:['All is peaceful in Sunmeadow today. A fine day for a stroll!','The castle gardens are in bloom. You simply must see them.','I heard the fountain wishes sparkle at sunset.'],
    Villager:['Well met, Your Majesty! May your day be full of sunshine.','A robin has made its nest in the old apple tree.','They say the fountain makes every wish a little brighter.','What a lovely day to be out and about!']
  };
  const npcs = npcData.map((n,i)=>({name:n[0],role:n[1],x:n[2],z:n[3],homeX:n[2],homeZ:n[3],icon:n[4],color:n[5],phase:i*1.7,walkX:0,walkZ:0,next:2+i%4,seed:i}));
  const props = [];
  let nearest = null, lastTime = 0, greetingTimer = 0, toastTimer = 0, music = null, musicTimer = null, musicOn = false;

  function resize(){
    const r=canvas.getBoundingClientRect(); world.w=r.width; world.h=r.height; world.dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(r.width*world.dpr); canvas.height=Math.round(r.height*world.dpr);
    ctx.setTransform(world.dpr,0,0,world.dpr,0,0);
    world.unit=Math.max(8,Math.min(r.width/42,r.height/30));
  }
  window.addEventListener('resize',resize,{passive:true}); resize();
  function project(x,z,height=0){return {x:world.w/2+(x-world.camX-z+world.camZ)*world.unit,y:world.h*.48+((x-world.camX)+(z-world.camZ))*world.unit*.5-height*world.unit*.72};}
  function point(x,z,h=0){return project(x,z,h)}
  function polygon(points,fill,stroke=null,lineWidth=1){ctx.beginPath();points.forEach((v,i)=>{const p=Array.isArray(v)?point(v[0],v[1],v[2]||0):v;i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke()}}
  function box(x,z,w,d,h,colors){
    const bl=point(x-w/2,z+d/2),br=point(x+w/2,z+d/2),fr=point(x+w/2,z-d/2),fl=point(x-w/2,z-d/2);
    const offset=h*world.unit*.72;
    const top=[{x:bl.x,y:bl.y-offset},{x:br.x,y:br.y-offset},{x:fr.x,y:fr.y-offset},{x:fl.x,y:fl.y-offset}];
    polygon([bl,br,top[1],top[0]],colors.side||colors.front);polygon([br,fr,top[2],top[1]],colors.front);polygon(top,colors.top||colors.front,colors.stroke||'#735b4540',.7);
    return top;
  }
  function oval(x,z,rx,rz,color,height=0){const c=point(x,z,height);ctx.beginPath();ctx.ellipse(c.x,c.y,rx*world.unit,rz*world.unit*.52,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()}
  function rounded(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
  function noise(x,z){const v=Math.sin(x*127.1+z*311.7)*43758.5453;return v-Math.floor(v)}
  function isRoad(x,z){
    const plaza=x*x+z*z<15;
    return plaza||((x>=-1.45&&x<=1.45&&z>-11.5&&z<10.5)||(z>=-1.35&&z<=1.35&&x>-10.5&&x<10.5)||((x>=-1&&x<=1)&&z>=8&&z<12));
  }
  function drawGround(){
    const grad=ctx.createLinearGradient(0,0,0,world.h);grad.addColorStop(0,'#d7e8b6');grad.addColorStop(.52,'#c7dea1');grad.addColorStop(1,'#b8d08f');ctx.fillStyle=grad;ctx.fillRect(0,0,world.w,world.h);
    for(let x=-14;x<=14;x++)for(let z=-14;z<=14;z++){
      const p=[point(x-.5,z-.5),point(x+.5,z-.5),point(x+.5,z+.5),point(x-.5,z+.5)];
      const n=noise(x,z);polygon(p,palette.grass[Math.floor(n*palette.grass.length)]);
      if(!isRoad(x,z)&&n>.90){const c=point(x+(n-.95)*2,z+(noise(z,x)-.5)*.4);ctx.fillStyle=n>.96?'#dce7a4':'#f2e7a0';ctx.fillRect(c.x-1,c.y-2,2,3)}
      if(isRoad(x,z)){
        const shade=palette.road[Math.floor(noise(x+11,z-8)*palette.road.length)];
        polygon(p,shade);
        for(let row=-1;row<=1;row++)for(let col=-1;col<=1;col++){
          if(noise(x*4+col,z*4+row)<.12)continue;
          const ox=col*.22+(row%2)*.10,oz=row*.23;
          const c=point(x+ox,z+oz);const rw=world.unit*.12,rh=world.unit*.075;
          ctx.fillStyle=noise(col+x,row+z)>.5?'#b49d77':'#e4d1aa';ctx.fillRect(Math.round(c.x-rw),Math.round(c.y-rh),Math.max(1,rw*2),Math.max(1,rh*2));
        }
      }
    }
  }

  function drawHouse(b){
    const h=1.65;oval(b.x+.18,b.z+.1,b.w*.75,b.d*.75,'#72694b28');
    box(b.x,b.z,b.w,b.d,h,{front:b.wall,side:shade(b.wall,.83),top:shade(b.wall,1.08)});
    polygon([[b.x-b.w*.66,b.z,h],[b.x,b.z-b.d*.67,h+.78],[b.x+b.w*.66,b.z,h],[b.x,b.z+b.d*.67,h+.78]],b.roof,'#76503e80',.8);
    // chimney and warm little windows
    box(b.x+b.w*.28,b.z-.35,.34,.36,.95,{front:'#b78266',side:'#9b6855',top:'#d0a17b'});
    const f=point(b.x+.01,b.z+b.d*.51,h*.56),g=point(b.x-.53,b.z+b.d*.51,h*.57);
    rounded(f.x-3,f.y-4,6,8,2,'#91a7a0');rounded(g.x-3,g.y-4,6,8,2,'#f5d992');
    const door=point(b.x+.53,b.z+b.d*.51,.56);rounded(door.x-4,door.y-8,8,13,3,'#9b6348');
    polygon([[b.x+.53,b.z+b.d*.51,.83],[b.x+.23,b.z+b.d*.51,.55],[b.x+.83,b.z+b.d*.51,.55]],'#e8bd73');
  }
  function shade(hex,f){
    const n=parseInt(hex.slice(1),16),r=Math.max(0,Math.min(255,((n>>16)&255)*f|0)),g=Math.max(0,Math.min(255,((n>>8)&255)*f|0)),b=Math.max(0,Math.min(255,(n&255)*f|0));return `rgb(${r},${g},${b})`;
  }
  function drawRoof(x,z,w,d,h,color){
    const apex=point(x,z,h+1.55),a=point(x-w*.7,z,h+.25),b=point(x,z-d*.7,h+.25),c=point(x+w*.7,z,h+.25),e=point(x,z+d*.7,h+.25);
    polygon([a,b,apex],shade(color,.85));polygon([b,c,apex],color);polygon([c,e,apex],shade(color,.74));polygon([e,a,apex],shade(color,1.06));
  }
  function drawCastle(b){
    oval(b.x+.2,b.z+.1,4,3,'#76684b30');
    box(b.x,b.z,5.6,3.8,2.4,{front:'#ead9b1',side:'#cfbc91',top:'#f2e4c4'});
    // battlements along the sunny front wall
    for(let i=-2;i<=2;i++)box(b.x+i*1.02,b.z+1.89,.48,.34,.44,{front:'#f4e3bf',side:'#d4c199',top:'#fff0cd'});
    [[-2.25,-1.45],[2.25,-1.45],[-2.25,1.45],[2.25,1.45]].forEach(([dx,dz],i)=>{
      box(b.x+dx,b.z+dz,1.18,1.18,3.1,{front:'#f1e0bb',side:'#d5c194',top:'#fbefce'});
      drawRoof(b.x+dx,b.z+dz,1.08,1.08,3.08,i===0?'#b95748':'#c4674c');
      const win=point(b.x+dx+.02,b.z+dz+.59,2.05);rounded(win.x-3,win.y-6,6,10,3,'#8eaa9b');
    });
    box(b.x,b.z-.1,2.1,1.8,3.15,{front:'#f4e5c4',side:'#d6c49c',top:'#fff0d0'});
    drawRoof(b.x,b.z-.1,2.05,1.8,3.15,'#ae5547');
    const door=point(b.x+.02,b.z+.98,1.05);rounded(door.x-7,door.y-20,14,26,7,'#795241');
    const arch=point(b.x+.02,b.z+.98,1.91);ctx.beginPath();ctx.arc(arch.x,arch.y+5,7,Math.PI,0);ctx.fillStyle='#795241';ctx.fill();
    // pennants
    [[-2.25,-1.45],[2.25,-1.45],[0,-.1]].forEach(([dx,dz],i)=>{const p=point(b.x+dx,b.z+dz,4.7);ctx.fillStyle='#9f4e43';ctx.fillRect(p.x-1,p.y-13,2,13);polygon([{x:p.x,y:p.y-13},{x:p.x+9,y:p.y-10},{x:p.x,y:p.y-6}],'#ba6750')});
  }
  function drawStall(s){
    oval(s.x,s.z+.05,.9,.7,'#76694b23');box(s.x,s.z,.95,.76,.62,{front:'#936647',side:'#704d3b',top:'#bd8c57'});
    const a=point(s.x-.72,s.z-.58,1.28),b=point(s.x+.72,s.z-.58,1.28),c=point(s.x+.72,s.z+.58,1.28),d=point(s.x-.72,s.z+.58,1.28);
    polygon([a,b,c,d],'#f4dfb8','#8e6246',1);
    for(let i=0;i<5;i++){const t=i/5,aa=point(s.x-.72+t*1.44,s.z-.58,1.29),bb=point(s.x-.72+(t+.5)*1.44,s.z-.58,1.29);polygon([aa,bb,{x:bb.x,y:bb.y+world.unit*.18},{x:aa.x,y:aa.y+world.unit*.18}],i%2?s.color:'#f4e4c1')}
    for(let i=-1;i<=1;i++){const p=point(s.x+i*.25,s.z-.58,1.35);ctx.fillStyle=i===0?'#ecbf61':'#89a66e';ctx.beginPath();ctx.arc(p.x,p.y,world.unit*.1,0,Math.PI*2);ctx.fill()}
  }
  function drawTree(t){
    const {x,z,scale}=t,u=world.unit*scale;oval(x,z+.1,.9*scale,.72*scale,'#55724727');
    box(x,z,.35*scale,.35*scale,1.08*scale,{front:'#8b6947',side:'#705239',top:'#ad8054'});
    const c=point(x,z,1.45*scale),r=u*.66;
    const colors=palette.leaf;const main=colors[t.variant];
    // stepped, blocky canopy clusters
    [[0,-.48,.63],[.42,-.22,.51],[-.43,-.15,.55],[.04,.18,.57],[0,-.05,.72]].forEach(([dx,dy,m,i])=>{
      ctx.fillStyle=colors[(t.variant+(i||0))%colors.length];ctx.fillRect(c.x+dx*u-r*m,c.y+dy*u-r*m*.58,r*m*2,r*m*1.18);
    });
    ctx.fillStyle='#c7d994';ctx.fillRect(c.x-r*.28,c.y-r*.5,Math.max(2,r*.43),Math.max(2,r*.2));
  }
  function drawFountain(time){
    const x=0,z=0;oval(x,z+.3,2.1,1.55,'#56654432');
    // pale stone octagonal basin
    const rim=[[-1.85,-.7],[-1.4,-1.35],[1.35,-1.35],[1.85,-.7],[1.85,.7],[1.35,1.35],[-1.35,1.35],[-1.85,.7]].map(([a,b])=>point(a,z+b,.25));
    polygon(rim,'#d7c396','#9e8865',1);const water=rim.map(p=>({x:p.x,y:p.y-world.unit*.20}));polygon(water,'#82c2bb','#c6dfc7',1);
    const glint=point(.36,-.24,.31);ctx.fillStyle='#d9f1d0';ctx.fillRect(glint.x,glint.y,world.unit*.42,Math.max(2,world.unit*.07));
    box(0,0,.62,.62,.85,{front:'#cbb78b',side:'#a7936e',top:'#e7d5ae'});
    const top=point(0,0,1.25);polygon([{x:top.x,y:top.y-world.unit*.24},{x:top.x+world.unit*.48,y:top.y},{x:top.x,y:top.y+world.unit*.24},{x:top.x-world.unit*.48,y:top.y}], '#ead6a7','#a79069',.8);
    ctx.fillStyle='#86c9bd';ctx.beginPath();ctx.ellipse(top.x,top.y-world.unit*.10,world.unit*.22,world.unit*.12,0,0,Math.PI*2);ctx.fill();
    if(Math.sin(time*1.3)>.86){ctx.fillStyle='#fff3b1';ctx.beginPath();ctx.arc(top.x+Math.sin(time)*world.unit*.36,top.y-world.unit*.6,2,0,Math.PI*2);ctx.fill()}
  }
  function drawWorldObjects(time){
    const list=[];
    buildings.forEach(b=>list.push({d:b.x+b.z,fn:()=>b.type==='castle'?drawCastle(b):drawHouse(b)}));
    stalls.forEach(s=>list.push({d:s.x+s.z,fn:()=>drawStall(s)}));
    trees.forEach(t=>list.push({d:t.x+t.z+.5,fn:()=>drawTree(t)}));
    list.push({d:.6,fn:()=>drawFountain(time)});
    npcs.forEach(n=>list.push({d:n.x+n.z+.2,fn:()=>drawCharacter(n,false,time)}));
    list.push({d:player.x+player.z,fn:()=>drawCharacter(player,true,time)});
    list.sort((a,b)=>a.d-b.d);list.forEach(item=>item.fn());
  }
  function drawCharacter(actor,isKing,time){
    const p=point(actor.x,actor.z),u=world.unit,phase=isKing?player.walk:Math.sin(time*5+actor.phase)*.5;
    const moving=isKing?Math.hypot(input.x,input.z)>.1:Math.hypot(actor.walkX||0,actor.walkZ||0)>.1;
    const bob=moving?Math.abs(Math.sin(time*10+(actor.phase||0)))*u*.055:Math.sin(time*1.7+(actor.phase||0))*u*.018;
    const s=u*(isKing?1:.86), headY=p.y-s*1.13-bob, bodyY=p.y-s*.60-bob;
    oval(actor.x,actor.z+.06,.43,.32,'#62593c38');
    if(isKing){
      // flowing scarlet cape and gold shoulder clasp
      polygon([{x:p.x-s*.27,y:bodyY-s*.1},{x:p.x+s*.28,y:bodyY-s*.1},{x:p.x+s*.43+phase*s*.06,y:p.y-s*.1},{x:p.x-s*.4+phase*s*.06,y:p.y-s*.1}],'#a8463d','#853a37',.7);
      polygon([{x:p.x-s*.14,y:bodyY-s*.07},{x:p.x+s*.17,y:bodyY-s*.07},{x:p.x+s*.29,y:p.y-s*.09},{x:p.x-s*.27,y:p.y-s*.09}],'#cf6551');
    }
    const clothes=isKing?'#637e69':actor.color;
    // little tunic, sleeves, and walking boots
    rounded(p.x-s*.30,bodyY-s*.1,s*.60,s*.55,s*.13,clothes);
    ctx.fillStyle=shade(clothes,.83);ctx.fillRect(p.x-s*.35,bodyY+s*.04,s*.15,s*.23);ctx.fillRect(p.x+s*.20,bodyY+s*.04,s*.15,s*.23);
    ctx.fillStyle='#755b4c';ctx.fillRect(p.x-s*.22,p.y-s*.11,s*.15,s*.13);ctx.fillRect(p.x+s*.08,p.y-s*.11,s*.15,s*.13);
    // face and hair
    ctx.fillStyle='#f0c99a';ctx.beginPath();ctx.arc(p.x,headY,s*.225,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=isKing?'#735343':'#795343';ctx.fillRect(p.x-s*.18,headY-s*.11,s*.36,s*.105);
    ctx.fillStyle='#594437';ctx.fillRect(p.x+s*.07,headY-s*.005,Math.max(1,s*.045),Math.max(1,s*.045));
    if(isKing){
      // unmistakable golden crown
      const cy=headY-s*.23;polygon([{x:p.x-s*.22,y:cy+s*.12},{x:p.x-s*.2,y:cy-s*.08},{x:p.x-s*.06,y:cy+s*.015},{x:p.x,y:cy-s*.17},{x:p.x+s*.08,y:cy+s*.015},{x:p.x+s*.21,y:cy-s*.08},{x:p.x+s*.22,y:cy+s*.12}], '#e9b64f','#a77935',.7);
      ctx.fillStyle='#f6dc89';ctx.fillRect(p.x-s*.19,cy+s*.08,s*.38,s*.08);
    }else if(actor.role==='Guard'){
      ctx.fillStyle='#738ba1';ctx.fillRect(p.x-s*.22,headY-s*.24,s*.44,s*.12);ctx.fillStyle='#e2bd78';ctx.fillRect(p.x-s*.23,headY-s*.13,s*.46,s*.045);
    }else if(actor.role==='Merchant'){
      ctx.fillStyle='#95694c';ctx.fillRect(p.x-s*.25,headY-s*.21,s*.5,s*.07);ctx.fillRect(p.x-s*.16,headY-s*.3,s*.32,s*.11);
    }else{
      ctx.fillStyle='#8c6953';ctx.fillRect(p.x-s*.23,headY-s*.21,s*.46,s*.08);
    }
    if(isKing&&Math.sin(time*1.4)>.985){ctx.fillStyle='#fff0a8';ctx.fillRect(p.x+s*.30,headY-s*.35,2,2)}
  }
  function update(dt,time){
    let dx=input.x,dz=input.z;
    if(input.keys.has('arrowleft')||input.keys.has('a'))dx-=1;
    if(input.keys.has('arrowright')||input.keys.has('d'))dx+=1;
    if(input.keys.has('arrowup')||input.keys.has('w'))dz-=1;
    if(input.keys.has('arrowdown')||input.keys.has('s'))dz+=1;
    const len=Math.hypot(dx,dz);if(len>1){dx/=len;dz/=len}
    if(len>.08){const speed=3.0;player.x=Math.max(-11,Math.min(11,player.x+dx*speed*dt));player.z=Math.max(-12,Math.min(12,player.z+dz*speed*dt));player.faceX=dx;player.faceZ=dz;player.walk+=dt*9}
    npcs.forEach(n=>{
      n.next-=dt;
      if(n.next<=0){n.next=2.2+noise(n.seed,time)*4.5;n.walkX=(noise(n.seed,time+4)-.5)*.8;n.walkZ=(noise(n.seed,time+9)-.5)*.8;if(Math.random()<.28)n.walkX=n.walkZ=0}
      if(Math.hypot(n.x-n.homeX,n.z-n.homeZ)>1.25){n.walkX=(n.homeX-n.x)*.5;n.walkZ=(n.homeZ-n.z)*.5}
      n.x+=n.walkX*dt;n.z+=n.walkZ*dt;
    });
    const targetX=player.x,targetZ=player.z;
    world.camX+=(targetX-world.camX)*Math.min(1,dt*2.7);world.camZ+=(targetZ-world.camZ)*Math.min(1,dt*2.7);
    nearest=null;let best=2.3;
    for(const n of npcs){const d=Math.hypot(n.x-player.x,n.z-player.z);if(d<best){best=d;nearest=n}}
    ui.interact.disabled=!nearest;ui.hint.textContent=nearest?`Say hello to ${nearest.name}`:'Greet a neighbor';
    if(greetingTimer>0){greetingTimer-=dt;if(greetingTimer<=0){player.greeting=false}}
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.remove('show')}
    const loc=Math.hypot(player.x,player.z)<2.7?'Fountain Square':player.z<-6?'Castle Hill':Math.abs(player.x)>6?'Cottage Lane':player.z>6?'South Meadow':'Market Street';
    ui.location.textContent=loc;
  }
  function interact(){
    if(!nearest){showToast('Step a little closer to someone in town ✨');return}
    const options=npcLines[nearest.role]||npcLines.Villager;const line=options[Math.floor(Math.random()*options.length)];
    ui.speaker.textContent=nearest.name;ui.role.textContent=nearest.role.toUpperCase();ui.avatar.textContent=nearest.role==='Guard'?'♜':nearest.role==='Merchant'?'✿':'♟';ui.speech.textContent=line;
    ui.dialogue.hidden=false;player.greeting=true;ui.quest.textContent='✓';ui.quest.classList.add('done');
    showToast('A lovely chat with '+nearest.name+'! ✨');
  }
  function showToast(message){ui.toast.textContent=message;ui.toast.classList.add('show');toastTimer=2.8}
  ui.interact.addEventListener('click',interact);ui.close.addEventListener('click',()=>ui.dialogue.hidden=true);ui.dialogue.addEventListener('click',e=>{if(e.target===ui.dialogue)ui.dialogue.hidden=true});
  window.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();
    if(k==='e'||k===' '){if(!e.repeat)interact();return}input.keys.add(k);
  });
  window.addEventListener('keyup',e=>input.keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>input.keys.clear());
  ui.joystick.addEventListener('pointerdown',e=>{e.preventDefault();input.pointer=e.pointerId;ui.joystick.setPointerCapture(e.pointerId);moveStick(e)});
  ui.joystick.addEventListener('pointermove',e=>{if(input.pointer===e.pointerId)moveStick(e)});
  function moveStick(e){const r=ui.joystick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.31,len=Math.hypot(dx,dy),scale=len>max?max/len:1;const x=dx*scale,y=dy*scale;input.x=x/max;input.z=y/max;ui.knob.style.transform=`translate(${x}px,${y}px)`}
  function resetStick(e){if(input.pointer===e.pointerId){input.pointer=null;input.x=input.z=0;ui.knob.style.transform='translate(0,0)'}}
  ui.joystick.addEventListener('pointerup',resetStick);ui.joystick.addEventListener('pointercancel',resetStick);ui.joystick.addEventListener('lostpointercapture',resetStick);

  function drawAmbient(time){
    // Faraway birds drift lazily above the rooftops.
    for(let i=0;i<3;i++){
      const x=((time*.65+i*173)%(world.w+80))-40,y=world.h*.23+Math.sin(time*.7+i*2)*8+i*12;
      if(x<world.w*.3||x>world.w*.82)continue;
      const wing=Math.sin(time*5+i)*2.5;ctx.strokeStyle='#7d956a88';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-5,y+wing);ctx.quadraticCurveTo(x,y-2,x+5,y-wing);ctx.stroke();
    }
  }
  function render(time){
    drawGround();drawWorldObjects(time);drawAmbient(time);
  }
  const chords=[[261.63,329.63,392],[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66]];
  function playChord(index=0){
    if(!musicOn||!music)return;
    const now=music.currentTime,notes=chords[index%chords.length];
    notes.forEach((hz,i)=>{
      const osc=music.createOscillator(),gain=music.createGain();osc.type=i===0?'sine':'triangle';osc.frequency.value=hz;
      gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(i===0?.025:.012,now+.22);gain.gain.exponentialRampToValueAtTime(.0001,now+2.35);
      osc.connect(gain);gain.connect(music.destination);osc.start(now);osc.stop(now+2.4);
    });
    // Tiny bell-like note, softly tucked into the melody.
    const bell=music.createOscillator(),bellGain=music.createGain();bell.type='sine';bell.frequency.value=notes[2]*2;
    bellGain.gain.setValueAtTime(.0001,now);bellGain.gain.exponentialRampToValueAtTime(.009,now+.04);bellGain.gain.exponentialRampToValueAtTime(.0001,now+1.15);bell.connect(bellGain);bellGain.connect(music.destination);bell.start(now+.32);bell.stop(now+1.2);
    musicTimer=window.setTimeout(()=>playChord(index+1),2550);
  }
  ui.sound.addEventListener('click',async()=>{
    if(!musicOn){
      try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){showToast('This browser does not support background music.');return}music=music||new Audio();await music.resume();musicOn=true;ui.soundIcon.textContent='♫';ui.soundText.textContent='Music on';ui.sound.setAttribute('aria-label','Turn music off');playChord()}
      catch{showToast('Could not start music. Please try again.');}
    }else{musicOn=false;window.clearTimeout(musicTimer);if(music)music.suspend();ui.soundIcon.textContent='♫';ui.soundText.textContent='Music off';ui.sound.setAttribute('aria-label','Turn music on')}
  });
  function frame(now){const time=now/1000,dt=Math.min(.04,(now-lastTime)/1000||0);lastTime=now;update(dt,time);render(time);requestAnimationFrame(frame)}
  requestAnimationFrame(frame);
})();
