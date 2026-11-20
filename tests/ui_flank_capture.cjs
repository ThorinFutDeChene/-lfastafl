#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'..','web','flank-capture.js'),'utf8');
const load=()=>import('data:text/javascript;base64,'+
 Buffer.from(source).toString('base64'));
const blank=()=>Array.from({length:11},()=>Array(11).fill('.'));
function fixture(attacker,victim) {
 const board=blank();
 board[5][3]=attacker;
 board[5][5]=attacker;
 board[8][8]='R';
 const record={n:1,piece:attacker,from:[5,1],to:[5,3],
  captured:[[5,4,victim]],reason:null};
 return {board,record};
}
test('Elf arrow and rear sword require two confirmed elf statues across a dwarf',async()=>{
 const {flankPlan}=await load();
 const {board,record}=fixture('E','N');
 assert.deepEqual(flankPlan(record,board,record.captured[0]),{
  supporter:[5,5],pause:[5,2],victim:[5,4],
  victimKind:'N',style:'elf-arrow-sword'});
 assert.equal(board[5][4],'.','The soldier must already be removed by server');
 const {attackAnchor}=await load();
 assert.deepEqual(attackAnchor(flankPlan(record,board,record.captured[0]),record.to),
  [5,2],'Elf may remain a square short before shooting');
});
test('Dwarf arriving with axe uses rear allied dwarf as decisive axe',async()=>{
 const {flankPlan}=await load();
 const {board,record}=fixture('N','E');
 assert.equal(flankPlan(record,board,record.captured[0]).style,'dwarf-double-axe');
 assert.deepEqual(flankPlan(record,board,record.captured[0]).supporter,[5,5]);
 const {attackAnchor}=await load();
 assert.deepEqual(attackAnchor(flankPlan(record,board,record.captured[0]),record.to),
  [5,3],'Dwarf must be on its final square before a melee axe swing');
});
test('No fictional participant for a corner, the throne or a wrong camp',async()=>{
 const {flankPlan}=await load();
 const {board,record}=fixture('E','N');
 board[5][5]='.';
 assert.equal(flankPlan(record,board,record.captured[0]),null);
 board[5][5]='N';
 assert.equal(flankPlan(record,board,record.captured[0]),null);
 board[5][5]='R';
 assert.equal(flankPlan(record,board,record.captured[0]),null);
 board[5][5]='E';
 assert.equal(flankPlan(record,board,[6,6,'N']),null);
 assert.equal(flankPlan({...record,piece:'R'},board,record.captured[0]),null);
 assert.equal(flankPlan({...record,from:[5,3]},board,record.captured[0]),null);
 assert.equal(flankPlan({...record,to:[5,10]},board,record.captured[0]),null);
});
test('First legal pause is source when incoming move advances one square',async()=>{
 const {flankPlan}=await load();
 const {board,record}=fixture('E','N');
 record.from=[5,2];
 assert.deepEqual(flankPlan(record,board,record.captured[0]).pause,[5,2]);
});
test('Visual stages are deterministic and destruction is irreversible',async()=>{
 const {flankPhases}=await load();
 const motion=fs.readFileSync(path.join(__dirname,'..','web','combat-motion.js'),'utf8');
 const {smooth,pulse}=await import('data:text/javascript;base64,'+
  Buffer.from(motion).toString('base64'));
 let last=0;
 for(let i=0;i<=100;i++){
  const p=i/100;
  const f=flankPhases(p,smooth,pulse);
  assert.deepEqual(f,flankPhases(p,smooth,pulse));
  assert(Object.values(f).every(x=>x>=0&&x<=1&&Number.isFinite(x)));
  assert(f.split>=last);last=f.split;
 }
 for(const [name,t] of Object.entries({incoming:.34,parry:.38,windup:.57,cleave:.74,split:.95,finish:1}))
  assert(flankPhases(t,smooth,pulse)[name]>.95, name);
});
