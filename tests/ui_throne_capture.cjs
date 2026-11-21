#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {test}=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'..','web','throne-capture.js'),'utf8');
const load=()=>import('data:text/javascript;base64,'+
 Buffer.from(source).toString('base64'));
function fixture(attacker='N',mode='fetlar'){
 const board=Array.from({length:11},()=>Array(11).fill('.'));
 const victim=attacker==='N'?'E':'N';
 board[5][3]=attacker;board[8][8]='R';
 const event={n:1,from:[5,1],to:[5,3],piece:attacker,
   captured:[[5,4,victim]],status:'active',winner:null,reason:null};
 return {board,event,mode,victim};
}
test('All three rule modes accept a genuine one-dwarf versus one-elf throne capture',async()=>{
 const {throneCapturePlan}=await load();
 for(const mode of ['historical','fetlar','copenhagen']){
  const {board,event}=fixture('N',mode);
  assert.deepEqual(throneCapturePlan(event,board,mode),{
   style:'dwarf-throne-smash',attacker:[5,3],victim:[5,4],victimKind:'E',
   throne:[5,5],from:[5,1],pause:[5,2],direction:[0,1]
  });
 }
});
test('An elf can also capture a dwarf against the same empty throne in every mode',async()=>{
 const {throneCapturePlan}=await load();
 for(const mode of ['historical','fetlar','copenhagen']){
  const {board,event}=fixture('E',mode);
  const plan=throneCapturePlan(event,board,mode);
  assert.equal(plan.style,'elf-throne-volley');
  assert.equal(plan.victimKind,'N');
  assert.deepEqual(plan.pause,[5,2]);
  assert.deepEqual(plan.throne,[5,5]);
  assert.deepEqual(plan.attacker,[5,3]);
 }
});
test('Only a captured enemy between the mover and an EMPTY throne qualifies',async()=>{
 const {throneCapturePlan}=await load();
 const {board,event}=fixture('E');
 for(const change of [
  {captured:[]},{captured:[[5,4,'E']]},
  {captured:[[5,4,'N'],[4,4,'N']]},
  {captured:[[4,4,'N']]},{captured:[[5,6,'N']]},
  {piece:'R'},{to:[5,2]},{from:[5,4]},{from:[4,1]}
 ])assert.equal(throneCapturePlan({...event,...change},board,'fetlar'),null);
 board[5][5]='R';assert.equal(throneCapturePlan(event,board,'fetlar'),null);
 board[5][5]='.';board[5][4]='N';
 assert.equal(throneCapturePlan(event,board,'fetlar'),null);
 board[5][4]='.';board[5][3]='.';
 assert.equal(throneCapturePlan(event,board,'fetlar'),null);
 assert.equal(throneCapturePlan(event,board,'unknown'),null);
});
test('Single-square attacks have a legal pause; long ones keep penultimate square',async()=>{
 const {throneCapturePlan}=await load();
 const {board,event}=fixture('E');
 event.from=[5,2];
 assert.deepEqual(throneCapturePlan(event,board,'historical').pause,[5,2]);
});
test('Camera and fracture progress deterministically through each duel',async()=>{
 const {thronePhases}=await load();
 const motion=fs.readFileSync(path.join(__dirname,'..','web','combat-motion.js'),'utf8');
 const {smooth,pulse}=await import('data:text/javascript;base64,'+
  Buffer.from(motion).toString('base64'));
 let last=0;
 for(let t=0;t<=100;t++){
  const pose=thronePhases(t/100,smooth,pulse);
  assert.deepEqual(pose,thronePhases(t/100,smooth,pulse));
  assert(Object.values(pose).every(x=>x>=0&&x<=1&&Number.isFinite(x)));
  assert(pose.fracture>=last,'Destroyed statue must not regrow');
  last=pose.fracture;
 }
 const at=t=>thronePhases(t,smooth,pulse);
 for(const [key,time] of Object.entries({opening:.35,guard:.42,
   windup:.65,killingBlow:.77,shock:.79}))
  assert(at(time)[key]>.95,key);
 assert.equal(at(.24).arrival,1);
 assert.equal(at(.98).finish,1);
 assert.equal(at(1).fracture,1);
 assert.equal(at(1).camera,0);
});
