/* King capture choreography planning. The server declares the winner.
 * This planner ONLY identifies the dwarf figurines in that authenticated
 * final board; it never determines or changes an outcome. */
const at=p=>Array.isArray(p)&&p.length===2&&p.every(x=>Number.isInteger(x)&&x>=0&&x<11);
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const directions=[[-1,0],[0,1],[1,0],[0,-1]];
const add=(a,d)=>[a[0]+d[0],a[1]+d[1]];
const center=[5,5];
export function kingSiegePlan(event,board,mode){
 if(!event||event.reason!=='king_captured'||event.winner!=='dwarf'||
    event.status!=='finished'||event.piece!=='N'||!at(event.from)||
    !at(event.to)||!['historical','fetlar','copenhagen'].includes(mode)||
    !Array.isArray(board)||board.length!==11||
    !board.every(row=>Array.isArray(row)&&row.length===11)||
    board[event.to[0]][event.to[1]]!=='N')return null;
 const kings=[];
 for(let r=0;r<11;r++)for(let c=0;c<11;c++)if(board[r][c]==='R')kings.push([r,c]);
 if(kings.length!==1)return null;
 const king=kings[0];
 if(Math.abs(king[0]-event.to[0])+Math.abs(king[1]-event.to[1])!==1)return null;
 const neighbors=directions.map((dir,index)=>{
  const square=add(king,dir);
  return {square,index,valid:at(square),dwarf:at(square)&&board[square[0]][square[1]]==='N'};
 });
 let participants=[],configuration='';
 const bySquare=square=>neighbors.find(n=>same(n.square,square));
 const moving=bySquare(event.to);
 if(!moving?.dwarf)return null;
 if(mode==='historical'){
  if(same(king,center)){
   if(!neighbors.every(n=>n.dwarf))return null;
   participants=neighbors;configuration='four';
  }else if(neighbors.some(n=>same(n.square,center))){
   if(!neighbors.every(n=>same(n.square,center)||n.dwarf))return null;
   participants=neighbors.filter(n=>!same(n.square,center));
   configuration='throne-three';
  }else{
   const opposite=neighbors[(moving.index+2)%4];
   if(!opposite?.dwarf)return null;
   participants=[moving,opposite];configuration='two';
  }
 }else if(mode==='copenhagen'&&neighbors.some(n=>same(n.square,center))){
  if(board[5][5]!=='.'||!neighbors.every(n=>same(n.square,center)||n.dwarf))
   return null;
  participants=neighbors.filter(n=>!same(n.square,center));
  configuration='throne-three';
 }else{
  if(!neighbors.every(n=>n.dwarf))return null;
  participants=neighbors;configuration='four';
 }
 if(!participants.some(n=>same(n.square,event.to)))return null;
 // Mover always enters first, then other dwarves in deterministic clockwise
 // order. Every real supporting statue participates in the final hit.
 const ordered=[moving,...participants.filter(n=>!same(n.square,event.to))
  .sort((a,b)=>a.index-b.index)];
 return {king,from:[...event.from],to:[...event.to],
  configuration,attackers:ordered.map(n=>({
   square:[...n.square],moved:same(n.square,event.to),
   direction:[n.square[0]-king[0],n.square[1]-king[1]],
   index:n.index
  }))};
}
const clamp=v=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;
export function siegeMotion(time,smooth,pulse){
 const t=clamp(time);
 return {
  move:smooth(t,.01,.175),
  threat:pulse(t,.12,.20,.24,.32),
  kingGuard:pulse(t,.19,.31,.45,.56),
  rally:smooth(t,.28,.54),
  finalBlow:pulse(t,.60,.72,.79,.87),
  collapse:smooth(t,.73,.87),
  fracture:smooth(t,.82,.96),
  crown:smooth(t,.68,.96),
  shock:pulse(t,.70,.76,.82,.96),
  camera:smooth(t,.03,.19)*(1-smooth(t,.90,1)),
 };
}
/* Individual hit, then every attacker makes a single coordinated final hit.
 * Two opposite dwarves cross their axes; four converge from four directions.
 * When the throne contributes as a wall, only three real dwarves swing. */
export function dwarfStrike(time,index,count,pulse){
 if(!Number.isInteger(count)||count<2||count>4||
    !Number.isInteger(index)||index<0||index>=count)return {windup:0,strike:0,finisher:0};
 const slot=.32/count,start=.245+index*slot;
 return {windup:pulse(time,start,start+slot*.27,start+slot*.39,start+slot*.52),
  strike:pulse(time,start+slot*.37,start+slot*.54,start+slot*.68,start+slot*.86),
  finisher:pulse(time,.60+index*.004,.71+index*.004,.78+index*.004,.88+index*.004)};
}
