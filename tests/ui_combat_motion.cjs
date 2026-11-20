#!/usr/bin/env node
'use strict';
/* Hermetic tests for the time-driven combat grammar. No WebGL required. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'..','web','combat-motion.js'),'utf8');
async function load() {
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
test('Each combat window is bounded, ordered and ends before the camera reset',async()=>{
 const {duelWindow}=await load();
 for(let count=1;count<=12;count++){
  const windows=Array.from({length:count},(_,i)=>duelWindow(i,count));
  assert(Math.abs(windows[0].start-.17)<1e-9);
  assert(Math.abs(windows.at(-1).end-.78)<1e-9);
  for(let i=0;i<count;i++){
   assert(windows[i].end>windows[i].start);
   if(i)assert(Math.abs(windows[i-1].end-windows[i].start)<1e-9);
  }
 }
});
test('Feint, parry, sidestep, counterattack and finishing hit each peak',async()=>{
 const {duelMotion}=await load();
 const p=t=>duelMotion(t,0,1,1);
 assert(p(.12).feint>.95);
 assert(p(.25).guard>.95);
 assert(p(.36).dodge>.95);
 assert(p(.45).counter>.95);
 assert(p(.68).finish>.95);
 assert(p(.26).clash>.90);
 assert(p(.78).burst>.90);
 assert(p(.96).fracture===1);
 assert(p(-1).fracture===0);
});
test('Timed poses are deterministic and valid for mid-scene reconnects',async()=>{
 const {duelWindow,duelMotion}=await load();
 for(let count=1;count<=12;count++){
  for(let i=0;i<count;i++){
   const {start,end}=duelWindow(i,count);
   let last=0;
   for(let step=0;step<=100;step++){
    const t=step/100;
    const pose=duelMotion(t,start,end,i%3);
    assert.deepEqual(pose,duelMotion(t,start,end,i%3));
    assert(Object.values(pose).every(Number.isFinite));
    assert(pose.fracture>=last-1e-10,'A destroyed figure must never regrow');
    last=pose.fracture;
   }
  }
 }
});
test('Variations are stable per confirmed move and never use RNG',async()=>{
 const {combatVariant}=await load();
 const e={n:18,from:[5,1],to:[5,3]};
 const results=Array.from({length:6},(_,i)=>combatVariant(e,i));
 assert(results.every(x=>Number.isInteger(x)&&x>=0&&x<=2));
 assert.deepEqual(results,Array.from({length:6},(_,i)=>combatVariant(e,i)));
 assert.notEqual(results[0],results[1]);
});
