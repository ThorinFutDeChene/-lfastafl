#!/usr/bin/env node
'use strict';
/* King defeat choreography must use only the real rule-dependent attackers. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {test}=require('node:test');
const code=fs.readFileSync(path.join(__dirname,'..','web','king-siege-motion.js'),'utf8');
const load=()=>import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const blank=()=>Array.from({length:11},()=>Array(11).fill('.'));
const record=(from,to)=>({n:6,from,to,piece:'N',captured:[],
  reason:'king_captured',status:'finished',winner:'dwarf'});
test('Historical normal capture activates just the two real opposed dwarves',async()=>{
 const {kingSiegePlan}=await load(),board=blank();
 board[4][4]='R';board[4][3]='N';board[4][5]='N';
 const event=record([4,7],[4,5]);
 const plan=kingSiegePlan(event,board,'historical');
 assert.equal(plan.configuration,'two');assert.equal(plan.attackers.length,2);
 assert.deepEqual(plan.king,[4,4]);
 assert.deepEqual(plan.attackers.map(a=>a.square),[[4,5],[4,3]]);
 assert.equal(plan.attackers.filter(a=>a.moved).length,1);
 assert.deepEqual(plan.from,[4,7]);
});
test('Fetlar and Copenhagen king surrounded by four active nains',async()=>{
 const {kingSiegePlan}=await load(),board=blank();
 board[4][4]='R';
 for(const [r,c] of [[4,5],[4,3],[3,4],[5,4]])board[r][c]='N';
 const event=record([4,7],[4,5]);
 for(const mode of ['fetlar','copenhagen']){
  const plan=kingSiegePlan(event,board,mode);
  assert.equal(plan.configuration,'four');
  assert.equal(plan.attackers.length,4);
  assert.equal(plan.attackers.filter(a=>a.moved).length,1);
  assert.deepEqual(plan.attackers[0].square,[4,5]);
 }
 // Tawlbwrdd only needs the two dwarves on the axis of the last move,
 // even if more dwarves happen to be nearby.
 assert.equal(kingSiegePlan(event,board,'historical').attackers.length,2);
});
test('Throne-adjacent three-sculpture trap is not secretly made into four',async()=>{
 const {kingSiegePlan}=await load(),board=blank();
 board[5][4]='R';
 for(const [r,c] of [[4,4],[6,4],[5,3]])board[r][c]='N';
 const event=record([5,1],[5,3]);
 for(const mode of ['historical','copenhagen']){
  const plan=kingSiegePlan(event,board,mode);
  assert(plan);
  assert.equal(plan.configuration,'throne-three');
  assert.equal(plan.attackers.length,3);
  assert(!plan.attackers.some(a=>a.square[0]===5&&a.square[1]===5),
    'No imaginary dwarf may occupy an empty throne');
 }
 assert.equal(kingSiegePlan(event,board,'fetlar'),null);
 board[5][5]='E';
 assert.equal(kingSiegePlan(event,board,'copenhagen'),null);
});
test('Historical center king requires four authentic dwarves',async()=>{
 const {kingSiegePlan}=await load(),board=blank();
 board[5][5]='R';
 for(const [r,c] of [[4,5],[6,5],[5,4],[5,6]])board[r][c]='N';
 const plan=kingSiegePlan(record([5,8],[5,6]),board,'historical');
 assert.equal(plan.configuration,'four');assert.equal(plan.attackers.length,4);
});
test('Rejects fabricated victory, missing attackers and incorrect king positions',async()=>{
 const {kingSiegePlan}=await load(),board=blank();
 board[4][4]='R';board[4][3]='N';board[4][5]='N';
 const event=record([4,7],[4,5]);
 for(const change of [
  {reason:'encirclement'}, {reason:'king_captured',winner:'elf'},
  {piece:'E'},{status:'active'},{to:[4,9]},{to:[12,4]}
 ])assert.equal(kingSiegePlan({...event,...change},board,'historical'),null);
 board[4][3]='.';
 assert.equal(kingSiegePlan(event,board,'historical'),null);
 board[4][3]='N';board[4][4]='.';
 assert.equal(kingSiegePlan(event,board,'historical'),null);
});
test('Move, parries, individual blows and final synchronized strike are frame deterministic',async()=>{
 const {siegeMotion,dwarfStrike}=await load();
 const src=fs.readFileSync(path.join(__dirname,'..','web','combat-motion.js'),'utf8');
 const {smooth,pulse}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
 for(const count of [2,3,4]){
  let previous=0;
  for(let step=0;step<=100;step++){
   const t=step/100;
   const m=siegeMotion(t,smooth,pulse);
   assert.deepEqual(m,siegeMotion(t,smooth,pulse));
   assert(Object.values(m).every(v=>Number.isFinite(v)&&v>=0&&v<=1));
   assert(m.fracture>=previous);
   previous=m.fracture;
   for(let i=0;i<count;i++){
    const action=dwarfStrike(t,i,count,pulse);
    assert.deepEqual(action,dwarfStrike(t,i,count,pulse));
    assert(Object.values(action).every(v=>Number.isFinite(v)&&v>=0&&v<=1));
   }
  }
  for(let i=0;i<count;i++){
   const at=.245+(i+.54)*(.32/count);
   assert(dwarfStrike(at,i,count,pulse).strike>.90);
   assert(dwarfStrike(.735,i,count,pulse).finisher>.90,
     'Every authentic dwarf participates in the final blow');
  }
 }
 assert.equal(siegeMotion(.175,smooth,pulse).move,1);
 assert.equal(siegeMotion(1,smooth,pulse).fracture,1);
 assert.equal(siegeMotion(1,smooth,pulse).camera,0);
});
