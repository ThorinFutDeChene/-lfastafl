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
 await check('Tournament ? beside format explains Swiss and elimination correctly',async()=>{
  assert.equal(await open('tournament'),true);
  await page.locator('#shell-tournament-dialog[open]').waitFor();
  const format=page.locator('#tournament-format');
  const help=page.locator('#tournament-format-help');
  const explanation=page.locator('#tournament-format-explanation');
  assert.equal(await help.getAttribute('aria-expanded'),'false');
  assert.equal(await explanation.isVisible(),false);
  const selectBox=await format.boundingBox();
  const helpBox=await help.boundingBox();
  assert(selectBox&&helpBox);
  assert(helpBox.x>=selectBox.x+selectBox.width-2,
   'The ? must be immediately to the RIGHT of the tournament format select');
  assert(Math.abs(helpBox.y-selectBox.y)<17,'The ? must line up with its dropdown');
  await format.selectOption('swiss');
  await help.click();
  assert.equal(await help.getAttribute('aria-expanded'),'true');
  assert.equal(await explanation.isVisible(),true);
  const swiss=explanation.locator('[data-tournament-format="swiss"]');
  assert.equal(await swiss.isVisible(),true);
  assert.match(await swiss.textContent(),/3/);
  assert.match(await swiss.textContent(),/1/);
  assert.match(await swiss.textContent(),/points|score/i);
  assert.match(await swiss.textContent(),/rondes/i);
  assert.equal(await page.locator('#tournament-rounds').isEnabled(),true);
  await format.selectOption('knockout');
  assert.equal(await swiss.isVisible(),false);
  const elimination=explanation.locator('[data-tournament-format="knockout"]');
  assert.equal(await elimination.isVisible(),true);
  assert.match(await elimination.textContent(),/vainqueur/i);
  assert.match(await elimination.textContent(),/éliminé/i);
  assert.match(await elimination.textContent(),/exemptions/i);
  assert.equal(await page.locator('#tournament-rounds').isEnabled(),false);
  await format.selectOption('round_robin');
  assert.equal(await explanation.locator('[data-tournament-format="round_robin"]').isVisible(),true);
  assert.equal(await elimination.isVisible(),false);
  await help.click();
  assert.equal(await explanation.isVisible(),false);
  assert.equal(await help.getAttribute('aria-expanded'),'false');
  await page.locator('#shell-tournament-dialog [data-shell-close]').click();
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
  assert.match(await firstPending.textContent(),/Joueur/);
  const firstChoices=firstPending.locator('button.pending-approve');
  assert.equal(await firstChoices.count(),2,
   'When host is observing, the first remote player chooses one of two free camps');
  assert.deepEqual(await firstChoices.evaluateAll(buttons=>
   buttons.map(button=>button.dataset.camp)),['elf','dwarf']);
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
 await check('When the host plays Dwarves, a waiting phone has ONE automatic Elf approval',async()=>{
  await open('connections');
  await page.waitForFunction(()=>document.querySelector(
   '#shell-connections-dialog #pending .pending-request[data-role="player"] .pending-approve'
  )?.textContent.includes('Elfes'));
  const guest=page.locator('#shell-connections-dialog #pending .pending-request[data-role="player"]');
  assert.equal(await guest.locator('.pending-approve').count(),1,
    'The opposite camp must be forced when the PC host is a player');
  assert.equal(await guest.locator('.pending-approve').textContent(),'Autoriser — Elfes');
  const approving=page.waitForResponse(response=>
   new URL(response.url()).pathname==='/api/approve'&&response.status()===200);
  await guest.locator('.pending-approve').click();
  const assigned=await (await approving).json();
  assert.equal(assigned.camp,'elf');
  assert.equal((await state(id)).seats.elf.name,'Demande player');
  await page.locator('#shell-connections-dialog [data-shell-close]').click();
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
 await check('Two remote phones: first chooses, second automatically inherits remaining camp',async()=>{
  const id2=await gameId();
  const invite=(await state(id2)).invites.player;
  for(const name of ['Premier téléphone','Deuxième téléphone']){
   const result=await context.request.post(base+'/api/join',{data:{game:id2,invite,name}});
   assert.equal(result.status(),200);
  }
  await open('connections');
  const requests=page.locator('#shell-connections-dialog #pending .pending-request[data-role="player"]');
  await page.waitForFunction(()=>document.querySelectorAll(
   '#shell-connections-dialog #pending .pending-request[data-role="player"]').length===2);
  assert.equal(await requests.nth(0).locator('.pending-approve').count(),2);
  const assigned=page.waitForResponse(response=>
   new URL(response.url()).pathname==='/api/approve'&&response.status()===200);
  await requests.nth(0).locator('button.pending-approve[data-camp="elf"]').click();
  assert.equal((await (await assigned).json()).camp,'elf');
  await page.waitForFunction(()=>{
   const requests=document.querySelectorAll('#shell-connections-dialog #pending .pending-request[data-role="player"]');
   return requests.length===1&&requests[0].querySelectorAll('.pending-approve').length===1;
  });
  const second=requests.first();
  assert.equal(await second.locator('.pending-approve').textContent(),'Autoriser — Nains');
  const approved=page.waitForResponse(response=>
   new URL(response.url()).pathname==='/api/approve'&&response.status()===200);
  await second.locator('.pending-approve').click();
  assert.equal((await (await approved).json()).camp,'dwarf');
  const seats=(await state(id2)).seats;
  assert.equal(seats.elf.name,'Premier téléphone');
  assert.equal(seats.dwarf.name,'Deuxième téléphone');
  assert.equal(pages,1);
  await page.locator('#shell-connections-dialog [data-shell-close]').click();
 });
 await check('Tournoi menu creates a scheduled game with automatic, visible faction assignments',async()=>{
  assert.equal(await open('tournament'),true);
  await page.locator('#shell-tournament-dialog[open]').waitFor();
  await page.locator('#tournament-name').fill('Coupe test');
  await page.locator('#tournament-players').fill('Alice\nBruno');
  await page.locator('#tournament-format').selectOption('swiss');
  await page.locator('#tournament-rounds').fill('2');
  await page.locator('#tournament-create').click();
  await page.waitForFunction(()=>document.querySelectorAll(
   '#tournament-list .tournament-item').length===1);
  assert.match(await page.locator('#tournament-list .tournament-title').textContent(),/Coupe test/);
  await page.locator('#tournament-list .tournament-next').click();
  await page.waitForFunction(()=>document.querySelectorAll(
   '#tournament-list .tournament-match').length===1);
  const line=await page.locator('#tournament-list .tournament-match').first().textContent();
  assert.match(line,/Alice/);assert.match(line,/Bruno/);
  assert.match(line,/Elfes/);assert.match(line,/Nains/);
  const tournaments=(await (await context.request.get(base+'/api/tournaments')).json()).tournaments;
  assert.equal(tournaments.length,1);
  const match=tournaments[0].matches[0];
  assert.notEqual(match.camp_a,match.camp_b);
  assert.equal(match.round,1);
  const show=page.locator('#tournament-list .tournament-view').first();
  await show.click();
  await page.waitForFunction(expected=>gameId===expected,match.game);
  assert.equal(await page.locator('#shell-tournament-dialog').evaluate(x=>x.open),false);
  const selected=(await state(match.game)).game;
  assert.equal(selected.id,match.game);
  assert.equal(pages,1,'Tournament match shares the existing fullscreen board');
 });
 await check('Four-person tournament schedules two live games and the host wall rotates both',async()=>{
  const created=await context.request.post(base+'/api/tournament/create',{data:{
   name:'Tournoi 4 joueurs','format':'swiss',
   players:['Alice','Bruno','Chloé','David'],rounds:3
  }});
  assert.equal(created.status(),200);
  const tid=(await created.json()).tournament.id;
  const played=await context.request.post(base+'/api/tournament/round',{
   data:{tournament:tid,mode:'fetlar'}});
  assert.equal(played.status(),200);
  const scheduled=(await played.json()).matches;
  assert.equal(scheduled.length,2);
  assert.notEqual(scheduled[0].game,scheduled[1].game);
  assert.equal(await page.evaluate(tid=>
   window.AlfastaflBroadcast.start(tid),tid),true);
  await page.waitForFunction(()=>!document.getElementById('broadcast-wall').hidden&&
   document.getElementById('broadcast-main').getAttribute('src')?.includes('broadcast-view=main'));
  const first=await page.locator('#broadcast-main').getAttribute('src');
  await page.evaluate(()=>window.AlfastaflBroadcast.next());
  await page.waitForFunction(previous=>
   document.getElementById('broadcast-main').getAttribute('src')!==previous,first);
  const second=await page.locator('#broadcast-main').getAttribute('src');
  assert.notEqual(first,second,'Two independent matches must alternate on the big screen');
  const expectedGames=new Set(scheduled.map(m=>m.game));
  const frameGame=url=>new URL(url,base).searchParams.get('game');
  assert.deepEqual(new Set([frameGame(first),frameGame(second)]),expectedGames);
  await page.waitForFunction(()=>['shell-player-image','shell-spectator-image'].every(id=>
   document.getElementById(id).getAttribute('src')?.includes('tournament=')));
  const playerQR=await page.locator('#shell-player-image').getAttribute('src');
  const watcherQR=await page.locator('#shell-spectator-image').getAttribute('src');
  assert.match(playerQR,/role=player/);
  assert.match(watcherQR,/role=spectator/);
  assert.equal(await page.locator('#broadcast-name').textContent(),'Tournoi 4 joueurs');
  assert.match(await page.locator('#broadcast-pairing').textContent(),/Elfes|Nains/);
  // Simulate two simultaneous capture cues at the broadcast feed boundary.
  // This tests separate overlapping panels, not synthetic game captures.
  await page.route('**/api/tournament/broadcast?*',async route=>{
   const response=await route.fetch();
   const feed=await response.json();
   for(let i=0;i<feed.matches.length;i++){
    feed.matches[i].cinematic={duration:8,remaining:7,
     move:{n:100+i,piece:'E',from:[5,1],to:[5,3],captured:[[5,4,'N']]}};
   }
   await route.fulfill({response,json:feed});
  });
  await page.waitForFunction(()=>document.querySelectorAll(
   '#broadcast-scenes .broadcast-scene iframe').length===2);
  const captions=await page.locator('#broadcast-scenes .broadcast-scene h3').allTextContents();
  assert.equal(captions.length,2);
  for(const caption of captions)assert.match(caption,/Elfes.*Nains.*prise en direct/);
  const shown=await page.locator('#broadcast-scenes .broadcast-scene').evaluateAll(rows=>
   rows.map(row=>row.dataset.game));
  assert.deepEqual(new Set(shown),expectedGames);
  await page.unroute('**/api/tournament/broadcast?*');
  await page.locator('#broadcast-stop').click();
  assert.equal(await page.locator('#broadcast-wall').isVisible(),false);
  assert.equal(pages,1);
 });
 assert.deepEqual(report.errors,[],'Unexpected JS errors');
 await context.close();
}
const timer=setTimeout(()=>{browser?.close().catch(()=>{});server?.kill('SIGTERM')},220000);
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;})
 .finally(async()=>{clearTimeout(timer);await browser?.close().catch(()=>{});
  // The server checkpoints games when SIGTERM arrives. Do not delete its
  // temporary directory concurrently with that filesystem write.
  if(server&&server.exitCode===null&&server.signalCode===null){
   const exited=new Promise(resolve=>server.once('exit',resolve));
   server.kill('SIGTERM');
   await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,3000))]);
  }
  fs.rmSync(temporary,{recursive:true,force:true,maxRetries:8,retryDelay:120});});
