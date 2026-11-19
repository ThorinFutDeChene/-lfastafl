/* Cinematic presentation: no rule decisions, solely server-confirmed capture events.
 * Figurines stay stone/bronze sculptures. All assets are locally generated. */
import * as THREE from 'three';
import {createFigurine} from './figurines3d.js';

const SURFACE = .12;
const good = p => Array.isArray(p) && p.length === 2 &&
 p.every(v => Number.isInteger(v) && v>=0 && v<11);
const world = p => new THREE.Vector3(p[1]-5,SURFACE,p[0]-5);
const ease = u => {const t=Math.max(0,Math.min(1,u));return t*t*(3-2*t);};
const tween = (u,a,b) => ease((u-a)/(b-a));
const clone = kind => {
 const fig=createFigurine(kind);
 fig.traverse(obj=>{if(obj.isMesh){obj.castShadow=false;obj.receiveShadow=true;}});
 return fig;
};
function validRecord(event) {
 return Boolean(event && Number.isInteger(event.n) &&
  good(event.from)&&good(event.to)&&['N','E','R'].includes(event.piece)&&
  Array.isArray(event.captured) &&
  event.captured.every(row=>Array.isArray(row)&&row.length===3&&
   good(row.slice(0,2))&&['N','E','R'].includes(row[2])) &&
  (event.captured.length || event.reason==='king_captured'));
}

export class CaptureCinematic {
 constructor(board) {
  this.board=board;
  this.active=false;
  this._frame=null;
  this._nodes=[];
  this._resources=[];
  this._hidden=[];
  this._resolved=null;
  this.progress=0;
  this.key='';
 }
 start(event,{duration=8,remaining=duration,onEffect=()=>{},onComplete=()=>{}}={}) {
  this.cancel();
  const board=this.board;
  if(!validRecord(event) || board.disposed || board.lost || !board.renderer || !board.active)return false;
  duration=Math.max(1,Math.min(15,Number(duration)||8));
  remaining=Math.max(0,Math.min(duration,Number(remaining)||0));
  if(remaining <= .05)return false;
  this.duration=duration;
  this.startTime=performance.now()-(duration-remaining)*1000;
  this.active=true;this.key=String(event.n);this.progress=0;
  this.onEffect=onEffect;
  this.onComplete=onComplete;
  this.effectsPlayed=new Set();
  const initial=(duration-remaining)/duration;
  for(const [tag,at] of [['move',.025],['swing',.24],['strike',.44],
                          ['break',.57],['king',.67]]) {
   if(initial>=at) this.effectsPlayed.add(tag);
  }
  this.originalCamera=board.camera.position.clone();
  this.originalTarget=board.controls.target.clone();
  this.controlsPreviouslyEnabled=board.controls.enabled;
  board.controls.enabled=false;
  board._cancelGesture();
  const target=world(event.to),source=world(event.from);
  const center=target.clone();
  const victims=event.captured.slice(0,12).map(([row,col,kind])=>({
   kind,at:[row,col],place:world([row,col])}));
  if(event.reason==='king_captured'&&!victims.some(v=>v.kind==='R')) {
   for(let row=0;row<11;row++) for(let col=0;col<11;col++) {
    if(board._view.board[row]?.[col]==='R') victims.push({
     kind:'R',at:[row,col],place:world([row,col])});
   }
  }
  this.victims=victims;
  const affected=[event.to,...victims.map(v=>v.at)];
  for(const figure of board._visiblePieces) {
   if(affected.some(p=>figure.userData.square?.[0]===p[0]&&
     figure.userData.square?.[1]===p[1])) {
    this._hidden.push(figure);
    figure.visible=false;
   }
  }
  this.scene=new THREE.Group();
  this.scene.name='Capture animée — sculptures';
  board.scene.add(this.scene);
  this.attacker=clone(event.piece);
  this.attacker.position.copy(source);
  this.fromPosition=source.clone();this.destination=target.clone();
  const original=board._visiblePieces.find(fig=>fig.userData.square?.[0]===event.to[0]&&
    fig.userData.square?.[1]===event.to[1]);
  this.attacker.rotation.y=original?.rotation.y || 0;
  this.scene.add(this.attacker);
  this.actors=victims.map((v,i)=>{
   const figure=clone(v.kind);
   figure.position.copy(v.place);
   figure.rotation.y=Math.atan2(target.x-v.place.x,target.z-v.place.z);
   this.scene.add(figure);
   return {figure,place:v.place,kind:v.kind,index:i};
  });
  for(const actor of this.actors) {
   const palette=actor.kind==='N'?0xba8955:actor.kind==='R'?0xeec97b:0xc8d2c8;
   const mat=new THREE.MeshStandardMaterial({color:palette,metalness:actor.kind==='N'?.5:.08,roughness:.8});
   const geo=new THREE.TetrahedronGeometry(.065,0);
   this._resources.push(mat,geo);
   actor.shards=[];
   for(let j=0;j<12;j++) {
    const angle=(j*2.399963+actor.index*.62),rad=.18+((j*7)%9)*.02;
    const shard=new THREE.Mesh(geo,mat);
    shard.position.copy(actor.place);
    shard.position.y+=.22+((j*3)%7)*.09;
    shard.scale.setScalar(.72+((j*5)%4)*.24);
    shard.userData.velocity=new THREE.Vector3(Math.sin(angle)*rad,
     .3+((j*11)%8)*.045,Math.cos(angle)*rad);
    shard.visible=false;
    this.scene.add(shard);
    actor.shards.push(shard);
   }
  }
  this.ringMaterial=new THREE.MeshBasicMaterial({color:event.reason==='king_captured'?0xffe2a0:0xe5a963,
   transparent:true,opacity:0,depthWrite:false});
  this.ringGeometry=new THREE.RingGeometry(.25,.32,48);
  this._resources.push(this.ringMaterial,this.ringGeometry);
  this.ring=new THREE.Mesh(this.ringGeometry,this.ringMaterial);
  this.ring.rotation.x=-Math.PI/2;this.ring.position.copy(target);this.ring.position.y+=.10;
  this.scene.add(this.ring);
  for(const actor of this.actors)center.add(actor.place);
  center.divideScalar(1+this.actors.length);
  const vector=this.originalCamera.clone().sub(this.originalTarget).normalize();
  this.combatTarget=center.clone();this.combatTarget.y=.42;
  this.combatCamera=center.clone().addScaledVector(vector,8.5);
  this.combatCamera.y=Math.max(4,this.combatCamera.y);
  this._loop();
  return true;
 }
 _sound(tag,at,name) {
  if(this.progress >= at && !this.effectsPlayed.has(tag)) {
   this.effectsPlayed.add(tag);
   try{this.onEffect(name);}catch(_){}
  }
 }
 _loop() {
  if(!this.active)return;
  const board=this.board;
  if(board.disposed||board.lost){this.cancel();return;}
  this.progress=Math.max(0,Math.min(1,(performance.now()-this.startTime)/(this.duration*1000)));
  const t=this.progress;
  const actor=this.attacker;
  const destination=this.destination;
  const movement=tween(t,0,.27);
  actor.position.copy(this.fromPosition).lerp(destination,movement);
  actor.position.y=SURFACE+Math.sin(Math.PI*movement)*.25;
  this._sound('move',.025,'move');
  this._sound('swing',.24,'swing');
  const lunge=Math.sin(Math.PI*tween(t,.27,.51));
  const first=this.actors[0];
  if(first) {
   actor.rotation.z=-.27*lunge;
   actor.position.x+=(first.place.x-destination.x)*.28*lunge;
   actor.position.z+=(first.place.z-destination.z)*.28*lunge;
  }
  this._sound('strike',.44,'strike');
  this._sound('break',.57,'shatter');
  if(this.actors.some(a=>a.kind==='R'))this._sound('king',.67,'king');
  for(const victim of this.actors) {
   const index=victim.index;
   const impact=.38+Math.min(index*.02,.12);
   const crumble=.47+Math.min(index*.018,.10);
   const recoil=tween(t,impact,Math.min(.88,impact+.25));
   const fracture=tween(t,crumble,Math.min(.83,crumble+.25));
   victim.figure.rotation.z=-recoil*.8;
   victim.figure.position.y=SURFACE+Math.sin(Math.PI*recoil)*.12;
   victim.figure.scale.setScalar(Math.max(.002,1-fracture));
   victim.figure.visible=fracture<.98;
   victim.shards.forEach(shard=>{
    shard.visible=t>crumble+.02&&t<.95;
    const v=shard.userData.velocity;
    const age=fracture*.9;
    shard.position.set(victim.place.x+v.x*age*2,
     SURFACE+.32+v.y*age*2-.36*age*age,
     victim.place.z+v.z*age*2);
    shard.rotation.set(age*v.y*11,age*v.x*9,age*v.z*12);
   });
  }
  const ring=tween(t,.42,.70);
  this.ring.visible=ring<1&&ring>0;
  this.ring.scale.setScalar(.7+ring*6);
  this.ringMaterial.opacity=.67*(1-ring);
  const focus=tween(t,0,.19)*(1-tween(t,.81,1));
  board.controls.target.copy(this.originalTarget).lerp(this.combatTarget,focus);
  board.camera.position.copy(this.originalCamera).lerp(this.combatCamera,focus);
  board.camera.lookAt(board.controls.target);
  board._requestDraw();
  if(t>=1){this.cancel();return;}
  this._frame=requestAnimationFrame(()=>this._loop());
 }
 cancel() {
  if(this._frame!==null){cancelAnimationFrame(this._frame);this._frame=null;}
  if(!this.active)return;
  this.active=false;
  const board=this.board;
  for(const fig of this._hidden)fig.visible=true;
  this._hidden.length=0;
  if(this.scene){board.scene.remove(this.scene);this.scene.clear();this.scene=null;}
  for(const resource of this._resources)resource.dispose();
  this._resources.length=0;
  if(this.originalCamera&&board.camera&&board.controls){
   board.camera.position.copy(this.originalCamera);
   board.controls.target.copy(this.originalTarget);
   board.controls.enabled=this.controlsPreviouslyEnabled;
   board.camera.lookAt(board.controls.target);
   board._requestDraw();
  }
  this.attacker=null;this.actors=[];this.fromPosition=null;this.destination=null;
  if(this.onComplete){const done=this.onComplete;this.onComplete=null;try{done();}catch(_){}}
 }
}
