#!/usr/bin/env node
'use strict';
/* End-to-end verification of the DEV9 SINGLE fullscreen host shell.
 * No UFW operations. The simulated LAN exposes the real admin-only
 * invitation/QR endpoint; no guest gains access before explicit approval. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'alfastafl-single-shell-'));
const python=process.env.TUTORIAL_TEST_PYTHON||'python3';
const environment={...process.env,
 PYTHONPATH:[path.join(root,'src'),process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)};
let server,browser;const report={scenarios:[],errors:[]};
async function check(name,task){
 try{await task();report.scenarios.push({name,ok:true});console.log('PASS '+name);}
 catch(error){report.scenarios.push({name,ok:false,message:String(error)});throw error;}
}
const code=`
import json,signal,sys
from alfastafl.server import Store,run
store=Store(sys.argv[1])
server=run('127.0.0.1',0,store)
# Test-only simulation: real QR generation and approval, no firewall leases.
server.lan_enabled=True
server.lan_address='127.0.0.1'
def interrupt(*_):raise KeyboardInterrupt
signal.signal(signal.SIGTERM,interrupt)
print(json.dumps({'port':server.server_address[1]}),flush=True)
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:store.shutdown();server.server_close()
`;
async function startServer(){
 server=spawn(python,['-u','-c',code,path.join(temporary,'games')],{
  cwd:root,env:environment,stdio:['ignore','pipe','pipe']});
 return new Promise((resolve,reject)=>{
  let data='',error='';
  const timer=setTimeout(()=>reject(Error('Python startup timed out')),16000);
  server.stderr.on('data',chunk=>error+=chunk.toString());
  server.once('exit',exit=>reject(Error('Python exited '+exit+': '+error)));
  server.stdout.on('data',chunk=>{
   data+=chunk.toString();if(!data.includes('\n'))return;
   try{const conf=JSON.parse(data.slice(0,data.indexOf('\n')));
    clearTimeout(timer);resolve('http://127.0.0.1:'+conf.port);
   }catch(e){reject(e);}
  });
 });
}
async function main(){
 const base=await startServer();
 browser=await chromium.launch({headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();page.setDefaultTimeout(16000);
 let pages=1;
 context.on('page',opened=>{
  if(opened!==page)pages++;
  opened.on('pageerror',error=>report.errors.push(String(error)));
 });
 page.on('pageerror',error=>report.errors.push(String(error)));
 page.on('dialog',dialog=>dialog.accept());
 const open=mode=>page.evaluate(mode=>window.AlfastaflShell.open(mode),mode);
 const gameId=()=>page.evaluate(()=>gameId);
 const state=async id=>(await(await context.request.get(
  base+'/api/state?game='+encodeURIComponent(id))).json());
 const eventual=fn=>page.waitForFunction(fn);
 await page.goto(base+'/?desktop=shell',{waitUntil:'domcontentloaded'});
 await eventual(()=>window.AlfastaflShell&&document.body.classList.contains('desktop-shell'));
 await check('Only one fullscreen board is visible; QR rail and menus replace management UI',async()=>{
  assert.equal(await page.locator('#game-board-view').isVisible(),true);
  assert.equal(await page.locator('#host').isVisible(),false);
  assert.equal(await page.locator('#shell-qr-column').isVisible(),true);
  assert.equal(await page.locator('#shell-empty-board').isVisible(),true);
  assert.equal(await page.locator('#shell-player-image').isVisible(),false);
  assert.equal(await page.locator('#shell-spectator-image').isVisible(),false);
  const box=await page.evaluate(()=>{
   const a=document.getElementById('shell-qr-column').getBoundingClientRect();
   const b=document.getElementById('game-board-view').getBoundingClientRect();
   return {rail:[a.x,a.y,a.width,a.height],game:[b.x,b.y,b.width,b.height],
    viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  assert.equal(box.rail[0],0);
  assert(Math.abs(box.game[0]-box.rail[2])<=2,JSON.stringify(box));
  assert(Math.abs(box.game[2]+box.rail[2]-box.viewport[0])<=2);
  assert(Math.abs(box.game[3]-box.viewport[1])<=2);
  assert.equal(box.overflow,false);
 });
 await check('Paramètres opens a modal window for game rules, time, 3D, sound, and camera',async()=>{
  assert.equal(await open('settings'),true);
  await page.locator('#shell-settings-dialog[open]').waitFor();
  for(const id of ['mode','time-mode','capture-duration','reconnect-minutes',
    'game-board-quality','game-board-mode','audio-toggle','audio-music',
    'audio-effects','game-camera-top']){
    assert.equal(await page.locator('#shell-settings-dialog #'+id).count(),1,id);
  }
  await page.selectOption('#mode','fetlar');
  await page.selectOption('#capture-duration','4');
  await page.selectOption('#game-board-quality','eco');
  assert.equal(await page.locator('#game-board-quality').inputValue(),'eco');
  await page.locator('#shell-settings-dialog [data-shell-close]').click();
  assert.equal(await page.locator('#shell-settings-dialog').evaluate(el=>el.open),false);
 });
 let id;
 await check('Fichier > Nouvelle partie creates the board in the SAME window',async()=>{
  await open('new');
  await page.locator('#shell-new-dialog[open]').waitFor();
  await page.selectOption('#create-host-camp','');
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/create');
  await page.locator('#shell-new-dialog #create').click();
  assert.equal((await response).status(),200);
  await eventual(()=>document.getElementById('shell-new-dialog').open===false&&
   document.getElementById('game-board-view').dataset.state==='ready'&&
   document.getElementById('game-board-3d')?.board3d?.getDiagnostics().pieceCount===37);
  id=await gameId();assert(id);
  assert.equal(await page.locator('#shell-empty-board').isVisible(),false);
  assert.equal(pages,1,'No secondary board or manager window should open');
  const game=(await state(id)).game;
  assert.equal(game.mode,'fetlar');
  assert.equal(game.status,'active');
  assert.equal(game.settings.capture_cinematic_seconds,4);
 });
 await check('Player QR top-left, spectator QR bottom-left, both stable across polling',async()=>{
  await eventual(()=>['shell-player-image','shell-spectator-image'].every(id=>
   document.getElementById(id).naturalWidth>0&&!document.getElementById(id).hidden));
  const top=await page.locator('#shell-player-code').boundingBox();
  const bottom=await page.locator('#shell-spectator-code').boundingBox();
  assert(top.y+top.height<bottom.y,'Player QR must be above spectator QR');
  assert(top.x<200&&bottom.x<200,'Both QRs must remain in LEFT rail');
  const first=await page.locator('#shell-player-image').getAttribute('src');
  const second=await page.locator('#shell-spectator-image').getAttribute('src');
  assert.match(first,/role=player/);
  assert.match(second,/role=spectator/);
  await page.waitForTimeout(2200);
  assert.equal(await page.locator('#shell-player-image').getAttribute('src'),first);
  assert.equal(await page.locator('#shell-spectator-image').getAttribute('src'),second);
 });
 await check('Both QRs request APPROVAL; network never bypasses host authorization',async()=>{
  const invites=(await state(id)).invites;
  for(const role of ['player','spectator']){
   const request=await context.request.post(base+'/api/join',{data:{
    game:id,invite:invites[role],name:'Demande '+role}});
   assert.equal(request.status(),200);
   const req=(await request.json()).request;
   const pending=(await(await context.request.get(base+'/api/pending')).json()).pending;
   assert(pending.some(x=>x.id===req&&x.role===role));
  }
  await open('connections');
  await eventual(()=>document.querySelectorAll('#shell-connections-dialog #pending button').length>=3);
  const firstPending=page.locator('#shell-connections-dialog #pending>div').first();
  assert.match(await firstPending.textContent(),/player/);
  await page.locator('#shell-connections-dialog [data-shell-close]').click();
 });
 await check('Partie menu can seat the host as a player without moving the board',async()=>{
  await open('game');
  await page.locator('#shell-game-dialog #host-play-dwarf').click();
  await eventual(()=>document.getElementById('shell-game-dialog').open===false);
  await page.waitForFunction(()=>Boolean(session)&&you?.role==='player'&&you.camp==='dwarf');
  assert.equal(pages,1);
  const authenticated=await context.request.get(base+'/api/state?game='+id+
   '&session='+encodeURIComponent(await page.evaluate(()=>session)));
  assert.equal((await authenticated.json()).you.camp,'dwarf');
  assert.equal(await page.locator('#shell-player-code').isVisible(),true);
 });
 await check('Fichier > Sauvegardes handles pause, resume and deletion',async()=>{
  // Verify that the real host save operation never closes the fullscreen shell.
  await open('saves');
  await page.locator('#shell-saves-dialog #save-leave').click();
  await page.waitForFunction(()=>game?.status==='paused');
  assert.equal((await state(id)).game.status,'paused');
  assert.equal(await page.locator('#shell-saves-dialog #resume-game').isVisible(),true);
  await page.locator('#shell-saves-dialog #resume-game').click();
  await page.waitForFunction(()=>game?.status==='active');
  assert.equal((await state(id)).game.status,'active');
  await open('saves');
  await page.locator('#shell-saves-dialog #save-leave').click();
  await page.waitForFunction(()=>game?.status==='paused');
  await open('saves');
  const deletion=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/delete');
  await page.locator('#shell-saves-dialog #game-list .game-delete').first().click();
  assert.equal((await deletion).status(),200);
  await page.waitForFunction(()=>!gameId&&document.getElementById('shell-empty-board')?.hidden===false);
  assert.equal(await page.locator('#shell-player-image').isVisible(),false);
  assert.equal(await page.locator('#shell-spectator-image').isVisible(),false);
  assert.equal(pages,1);
  await page.locator('#shell-saves-dialog [data-shell-close]').click();
 });
 await check('Tutorial is a modal window, never a second fullscreen game',async()=>{
  await open('tutorial');
  await eventual(()=>document.getElementById('tutorial-panel').open&&
   document.querySelectorAll('#tutorial-board button').length===121&&
   document.getElementById('tutorial-panel').getAttribute('aria-busy')==='false');
  assert.equal(pages,1);
  await page.locator('#tutorial-close').click();
  await page.waitForFunction(()=>document.getElementById('tutorial-panel').open===false);
  assert.equal(await page.locator('#game-board-view').isVisible(),true);
 });
 await check('Both QRs disappear on LAN shutdown and come back only with LAN and a game',async()=>{
  await open('new');
  await page.locator('#create').click();
  await page.waitForFunction(()=>Boolean(game)&&game.status==='active'&&
    !document.getElementById('shell-player-image').hidden);
  const route='**/api/address';
  await context.route(route,async r=>r.fulfill({status:200,contentType:'application/json',
   body:JSON.stringify({address:'127.0.0.1',port:new URL(base).port,lan_enabled:false})}));
  await page.waitForFunction(()=>['shell-player-image','shell-spectator-image'].every(id=>
   document.getElementById(id).hidden));
  await context.unroute(route);
  await page.waitForFunction(()=>['shell-player-image','shell-spectator-image'].every(id=>
   !document.getElementById(id).hidden));
  assert.equal(pages,1);
 });
 assert.deepEqual(report.errors,[],'Unexpected JS errors');
 await context.close();
}
const timer=setTimeout(()=>{browser?.close().catch(()=>{});server?.kill('SIGTERM')},220000);
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;})
 .finally(async()=>{clearTimeout(timer);await browser?.close().catch(()=>{});
  if(server)server.kill('SIGTERM');
  fs.rmSync(temporary,{recursive:true,force:true});});
