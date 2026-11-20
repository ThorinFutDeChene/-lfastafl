#!/usr/bin/env node
'use strict';
/* Hermetic king-escape cinematic planning; no browser, GL or services. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {test}=require('node:test');
const script=fs.readFileSync(path.join(__dirname,'..','web','escape-motion.js'),'utf8');
const load=()=>import('data:text/javascript;base64,'+Buffer.from(script).toString('base64'));
const game=()=>{
 const board=Array.from({length:11},()=>Array(11).fill('.'));
 board[0][2]='R';board[3][5]='E';board[9][5]='N';
 const event={n:7,piece:'R',from:[1,2],to:[0,2],captured:[],
  status:'finished',winner:'elf',reason:'escape'};
 return {board,event};
};
test('Historical king reaches a non-corner border and escapes north',async()=>{
 const {escapePlan}=await load(),{board,event}=game();
 assert.deepEqual(escapePlan(event,board,'historical'),{
  from:[1,2],to:[0,2],direction:[0,-1],edge:'row',kind:'royal-cavalry'});
});
test('Fetlar/Copenhagen escapes require a corner and diagonal cavalry direction',async()=>{
 const {escapePlan}=await load(),{board,event}=game();
 assert.equal(escapePlan(event,board,'fetlar'),null);
 assert.equal(escapePlan(event,board,'copenhagen'),null);
 board[0][2]='.';board[0][0]='R';
 const corner={...event,from:[2,0],to:[0,0]};
 for(const mode of ['fetlar','copenhagen']){
  const scene=escapePlan(corner,board,mode);
  assert(scene);
  assert.deepEqual(scene.to,[0,0]);
  assert(Math.abs(Math.hypot(...scene.direction)-1)<1e-12);
  assert(scene.direction[0]<0&&scene.direction[1]<0);
 }
});
test('Cavalry cannot run for an invalid or unrelated result',async()=>{
 const {escapePlan}=await load(),{board,event}=game();
 for(const changed of [
  {reason:'king_captured'},{reason:'escape',piece:'E'},{winner:'dwarf'},
  {status:'active'},{to:[6,6]},{to:[0,14]},{from:[12,3]}
 ])assert.equal(escapePlan({...event,...changed},board,'historical'),null);
 board[0][2]='.';
 assert.equal(escapePlan(event,board,'historical'),null);
});
test('Arrival then mount then gallop is deterministic; salutes and camera return',async()=>{
 const {escapePhases}=await load();
 const code=fs.readFileSync(path.join(__dirname,'..','web','combat-motion.js'),'utf8');
 const {smooth}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const a=escapePhases(.10,smooth),b=escapePhases(.60,smooth),c=escapePhases(.90,smooth);
 assert(a.approach>0&&a.mount===0&&a.gallop===0);
 assert(b.approach===1&&b.mount>0&&b.gallop===0);
 assert(c.mount===1&&c.gallop>0);
 assert.equal(escapePhases(1,smooth).camera,0);
 assert.equal(escapePhases(1,smooth).approach,1);
 assert.equal(escapePhases(1,smooth).gallop,1);
 let last={approach:0,horseApproach:0,mount:0,gallop:0};
 for(let i=0;i<=100;i++){
  const t=i/100,pose=escapePhases(t,smooth);
  assert.deepEqual(pose,escapePhases(t,smooth));
  assert(Object.values(pose).every(x=>Number.isFinite(x)&&x>=0&&x<=1));
  for(const name of Object.keys(last)){
   assert(pose[name]>=last[name]-1e-12,name+' may not run backwards');
   last[name]=pose[name];
  }
 }
});
