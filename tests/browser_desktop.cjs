#!/usr/bin/env node
'use strict';
/* Independent Ubuntu host-management / popup-board contract. Qt implements
 * native fullscreen; Chromium exercises the same URLs, role separation,
 * spectator QR, tutorial isolation and popup close behavior. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'alfastafl-desktop-ui-'));
const python=process.env.TUTORIAL_TEST_PYTHON||'python3';
const environment={...process.env,
 PYTHONPATH:[path.join(root,'src'),process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)};
let server,browser;
const report=[];
async function check(name,task){
 try{await task();report.push({name,result:'PASS'});console.log('PASS '+name);}
 catch(error){report.push({name,result:'FAIL',error:String(error)});throw error;}
}
const code=`
import json,signal,sys
from alfastafl.server import Store,run
store=Store(sys.argv[1])
server=run('127.0.0.1',0,store)
# Simulated opted-in network without any second bound port or firewall
# change. The QR endpoint still generates real spectator invites.
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
  const timer=setTimeout(()=>reject(Error('Server startup timeout')),16000);
  let buffer='',err='';
  server.stderr.on('data',b=>{err+=b.toString();});
  server.once('exit',c=>reject(Error('Server exit '+c+': '+err)));
  server.stdout.on('data',chunk=>{
   buffer+=chunk.toString();
   if(!buffer.includes('\n'))return;
   try{const ready=JSON.parse(buffer.slice(0,buffer.indexOf('\n')));
    clearTimeout(timer);resolve('http://127.0.0.1:'+ready.port);
   }catch(e){reject(e);}
  });
 });
}
async function main(){
 const base=await startServer();
 browser=await chromium.launch({headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1366,height:820},acceptDownloads:false});
 const errors=[];
 context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
 const manager=await context.newPage();
 manager.setDefaultTimeout(13000);
 await manager.goto(base+'/?desktop=host',{waitUntil:'domcontentloaded'});
 await manager.locator('#tutorial-open').waitFor({state:'visible'});
 await check('Desktop manager remains maximized-style and never embeds a board',async()=>{
  assert.equal(await manager.evaluate(()=>document.body.classList.contains('desktop-host-manager')),true);
  assert.equal(await manager.locator('#host').isVisible(),true);
  assert.equal(await manager.locator('#game-board-view').isVisible(),false);
  assert.equal(await manager.locator('#game-board-3d canvas').count(),0);
  assert.equal(await manager.locator('#tutorial-panel').isVisible(),false);
  assert.equal(await manager.locator('#host-close-board').isVisible(),false);
 });
 await check('Tutorial opens in a separate window without a game or remote LAN',async()=>{
  await manager.selectOption('#mode','historical');
  const popupReady=manager.waitForEvent('popup');
  await manager.locator('#tutorial-open').click();
  const tutorial=await popupReady;
  tutorial.setDefaultTimeout(14000);
  await tutorial.waitForURL(/desktop=tutorial/);
  await tutorial.waitForFunction(()=>document.getElementById('tutorial-panel')?.open&&
   document.querySelectorAll('#tutorial-board button').length===121&&
   document.getElementById('tutorial-panel').getAttribute('aria-busy')==='false');
  const snapshot=await tutorial.evaluate(()=>{
   const dialog=document.getElementById('tutorial-panel');
   const rect=dialog.getBoundingClientRect();
   return {mode:document.getElementById('tutorial-mode-label').textContent,
    dimensions:[rect.width,rect.height],window:[innerWidth,innerHeight],
    managementVisible:document.getElementById('host').getBoundingClientRect().width>0,
    hasSelectedGame:document.getElementById('game-board-view').boardView?.state?.board!=null};
  });
  assert.match(snapshot.mode,/histor/i);
  assert(Math.abs(snapshot.dimensions[0]-snapshot.window[0])<3);
  assert(Math.abs(snapshot.dimensions[1]-snapshot.window[1])<3);
  assert.equal(snapshot.managementVisible,false);
  assert.equal(snapshot.hasSelectedGame,false);
  assert.equal(await manager.locator('#tutorial-panel').evaluate(el=>el.open),false);
  const closed=tutorial.waitForEvent('close');
  await tutorial.locator('#tutorial-close').click();
  await closed;
  assert.equal(manager.isClosed(),false,'Closing tutor must not close the host manager');
 });
 let board;
 await check('Creating a game opens an independent viewport-filling spectator board',async()=>{
  await manager.selectOption('#create-host-camp','');
  const pending=manager.waitForEvent('popup');
  await manager.locator('#create').click();
  board=await pending;
  board.setDefaultTimeout(20000);
  await board.waitForURL(/desktop=board.*game=/);
  await board.waitForFunction(()=>document.getElementById('game-board-view')?.dataset.state==='ready'&&
   document.getElementById('game-board-3d')?.board3d?.getDiagnostics().pieceCount===37);
  assert.equal(await board.locator('#host').isVisible(),false);
  assert.equal(await board.locator('#join').isVisible(),false);
  assert.equal(await board.locator('#guest-menu-toggle').isVisible(),true);
  assert.equal(await board.locator('#host-close-board').isVisible(),true);
  assert.equal(await manager.locator('#game-board-view').isVisible(),false);
  assert.equal(await manager.locator('#game-board-3d canvas').count(),0);
  const size=await board.evaluate(()=>{
   const area=document.getElementById('game-board-3d').getBoundingClientRect();
   return {w:area.width,h:area.height,vw:innerWidth,vh:innerHeight,scroll:document.documentElement.scrollWidth>innerWidth+1};
  });
  assert(Math.abs(size.w-size.vw)<4,JSON.stringify(size));
  assert(Math.abs(size.h-size.vh)<4,JSON.stringify(size));
  assert.equal(size.scroll,false);
  assert.equal(await board.locator('#player-controls').isVisible(),false);
 });
 await check('QR spectator invitation scans and only requests access; image is not reloaded on every poll',async()=>{
  await board.waitForFunction(()=>!document.getElementById('host-spectator-qr').hidden&&
   document.getElementById('host-spectator-qr-image').naturalWidth>0);
  const img=board.locator('#host-spectator-qr-image');
  assert.match(await img.getAttribute('src'),/role=spectator/);
  const before=await img.getAttribute('src');
  await board.waitForTimeout(2400);
  assert.equal(await img.getAttribute('src'),before,'Polling must not reload the QR');
  const invitation=(await (await context.request.get(base+'/api/state?game='+
   encodeURIComponent(new URL(board.url()).searchParams.get('game')))).json()).invites.spectator;
  const requested=await context.request.post(base+'/api/join',{data:{
   game:new URL(board.url()).searchParams.get('game'),invite:invitation,name:'Spectateur supplémentaire'
  }});
  assert.equal(requested.status(),200);
  const requestId=(await requested.json()).request;
  const pending=(await (await context.request.get(base+'/api/pending')).json()).pending;
  assert(pending.some(entry=>entry.id===requestId&&entry.role==='spectator'),
   'QR points to spectator request; it never bypasses host approval');
 });
 await check('Spectator QR disappears as soon as the LAN is disabled',async()=>{
  const route='**/api/address';
  await context.route(route,async r=>r.fulfill({status:200,contentType:'application/json',
   body:JSON.stringify({address:'127.0.0.1',port:new URL(base).port,lan_enabled:false})}));
  await board.waitForFunction(()=>document.getElementById('host-spectator-qr').hidden);
  await context.unroute(route);
  await board.waitForFunction(()=>!document.getElementById('host-spectator-qr').hidden);
 });
 await check('The host can switch to player in the separate board without altering admin rights',async()=>{
  const seat=manager.waitForResponse(response=>response.url().includes('/api/host/seat')&&
   response.request().method()==='POST');
  await manager.locator('#host-play-dwarf').click();
  assert.equal((await seat).status(),200);
  await board.waitForURL(url=>url.searchParams.get('desktop')==='board'&&
   Boolean(url.searchParams.get('session')));
  await board.waitForFunction(()=>document.getElementById('game-board-view')?.boardView?.state?.interactive===true ||
    document.getElementById('host-player-status')?.textContent.includes('Nains'));
  const sess=new URL(board.url()).searchParams.get('session');
  const id=new URL(board.url()).searchParams.get('game');
  const state=(await (await context.request.get(base+'/api/state?game='+id+'&session='+sess)).json());
  assert.equal(state.you.role,'player');assert.equal(state.you.camp,'dwarf');
  assert.equal(await manager.locator('#host').isVisible(),true);
  assert.equal(await board.locator('#host').isVisible(),false);
  assert.equal(await board.locator('#host-spectator-qr').isVisible(),true);
 });
 await check('Closing and reopening the fullscreen board does not stop the game',async()=>{
  const id=new URL(board.url()).searchParams.get('game');
  const close=board.waitForEvent('close');
  await board.locator('#host-close-board').click();
  await close;
  assert.equal(manager.isClosed(),false);
  const newWindow=manager.waitForEvent('popup');
  await manager.locator('#host-open-board').click();
  board=await newWindow;
  await board.waitForURL(/desktop=board/);
  const game=(await (await context.request.get(base+'/api/state?game='+id)).json()).game;
  assert.equal(game.status,'active');
  await board.waitForFunction(()=>document.getElementById('game-board-3d')?.board3d?.getDiagnostics().pieceCount===37);
 });
 assert.deepEqual(errors,[],'Browser JS failures: '+errors.join('; '));
 await context.close();
}
const timeout=setTimeout(()=>{if(browser)browser.close().catch(()=>{});
 if(server)server.kill('SIGTERM');},150000);
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;})
 .finally(async()=>{clearTimeout(timeout);if(browser)await browser.close().catch(()=>{});
  if(server)server.kill('SIGTERM');
  fs.rmSync(temporary,{recursive:true,force:true});});
