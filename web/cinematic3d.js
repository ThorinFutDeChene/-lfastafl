/* Álfastafl 0.7: deterministic, local cinematic staging of server-confirmed captures.
 * Each combatant is the same carved statuette as on the board, but with local
 * shoulder, hip and neck joints. The board, clock and captures stay authoritative.
 * No external meshes, textures, soundtracks or animation services are loaded. */
import * as THREE from 'three';
import {createFigurine} from './figurines3d.js';

const SURFACE=.12;
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{const t=clamp(x);return t*t*(3-2*t);};
const phase=(time,from,to)=>ease((time-from)/(to-from));
const good=p=>Array.isArray(p)&&p.length===2&&
 p.every(v=>Number.isInteger(v)&&v>=0&&v<11);
const world=p=>new THREE.Vector3(p[1]-5,SURFACE,p[0]-5);
const lerpAngle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const heading=(from,to)=>Math.atan2(to.x-from.x,to.z-from.z);
const parts=figure=>({
 left:figure.getObjectByName('combat-left-arm'),
 right:figure.getObjectByName('combat-right-arm'),
 leftLeg:figure.getObjectByName('combat-left-leg'),
 rightLeg:figure.getObjectByName('combat-right-leg'),
 head:figure.getObjectByName('combat-head'),
});
function validRecord(event) {
 return Boolean(event&&Number.isInteger(event.n)&&good(event.from)&&good(event.to)&&
  ['N','E','R'].includes(event.piece)&&Array.isArray(event.captured)&&
  event.captured.every(row=>Array.isArray(row)&&row.length===3&&
   good(row.slice(0,2))&&['N','E','R'].includes(row[2]))&&
  (event.captured.length||event.reason==='king_captured'));
}
function sculpture(kind) {
 const figure=createFigurine(kind,{articulated:true});
 figure.traverse(object=>{
  if(object.isMesh){object.castShadow=false;object.receiveShadow=true;}
 });
 return figure;
}

export class CaptureCinematic {
 constructor(board) {
  this.board=board;
  this.active=false;
  this._frame=null;
  this._resources=[];
  this._hidden=[];
  this.actors=[];
  this.progress=0;
  this.key='';
 }
 start(event,{duration=8,remaining=duration,onEffect=()=>{},onComplete=()=>{}}={}) {
  this.cancel();
  const board=this.board;
  if(!validRecord(event)||board.disposed||board.lost||!board.renderer||!board.active||
     document.hidden||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return false;
  duration=Math.max(1,Math.min(15,Number(duration)||8));
  remaining=Math.max(0,Math.min(duration,Number(remaining)||0));
  if(remaining<=.05)return false;
  this.duration=duration;
  this.startTime=performance.now()-(duration-remaining)*1000;
  this.active=true;
  this.key=String(event.n);
  this.progress=0;
  this.onEffect=onEffect;
  this.onComplete=onComplete;
  this.effectsPlayed=new Set();
  this.originalCamera=board.camera.position.clone();
  this.originalTarget=board.controls.target.clone();
  this.controlsPreviouslyEnabled=board.controls.enabled;
  board.controls.enabled=false;
  board._cancelGesture();

  const source=world(event.from);
  const destination=world(event.to);
  const victims=event.captured.slice(0,12).map(([row,col,kind])=>({
   kind,at:[row,col],place:world([row,col])}));
  if(event.reason==='king_captured'&&!victims.some(v=>v.kind==='R')) {
   // Some rule variants immobilise the king instead of removing it. The king
   // still deserves a combat scene, but only when the server reports defeat.
   for(let row=0;row<11;row++)for(let col=0;col<11;col++) {
    if(board._view.board[row]?.[col]==='R')victims.push({
     kind:'R',at:[row,col],place:world([row,col])});
   }
  }
  if(!victims.length){this.cancel();return false;}
  this._hidden=[];
  const squares=[event.to,...victims.map(v=>v.at)];
  for(const figure of board._visiblePieces) {
   if(squares.some(p=>figure.userData.square?.[0]===p[0]&&
     figure.userData.square?.[1]===p[1])) {
    this._hidden.push(figure);
    figure.visible=false;
   }
  }
  this.scene=new THREE.Group();
  this.scene.name='Combat cinématographique — figurines articulées';
  board.scene.add(this.scene);
  this.attacker=sculpture(event.piece);
  this.attacker.position.copy(source);
  this.fromPosition=source;
  this.destination=destination;
  const original=board._visiblePieces.find(figure=>
   figure.userData.square?.[0]===event.to[0]&&figure.userData.square?.[1]===event.to[1]);
  this.initialHeading=original?.rotation.y||0;
  this.attacker.rotation.y=this.initialHeading;
  this.attackerRig=parts(this.attacker);
  this.scene.add(this.attacker);

  // A small shared set of flat stone/bronze fracture shapes rather than
  // dozens of downloadable meshes or one enormous particle system.
  const shapes=[
   new THREE.TetrahedronGeometry(.074,0),
   new THREE.IcosahedronGeometry(.064,0),
   new THREE.BoxGeometry(.09,.065,.073),
  ];
  this._resources.push(...shapes);
  const count=victims.length;
  const slot=(.79-.25)/count;
  this.actors=victims.map((victim,index)=>{
   const figure=sculpture(victim.kind);
   figure.position.copy(victim.place);
   figure.rotation.y=heading(victim.place,destination);
   this.scene.add(figure);
   const mat=new THREE.MeshStandardMaterial({
    color:victim.kind==='N'?0x9b7144:victim.kind==='R'?0xe3dfcd:0xd8d7c5,
    metalness:victim.kind==='N'?.52:.04,roughness:.77,
   });
   this._resources.push(mat);
   const shards=[];
   for(let j=0;j<18;j++) {
    const angle=j*2.399963+index*.73;
    const speed=.30+((j*7)%11)*.041;
    const shard=new THREE.Mesh(shapes[j%shapes.length],mat);
    shard.scale.setScalar(.63+((j*5)%7)*.17);
    shard.position.copy(victim.place);
    shard.position.y+=.15+(j%6)*.16;
    shard.userData.velocity=new THREE.Vector3(
     Math.sin(angle)*speed, .65+((j*11)%9)*.14, Math.cos(angle)*speed);
    shard.userData.startHeight=.11+(j%7)*.16;
    shard.visible=false;
    this.scene.add(shard);
    shards.push(shard);
   }
   return {...victim,index,figure,rig:parts(figure),shards,
    start:.25+index*slot,end:.25+(index+1)*slot};
  });
  this.soundCues=[['move',.025,'move']];
  for(const victim of this.actors) {
   const width=victim.end-victim.start;
   this.soundCues.push(['swing-'+victim.index,victim.start+width*.12,
    event.piece==='E'?'arrow':'swing']);
   this.soundCues.push(['guard-'+victim.index,victim.start+width*.33,'guard']);
   this.soundCues.push(['strike-'+victim.index,victim.start+width*.52,
    victim.kind==='N'?'shield':'strike']);
   this.soundCues.push(['break-'+victim.index,victim.start+width*.62,'shatter']);
   if(victim.kind==='R')this.soundCues.push(['king-'+victim.index,
    victim.start+width*.72,'king']);
  }
  const elapsed=(duration-remaining)/duration;
  for(const [tag,time] of this.soundCues)if(elapsed>=time)this.effectsPlayed.add(tag);

  this.ringMaterial=new THREE.MeshBasicMaterial({
   color:event.reason==='king_captured'?0xffe2a0:0xe5a963,
   transparent:true,opacity:0,depthWrite:false,
  });
  this.ringGeometry=new THREE.RingGeometry(.20,.31,48);
  this._resources.push(this.ringMaterial,this.ringGeometry);
  this.ring=new THREE.Mesh(this.ringGeometry,this.ringMaterial);
  this.ring.rotation.x=-Math.PI/2;
  this.scene.add(this.ring);

  const center=destination.clone();
  for(const victim of this.actors)center.add(victim.place);
  center.divideScalar(1+this.actors.length);
  this.combatTarget=center;
  this.combatTarget.y=.46;
  this.cameraVector=this.originalCamera.clone().sub(this.originalTarget).normalize();
  this._loop();
  return true;
 }
 _sounds() {
  for(const [tag,time,name] of this.soundCues) {
   if(this.progress>=time&&!this.effectsPlayed.has(tag)) {
    this.effectsPlayed.add(tag);
    try{this.onEffect(name);}catch(_){}
   }
  }
 }
 _loop() {
  if(!this.active)return;
  const board=this.board;
  if(board.disposed||board.lost||!board.active||document.hidden) {
   this.cancel();return;
  }
  const t=this.progress=clamp((performance.now()-this.startTime)/(this.duration*1000));
  const travel=phase(t,0,.24);
  const attacker=this.attacker;
  attacker.position.copy(this.fromPosition).lerp(this.destination,travel);
  attacker.position.y=SURFACE+Math.sin(Math.PI*travel)*.20;

  const index=Math.min(this.actors.length-1,
   Math.max(0,Math.floor((t-.25)/(.54/this.actors.length))));
  const opponent=this.actors[index];
  const local=clamp((t-opponent.start)/(opponent.end-opponent.start));
  const attack=Math.sin(Math.PI*local);
  const attackHeading=heading(this.destination,opponent.place);
  attacker.rotation.y=lerpAngle(this.initialHeading,attackHeading,phase(t,.12,.31));
  attacker.rotation.z=-.13*attack;
  attacker.position.x+=(opponent.place.x-this.destination.x)*.23*attack;
  attacker.position.z+=(opponent.place.z-this.destination.z)*.23*attack;
  if(this.attackerRig.right) {
   this.attackerRig.right.rotation.z=.95*attack;
   this.attackerRig.right.rotation.x=-1.05*attack;
  }
  if(this.attackerRig.left) {
   this.attackerRig.left.rotation.z=-.37*attack;
   this.attackerRig.left.rotation.x=-.34*attack;
  }
  if(this.attackerRig.head)this.attackerRig.head.rotation.y=.24*Math.sin(Math.PI*local);
  if(this.attackerRig.leftLeg)this.attackerRig.leftLeg.rotation.x=.22*attack;
  if(this.attackerRig.rightLeg)this.attackerRig.rightLeg.rotation.x=-.26*attack;

  for(const victim of this.actors) {
   const p=clamp((t-victim.start)/(victim.end-victim.start));
   const anticipation=Math.sin(Math.PI*phase(p,.10,.47));
   const impact=phase(p,.45,.65);
   const fracture=phase(p,.56,.88);
   const guard=Math.max(0,anticipation)*(1-fracture);
   if(victim.rig.left) {
    victim.rig.left.rotation.z=-.77*guard;
    victim.rig.left.rotation.x=-.31*guard;
   }
   if(victim.rig.right)victim.rig.right.rotation.x=-.45*guard;
   if(victim.rig.head)victim.rig.head.rotation.y=-.3*guard+.34*impact;
   if(victim.rig.leftLeg)victim.rig.leftLeg.rotation.x=-.12*impact;
   if(victim.rig.rightLeg)victim.rig.rightLeg.rotation.x=.16*impact;
   victim.figure.rotation.z=-.68*impact*(1-fracture);
   victim.figure.position.y=SURFACE+.14*Math.sin(Math.PI*impact)*(1-fracture);
   victim.figure.scale.setScalar(Math.max(.001,1-fracture));
   victim.figure.visible=fracture<.99;
   for(const shard of victim.shards) {
    shard.visible=p>=.58&&t<.985;
    if(!shard.visible)continue;
    // Ballistic shards from several different body heights, with a grounded
    // rebound. The positions are pure functions of the shared elapsed time.
    const age=Math.min(1.30,Math.max(0,(p-.58)*(victim.end-victim.start)*this.duration));
    const velocity=shard.userData.velocity;
    const ground=SURFACE+.022;
    const y=SURFACE+shard.userData.startHeight+velocity.y*age-2.1*age*age;
    shard.position.set(victim.place.x+velocity.x*age,
     Math.max(ground,y),victim.place.z+velocity.z*age);
    shard.rotation.set(age*velocity.y*4.1,age*velocity.x*6.3,age*velocity.z*7.4);
    const fade=1-.76*phase(t,.90,.99);
    shard.scale.setScalar((.63+((victim.index+shard.userData.startHeight*100)%7)*.14)*fade);
   }
  }
  // Impact follows the current duel, not always the attacker's destination.
  const ringProgress=phase(local,.45,.73);
  this.ring.position.copy(opponent.place);
  this.ring.position.y+=.11;
  this.ring.visible=local>.45&&local<.76;
  this.ring.scale.setScalar(.7+ringProgress*4.7);
  this.ringMaterial.opacity=.73*(1-ringProgress);

  // Choreographed camera on each device: identical combat timeline, but
  // spectators retain their own initial perspective and get it back on skip.
  const focus=phase(t,0,.18)*(1-phase(t,.82,1));
  const sweep=.24*Math.sin(t*Math.PI*2);
  const offset=this.cameraVector.clone()
   .applyAxisAngle(new THREE.Vector3(0,1,0),sweep)
   .multiplyScalar(8.7-1.1*Math.sin(Math.PI*t));
  const camera=this.combatTarget.clone().add(offset);
  camera.y=Math.max(3.8,camera.y);
  board.controls.target.copy(this.originalTarget).lerp(this.combatTarget,focus);
  board.camera.position.copy(this.originalCamera).lerp(camera,focus);
  board.camera.lookAt(board.controls.target);
  this._sounds();
  board._requestDraw();
  if(t>=1){this.cancel();return;}
  this._frame=requestAnimationFrame(()=>this._loop());
 }
 cancel() {
  if(this._frame!==null){cancelAnimationFrame(this._frame);this._frame=null;}
  if(!this.active)return;
  this.active=false;
  const board=this.board;
  for(const figure of this._hidden)figure.visible=true;
  this._hidden.length=0;
  if(this.scene){board.scene.remove(this.scene);this.scene.clear();this.scene=null;}
  for(const resource of this._resources)resource.dispose();
  this._resources.length=0;
  if(this.originalCamera&&board.camera&&board.controls) {
   board.camera.position.copy(this.originalCamera);
   board.controls.target.copy(this.originalTarget);
   board.controls.enabled=this.controlsPreviouslyEnabled;
   board.camera.lookAt(board.controls.target);
   board._requestDraw();
  }
  this.attacker=null;this.attackerRig=null;this.actors=[];
  this.fromPosition=null;this.destination=null;
  if(this.onComplete){const done=this.onComplete;this.onComplete=null;try{done();}catch(_){}}
 }
}
