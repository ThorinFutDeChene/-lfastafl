/* Single-soldier capture against the empty hostile throne (both camps).
 * All poses follow the server-timed playback window. The board and its
 * real throne are NEVER changed: only local statues and fragments move. */
import * as THREE from 'three';
import {thronePhases} from './throne-capture.js';
import {smooth,pulse} from './combat-motion.js';

const SURFACE=.12;
const Y=new THREE.Vector3(0,1,0);
const world=p=>new THREE.Vector3(p[1]-5,SURFACE,p[0]-5);
const face=(a,b)=>Math.atan2(b.x-a.x,b.z-a.z);
const angle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const clamp=v=>Math.min(1,Math.max(0,v));

export class ThroneCinematic {
 constructor(capture,plan,event){
  this.capture=capture;
  this.board=capture.board;
  this.event=event;
  this.plan=plan;
  this.style=plan.style;
  this.phase=0;
  this.stage='';
  this.rubble=[];
 }
 start(){
  const cut=this.capture,board=this.board;
  this.victim=cut.actors[0];
  if(!this.victim||this.victim.kind!==this.plan.victimKind)return false;
  this.source=cut.fromPosition.clone();
  this.destination=cut.destination.clone();
  this.pauseAt=world(this.plan.pause);
  this.throne=world(this.plan.throne);
  this.victimAt=this.victim.place.clone();
  this.forward=this.throne.clone().sub(this.victimAt).setY(0).normalize();
  this.melee=this.event.piece==='N';
  this.attackerAt=this.melee?this.destination:this.pauseAt;
  this.targetYaw=face(this.attackerAt,this.victimAt);
  this.victimYaw=face(this.victimAt,this.attackerAt);
  // Actual throne tiles retain their rigid board meshes. Small temporary
  // stone fragments emphasize where the victim sculpture hits the plinth.
  const geometry=new THREE.TetrahedronGeometry(.055,0);
  const material=new THREE.MeshStandardMaterial({
   color:0xa5a097,roughness:.83,metalness:.04,
  });
  cut._resources.push(geometry,material);
  for(let i=0;i<12;i++){
   const stone=new THREE.Mesh(geometry,material);
   stone.name='fragment-de-choc-sur-le-trône-'+i;
   stone.visible=false;
   const theta=i*2.3999632297;
   stone.userData.velocity=new THREE.Vector3(Math.sin(theta)*(.27+i%3*.09),
    .45+(i%4)*.19,Math.cos(theta)*(.27+i%3*.09));
   cut.scene.add(stone);
   this.rubble.push(stone);
  }
  return true;
 }
 update(t){
  const cut=this.capture,board=this.board,v=this.victim;
  const m=thronePhases(t,smooth,pulse);
  this.phase=t;this.phases=m;
  const front=cut.attacker,defender=v.figure;
  const contact=this.melee;
  // Melee dwarves MUST reach the actual destination before the first axe
  // strike. Ranged elves can pause one cell early and finish after impact.
  front.position.copy(this.source).lerp(this.attackerAt,m.arrival);
  if(!contact)front.position.lerp(this.destination,m.finish);
  front.position.y=SURFACE+.11*Math.sin(Math.PI*m.arrival)+
   (!contact?.08*Math.sin(Math.PI*m.finish):0);
  front.rotation.y=angle(cut.initialHeading,this.targetYaw,smooth(t,.05,.24));
  front.rotation.x= -.12*m.opening-.24*m.killingBlow;
  front.rotation.z=contact?-.12*m.killingBlow:-.05*m.opening;
  const arm=cut.attackerRig.right,off=cut.attackerRig.left;
  if(arm){
   arm.rotation.x=contact?
    -1.12*m.opening-1.43*m.windup+1.60*m.killingBlow:
    -.95*m.opening-.90*m.killingBlow;
   arm.rotation.z=contact?
    .83*m.opening+1.06*m.windup-.82*m.killingBlow:
    .18*m.opening+.31*m.killingBlow;
  }
  if(off){
   off.rotation.x=contact?-.31*(m.opening+m.killingBlow):
    -.86*(m.opening+m.killingBlow);
   off.rotation.z=contact?-.49*m.opening:-.23*m.killingBlow;
  }
  if(cut.attackerRig.head)cut.attackerRig.head.rotation.y=.12*m.opening-.17*m.killingBlow;
  if(cut.attackerRig.leftLeg)cut.attackerRig.leftLeg.rotation.x=.18*m.arrival-.12*m.killingBlow;
  if(cut.attackerRig.rightLeg)cut.attackerRig.rightLeg.rotation.x=-.16*m.arrival+.16*m.killingBlow;

  // The trapped elf blocks with the bow-arm. The trapped dwarf deflects
  // the first arrow on its shield before the second shot sends it back.
  defender.position.copy(this.victimAt)
   .addScaledVector(this.forward,.72*m.knockback);
  defender.position.y=SURFACE+.09*m.recoil-
   .24*m.knockback*(1-m.fracture);
  defender.rotation.y=this.victimYaw;
  defender.rotation.x=-.30*m.recoil-.68*m.knockback;
  defender.rotation.z=(contact?-.16:.19)*m.guard-.33*m.knockback;
  if(v.rig.left){
   v.rig.left.rotation.x=-.63*m.guard+.22*m.recoil;
   v.rig.left.rotation.z=-1.18*m.guard+.08*m.knockback;
  }
  if(v.rig.right){
   v.rig.right.rotation.x=-.34*m.guard+.15*m.recoil;
   v.rig.right.rotation.z=.25*m.guard+.15*m.knockback;
  }
  if(v.rig.head)v.rig.head.rotation.y=.23*m.recoil+.12*m.knockback;
  defender.scale.setScalar(Math.max(.001,1-m.fracture));
  defender.visible=m.fracture<.99;

  const hitPoint=this.throne.clone().addScaledVector(this.forward,-.20);
  // The victim does not simply fade: eighteen flying pieces replace it
  // exactly when its statue crashes into the visible throne.
  for(const shard of v.shards){
   shard.visible=t>=.83&&t<.994;
   if(!shard.visible)continue;
   const seconds=Math.max(0,(t-.83)*cut.duration);
   const velocity=shard.userData.velocity;
   const y=SURFACE+shard.userData.startHeight+
     velocity.y*seconds-2.05*seconds*seconds;
   shard.position.set(hitPoint.x+velocity.x*seconds,
    Math.max(SURFACE+.015,y),hitPoint.z+velocity.z*seconds);
   shard.rotation.set(seconds*velocity.y*4,seconds*velocity.x*6,
    seconds*velocity.z*5);
   shard.scale.setScalar((.63+.10*(shard.userData.startHeight*10))*
     (1-.88*smooth(t,.95,1)));
  }
  for(const stone of this.rubble){
   stone.visible=t>=.79&&t<.995;
   if(!stone.visible)continue;
   const seconds=Math.max(0,(t-.79)*cut.duration);
   const velocity=stone.userData.velocity;
   stone.position.set(this.throne.x+velocity.x*seconds,
    Math.max(SURFACE+.02,SURFACE+.24+velocity.y*seconds-2.3*seconds*seconds),
    this.throne.z+velocity.z*seconds);
   stone.rotation.set(seconds*3,seconds*4,seconds*2);
   stone.scale.setScalar(1-.75*smooth(t,.94,1));
  }
  const flash=Math.max(m.shock,m.guard*.25);
  for(const spark of v.sparks){
   spark.visible=flash>.06&&t<.99;
   if(!spark.visible)continue;
   const theta=spark.userData.angle;
   spark.position.set(hitPoint.x+Math.cos(theta)*.34*m.knockback,
    SURFACE+.65+Math.sin(theta*2)*.15+.15*m.shock,
    hitPoint.z+Math.sin(theta)*.34*m.knockback);
   spark.scale.setScalar(Math.max(.01,flash)*(.55+.25*m.knockback));
  }
  // In the elven version one arrow is deflected off the shield and a
  // second arrow hits lower to push the bronze dwarf into the throne.
  const arrow=cut.projectile;
  if(arrow&&!contact){
   const first=t>=.28&&t<.51;
   const second=t>=.70&&t<.87;
   arrow.visible=first||second;
   if(arrow.visible){
    const origin=front.position.clone().add(new THREE.Vector3(0,.87,0));
    const shield=this.victimAt.clone().add(new THREE.Vector3(0,.70,0));
    const bounce=shield.clone().add(new THREE.Vector3(.29,.42,-.20));
    const foot=this.victimAt.clone().add(new THREE.Vector3(0,.32,0));
    const target=first&&t<.41?shield:first?bounce:foot;
    const from=first&&t<.41?origin:first?shield:origin;
    const progress=first&&t<.41?smooth(t,.28,.41):
     first?smooth(t,.41,.51):smooth(t,.70,.87);
    arrow.position.copy(from).lerp(target,progress);
    const direction=target.clone().sub(from).normalize();
    arrow.quaternion.setFromUnitVectors(Y,direction);
   }
  }
  const trailPower=Math.max(m.opening*.68,m.killingBlow);
  cut.trail.visible=trailPower>.10;
  if(cut.trail.visible){
   cut.trail.position.copy(front.position);
   cut.trail.position.y+=contact?.79:.93;
   cut.trail.rotation.set(Math.PI*.55,front.rotation.y,
    -.5+.72*m.killingBlow);
   cut.trail.scale.setScalar(.82+.32*trailPower);
   cut.trailMaterial.opacity=.49*trailPower;
  }
  cut.ring.visible=m.shock>.04;
  if(cut.ring.visible){
   cut.ring.position.copy(this.throne);
   cut.ring.position.y+=.04;
   cut.ring.scale.setScalar(.73+2.9*(1-m.shock));
   cut.ringMaterial.opacity=.72*m.shock;
  }
  const sceneTarget=this.throne.clone().lerp(this.victimAt,.48);
  sceneTarget.y=.60;
  const orbit=cut.cameraVector.clone();
  orbit.applyAxisAngle(Y,.21*Math.sin(t*Math.PI*2.5));
  const distance=7.5-1.14*m.killingBlow-.94*m.shock;
  const closeCamera=sceneTarget.clone().addScaledVector(orbit,distance);
  closeCamera.y=Math.max(3.40,closeCamera.y);
  closeCamera.x+=.061*m.shock*Math.sin(t*211);
  closeCamera.y+=.035*m.shock*Math.sin(t*163);
  board.controls.target.copy(cut.originalTarget).lerp(sceneTarget,m.camera);
  board.camera.position.copy(cut.originalCamera).lerp(closeCamera,m.camera);
  board.camera.lookAt(board.controls.target);
  this.stage=t<.24?'Approche du trône':
   t<.52?contact?'Hache parée par l’arc':'Flèche arrêtée par le bouclier':
   t<.76?contact?'Le nain arme sa hache':'Deuxième flèche elfique':
   t<.94?'La sculpture heurte le trône':'Sculpture fracassée';
  cut.stage=this.stage;
  cut.duel=0;
 }
 cancel(){
  this.rubble=[];this.victim=null;this.phases=null;
 }
}
