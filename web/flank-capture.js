/* Visual-only flank planner, using the authoritative post-move board. No
 * capture rule is evaluated here: only an existing server-confirmed removal
 * may acquire the optional two-figure choreography. */
const good = p => Array.isArray(p) && p.length===2 &&
  p.every(x => Number.isInteger(x) && x>=0 && x<11);
const same = (a,b) => a[0]===b[0] && a[1]===b[1];
export function flankPlan(event, board, captured) {
  if (!event || !good(event.from) || !good(event.to) ||
      !Array.isArray(board) || board.length!==11 ||
      !Array.isArray(captured) || captured.length!==3 ||
      !good(captured.slice(0,2))) return null;
  const [vr,vc,kind]=captured;
  const attacking=event.piece;
  if ((attacking!=='N' || kind!=='E') &&
      (attacking!=='E' || kind!=='N')) return null;
  const dr=vr-event.to[0],dc=vc-event.to[1];
  if (Math.abs(dr)+Math.abs(dc)!==1) return null;
  const supporter=[vr+dr,vc+dc];
  if (!good(supporter) || board[supporter[0]]?.[supporter[1]]!==attacking ||
      same(supporter,event.to) || same(supporter,event.from)) return null;
  const travel=[Math.sign(event.to[0]-event.from[0]),
                Math.sign(event.to[1]-event.from[1])];
  if(Math.abs(travel[0])+Math.abs(travel[1])!==1 ||
     board[event.to[0]]?.[event.to[1]]!==attacking) return null;
  const pause=[event.to[0]-travel[0],event.to[1]-travel[1]];
  if(!good(pause))return null;
  return {supporter,pause,victim:[vr,vc],victimKind:kind,
    style:attacking==='E'?'elf-arrow-sword':'dwarf-double-axe'};
}
/* A single local timeline for the incoming attacker, the defending statue
 * and the supporting ally. Fractions are relative to this victim's duel slot.
 * No animation property is accumulated from frame to frame. */
export function flankPhases(p,smooth,pulse) {
  const incoming=pulse(p,.24,.34,.37,.45);
  const parry=pulse(p,.30,.38,.45,.53);
  const recoil=pulse(p,.35,.46,.55,.67);
  const windup=pulse(p,.43,.57,.62,.72);
  const cleave=pulse(p,.61,.74,.82,.91);
  const split=smooth(p,.77,.92);
  return {incoming,parry,recoil,windup,cleave,split,
    finish:smooth(p,.82,.98)};
}
