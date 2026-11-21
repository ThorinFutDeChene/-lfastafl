/* Authentic single-soldier capture against an EMPTY hostile throne.
 * The Tafl engine already confirmed and removed the enemy from the board.
 * Either camp may use the throne. This module adds visual choreography only. */
const valid=p=>Array.isArray(p)&&p.length===2&&
 p.every(x=>Number.isInteger(x)&&x>=0&&x<11);
const center=[5,5];
const adjacent=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])===1;
export function throneCapturePlan(event,board,mode) {
 if(!event||!['historical','fetlar','copenhagen'].includes(mode)||
    !['N','E'].includes(event.piece)||!valid(event.from)||!valid(event.to)||
    !Array.isArray(event.captured)||event.captured.length!==1||
    !Array.isArray(board)||board.length!==11||
    !board.every(row=>Array.isArray(row)&&row.length===11)||
    board[5][5]!=='.'||board[event.to[0]][event.to[1]]!==event.piece)
  return null;
 const victim=event.captured[0];
 const victimKind=event.piece==='N'?'E':'N';
 if(!Array.isArray(victim)||victim.length!==3||victim[2]!==victimKind||
    !valid(victim.slice(0,2)))return null;
 const square=victim.slice(0,2);
 // The moving soldier cannot have started on the enemy's occupied square
 // or on its own final destination. Reject fabricated/old capture events.
 if((event.from[0]===square[0]&&event.from[1]===square[1])||
    (event.from[0]===event.to[0]&&event.from[1]===event.to[1]))
  return null;
 const dr=square[0]-event.to[0],dc=square[1]-event.to[1];
 if(Math.abs(dr)+Math.abs(dc)!==1||
    square[0]+dr!==5||square[1]+dc!==5||
    !adjacent(square,center)||board[square[0]][square[1]]!=='.')
  return null;
 const step=[Math.sign(event.to[0]-event.from[0]),
             Math.sign(event.to[1]-event.from[1])];
 if(Math.abs(step[0])+Math.abs(step[1])!==1||
    (step[0]!==0&&event.to[1]!==event.from[1])||
    (step[1]!==0&&event.to[0]!==event.from[0]))
  return null;
 const pause=[event.to[0]-step[0],event.to[1]-step[1]];
 if(!valid(pause))return null;
 return {style:event.piece==='N'?'dwarf-throne-smash':'elf-throne-volley',
  attacker:[...event.to],victim:square,victimKind,throne:[...center],
  from:[...event.from],pause, direction:[dr,dc]};
}
export function thronePhases(time,smooth,pulse){
 const t=Number.isFinite(time)?Math.max(0,Math.min(1,time)):0;
 const arrival=smooth(t,.015,.24);
 const opening=pulse(t,.25,.35,.41,.48);
 const guard=pulse(t,.32,.42,.49,.56);
 const recoil=pulse(t,.40,.49,.55,.65);
 const windup=pulse(t,.54,.65,.70,.76);
 const killingBlow=pulse(t,.68,.77,.83,.90);
 const knockback=smooth(t,.74,.87);
 const fracture=smooth(t,.83,.96);
 const shock=pulse(t,.76,.79,.83,.90);
 const finish=smooth(t,.83,.98);
 const camera=smooth(t,.06,.20)*(1-smooth(t,.88,1));
 return {arrival,opening,guard,recoil,windup,killingBlow,knockback,
  fracture,shock,finish,camera};
}
