/* Álfastafl DEV — The last stand of the king. Locally animated, server
 * confirmed. Exactly the real 2, 3 or 4 trapping dwarves take part.
 * No artificial capture, network request, downloaded asset or clock change. */
import * as THREE from 'three';
import {createFigurine} from './figurines3d.js';
import {kingSiegePlan,siegeMotion,dwarfStrike} from './king-siege-motion.js';
import {smooth,pulse} from './combat-motion.js';

const SURFACE=.12,UP=new THREE.Vector3(0,1,0);
const world=p=>new THREE.Vector3(p[1]-5,SURFACE,p[0]-5);
const heading=(from,to)=>Math.atan2(to.x-from.x,to.z-from.z);
const clamp=v=>Math.min(1,Math.max(0,v));
function buildCrown(resources) {
 const crown=new THREE.Group();crown.name='couronne-royale-envol';
 const gold=new THREE.MeshStandardMaterial({
  color:0xd5b86a,metalness:.77,roughness:.30,side:THREE.DoubleSide
 });
 const jewel=new THREE.MeshStandardMaterial({
  color:0x9fd5e4,metalness:.36,roughness:.25
 });
 const band=new THREE.TorusGeometry(.145,.040,8,32);
 const point=new THREE.ConeGeometry(.043,.19,5);
 const gem=new THREE.IcosahedronGeometry(.042,0);
 resources.push(gold,jewel,band,point,gem);
 const base=new THREE.Mesh(band,gold);
 base.rotation.x=Math.PI/2;crown.add(base);
 for(let i=0;i<6;i++){
  const angle=i*Math.PI/3;
  const spike=new THREE.Mesh(point,gold);
  spike.position.set(Math.cos(angle)*.14,.11,Math.sin(angle)*.14);
  crown.add(spike);
  if(i%2===0) {
   const stone=new THREE.Mesh(gem,jewel);
   stone.position.set(Math.cos(angle)*.16,.025,Math.sin(angle)*.16);
   crown.add(stone);
  }
 }
 return crown;
}
export class KingSiegeCinematic {
 constructor(board) {
  this.board=board;this.active=false;this._frame=null;
  this.key='';this.progress=0;this.stage='';this.plan=null;
  this.dwarves=[];this.resources=[];this._hidden=[];
  this.shards=[];this.sparks=[];this.onComplete=null;
  this._played=new Set();
 }
 start(event,{duration=8,remaining=duration,onEffect=()=>{},onComplete=()=>{}}={}) {
  this.cancel();
  const board=this.board;
  const plan=kingSiegePlan(event,board._view.board,board._view.mode);
  if(!plan||board.disposed||board.lost||!board.active||!board.renderer||
     document.hidden||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return false;
  duration=Math.max(1,Math.min(15,Number(duration)||8));
  remaining=Math.max(0,Math.min(duration,Number(remaining)||0));
  if(remaining<=.05)return false;
  const originalKing=board._visiblePieces.find(p=>p.userData.piece==='R'&&
   p.userData.square?.[0]===plan.king[0]&&p.userData.square?.[1]===plan.king[1]);
  const originals=plan.attackers.map(a=>board._visiblePieces.find(p=>
   p.userData.piece==='N'&&p.userData.square?.[0]===a.square[0]&&
   p.userData.square?.[1]===a.square[1]));
  if(!originalKing||originals.some(x=>!x))return false;
  this.plan=plan;
  this.duration=duration;
  this.startTime=performance.now()-(duration-remaining)*1000;
  this.progress=(duration-remaining)/duration;
  this.key=String(event.n);
  this.onEffect=onEffect;this.onComplete=onComplete;
  this._played.clear();
  this.originalCamera=board.camera.position.clone();
  this.originalTarget=board.controls.target.clone();
  this.originalQuaternion=board.camera.quaternion.clone();
  this.controlsPreviouslyEnabled=board.controls.enabled;
  board.controls.enabled=false;
  board._cancelGesture();
  this.active=true;
  this.kingPosition=world(plan.king);
  this.scene=new THREE.Group();this.scene.name='Dernier combat du roi';
  board.scene.add(this.scene);
  for(const figure of [originalKing,...originals]){
   figure.visible=false;this._hidden.push(figure);
  }
  this.king=createFigurine('R',{articulated:true});
  this.king.name='roi-dernière-résistance';
  this.king.position.copy(this.kingPosition);
  this.king.rotation.y=originalKing.rotation.y;
  this.kingRight=this.king.getObjectByName('combat-right-arm');
  this.kingLeft=this.king.getObjectByName('combat-left-arm');
  this.kingHead=this.king.getObjectByName('combat-head');
  this.scene.add(this.king);
  this.dwarves=plan.attackers.map((entry,index)=>{
   const figure=createFigurine('N',{articulated:true});
   figure.name='nain-assiégeant-'+String(index+1);
   const target=world(entry.square);
   const source=entry.moved?world(plan.from):target.clone();
   figure.position.copy(source);
   figure.rotation.y=heading(target,this.kingPosition);
   this.scene.add(figure);
   return {entry,index,figure,target,source,
    axe:figure.getObjectByName('combat-right-arm'),
    shield:figure.getObjectByName('combat-left-arm'),
    head:figure.getObjectByName('combat-head'),
    leg:figure.getObjectByName('combat-right-leg')};
  });

  const bronze=new THREE.MeshStandardMaterial({color:0xd5c4a3,metalness:.24,roughness:.64});
  const gold=new THREE.MeshStandardMaterial({color:0xe8cb79,metalness:.67,roughness:.42});
  const shapes=[
   new THREE.TetrahedronGeometry(.084,0),
   new THREE.IcosahedronGeometry(.054,0),
   new THREE.BoxGeometry(.065,.088,.062)
  ];
  this.resources.push(bronze,gold,...shapes);
  for(let i=0;i<30;i++){
   const shard=new THREE.Mesh(shapes[i%3],i%5===0?gold:bronze);
   shard.name='éclat-roi-'+String(i);
   shard.visible=false;
   shard.userData.angle=i*2.3999632297;
   shard.userData.height=.20+(i%8)*.16;
   shard.userData.speed=.37+(i%7)*.12;
   this.scene.add(shard);
   this.shards.push(shard);
  }
  const glow=new THREE.MeshBasicMaterial({color:0xffdc8b,transparent:true,opacity:.72,depthWrite:false});
  const sphere=new THREE.OctahedronGeometry(.037,0);
  const ringGeo=new THREE.RingGeometry(.24,.34,48);
  this.resources.push(glow,sphere,ringGeo);
  this.shockwave=new THREE.Mesh(ringGeo,glow);
  this.shockwave.name='choc-de-haches';
  this.shockwave.rotation.x=-Math.PI/2;
  this.shockwave.position.copy(this.kingPosition);
  this.shockwave.position.y+=.035;
  this.shockwave.visible=false;this.scene.add(this.shockwave);
  for(let i=0;i<18;i++){
   const spark=new THREE.Mesh(sphere,glow);
   spark.visible=false;spark.userData.angle=i*2.3999632297;
   this.scene.add(spark);this.sparks.push(spark);
  }
  this.crown=buildCrown(this.resources);
  this.crown.visible=false;this.scene.add(this.crown);
  const n=this.dwarves.length;
  this.cues=[['approach',.05,'move'],['defiance',.19,'king-defiance']];
  for(let i=0;i<n;i++){
   const slot=.32/n,at=.245+(i+.57)*slot;
   this.cues.push(['blow-'+i,at,'dwarven-axe']);
  }
  this.cues.push(['king-parries',.44,'guard'],['final-axes',.71,'dwarven-axe'],
   ['crown',.79,'royal-crown-fall'],['fracture',.84,'shatter'],
   ['victory',.93,'dwarven-victory']);
  for(const [id,time] of this.cues)if(this.progress>=time)this._played.add(id);
  this._loop();
  return true;
 }
 _sounds(){
  for(const [id,time,sound] of this.cues){
   if(this.progress>=time&&!this._played.has(id)){
    this._played.add(id);
    try{this.onEffect(sound);}catch(_){}
   }
  }
 }
 _loop(){
  if(!this.active)return;
  const board=this.board;
  if(board.disposed||board.lost||!board.active||document.hidden){this.cancel();return;}
  const t=this.progress=clamp((performance.now()-this.startTime)/(this.duration*1000));
  this._pose(t);
  this._sounds();
  board._requestDraw();
  if(t>=1){this.cancel();return;}
  this._frame=requestAnimationFrame(()=>this._loop());
 }
 _pose(t){
  const board=this.board,m=siegeMotion(t,smooth,pulse),n=this.dwarves.length;
  this.phases=m;this.progress=t;
  this.stage=t<.18?'Les nains encerclent le roi':
   t<.43?'Le roi défend son trône':
   t<.62?'Les haches se succèdent':
   t<.81?'La frappe des nains':'Le roi tombe !';
  const active= this.dwarves[Math.min(n-1,
    Math.max(0,Math.floor((t-.245)/(.32/n))))];
  const kingYaw=heading(this.kingPosition,active?.target||this.dwarves[0].target);
  this.king.position.copy(this.kingPosition);
  this.king.position.y=SURFACE+.065*m.kingGuard-.19*m.collapse;
  this.king.rotation.y=kingYaw+.11*Math.sin(11*t)*m.kingGuard;
  this.king.rotation.z=-.12*m.kingGuard-.77*m.collapse*(1-m.fracture);
  this.king.rotation.x=.09*m.threat+.30*m.collapse;
  this.king.scale.setScalar(Math.max(.001,1-m.fracture));
  this.king.visible=m.fracture<.992;
  if(this.kingRight){
   this.kingRight.rotation.x=-.43*m.threat-.95*m.kingGuard+.24*m.collapse;
   this.kingRight.rotation.z=.54*m.kingGuard+.15*m.threat;
  }
  if(this.kingLeft){
   this.kingLeft.rotation.z=-.67*m.kingGuard+.16*m.collapse;
   this.kingLeft.rotation.x=-.24*m.kingGuard;
  }
  if(this.kingHead)this.kingHead.rotation.y=-.24*m.kingGuard+.34*m.collapse;

  for(const dwarf of this.dwarves){
   const attack=dwarfStrike(t,dwarf.index,n,pulse);
   const target=dwarf.target;
   const vector=this.kingPosition.clone().sub(target).setY(0);
   vector.normalize();
   const forward=attack.strike*.10+attack.finisher*.16;
   dwarf.figure.position.copy(dwarf.source).lerp(target,dwarf.entry.moved?m.move:1);
   dwarf.figure.position.addScaledVector(vector,forward);
   dwarf.figure.position.y=SURFACE+.07*attack.windup+.05*attack.finisher;
   dwarf.figure.rotation.y=heading(target,this.kingPosition);
   dwarf.figure.rotation.z=-.07*attack.strike-.14*attack.finisher;
   if(dwarf.axe){
    dwarf.axe.rotation.x=-1.13*attack.windup+1.35*attack.strike+
     1.68*attack.finisher;
    dwarf.axe.rotation.z=1.10*attack.windup-.79*attack.strike-.97*attack.finisher;
   }
   if(dwarf.shield){
    dwarf.shield.rotation.x=-.23*attack.windup;
    dwarf.shield.rotation.z=-.44*attack.windup-.22*attack.finisher;
   }
   if(dwarf.head)dwarf.head.rotation.y=.14*attack.strike-.18*attack.finisher;
   if(dwarf.leg)dwarf.leg.rotation.x=-.25*attack.finisher;
  }
  const shock=m.shock;
  this.shockwave.visible=shock>.04;
  this.shockwave.scale.setScalar(1+6*(1-shock));
  this.shockwave.material.opacity=.58*shock;
  for(const spark of this.sparks){
   const angle=spark.userData.angle;
   const flying=shock>.06&&m.fracture<.99;
   spark.visible=flying;
   if(!flying)continue;
   spark.position.copy(this.kingPosition);
   spark.position.x+=Math.cos(angle)*(.26+1.32*(1-shock));
   spark.position.z+=Math.sin(angle)*(.26+1.32*(1-shock));
   spark.position.y+=.46+Math.sin(angle*1.8)*.35;
   spark.scale.setScalar(.35+.74*shock);
  }
  for(const shard of this.shards){
   shard.visible=t>=.82&&t<.995;
   if(!shard.visible)continue;
   const age=Math.min(1.5,Math.max(0,(t-.82)*this.duration));
   const a=shard.userData.angle;
   const speed=shard.userData.speed;
   shard.position.set(
    this.kingPosition.x+Math.sin(a)*age*speed,
    Math.max(SURFACE+.018,SURFACE+shard.userData.height+
     (0.62+(shard.userData.height%3))*age-1.97*age*age),
    this.kingPosition.z+Math.cos(a)*age*speed);
   shard.rotation.set(a*age*1.2,age*4.3,age*3.9);
   shard.scale.setScalar((1-smooth(t,.95,1))*.92+.08);
  }
  this.crown.visible=t>.69&&t<.99;
  if(this.crown.visible){
   const a=m.crown;
   this.crown.position.copy(this.kingPosition);
   this.crown.position.y+=1.41+.62*Math.sin(Math.PI*a)-1.30*a;
   const lateral=new THREE.Vector3(-Math.cos(kingYaw),0,Math.sin(kingYaw));
   this.crown.position.addScaledVector(lateral,.65*a);
   this.crown.rotation.set(.7*a,3.3*a,-1.1*a);
  }

  const focus=m.camera;
  const dir=this.originalCamera.clone().sub(this.originalTarget).normalize();
  dir.applyAxisAngle(UP,.29*Math.sin(t*Math.PI*2.5));
  const shot=this.kingPosition.clone().addScaledVector(dir,8.3-1.20*m.kingGuard-1.60*m.shock);
  shot.y=Math.max(3.50,shot.y);
  const tremor=.038*m.kingGuard+.092*m.shock;
  shot.x+=tremor*Math.sin(t*171);
  shot.y+=tremor*.55*Math.sin(t*204);
  const target=this.kingPosition.clone();target.y=.65;
  board.controls.target.copy(this.originalTarget).lerp(target,focus);
  board.camera.position.copy(this.originalCamera).lerp(shot,focus);
  board.camera.lookAt(board.controls.target);
 }
 cancel(){
  if(this._frame!==null){cancelAnimationFrame(this._frame);this._frame=null;}
  if(!this.active)return;
  this.active=false;
  const board=this.board;
  for(const original of this._hidden)original.visible=true;
  this._hidden.length=0;
  if(this.scene){board.scene.remove(this.scene);this.scene.clear();this.scene=null;}
  for(const resource of this.resources)resource.dispose();
  this.resources.length=0;
  if(this.originalCamera&&board.camera&&board.controls){
   board.camera.position.copy(this.originalCamera);
   board.controls.target.copy(this.originalTarget);
   board.camera.quaternion.copy(this.originalQuaternion);
   board.controls.enabled=this.controlsPreviouslyEnabled;
   board._requestDraw();
  }
  this.king=null;this.dwarves=[];this.shards=[];this.sparks=[];this.crown=null;
  this.shockwave=null;this.plan=null;this.stage='';
  if(this.onComplete){
   const done=this.onComplete;this.onComplete=null;
   try{done();}catch(_){}
  }
 }
}
