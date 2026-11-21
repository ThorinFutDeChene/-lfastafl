/* Client-side movement of server-confirmed pieces; never alters game rules.
 * Runs independently on each WebGL board and is disposable on view switches. */
const SURFACE = .12;
const validSquare = p => Array.isArray(p) && p.length===2 &&
 p.every(v => Number.isInteger(v) && v>=0 && v<11);
const sameSquare = (a,b) => Array.isArray(a) && a.length===2 &&
 a[0]===b[0] && a[1]===b[1];
const smoothstep = t => {const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};

export class MoveAnimation {
 constructor(board) {
  this.board=board;
  this.active=false;
  this.frame=null;
  this.key='';
  this.progress=0;
  this.from=null;
  this.to=null;
  this.actor=null;
  this.saved=null;
  this.finished=null;
 }
 start(record,{duration=null,onComplete=()=>{}}={}) {
  this.cancel();
  const board=this.board;
  if(!record || !validSquare(record.from) || !validSquare(record.to) ||
     !['N','E','R'].includes(record.piece) ||
     (record.from[0]!==record.to[0] && record.from[1]!==record.to[1]) ||
     sameSquare(record.from,record.to) ||
     board.disposed || board.lost || !board.active || document.hidden ||
     board.captureCinematic.active ||
     window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  const [fr,fc]=record.from,[tr,tc]=record.to;
  if(board._view.board?.[tr]?.[tc]!==record.piece ||
     board._view.board?.[fr]?.[fc]!=='.') return false;
  const actor=board._visiblePieces.find(figure =>
   figure.userData.piece===record.piece && sameSquare(figure.userData.square,record.to));
  if(!actor) return false;
  const travel=Math.abs(fr-tr)+Math.abs(fc-tc);
  const suggested=Math.min(1150,Math.max(500,450+travel*85));
  const milliseconds=duration===null?suggested:Number(duration);
  if(!Number.isFinite(milliseconds) || milliseconds<100 || milliseconds>2000) return false;
  this.actor=actor;
  this.saved={x:actor.position.x,y:actor.position.y,z:actor.position.z,
   rx:actor.rotation.x,ry:actor.rotation.y,rz:actor.rotation.z};
  this.from=[fr,fc];this.to=[tr,tc];
  this.startTime=performance.now();
  this.duration=milliseconds;
  this.progress=0;
  this.key=String(record.n??'?')+':'+record.piece+':'+fr+','+fc+':'+tr+','+tc;
  this.finished=onComplete;
  this.active=true;
  actor.position.set(fc-5,SURFACE,fr-5);
  board.renderer.shadowMap.needsUpdate=true;
  board._requestDraw();
  this.frame=requestAnimationFrame(()=>this._step());
  return true;
 }
 _step() {
  this.frame=null;
  if(!this.active)return;
  const board=this.board;
  if(board.disposed||board.lost||!board.active||document.hidden){this.cancel();return;}
  const elapsed=performance.now()-this.startTime;
  const t=Math.max(0,Math.min(1,elapsed/this.duration));
  this.progress=t;
  const eased=smoothstep(t);
  const from=this.from,to=this.to,actor=this.actor;
  const lift=Math.sin(Math.PI*eased)*.15;
  actor.position.set((from[1]-5)+(to[1]-from[1])*eased,
                     this.saved.y+lift,
                     (from[0]-5)+(to[0]-from[0])*eased);
  // A subtle weight shift gives rigid stone/bronze sculptures a sense of motion.
  actor.rotation.z=this.saved.rz+Math.sin(Math.PI*t)*.065*
   Math.sign(to[1]-from[1] || to[0]-from[0]);
  actor.rotation.x=this.saved.rx+Math.sin(2*Math.PI*t)*.035;
  board._requestDraw();
  if(t>=1){this.cancel(false);return;}
  this.frame=requestAnimationFrame(()=>this._step());
 }
 cancel(interrupted=true) {
  if(this.frame!==null){cancelAnimationFrame(this.frame);this.frame=null;}
  if(!this.active)return;
  this.active=false;
  if(this.actor&&this.saved) {
   this.actor.position.set(this.saved.x,this.saved.y,this.saved.z);
   this.actor.rotation.x=this.saved.rx;
   this.actor.rotation.y=this.saved.ry;
   this.actor.rotation.z=this.saved.rz;
  }
  const board=this.board;
  if(!board.disposed&&!board.lost&&board.renderer) {
   board.renderer.shadowMap.needsUpdate=true;
   board._requestDraw();
  }
  this.actor=null;this.saved=null;
  const done=this.finished;this.finished=null;
  if(typeof done==='function') {
   try{done({interrupted});}catch(_){}
  }
 }
}
