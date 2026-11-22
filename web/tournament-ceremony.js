/* Procedural 3D tournament ceremonies: elf/dwarf faction assignment,
 * the gold cup, and silver/bronze numbered medals. No remote assets.
 * Server chooses the faction and the podium rank; this file only presents. */
(()=>{
 'use strict';
 let running=null;
 const durationFaction=5800,durationAward=7400;
 const el=(tag,className,text)=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
 };
 const colorForRank=rank=>rank===1?0xecc166:rank===2?0xd7dce1:0xba7950;
 const nameForRank=rank=>rank===1?'COUPE D’OR':rank===2?'MÉDAILLE D’ARGENT':'MÉDAILLE DE BRONZE';

 function buildMedal(THREE,rank){
  const root=new THREE.Group();
  const tone=colorForRank(rank);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.96,.08,14,72),
    new THREE.MeshStandardMaterial({color:tone,metalness:.9,roughness:.18}));
  rim.position.z=.11;root.add(rim);
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.91,.91,.16,72),
    new THREE.MeshStandardMaterial({color:tone,metalness:.8,roughness:.22}));
  body.rotation.x=Math.PI/2;
  root.add(body);
  const silk=new THREE.Mesh(new THREE.BoxGeometry(.34,1.25,.048),
    new THREE.MeshStandardMaterial({color:0x394d83,roughness:.76}));
  silk.rotation.z=.16;silk.position.set(-.25,1.24,-.12);root.add(silk);
  const silk2=silk.clone();silk2.rotation.z=-.16;silk2.position.x=.25;root.add(silk2);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=rank===2?'#3b4652':'#492d20';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='900 188px Georgia,serif';
  ctx.fillText(String(rank)+'ème',256,258);
  const texture=new THREE.CanvasTexture(canvas);
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(1.53,1.53),
   new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
  plate.position.z=.205;root.add(plate);
  root.userData.ownedTexture=texture;
  return root;
 }

 function buildCup(THREE){
  const group=new THREE.Group();
  const metal=new THREE.MeshStandardMaterial({
   color:0xf1bc4e,metalness:1,roughness:.14,emissive:0x563409,emissiveIntensity:.2});
  const stand=new THREE.Mesh(new THREE.CylinderGeometry(.63,.73,.14,48),metal);
  stand.position.y=-1.13;group.add(stand);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.13,.16,.92,32),metal);
  stem.position.y=-.57;group.add(stem);
  const shape=[
   [.03,-.16],[.38,-.13],[.55,-.03],[.72,.25],[.84,.67],[.88,.85],
   [.82,1.04],[.73,1.07],[.66,.91],[.48,.62],[.27,.37],[.09,.3],
  ].map(([x,y])=>new THREE.Vector2(x,y));
  const bowl=new THREE.Mesh(new THREE.LatheGeometry(shape,64),metal);
  group.add(bowl);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.785,.045,12,60),metal);
  ring.rotation.x=Math.PI/2;ring.position.y=1.04;group.add(ring);
  for(const side of [-1,1]){
   const handle=new THREE.Mesh(new THREE.TorusGeometry(.47,.075,12,52,Math.PI*1.48),
    metal);
   handle.rotation.z=side>0?-.8:2.35;
   handle.position.set(side*.91,.58,0);
   group.add(handle);
  }
  group.scale.setScalar(.85);
  return group;
 }

 async function open(kind,{camp,name,opponent,round,rank}){
  if(running)running.close();
  const existing=document.getElementById('tournament-ceremony');
  if(existing)existing.remove();
  const root=el('div','tournament-ceremony '+kind);
  root.id='tournament-ceremony';root.setAttribute('role','status');
  root.setAttribute('aria-live','polite');
  const canvasSlot=el('div','tournament-ceremony-canvas');
  const copy=el('div','tournament-ceremony-copy');
  const kicker=el('p','tournament-ceremony-kicker',
   kind==='faction'?'ATTRIBUTION DES FACTIONS · RONDE '+round:'CLASSEMENT DU TOURNOI');
  const title=el('h2','tournament-ceremony-title',
   kind==='faction'?(camp==='elf'?'LES ELFES':'LES NAINS'):nameForRank(rank));
  const subtitle=el('p','tournament-ceremony-subtitle',
   kind==='faction'?(name+' · face à '+opponent):rank+'ᵉ place · '+name);
  copy.append(kicker,title,subtitle);
  root.append(canvasSlot,copy);
  document.body.append(root);
  let closed=false,renderer=null,animation=0,materialList=[],texture=null,started=performance.now();
  const close=()=>{
   if(closed)return;
   closed=true;
   cancelAnimationFrame(animation);
   if(renderer){renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
   for(const material of materialList)material.dispose();
   if(texture)texture.dispose();
   root.remove();
   if(running?.close===close)running=null;
  };
  running={close};
  const lifetime=kind==='faction'?durationFaction:durationAward;
  setTimeout(close,lifetime);
  try{
   const THREE=await import('three');
   if(closed)return;
   const scene=new THREE.Scene();
   scene.fog=new THREE.FogExp2(0x101b17,.055);
   const camera=new THREE.PerspectiveCamera(38,1,.1,100);
   camera.position.set(0,1.55,6.3);
   camera.lookAt(0,.25,0);
   const hemilight=new THREE.HemisphereLight(0xf5e7c4,0x1b2820,2.4);
   scene.add(hemilight);
   const keylight=new THREE.DirectionalLight(0xf7ca82,3.6);
   keylight.position.set(-3,5,5);scene.add(keylight);
   const rimlight=new THREE.PointLight(camp==='elf'?0x85d0b2:0xf1a951,35,20);
   rimlight.position.set(2,3,-2);scene.add(rimlight);
   renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,
    powerPreference:'low-power'});
   renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.8));
   const resize=()=>{
    const width=Math.max(1,canvasSlot.clientWidth);
    const height=Math.max(1,canvasSlot.clientHeight);
    renderer.setSize(width,height,false);
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
   };
   canvasSlot.append(renderer.domElement);
   resize();
   let figure;
   if(kind==='faction'){
    const {createFigurine}=await import('/figurines3d.js');
    if(closed)return;
    figure=createFigurine(camp==='elf'?'E':'N',{articulated:true});
    figure.scale.setScalar(2.6);
    figure.position.y=-1.2;
    scene.add(figure);
   }else{
    figure=rank===1?buildCup(THREE):buildMedal(THREE,rank);
    if(figure.userData.ownedTexture)texture=figure.userData.ownedTexture;
    figure.scale.setScalar(1.45);
    figure.position.y=.25;
    scene.add(figure);
   }
   const platformMat=new THREE.MeshStandardMaterial({
    color:0x243a2e,metalness:.62,roughness:.31});
   const platform=new THREE.Mesh(new THREE.CylinderGeometry(1.45,1.58,.23,64),platformMat);
   platform.position.y=-1.45;scene.add(platform);materialList.push(platformMat);
   const glowMat=new THREE.MeshStandardMaterial({
    color:kind==='faction'?camp==='elf'?0x78e2bf:0xddad69:colorForRank(rank),
    emissive:kind==='faction'?camp==='elf'?0x4dbaa5:0xad722c:colorForRank(rank),
    metalness:.7,roughness:.18,emissiveIntensity:.5});
   const circle=new THREE.Mesh(new THREE.TorusGeometry(1.34,.035,8,96),glowMat);
   circle.rotation.x=Math.PI/2;circle.position.y=-1.32;scene.add(circle);
   materialList.push(glowMat);
   const run=now=>{
    if(closed)return;
    const elapsed=(now-started)/1000;
    const sweep=Math.min(1,elapsed/1.15);
    figure.scale.multiplyScalar(1+(0.0005*Math.sin(now/480)));
    figure.rotation.y=-.45+Math.sin(elapsed*.7)*.35;
    figure.position.y=(kind==='faction'?-1.2:.25)+Math.sin(elapsed*1.6)*.04;
    circle.rotation.z=elapsed*.22;
    camera.position.z=6.9-sweep*.8;
    camera.lookAt(0,.05,0);
    renderer.render(scene,camera);
    animation=requestAnimationFrame(run);
   };
   animation=requestAnimationFrame(run);
  }catch(_){
   // WebGL may not exist on a mobile browser. The prominent title, faction
   // and rank remain readable and the underlying 2D board still works.
   root.classList.add('tournament-ceremony-fallback');
  }
  return close;
 }

 function faction(args){return open('faction',args);}
 function award(args){return open('award',args);}
 window.AlfastaflTournamentCeremony={faction,award,close:()=>running?.close()};
})();
