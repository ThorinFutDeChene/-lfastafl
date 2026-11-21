/* Deterministic 0.7.0-dev2 combat choreography.
 * Pure timeline functions: no DOM, WebGL, random numbers or network access.
 * Each client may seek to the server's remaining-time position without replay. */
export const clamp01 = value => Number.isFinite(value) ? Math.min(1,Math.max(0,value)) : 0;
export const smooth = (value, start, end) => {
  if(!(end>start)) return value>=end?1:0;
  const t=clamp01((value-start)/(end-start));
  return t*t*(3-2*t);
};
export const pulse = (value, rise, top, fall, end) =>
  smooth(value,rise,top)*(1-smooth(value,fall,end));

/* Evenly distributed combat windows, with a short approach and exit.
 * Supports twelve simultaneous server-confirmed captures without extra time. */
export function duelWindow(index,count) {
  const total=Number.isInteger(count)?Math.max(1,Math.min(12,count)):1;
  const slot=Math.max(0,Math.min(total-1,Math.trunc(Number(index)||0)));
  const width=.61/total;
  return {start:.17+width*slot,end:.17+width*(slot+1)};
}
export function combatVariant(event,index=0) {
  const n=Number.isInteger(event?.n)?event.n:0;
  const r=Number.isInteger(event?.from?.[0])?event.from[0]:0;
  const c=Number.isInteger(event?.to?.[1])?event.to[1]:0;
  return ((n+r*3+c*5+index*7)%3+3)%3;
}
/* Feint -> parry -> sidestep and counter -> finishing blow -> shatter.
 * Pulse lengths scale to the assigned duel window; effects are all functions
 * of elapsed time, never cumulative frame deltas. */
export function duelMotion(t,start,end,variant=0) {
  const p=clamp01((t-start)/Math.max(.001,end-start));
  const direction=variant%2===0?1:-1;
  const feint=pulse(p,.025,.11,.18,.29);
  const guard=pulse(p,.145,.22,.34,.44);
  const dodge=pulse(p,.26,.34,.43,.55);
  const counter=pulse(p,.32,.41,.49,.59);
  const finish=pulse(p,.51,.65,.74,.84);
  const recoil=pulse(p,.72,.77,.87,.99);
  const fracture=smooth(p,.79,.93);
  const clash=pulse(p,.22,.25,.28,.37);
  const burst=pulse(p,.745,.76,.82,.89);
  const footwork=Math.sin(Math.PI*2*p)*pulse(p,.02,.16,.62,.81);
  return {p,direction,feint,guard,dodge,counter,finish,recoil,
    fracture,clash,burst,footwork};
}
