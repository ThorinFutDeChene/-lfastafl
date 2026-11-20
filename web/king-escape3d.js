/* Álfastafl DEV 0.7.0: royal escape, a procedural equestrian 3D scene.
 * The server has already won the game for the elves; this changes no rules.
 * Three distinct animated horses and mounted elf statuettes are local to
 * each host/player/spectator. No external art, sounds or animation assets. */
import * as THREE from 'three';
import {createFigurine} from './figurines3d.js';
import {escapePlan,escapePhases} from './escape-motion.js';
import {smooth} from './combat-motion.js';

const UP=new THREE.Vector3(0,1,0),SURFACE=.12;
const square=([row,col])=>new THREE.Vector3(col-5,SURFACE,row-5);
const valid=board=>board&&!board.disposed&&!board.lost&&board.active&&!!board.renderer;
function makeHorseKit(resources) {
 const sphere=new THREE.SphereGeometry(1,12,9);
 const cylinder=new THREE.CylinderGeometry(1,1,1,9);
 const cone=new THREE.ConeGeometry(1,1,8);
 const cube=new THREE.BoxGeometry(1,1,1);
 const torus=new THREE.TorusGeometry(1,.1,6,16);
 const tail=new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
  new THREE.Vector3(0,.89,-.57),new THREE.Vector3(0,.75,-.76),
  new THREE.Vector3(.07,.49,-.89),new THREE.Vector3(.10,.40,-.83)
 ]),10,.058,5,false);
 resources.push(sphere,cylinder,cone,cube,torus,tail);
 const mat=(color,metalness=.04,roughness=.78)=>{
  const m=new THREE.MeshStandardMaterial({color,metalness,roughness});
  resources.push(m);return m;
 };
 return {sphere,cylinder,cone,cube,torus,tail,
  coat:[mat(0xdcd9c8),mat(0xaaa8a2),mat(0xc1a67a)],
  mane:mat(0x383d3a),eye:mat(0x262723),rein:mat(0x625444),
  saddle:mat(0x6b4431),metal:mat(0xd5b974,.6,.42),moon:mat(0xb9dcdb,.3,.44)};
}
function part(parent,geometry,material,position,scale,rotation=null,name=''){
 const mesh=new THREE.Mesh(geometry,material);
 mesh.position.set(...position);
 mesh.scale.set(...scale);
 if(rotation)mesh.rotation.set(...rotation);
 if(name)mesh.name=name;
 mesh.receiveShadow=true;
 parent.add(mesh);
 return mesh;
}
function horseWithRider(kit,kind,coatIndex,side) {
 const root=new THREE.Group();
 root.name=kind==='R'?'royal-horse':'escort-horse-'+side;
 const animal=new THREE.Group();animal.name='warhorse';
 root.add(animal);
 const coat=kit.coat[coatIndex];
 part(animal,kit.sphere,coat,[0,.84,0],[.32,.37,.67],null,'horse-body');
 part(animal,kit.sphere,coat,[0,.93,.30],[.33,.33,.30]);
 part(animal,kit.cylinder,coat,[0,1.14,.47],[.19,.40,.19],[-.34,0,0],'horse-neck');
 part(animal,kit.sphere,coat,[0,1.36,.67],[.23,.27,.29],[-.14,0,0],'horse-head');
 part(animal,kit.sphere,coat,[0,1.23,.89],[.175,.11,.22]);
 for(const sign of [-1,1]){
  part(animal,kit.cone,coat,[sign*.14,1.63,.57],[.067,.19,.08],[-.15,0,0]);
  part(animal,kit.sphere,kit.eye,[sign*.208,1.42,.81],[.039,.043,.045]);
  part(animal,kit.torus,kit.rein,[sign*.105,1.22,.92],[.087,.12,.07],[0,Math.PI/2,0]);
 }
 part(animal,kit.sphere,kit.mane,[0,1.33,.39],[.13,.16,.27],[-.4,0,0]);
 part(animal,kit.tail,kit.mane,[0,0,0],[1,1,1],null,'horse-tail');
 part(animal,kit.cube,kit.saddle,[0,1.17,-.08],[.38,.11,.44],null,'horse-saddle');
 part(animal,kit.cube,kit.metal,[0,1.22,-.07],[.38,.035,.23]);
 part(animal,kit.cube,kit.rein,[-.27,.95,-.08],[.035,.48,.12]);
 part(animal,kit.cube,kit.rein,[.27,.95,-.08],[.035,.48,.12]);
 const legs=[];
 for(const front of [-1,1])for(const sign of [-1,1]){
  const hinge=new THREE.Group();
  hinge.position.set(sign*.21,.73,front*.43);
  animal.add(hinge);
  part(hinge,kit.cylinder,coat,[0,-.20,0],[.09,.43,.091],null,'horse-upper-leg');
  part(hinge,kit.cylinder,coat,[0,-.47,.018],[.067,.34,.072],null,'horse-lower-leg');
  part(hinge,kit.cube,kit.mane,[0,-.66,.076],[.16,.10,.22],null,'horse-hoof');
  legs.push({hinge,front,sign});
 }
 const rider=createFigurine(kind,{articulated:true});
 rider.name=kind==='R'?'king-mounted':'elf-cavalier';
 rider.scale.setScalar(.67);
 rider.position.set(0,1.18,-.15);
 rider.rotation.y=0;
 rider.traverse(object=>{if(object.isMesh){object.castShadow=false;object.receiveShadow=false;}});
 animal.add(rider);
 const right=rider.getObjectByName('combat-right-arm');
 const left=rider.getObjectByName('combat-left-arm');
 return {root,animal,rider,right,left,legs,kind,side};
}
export class KingEscapeCinematic {
 constructor(board) {
  this.board=board;this.active=false;this._frame=null;
  this._resources=[];this._hidden=[];this.horses=[];
  this.reactions=[];this.progress=0;this.key='';this.stage='';
  this._soundPlayed=new Set();this.onComplete=null;
 }
 start(event,{duration=8,remaining=duration,onEffect=()=>{},onComplete=()=>{}}={}) {
  this.cancel();
  const board=this.board;
  const plan=escapePlan(event,board._view.board,board._view.mode);
  if(!plan||!valid(board)||document.hidden||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return false;
  duration=Math.max(1,Math.min(15,Number(duration)||8));
  remaining=Math.max(0,Math.min(duration,Number(remaining)||0));
  if(remaining<=.05)return false;
  this.duration=duration;
  this.startTime=performance.now()-(duration-remaining)*1000;
  this.progress=(duration-remaining)/duration;
  this.key=String(event.n);
  this.plan=plan;this.active=true;
  this.onEffect=onEffect;this.onComplete=onComplete;
  this._soundPlayed.clear();
  this.originalCamera=board.camera.position.clone();
  this.originalTarget=board.controls.target.clone();
  this.originalQuaternion=board.camera.quaternion.clone();
  this.controlsPreviouslyEnabled=board.controls.enabled;
  board.controls.enabled=false;
  board._cancelGesture();
  this.source=square(plan.from);
  this.exit=square(plan.to);
  this.outward=new THREE.Vector3(plan.direction[0],0,plan.direction[1]);
  this.lateral=new THREE.Vector3(-this.outward.z,0,this.outward.x);
  this.heading=Math.atan2(this.outward.x,this.outward.z);
  const realKing=board._visiblePieces.find(piece=>piece.userData.piece==='R' &&
   piece.userData.square?.[0]===plan.to[0]&&piece.userData.square?.[1]===plan.to[1]);
  if(!realKing){this.cancel();return false;}
  this._hidden.push(realKing);realKing.visible=false;
  this.scene=new THREE.Group();
  this.scene.name='Fuite royale — escorte des cavaliers elfes';
  board.scene.add(this.scene);
  this.king=createFigurine('R',{articulated:true});
  this.king.name='king-escape-on-foot';
  this.king.position.copy(this.source);
  this.king.rotation.y=this.heading;
  this.scene.add(this.king);
  this.kingArm=this.king.getObjectByName('combat-right-arm');
  const kit=makeHorseKit(this._resources);
  this.horses=[
   horseWithRider(kit,'R',0,0),
   horseWithRider(kit,'E',1,-1),
   horseWithRider(kit,'E',2,1)
  ];
  for(const h of this.horses){
   h.root.rotation.y=this.heading;
   this.scene.add(h.root);
  }
  // As in magical chess, only a few existing statuettes animate locally.
  // All pieces retain their true squares and return unchanged after playback.
  const available=board._visiblePieces.filter(piece=>piece!==realKing&&piece.visible&&
   ['N','E'].includes(piece.userData.piece));
  const distance=piece=>{
   const [r,c]=piece.userData.square;
   return Math.hypot(r-plan.to[0],c-plan.to[1]);
  };
  available.sort((a,b)=>distance(a)-distance(b));
  const selected={N:0,E:0};
  for(const piece of available){
   const kind=piece.userData.piece;
   if(selected[kind]>=3)continue;
   selected[kind]++;
   piece.visible=false;this._hidden.push(piece);
   const statue=createFigurine(kind,{articulated:true});
   statue.position.copy(piece.position);statue.rotation.y=piece.rotation.y;
   statue.name=kind==='E'?'elf-salutes-king':'dwarf-protests-escape';
   this.scene.add(statue);
   this.reactions.push({kind,statue,original:piece,arm:statue.getObjectByName('combat-right-arm'),
    shield:statue.getObjectByName('combat-left-arm'),head:statue.getObjectByName('combat-head')});
  }
  const glow=new THREE.MeshBasicMaterial({
   color:0xf9e6a6,transparent:true,opacity:.72,depthWrite:false
  });
  const sparkleGeometry=new THREE.OctahedronGeometry(.057,0);
  this._resources.push(glow,sparkleGeometry);
  this.sparks=[];
  for(let i=0;i<22;i++){
   const mesh=new THREE.Mesh(sparkleGeometry,glow);
   mesh.visible=false;this.scene.add(mesh);
   this.sparks.push(mesh);
  }
  this.cues=[
   ['king-steps',.08,'move'],['king-summons-horse',.25,'royal-hooves'],
   ['royal-fanfare',.47,'royal-horns'],
   ['saddle',.59,'royal-mount'],
   ['canter',.71,'royal-hooves'],
   ['gallop',.82,'royal-hooves'],
   ['farewell',.93,'royal-horns']
  ];
  for(const [id,at] of this.cues)if(this.progress>=at)this._soundPlayed.add(id);
  this._loop();
  return true;
 }
 _emit() {
  for(const [key,at,sound] of this.cues)if(this.progress>=at&&!this._soundPlayed.has(key)) {
   this._soundPlayed.add(key);
   try{this.onEffect(sound);}catch(_){}
  }
 }
 _loop() {
  if(!this.active)return;
  const board=this.board;
  if(!valid(board)||document.hidden){this.cancel();return;}
  const t=this.progress=Math.max(0,Math.min(1,
    (performance.now()-this.startTime)/(this.duration*1000)));
  this._pose(t);
  this._emit();
  board._requestDraw();
  if(t>=1){this.cancel();return;}
  this._frame=requestAnimationFrame(()=>this._loop());
 }
 _pose(t) {
  const m=escapePhases(t,smooth),board=this.board;
  this.phases=m;
  this.stage=t<.22?'Le roi atteint la sortie':
   t<.46?'Les cavaliers elfes arrivent':
   t<.67?'Le roi monte à cheval':
   t<.93?'La cavalcade royale':'Victoire des Elfes !';
  // King runs to his server-confirmed escape square, then mounts. His
  // real board piece stays on that square throughout and after the scene.
  this.king.position.copy(this.source).lerp(this.exit,m.approach);
  this.king.position.y=SURFACE+.12*Math.sin(m.approach*Math.PI);
  this.king.rotation.y=this.heading;
  const standScale=Math.max(.001,1-m.mount*.84);
  this.king.scale.setScalar(standScale);
  this.king.visible=m.mount<.99;
  if(this.kingArm)this.kingArm.rotation.z=.64*m.approach+
   1.02*m.mount;
  const kingHorse=this.horses[0];
  const base=this.exit.clone().addScaledVector(this.outward,1.8*(1-m.horseApproach)+.12);
  const depart=m.gallop;
  const travel=depart*7.2;
  for(const horse of this.horses){
   const isKing=horse.kind==='R';
   const shift=horse.side===0?0:horse.side*.72;
   const back=isKing?0:.52;
   horse.root.position.copy(base).addScaledVector(this.outward,travel-back)
    .addScaledVector(this.lateral,shift);
   const wave=m.horseApproach+m.gallop*2.6;
   const gallop= (t>.10 && t<.99) ? 1 : 0;
   horse.animal.position.y=.065*gallop*Math.sin(wave*19+horse.side*.65);
   horse.animal.rotation.z=.035*gallop*Math.sin(wave*11+horse.side);
   horse.animal.rotation.x=.035*gallop*Math.sin(wave*14+horse.side);
   for(const leg of horse.legs){
    const step=Math.sin(wave*23+leg.sign*1.9+leg.front*1.2);
    leg.hinge.rotation.x=.41*step*gallop;
   }
   // The king only becomes mounted after the magical transfer at the saddle;
   // the two escorts remain mounted for the entire approach and departure.
   horse.rider.scale.setScalar(isKing?
    .67*m.mount:.67);
   if(horse.right) {
    horse.right.rotation.x= -.35*(isKing?m.triumph:m.salutes);
    horse.right.rotation.z= (isKing?1.08*m.triumph:.75*m.salutes);
   }
   if(horse.left)horse.left.rotation.z=-.24*(isKing?m.mount:m.salutes);
  }
  for(const e of this.reactions){
   const salute=e.kind==='E'?m.salutes:m.anger;
   if(e.arm){
    e.arm.rotation.z=(e.kind==='E'?.99:-1.19)*salute;
    e.arm.rotation.x=-.39*salute;
   }
   if(e.shield)e.shield.rotation.z=(e.kind==='E'?-.28:.31)*salute;
   if(e.head)e.head.rotation.y=(e.kind==='E'?-.32:.38)*salute;
   e.statue.rotation.y=e.original.rotation.y;
  }
  for(let i=0;i<this.sparks.length;i++){
   const spark=this.sparks[i];
   const fade=Math.max(m.horseApproach*(1-m.mount*.3),m.triumph)*(1-smooth(t,.92,1));
   spark.visible=fade>.04;
   if(!spark.visible)continue;
   const angle=i*2.399963229728653;
   const spread=.34+.055*(i%6)+m.mount*.36;
   spark.position.copy(kingHorse.root.position);
   spark.position.y+=.62+((i*7)%11)*.14+Math.sin(t*11+i)*.12;
   spark.position.x+=Math.cos(angle)*spread;
   spark.position.z+=Math.sin(angle)*spread;
   spark.scale.setScalar((.35+.60*fade)*(.6+.13*(i%5)));
  }
  const focus=m.camera;
  const point=this.exit.clone().addScaledVector(this.outward,2.8*m.gallop+.35);
  point.y=.77+.35*m.mount;
  const orbit=this.originalCamera.clone().sub(this.originalTarget).normalize();
  const twist=.26*Math.sin(t*Math.PI*2.2);
  orbit.applyAxisAngle(UP,twist);
  const camera=point.clone().addScaledVector(orbit,8.0-1.25*m.triumph);
  camera.y=Math.max(camera.y,3.6);
  board.controls.target.copy(this.originalTarget).lerp(point,focus);
  board.camera.position.copy(this.originalCamera).lerp(camera,focus);
  board.camera.lookAt(board.controls.target);
 }
 cancel() {
  if(this._frame!==null){cancelAnimationFrame(this._frame);this._frame=null;}
  if(!this.active)return;
  this.active=false;
  const board=this.board;
  for(const piece of this._hidden)piece.visible=true;
  this._hidden.length=0;
  if(this.scene){board.scene.remove(this.scene);this.scene.clear();this.scene=null;}
  for(const asset of this._resources)asset.dispose();
  this._resources.length=0;
  if(this.originalCamera&&board.camera&&board.controls){
   board.camera.position.copy(this.originalCamera);
   board.controls.target.copy(this.originalTarget);
   board.camera.quaternion.copy(this.originalQuaternion);
   board.controls.enabled=this.controlsPreviouslyEnabled;
   board._requestDraw();
  }
  this.horses=[];this.reactions=[];this.king=null;this.plan=null;
  this.stage='';
  if(this.onComplete){const cb=this.onComplete;this.onComplete=null;try{cb();}catch(_){}}
 }
}
