/* Álfastafl flank choreography. This is presentation only, not a rules
 * engine: the spectator/host both use the post-move board and server's cue. */
import * as THREE from 'three';
import {createFigurine} from './figurines3d.js';
import {flankPhases,attackAnchor} from './flank-capture.js';
import {clamp01,smooth,pulse} from './combat-motion.js';

const SURFACE=.12;
const Y=new THREE.Vector3(0,1,0);
const at=square=>new THREE.Vector3(square[1]-5,SURFACE,square[0]-5);
const face=(from,to)=>Math.atan2(to.x-from.x,to.z-from.z);
const rotate=(group,side,x,z)=>{
 if(!group)return;
 group.rotation.x=x;
 group.rotation.z=z*side;
};
function sword(resources) {
 // Leaf-shaped elven blade: a proper 3D extrusion, narrow cross-guard
 // and pommel, attached to the defending elf's weapon arm.
 const group=new THREE.Group();
 group.name='elf-sword';
 const bladeShape=new THREE.Shape();
 bladeShape.moveTo(-.032,0);
 bladeShape.lineTo(-.052,.29);
 bladeShape.lineTo(-.035,.49);
 bladeShape.lineTo(0,.72);
 bladeShape.lineTo(.035,.49);
 bladeShape.lineTo(.052,.29);
 bladeShape.lineTo(.032,0);
 bladeShape.closePath();
 const bladeGeometry=new THREE.ExtrudeGeometry(bladeShape,{
  depth:.023,steps:1,bevelEnabled:true,bevelSegments:1,
  bevelSize:.007,bevelThickness:.006,
 });
 bladeGeometry.translate(0,0,-.012);
 const metal=new THREE.MeshStandardMaterial({
  color:0xd1dad8,roughness:.29,metalness:.84,side:THREE.DoubleSide,
 });
 const dark=new THREE.MeshStandardMaterial({color:0x45534b,roughness:.64,metalness:.54});
 const gold=new THREE.MeshStandardMaterial({color:0xb8a06c,roughness:.42,metalness:.55});
 const gripGeometry=new THREE.CylinderGeometry(.023,.025,.20,8);
 const guardGeometry=new THREE.CylinderGeometry(.020,.022,.24,8);
 const gemGeometry=new THREE.IcosahedronGeometry(.045,0);
 resources.push(bladeGeometry,metal,dark,gold,gripGeometry,guardGeometry,gemGeometry);
 const blade=new THREE.Mesh(bladeGeometry,metal);
 blade.name='elf-sword-blade';group.add(blade);
 const grip=new THREE.Mesh(gripGeometry,dark);
 grip.position.y=-.10;group.add(grip);
 const guard=new THREE.Mesh(guardGeometry,gold);
 guard.rotation.z=Math.PI/2;
 guard.position.y=.015;
 group.add(guard);
 const gem=new THREE.Mesh(gemGeometry,gold);gem.position.y=-.21;group.add(gem);
 // Tip up while drawn; the right-hand joint handles the attack swing.
 group.position.set(.02,-.13,.13);
 group.rotation.z=-.25;
 return group;
}
function separateBronze(victim,board,resources) {
 const old=board.renderer.localClippingEnabled;
 board.renderer.localClippingEnabled=true;
 const parts=[];
 for(const direction of [-1,1]){
  const root=victim.figure.clone(true);
  root.name=direction<0?'nain-moitié-gauche':'nain-moitié-droite';
  const plane=new THREE.Plane();
  root.traverse(mesh=>{
   if(!mesh.isMesh)return;
   const material=mesh.material.clone();
   material.clippingPlanes=[plane];
   material.clipShadows=false;
   resources.push(material);
   mesh.material=material;
  });
  const capMat=new THREE.MeshStandardMaterial({
   color:0x5b4632,roughness:.86,metalness:.26,side:THREE.DoubleSide,
  });
  const capGeo=new THREE.BoxGeometry(.022,.92,.22);
  resources.push(capMat,capGeo);
  const cap=new THREE.Mesh(capGeo,capMat);
  cap.position.set(direction*.009,.56,-.02);
  root.add(cap);
  root.visible=false;
  victim.figure.parent.add(root);
  parts.push({root,plane,direction});
 }
 return {old,parts};
}
function updateBronzeSplit(split,figure,amount) {
 const sideAxis=new THREE.Vector3(1,0,0)
  .applyAxisAngle(Y,figure.rotation.y).normalize();
 for(const {root,plane,direction} of split.parts) {
  root.visible=amount>.02;
  if(!root.visible)continue;
  root.position.copy(figure.position)
   .addScaledVector(sideAxis,direction*.29*amount);
  root.position.y-=.36*amount;
  root.rotation.copy(figure.rotation);
  root.rotation.z+=(direction<0?-.52:.52)*amount;
  root.rotation.x+=direction*.13*amount;
  const rigNames=['left-arm','right-arm','left-leg','right-leg','head'];
  for(const name of rigNames) {
   const from=figure.getObjectByName('combat-'+name);
   const into=root.getObjectByName('combat-'+name);
   if(from&&into)into.rotation.copy(from.rotation);
  }
  root.updateMatrixWorld(true);
  const normal=new THREE.Vector3(direction<0?1:-1,0,0)
   .transformDirection(root.matrixWorld);
  const center=new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
  plane.setFromNormalAndCoplanarPoint(normal,center);
 }
}
export class FlankCinematic {
 constructor(capture,plan,event) {
  this.capture=capture;
  this.board=capture.board;
  this.plan=plan;
  this.event=event;
  this.style=plan.style;
  this.supporter=null;
  this.split=null;
  this._clippingRestored=false;
  this.lastPhases=null;
 }
 start() {
  const cut=this.capture,board=this.board,actor=cut.actors[0];
  this.victim=actor;
  this.source=cut.fromPosition.clone();
  this.destination=cut.destination.clone();
  this.pauseAt=at(this.plan.pause);
  // Contact attack: the dwarf stops on the final square before swinging.
  // Only the elf archer can halt at the penultimate square.
  this.contactAt=at(attackAnchor(this.plan,this.event.to));
  this.allyAt=at(this.plan.supporter);
  this.allyBody=board._visiblePieces.find(piece=>
   piece.userData.square?.[0]===this.plan.supporter[0]&&
   piece.userData.square?.[1]===this.plan.supporter[1]&&
   piece.userData.piece===this.event.piece);
  if(!this.allyBody)return false;
  this.allyBody.visible=false;
  cut._hidden.push(this.allyBody);
  this.supporter=createFigurine(this.event.piece,{articulated:true});
  this.supporter.name='sculpture-alliée-coup-final';
  this.supporter.position.copy(this.allyAt);
  this.supporter.rotation.y=face(this.allyAt,actor.place);
  this.supporter.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=false;mesh.receiveShadow=true;}});
  cut.scene.add(this.supporter);
  this.allyRight=this.supporter.getObjectByName('combat-right-arm');
  this.allyLeft=this.supporter.getObjectByName('combat-left-arm');
  if(this.style==='elf-arrow-sword'){
   const weapon=sword(cut._resources);
   this.supporter.getObjectByName('combat-right-arm')?.add(weapon);
   this.sword=weapon;this.sword.visible=false;
   this.split=separateBronze(actor,board,cut._resources);
  }
  const trailMat=new THREE.MeshBasicMaterial({
   color:this.style==='elf-arrow-sword'?0xd0efff:0xffcd84,
   transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide,
  });
  const trailGeo=new THREE.TorusGeometry(.44,.020,5,44,Math.PI*1.3);
  cut._resources.push(trailGeo,trailMat);
  this.supportTrail=new THREE.Mesh(trailGeo,trailMat);
  this.supportTrail.visible=false;cut.scene.add(this.supportTrail);
  const frontOriginal=board._visiblePieces.find(piece=>
   piece.userData.square?.[0]===this.event.to[0]&&
   piece.userData.square?.[1]===this.event.to[1]);
  this.frontYaw=frontOriginal?.rotation.y ?? 0;
  this.allyYaw=face(this.allyAt,actor.place);
  return true;
 }
 update(t) {
  const cut=this.capture,board=this.board,v=this.victim;
  const begin=v.start,end=v.end;
  const p=clamp01((t-begin)/(end-begin));
  const m=flankPhases(p,smooth,pulse);
  this.lastPhases=m;
  this.phase=p;
  const elf=this.style==='elf-arrow-sword';
  if(this.sword)this.sword.visible=p>=.42;
  const front=cut.attacker,back=this.supporter;
  const victim=v.figure;
  const frontYaw=face(this.contactAt,v.place);
  const victimYaw=face(v.place,this.contactAt);
  // Melee dwarf: first move fully to the confirmed destination, then
  // strike and trigger the bow-arm parry. Elf archers remain one square
  // short for the shot, then finish their move after the supporter's sword.
  const arrival=smooth(t,0,begin+.055);
  const finish=elf?smooth(t,.81,.97):0;
  front.position.copy(this.source).lerp(this.contactAt,arrival);
  if(elf)front.position.lerp(this.destination,finish);
  front.position.y=SURFACE+.13*Math.sin(Math.PI*arrival)+
   (elf?.12*Math.sin(Math.PI*finish):0);
  front.rotation.y=this.frontYaw+(frontYaw-this.frontYaw)*smooth(t,.05,.22);
  front.rotation.x=-.19*m.incoming+.05*m.parry;
  front.rotation.z=-.07*m.incoming;
  rotate(cut.attackerRig.right,1,elf?-.95*m.incoming:-1.17*m.incoming,
   (elf?.24:1.01)*m.incoming);
  rotate(cut.attackerRig.left,1,elf?-.61*m.incoming:-.46*m.incoming,
   (elf?-.15:-.64)*m.incoming);
  if(cut.attackerRig.head)cut.attackerRig.head.rotation.y=.2*m.incoming;
  if(cut.attackerRig.leftLeg)cut.attackerRig.leftLeg.rotation.x=.17*(arrival-finish);
  if(cut.attackerRig.rightLeg)cut.attackerRig.rightLeg.rotation.x=-.14*(arrival-finish);
  // Victim blocks the arrow with his shield or uses the bow-protected arm.
  victim.position.copy(v.place);
  victim.position.y=SURFACE+.05*m.parry+.09*m.recoil*(1-m.split);
  victim.rotation.y=victimYaw;
  victim.rotation.z=(elf?.13:-.11)*m.parry-.29*m.recoil*(1-m.split);
  if(v.rig.left){
   v.rig.left.rotation.x=-.55*m.parry+.19*m.recoil;
   v.rig.left.rotation.z=-1.35*m.parry;
  }
  if(v.rig.right) {
   v.rig.right.rotation.x=-.38*m.parry-.11*m.recoil;
   v.rig.right.rotation.z=.17*m.parry+.25*m.recoil;
  }
  if(v.rig.head)v.rig.head.rotation.y=.16*m.recoil;
  if(v.rig.leftLeg)v.rig.leftLeg.rotation.x=-.12*m.recoil;
  if(v.rig.rightLeg)v.rig.rightLeg.rotation.x=.18*m.recoil;

  // The ally on the opposite side, NOT the incoming piece, delivers the
  // decisive sword/axe blow. Both figures remain in their board squares.
  const toEnemy=v.place.clone().sub(this.allyAt).setY(0);
  toEnemy.normalize();
  back.position.copy(this.allyAt).addScaledVector(toEnemy,.18*m.cleave);
  back.position.y=SURFACE+.08*m.cleave;
  back.rotation.y=this.allyYaw;
  back.rotation.z=-.23*m.cleave;
  if(this.allyRight){
   this.allyRight.rotation.x=-1.25*m.windup+1.68*m.cleave;
   this.allyRight.rotation.z=1.07*m.windup-.76*m.cleave;
  }
  if(this.allyLeft){
   this.allyLeft.rotation.x=-.31*m.windup-.21*m.cleave;
   this.allyLeft.rotation.z=-.34*m.windup+.25*m.cleave;
  }
  const h=back.getObjectByName('combat-head');
  if(h)h.rotation.y=-.15*m.windup+.25*m.cleave;
  const leg=back.getObjectByName('combat-right-leg');
  if(leg)leg.rotation.x=-.27*m.cleave;

  if(this.split) {
   // A shielded dwarf is cleaved into two visible bronze halves, not
   // replaced by a generic explosion or two overlapping full-size models.
   victim.visible=m.split<.03;
   updateBronzeSplit(this.split,victim,m.split);
   for(const shard of v.shards)shard.visible=false;
  }else{
   const broken=m.split;
   victim.visible=broken<.99;
   victim.scale.setScalar(Math.max(.001,1-broken));
   for(const shard of v.shards) {
    const age=clamp01((p-.79)*2.4);
    shard.visible=p>=.79&&t<.986;
    if(!shard.visible)continue;
    const vel=shard.userData.velocity;
    const seconds=age*(end-begin)*cut.duration;
    shard.position.set(v.place.x+vel.x*seconds,
      Math.max(SURFACE+.02,SURFACE+shard.userData.startHeight+
       vel.y*seconds-2.1*seconds*seconds),
      v.place.z+vel.z*seconds);
    shard.rotation.set(seconds*vel.y*4,seconds*vel.x*5,seconds*vel.z*7);
   }
  }
  const sparkle=Math.max(m.parry*.45,m.cleave);
  for(const spark of v.sparks){
   spark.visible=sparkle>.15&&m.split<.98;
   if(!spark.visible)continue;
   const theta=spark.userData.angle;
   spark.position.set(v.place.x+Math.sin(theta)*.32*m.cleave,
    SURFACE+.70+Math.cos(theta)*.25*m.cleave,
    v.place.z+Math.cos(theta)*.32*m.cleave);
   spark.scale.setScalar(.4+.7*sparkle);
  }
  // Incoming elf actually shoots a 3D arrow into the dwarf's shield; it
  // deflects off instead of piercing the sculpted bronze.
  if(cut.projectile&&elf){
   const q=p;
   const arrow=cut.projectile;
   arrow.visible=q>=.22&&q<.52;
   if(arrow.visible) {
    const start=front.position.clone().add(new THREE.Vector3(0,.88,0));
    const shield=v.place.clone().add(new THREE.Vector3(0,.65,0));
    const bounce=shield.clone().add(new THREE.Vector3(.47,.30,-.28));
    const goal=q<.38?shield:bounce;
    const u=q<.38?smooth(q,.22,.38):smooth(q,.38,.52);
    const from=q<.38?start:shield;
    arrow.position.copy(from).lerp(goal,u);
    const direction=goal.clone().sub(from).normalize();
    arrow.quaternion.setFromUnitVectors(Y,direction);
   }
  }
  // The second attacking sculpture drives the visible weapon-trail.
  cut.trail.visible=m.incoming>.10;
  if(cut.trail.visible){
   cut.trail.position.copy(front.position);
   cut.trail.position.y+=elf?.89:.84;
   cut.trail.rotation.set(1.2,front.rotation.y,.5*m.incoming);
   cut.trail.scale.setScalar(.8+.25*m.incoming);
   cut.trailMaterial.opacity=.42*m.incoming;
  }
  this.supportTrail.visible=m.cleave>.08;
  if(this.supportTrail.visible){
   this.supportTrail.position.copy(back.position);this.supportTrail.position.y+=elf?.98:.81;
   this.supportTrail.rotation.set(.96,back.rotation.y,.9*m.cleave);
   this.supportTrail.material.opacity=.68*m.cleave;
   this.supportTrail.scale.setScalar(.75+.3*m.cleave);
  }
  cut.ring.visible=m.parry>.10||m.cleave>.18;
  if(cut.ring.visible){
   cut.ring.position.copy(v.place);cut.ring.position.y+=.09;
   cut.ring.scale.setScalar(.83+2.5*m.cleave+1.1*m.parry);
   cut.ringMaterial.opacity=.48*m.parry+.73*m.cleave;
  }
  const cameraFocus=smooth(t,0,.16)*(1-smooth(t,.86,1));
  const sceneTarget=this.contactAt.clone().add(v.place).add(this.allyAt).divideScalar(3);
  sceneTarget.y=.64;
  const viewVector=cut.cameraVector.clone();
  const turn=.21*Math.sin(t*Math.PI*2.3);
  viewVector.applyAxisAngle(Y,turn);
  const close=8.1-.90*m.parry-1.4*m.cleave;
  const view=sceneTarget.clone().addScaledVector(viewVector,close);
  view.y=Math.max(view.y,3.5);
  const shake=m.parry*.025+m.cleave*.055;
  view.x+=shake*Math.sin(t*214);
  view.y+=shake*Math.sin(t*158)*.5;
  board.controls.target.copy(cut.originalTarget).lerp(sceneTarget,cameraFocus);
  board.camera.position.copy(cut.originalCamera).lerp(view,cameraFocus);
  board.camera.lookAt(board.controls.target);
  cut.stage=p<.22?'approche':p<.43?(elf?'tir et bouclier':'hache et arc'):
   p<.62?'arme de l’allié':p<.83?(elf?'épée elfique':'hache décisive'):
   t<.83?'sculpture brisée':'fin du déplacement';
  cut.duel=0;
 }
 cancel(){
  if(this.split&&!this._clippingRestored&&this.board.renderer){
   this.board.renderer.localClippingEnabled=this.split.old;
   this._clippingRestored=true;
  }
  this.supporter=null;this.allyBody=null;this.split=null;
 }
}
