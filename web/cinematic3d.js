/* Álfastafl 0.7: deterministic, local cinematic staging of server-confirmed captures.
 * Each combatant is the same carved statuette as on the board, but with local
 * shoulder, hip and neck joints. The board, clock and captures stay authoritative.
 * No external meshes, textures, soundtracks or animation services are loaded. */
import * as THREE from 'three';
import {createFigurine} from './figurines3d.js';
import {duelWindow,combatVariant,duelMotion,smooth} from './combat-motion.js';
import {flankPlan} from './flank-capture.js';
import {FlankCinematic} from './flank-cinematic3d.js';
import {poseDuelArrow} from './archery3d.js';
import {throneCapturePlan} from './throne-capture.js';
import {ThroneCinematic} from './throne-cinematic3d.js';

const SURFACE=.12;
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{const t=clamp(x);return t*t*(3-2*t);};
const phase=(time,from,to)=>smooth(time,from,to);
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
  this.flank=null;
  this.throne=null;
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
  this.originalQuaternion=board.camera.quaternion.clone();
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
  // Only an ordinary single-piece sandwich capture qualifies. A corner,
  // hostile throne, king or shieldwall may not invent an allied executioner.
  const plan=event.captured.length===1&&victims.length===1
   ?flankPlan(event,board._view.board,event.captured[0]):null;
  const thronePlan=!plan&&event.captured.length===1&&victims.length===1
   ?throneCapturePlan(event,board._view.board,board._view.mode):null;
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
  const sparkGeometry=new THREE.OctahedronGeometry(.027,0);
  const sparkMaterial=new THREE.MeshBasicMaterial({color:0xffd18c,transparent:true,opacity:.92,depthWrite:false});
  this._resources.push(sparkGeometry,sparkMaterial);
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
   const sparks=[];
   for(let j=0;j<10;j++) {
    const spark=new THREE.Mesh(sparkGeometry,sparkMaterial);
    spark.userData.angle=j*2.399963+index*.71;
    spark.visible=false;
    this.scene.add(spark);
    sparks.push(spark);
   }
   return {...victim,index,figure,rig:parts(figure),shards,sparks,
    ...duelWindow(index,count),variant:combatVariant(event,index)};
  });
  this.soundCues=[['move',.025,'move']];
  if(thronePlan){
   const dwarf=event.piece==='N';
   this.soundCues.push(
    ['throne-first',.34,dwarf?'dwarven-axe':'arrow'],
    ['throne-block',.42,dwarf?'guard':'shield'],
    ['throne-second',.73,dwarf?'dwarven-axe':'arrow'],
    ['throne-impact',.80,'throne-impact'],
    ['throne-shatter',.87,'shatter']);
  }else if(plan) {
   const [victim]=this.actors;
   const cue=(tag,phase,name)=>this.soundCues.push([
    tag,victim.start+(victim.end-victim.start)*phase,name]);
   cue('opening',.25,plan.style==='elf-arrow-sword'?'arrow':'swing');
   cue('parry',.38,plan.style==='elf-arrow-sword'?'shield':'guard');
   cue('support-draw',.54,plan.style==='elf-arrow-sword'?'blade':'swing');
   cue('support-hit',.74,plan.style==='elf-arrow-sword'?'slice':'strike');
   cue('shatter',.82,'shatter');
  } else for(const victim of this.actors) {
   const width=victim.end-victim.start;
   const beat=(name,point,effect)=>this.soundCues.push(
    [name+'-'+victim.index,victim.start+width*point,effect]);
   beat('feint',.12,event.piece==='E'?'arrow':'swing');
   if(count<=4) {
    beat('parry',.25,victim.kind==='N'?'shield':'guard');
    beat('counter',.44,'counter');
   }
   beat('finisher',.67,event.piece==='E'?'arrow':'swing');
   beat('impact',.77,'strike');
   beat('fracture',.82,'shatter');
   if(victim.kind==='R')beat('king',.89,'king');
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
  // Shared cinematic assets: translucent swing trail and optional arrow.
  this.trailMaterial=new THREE.MeshBasicMaterial({
   color:event.piece==='N'?0xffca70:event.piece==='R'?0xd7f2ff:0xcdf1d0,
   transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false,
  });
  this.trailGeometry=new THREE.TorusGeometry(.40,.018,5,40,Math.PI*1.2);
  this._resources.push(this.trailGeometry,this.trailMaterial);
  this.trail=new THREE.Mesh(this.trailGeometry,this.trailMaterial);
  this.trail.visible=false;this.scene.add(this.trail);
  this.projectile=null;
  if(event.piece==='E'){
   const shaft=new THREE.CylinderGeometry(.012,.012,.41,6);
   const tip=new THREE.ConeGeometry(.057,.13,6);
   const material=new THREE.MeshStandardMaterial({color:0xd2cfad,metalness:.2,roughness:.56});
   this._resources.push(shaft,tip,material);
   const arrow=new THREE.Group();
   arrow.add(new THREE.Mesh(shaft,material));
   const point=new THREE.Mesh(tip,material);point.position.y=.25;arrow.add(point);
   arrow.visible=false;this.scene.add(arrow);this.projectile=arrow;
  }

  const center=destination.clone();
  for(const victim of this.actors)center.add(victim.place);
  center.divideScalar(1+this.actors.length);
  this.combatTarget=center;
  this.combatTarget.y=.46;
  this.cameraVector=this.originalCamera.clone().sub(this.originalTarget).normalize();
  if(plan) {
   const flanking=new FlankCinematic(this,plan,event);
   if(flanking.start())this.flank=flanking;
  }else if(thronePlan){
   const againstThrone=new ThroneCinematic(this,thronePlan,event);
   if(againstThrone.start())this.throne=againstThrone;
  }
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
  if(board.disposed||board.lost||!board.active||document.hidden){
   this.cancel();return;
  }
  const t=this.progress=clamp((performance.now()-this.startTime)/(this.duration*1000));
  if(this.flank||this.throne) {
   if(this.flank)this.flank.update(t);
   else this.throne.update(t);
   this._sounds();
   board._requestDraw();
   if(t>=1){this.cancel();return;}
   this._frame=requestAnimationFrame(()=>this._loop());
   return;
  }
  const travel=phase(t,0,.20);
  const attacker=this.attacker;
  // Every client derives poses from the server's remaining-time timeline.
  const index=Math.min(this.actors.length-1,
   Math.max(0,Math.floor((t-.17)/(.61/this.actors.length))));
  const opponent=this.actors[index];
  const m=duelMotion(t,opponent.start,opponent.end,opponent.variant);
  this.duel=index;
  this.stage=m.fracture>=.99?'fracture':
   m.finish>.20?'attaque finale':m.counter>.18?'riposte':
   m.guard>.18?'parade':m.feint>.18?'feinte':'approche';

  const direction=opponent.place.clone().sub(this.destination);
  direction.y=0;
  if(direction.lengthSq()<.001)direction.set(0,0,1);
  direction.normalize();
  const lateral=new THREE.Vector3(-direction.z,0,direction.x);
  attacker.position.copy(this.fromPosition).lerp(this.destination,travel);
  attacker.position.addScaledVector(direction,.15*m.feint+.27*m.finish-.075*m.counter);
  attacker.position.addScaledVector(lateral,-m.direction*.11*m.dodge);
  attacker.position.y=SURFACE+.16*Math.sin(Math.PI*travel)+
   .085*Math.max(m.feint,m.finish)+.05*Math.abs(m.footwork);
  const desiredHeading=heading(this.destination,opponent.place);
  attacker.rotation.y=lerpAngle(this.initialHeading,desiredHeading,phase(t,.075,.25))+
   .11*m.direction*m.dodge-.075*m.counter;
  attacker.rotation.z=.06*m.feint-.19*m.finish+.08*m.counter;
  attacker.rotation.x=.12*m.counter-.09*m.finish;

  // Axe-and-shield, bow-and-arrow and sword poses use the same stone joints.
  const bow=attacker.userData.kind==='E';
  const king=attacker.userData.kind==='R';
  const right=this.attackerRig.right,left=this.attackerRig.left;
  if(right){
   right.rotation.x=(bow?-.85:-.65)*m.feint+
    (bow?.44:.6)*m.counter-(bow?.85:king?1.23:1.1)*m.finish;
   right.rotation.z=(bow?.40:1.02)*m.feint-.32*m.counter+
    (bow?.22:.94)*m.finish;
  }
  if(left){
   left.rotation.x=-(bow?.82:.32)*(m.feint+m.finish)+.12*m.counter;
   left.rotation.z=(bow?-.30:-.45)*m.feint+.29*m.counter-
    (bow?.24:.33)*m.finish;
  }
  if(this.attackerRig.head)this.attackerRig.head.rotation.y=
   .27*m.direction*m.feint-.20*m.counter+.19*m.finish;
  if(this.attackerRig.leftLeg)this.attackerRig.leftLeg.rotation.x=
   .32*m.footwork+.19*m.finish;
  if(this.attackerRig.rightLeg)this.attackerRig.rightLeg.rotation.x=
   -.35*m.footwork-.26*m.finish;

  // Defender gets a visible block, sidestep and counter before the final hit.
  for(const victim of this.actors){
   const v=duelMotion(t,victim.start,victim.end,victim.variant);
   const away=victim.place.clone().sub(this.destination);
   away.y=0;
   if(away.lengthSq()<.001)away.set(0,0,-1);
   away.normalize();
   const sidestep=new THREE.Vector3(-away.z,0,away.x);
   victim.figure.position.copy(victim.place)
    .addScaledVector(sidestep,.20*v.direction*v.dodge)
    .addScaledVector(away,-.11*v.counter+.07*v.recoil);
   victim.figure.position.y=SURFACE+.12*v.dodge+
    .075*v.counter+.18*v.recoil*(1-v.fracture);
   victim.figure.rotation.y=heading(victim.place,this.destination)+
    .20*v.direction*v.dodge-.16*v.counter;
   victim.figure.rotation.z=-.11*v.guard+.22*v.counter-
    .70*v.recoil*(1-v.fracture);
   victim.figure.rotation.x=.14*v.dodge-.17*v.recoil;
   const guard=v.guard+v.clash*.35;
   if(victim.rig.left){
    victim.rig.left.rotation.x=-.42*guard+.34*v.counter;
    victim.rig.left.rotation.z=-.90*guard+.44*v.counter;
   }
   if(victim.rig.right){
    victim.rig.right.rotation.x=-.50*guard+1.06*v.counter;
    victim.rig.right.rotation.z=.27*guard-.50*v.counter;
   }
   if(victim.rig.head)victim.rig.head.rotation.y=
    -.28*v.direction*v.dodge+.28*v.recoil;
   if(victim.rig.leftLeg)victim.rig.leftLeg.rotation.x=.30*v.dodge-.18*v.recoil;
   if(victim.rig.rightLeg)victim.rig.rightLeg.rotation.x=-.29*v.dodge+.14*v.recoil;
   victim.figure.scale.setScalar(Math.max(.001,1-v.fracture));
   victim.figure.visible=v.fracture<.99;

   for(const shard of victim.shards){
    shard.visible=v.p>=.80&&t<.985;
    if(!shard.visible)continue;
    const age=Math.min(1.3,Math.max(0,(v.p-.80)*
     (victim.end-victim.start)*this.duration));
    const velocity=shard.userData.velocity;
    const ground=SURFACE+.022;
    const y=SURFACE+shard.userData.startHeight+velocity.y*age-2.1*age*age;
    shard.position.set(victim.place.x+velocity.x*age,
     Math.max(ground,y),victim.place.z+velocity.z*age);
    shard.rotation.set(age*velocity.y*4.1,age*velocity.x*6.3,age*velocity.z*7.4);
    const fade=1-.76*phase(t,.90,.99);
    shard.scale.setScalar((.63+((victim.index+
     shard.userData.startHeight*100)%7)*.14)*fade);
   }

   // Two deterministic bursts: first at parry, second at decisive impact.
   const sparkle=Math.max(v.clash,v.burst);
   const beginning=v.clash>=v.burst ? .24 : .75;
   const age=clamp((v.p-beginning)/.20);
   for(const spark of victim.sparks){
    spark.visible=sparkle>.06&&victim.index===index;
    if(!spark.visible)continue;
    const a=spark.userData.angle;
    spark.position.set(victim.place.x+Math.cos(a)*age*.46,
     SURFACE+.69+Math.sin(a*2.7)*.15+age*.3,
     victim.place.z+Math.sin(a)*age*.46);
    spark.scale.setScalar(Math.max(.01,sparkle)*(.5+age*.5));
   }
  }

  const trailPower=Math.max(m.feint*.62,m.finish);
  this.trail.visible=trailPower>.10;
  if(this.trail.visible){
   this.trail.position.copy(attacker.position);
   this.trail.position.y+=attacker.userData.kind==='N'?.72:1.0;
   this.trail.rotation.set(Math.PI/2,attacker.rotation.y,-.6+
    .55*Math.sin(m.p*Math.PI*4));
   this.trail.scale.setScalar(.75+.30*trailPower);
   this.trailMaterial.opacity=.48*trailPower;
  }
  if(this.projectile){
   // A regular duel uses the same moving bowstring as flank/throne scenes.
   const target=opponent.place.clone().add(new THREE.Vector3(0,.82,0));
   poseDuelArrow(this.projectile,attacker,target,m.p);
  }
  const ringPower=Math.max(m.clash,m.burst);
  this.ring.position.copy(opponent.place);
  this.ring.position.y+=.11;
  this.ring.visible=ringPower>.04;
  this.ring.scale.setScalar(.67+(1-ringPower)*2.4);
  this.ringMaterial.opacity=.70*ringPower;

  // Independent camera on each client: sweep, close shot and small bounded
  // impact shake. Exact pre-combat viewpoint restored by cancel().
  const focus=phase(t,0,.15)*(1-phase(t,.84,1));
  const shotTarget=this.destination.clone().lerp(opponent.place,.51);
  shotTarget.y=.60;
  const center=this.combatTarget.clone().lerp(shotTarget,.72);
  const orbit=.32*Math.sin(t*Math.PI*2.4)+m.direction*.15*m.dodge;
  const distance=8.15-1.25*m.finish-.88*m.burst+.35*m.counter;
  const offset=this.cameraVector.clone()
   .applyAxisAngle(new THREE.Vector3(0,1,0),orbit).multiplyScalar(distance);
  const shotCamera=center.clone().add(offset);
  shotCamera.y=Math.max(3.65,shotCamera.y);
  const shake=m.clash*.027+m.burst*.075;
  shotCamera.x+=shake*Math.sin(t*240);
  shotCamera.y+=shake*.50*Math.sin(t*178);
  board.controls.target.copy(this.originalTarget).lerp(center,focus);
  board.camera.position.copy(this.originalCamera).lerp(shotCamera,focus);
  board.camera.lookAt(board.controls.target);
  board.camera.rotateZ(focus*(m.clash*.018+m.burst*.038)*Math.sin(t*150));
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
  this.flank?.cancel();
  this.flank=null;
  this.throne?.cancel();
  this.throne=null;
  for(const figure of this._hidden)figure.visible=true;
  this._hidden.length=0;
  if(this.scene){board.scene.remove(this.scene);this.scene.clear();this.scene=null;}
  for(const resource of this._resources)resource.dispose();
  this._resources.length=0;
  if(this.originalCamera&&board.camera&&board.controls) {
   board.camera.position.copy(this.originalCamera);
   board.controls.target.copy(this.originalTarget);
   board.controls.enabled=this.controlsPreviouslyEnabled;
   if(this.originalQuaternion)board.camera.quaternion.copy(this.originalQuaternion);
   else board.camera.lookAt(board.controls.target);
   board._requestDraw();
  }
  this.attacker=null;this.attackerRig=null;this.actors=[];
  this.trail=null;this.trailMaterial=null;this.projectile=null;
  this.ring=null;this.ringMaterial=null;this.stage='';this.duel=-1;
  this.fromPosition=null;this.destination=null;
  if(this.onComplete){const done=this.onComplete;this.onComplete=null;try{done();}catch(_){}}
 }
}
