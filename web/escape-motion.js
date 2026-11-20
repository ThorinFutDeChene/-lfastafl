/* Álfastafl: pure choreography for the king's SERVER-CONFIRMED escape.
 * Display-only data. No move validation, RNG, extra turns or side effects. */
export const exitSquare=p=>Array.isArray(p)&&p.length===2&&
 p.every(v=>Number.isInteger(v)&&v>=0&&v<11)&&
 (p[0]===0||p[0]===10||p[1]===0||p[1]===10);
export function escapePlan(event,board,mode) {
 if(event?.reason!=='escape'||event?.piece!=='R'||
    event?.winner!=='elf'||event?.status!=='finished'||
    !exitSquare(event.to)||!Array.isArray(event.from)||
    event.from.length!==2||event.from.some(v=>!Number.isInteger(v)||v<0||v>10)||
    !Array.isArray(board)||board.length!==11||
    board[event.to[0]]?.[event.to[1]]!=='R')return null;
 if(mode!=='historical' && !([0,10].includes(event.to[0])&&
    [0,10].includes(event.to[1])))return null;
 const row=event.to[0],col=event.to[1];
 const dx=col===0?-1:col===10?1:0;
 const dz=row===0?-1:row===10?1:0;
 const len=Math.hypot(dx,dz);
 return {from:[...event.from],to:[row,col],direction:[dx/len,dz/len],
  edge:dx&&dz?'corner':dx?'column':'row',kind:'royal-cavalry'};
}
export function escapePhases(time,smooth) {
 const t=Math.max(0,Math.min(1,Number(time)||0));
 const approach=smooth(t,.015,.22);
 const horseApproach=smooth(t,.15,.48);
 const mount=smooth(t,.43,.67);
 const gallop=smooth(t,.68,.995);
 const salutes=smooth(t,.17,.36)*(1-smooth(t,.85,1));
 const anger=smooth(t,.21,.40)*(1-smooth(t,.81,.98));
 const camera=smooth(t,.05,.22)*(1-smooth(t,.88,1));
 const triumph=smooth(t,.55,.69);
 return {approach,horseApproach,mount,gallop,salutes,anger,camera,triumph};
}
