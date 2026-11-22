/* Five independent Chromium clients: four concurrent players and a spectator.
 * This regression complements the real-remote IP authorization Python tests.
 * Chrome contexts stand in for separate devices; firewall and physical Wi-Fi
 * still require field testing on the Ubuntu host.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium,firefox,webkit}=require('playwright');
const browserName=process.env.ALFASTAFL_BROWSER||'chromium';
const browserEngines={chromium,firefox,webkit};
if(!browserEngines[browserName])throw Error('Unsupported test browser: '+browserName);
const root=path.resolve(__dirname,'..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'alfastafl-four-browsers-'));
const python=process.env.TUTORIAL_TEST_PYTHON||'python3';
const env={...process.env,PYTHONPATH:[path.join(root,'src'),process.env.PYTHONPATH]
  .filter(Boolean).join(path.delimiter)};
let processHost,browser;
const code=`
import json,signal,sys
from alfastafl.server import Store,run,AppHandler
store=Store(sys.argv[1])
server=run('127.0.0.1',0,store)
# Test-only virtual LAN: no polkit, no firewall changes.
server.lan_enabled=True
server.lan_address='127.0.0.1'
class TestHandler(AppHandler):
 def do_POST(self):
  if self.path=='/__test__/two-captures':
   with self.server.store.lock:
    store=self.server.store
    t=next(iter(store.tournaments.values()))
    current=[m for m in t['matches'] if m['round']==t['round_no']]
    now=store.monotonic()
    for n,m in enumerate(current):
     store._cinematics[m['game']]={'deadline':now+32,'duration':32,
      'move':{'n':n+1,'piece':'E','from':[5,1],'to':[5,3],
       'captured':[[5,4,'N']],'reason':'capture'}}
   return self.send({'ok':True})
  if self.path=='/__test__/clear-captures':
   with self.server.store.lock:self.server.store._cinematics.clear()
   return self.send({'ok':True})
  super().do_POST()
server.RequestHandlerClass=TestHandler
def terminate(*_):raise KeyboardInterrupt
signal.signal(signal.SIGTERM,terminate)
print(json.dumps({'port':server.server_address[1]}),flush=True)
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:store.shutdown();server.server_close()
`;
async function serve(){
 processHost=spawn(python,['-u','-c',code,path.join(temporary,'games')],{
  cwd:root,env,stdio:['ignore','pipe','pipe']});
 return new Promise((resolve,reject)=>{
  let output='',errors='';
  const deadline=setTimeout(()=>reject(Error('Server startup timeout: '+errors)),16000);
  processHost.stderr.on('data',x=>errors+=x.toString());
  processHost.once('exit',status=>reject(Error('Server exited '+status+': '+errors)));
  processHost.stdout.on('data',x=>{
   output+=x.toString();if(!output.includes('\n'))return;
   try{const settings=JSON.parse(output.split('\n')[0]);clearTimeout(deadline);
    resolve('http://127.0.0.1:'+settings.port);}catch(error){reject(error);}
  });
 });
}
async function main(){
 const base=await serve(), origin=new URL(base);
 browser=await browserEngines[browserName].launch(browserName==='chromium'
  ?{headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}
  :{headless:true});
 const hostContext=await browser.newContext({viewport:{width:1370,height:820}});
 const host=await hostContext.newPage();host.setDefaultTimeout(16000);
 const errors=[];
 host.on('pageerror',e=>errors.push('host: '+e.message));
 const api=async(endpoint,payload)=>{
  const response=payload===undefined
   ?await hostContext.request.get(base+'/api/'+endpoint)
   :await hostContext.request.post(base+'/api/'+endpoint,{data:payload});
  const json=await response.json();
  if(!response.ok())throw Error(endpoint+' '+response.status()+': '+JSON.stringify(json));
  return json;
 };
 const tournamentName='Recette quatre navigateurs';
 await host.goto(base+'/?desktop=shell',{waitUntil:'domcontentloaded'});
 await host.waitForFunction(()=>Boolean(window.AlfastaflShell));
 await host.evaluate(()=>window.AlfastaflShell.open('tournament'));
 await host.locator('#tournament-name').fill(tournamentName);
 await host.locator('#tournament-format').selectOption('knockout');
 await host.locator('#tournament-players').fill('Alice\nBruno\nChloé\nDavid');
 await host.locator('#tournament-create').click();
 await host.waitForFunction(()=>document.querySelectorAll('#tournament-list .tournament-item').length===1);
 await host.locator('#tournament-list .tournament-next').click();
 await host.waitForFunction(()=>document.querySelectorAll('#tournament-list .tournament-match').length===2);
 const tournaments=await api('tournaments');
 const tournament=tournaments.tournaments.find(t=>t.name===tournamentName);
 assert(tournament);
 const tid=tournament.id,matches=tournament.matches.filter(m=>m.round===1);
 assert.equal(matches.length,2);
 assert.equal(new Set(matches.map(m=>m.game)).size,2);
 assert.deepEqual(new Set(matches.flatMap(m=>[m.a,m.b])),
  new Set(['Alice','Bruno','Chloé','David']));
 await host.locator('#shell-tournament-dialog [data-shell-close]').click();
 await host.waitForFunction(()=>['shell-player-image','shell-spectator-image'].every(
  id=>document.getElementById(id).src.includes('tournament=')));
 const invitations=(await api('tournament/invites?tournament='+encodeURIComponent(tid))).invites;
 assert.notEqual(invitations.player,invitations.spectator);
 console.log('PASS host creates two independent knockout matches and stable tournament QR codes');

 const actors=new Map();
 async function device(name,role,invite){
  const hostname=(name.toLowerCase().replace(/[^a-z]+/g,'-'))+'.test';
  const context=await browser.newContext({viewport:{width:780,height:650}});
  // Keep separate cookie/local/session stores and intentionally use non-loopback
  // browser origins. The Python remote-IP access test is separate.
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname!==hostname)return route.abort();
   // The 2D fallback lets six browser renderers run on small CI machines;
   // the existing WebGL-specific suite verifies full 3D separately.
   if(url.pathname==='/board3d.js')return route.abort();
   const args={method:req.method(),headers:req.headers()};
   if(req.postDataBuffer())args.data=req.postDataBuffer();
   try{
    const response=await context.request.fetch(base+url.pathname+url.search,args);
    await route.fulfill({response});
   }catch(error){try{await route.abort();}catch(_ignored){/* Context may already be closing. */}}
  });
  const page=await context.newPage();page.setDefaultTimeout(16000);
  page.on('pageerror',e=>errors.push(name+': '+e.message));
  const link='http://'+hostname+origin.port.replace(/^/,':')+'/?'+
   new URLSearchParams({tournament:tid,invite}).toString();
  await page.goto(link,{waitUntil:'domcontentloaded'});
  if(role==='spectator'){
   await page.waitForFunction(()=>Boolean(session&&you?.role==='spectator'&&gameId),
    null,{timeout:14000});
  }else{
   await page.locator('#tournament-entrant-name').fill(name);
   await page.locator('#tournament-enter').click();
   await page.waitForFunction(()=>Boolean(requestId&&gameId),null,{timeout:14000});
  }
  const first=await page.evaluate(()=>({game:gameId,request:requestId}));
  const expected=matches.find(m=>role==='spectator'||[m.a,m.b].includes(name));
  assert.equal(first.game,expected.game,'Selected game for '+name);
  actors.set(name,{name,role,hostname,context,page,link,first});
  return actors.get(name);
 }
 for(const name of ['Alice','Bruno','Chloé','David']){
  const actor=await device(name,'player',invitations.player);
  assert(matches.some(m=>m.game===actor.first.game));
 }
 const s=await device('Public','spectator',invitations.spectator);
 const pending=(await api('pending')).pending.filter(p=>p.status==='waiting');
 assert.equal(pending.length,4);
 assert.equal(new Set(pending.map(p=>p.name)).size,4);
 for(const actor of actors.values())if(actor.role==='player')
  await api('approve',{request:actor.first.request});
 for(const actor of actors.values()){
  const {page,name,role}=actor;
  await page.waitForFunction(expected=>Boolean(
   you&&you.name===expected&&session&&game&&game.status==='active'),
   role==='spectator'?'Spectateur':name,{timeout:19000});
  const value=await page.evaluate(()=>({
   game:gameId,session,name:you?.name,role:you?.role,camp:you?.camp,
   secret:localStorage.getItem('alfastafl.credential.'+
     new URLSearchParams(location.search).get('tournament')+'.'+you?.role+'.'+you?.name)
  }));
  assert.equal(value.role,role);
  if(role==='player')assert(value.secret?.length>36,'Persistent device credential '+name);
  actor.session=value.session;actor.camp=value.camp;
 }
 for(const m of matches){
  const names=[m.a,m.b];
  assert.equal(actors.get(m.a).first.game,m.game);
  assert.equal(actors.get(m.b).first.game,m.game);
  assert.deepEqual(new Set(names.map(name=>actors.get(name).camp)),new Set(['elf','dwarf']));
  await host.waitForFunction(async id=>{
   const response=await fetch('/api/state?game='+id);
   const state=(await response.json()).game;
   return state.status==='active'&&state.clock.started===true;
  },m.game,{timeout:17000});
 }
 console.log('PASS four individually authorized browsers join both camps; two clocks start');

 async function oneMove(match){
  const dwarf=match.camp_a==='dwarf'?match.a:match.b;
  const actor=actors.get(dwarf),page=actor.page;
  // On approved guest devices, graphical options live behind the compact
  // overlay menu. Open, choose the lightweight view, then close it before
  // clicking the actual legal destination on the board.
  await page.locator('#guest-menu-toggle').click();
  await page.locator('#game-board-mode').selectOption('2d');
  await page.locator('#guest-menu-toggle').click();
  const state=await api('state?game='+match.game+'&session='+actor.session);
  assert.equal(state.game.turn,'dwarf');
  let from=null,to=null;
  for(let r=0;r<11&&!from;r++)for(let c=0;c<11&&!from;c++){
   if(state.game.board[r][c]!=='N')continue;
   const legal=await api('legal?'+new URLSearchParams({
    game:match.game,session:actor.session,row:String(r),col:String(c)}));
   if(legal.moves.length){from=[r,c];to=legal.moves[0];}
  }
  assert(from&&to,'First legal move for '+dwarf);
  const square=where=>page.locator('#board .square[data-row="'+where[0]+
   '"][data-col="'+where[1]+'"]');
  await square(from).click();
  await page.waitForFunction(position=>Boolean(selected&&selected[0]===position[0]&&
   selected[1]===position[1]),from);
  await square(to).click();
  // On loaded CI runners a periodic repaint can clear the selection
  // between the two clicks. Check the authoritative game history; retry
  // the same legal interaction once if the first click was not sent.
  let moved=false;
  for(let attempt=0;attempt<2;attempt++){
   try{
    await page.waitForFunction(()=>game?.history?.length===1,null,{timeout:6500});
    moved=true;break;
   }catch(error){
    const latest=(await api('state?game='+match.game)).game;
    if(latest.history.length===1){moved=true;break;}
    if(attempt){
     const info=await page.evaluate(()=>({busy:gameBusy,selected,
      myTurn:myTurn(),message:document.getElementById('msg').textContent}));
     throw Error('Move never reached the server for '+dwarf+': '+JSON.stringify(info));
    }
    await page.waitForFunction(()=>myTurn()&&!gameBusy,null,{timeout:8000});
    await square(from).click();
    await page.waitForFunction(position=>Boolean(selected&&
     selected[0]===position[0]&&selected[1]===position[1]),from);
    await square(to).click();
   }
  }
  assert(moved,'At least one legal move must commit to the server');
  return {from,to,game:match.game};
 }
 const moves=await Promise.all(matches.map(oneMove));
 assert.equal(new Set(moves.map(m=>m.game)).size,2);
 for(const match of matches){
  const state=(await api('state?game='+match.game)).game;
  assert.equal(state.history.length,1);
  assert.equal(state.turn,'elf');
 }
 console.log('PASS two different devices make two independent, simultaneous legal moves');

 const spectator=s.page;
 await spectator.waitForFunction(()=>document.body.classList.contains('tournament-broadcast')&&
   !document.getElementById('broadcast-wall').hidden&&
   document.getElementById('broadcast-main').getAttribute('src')?.includes('broadcast-view=main'),
   null,{timeout:19000});
 let currentSrc=await spectator.locator('#broadcast-main').getAttribute('src');
 const initialGame=new URL(currentSrc,'http://public.test').searchParams.get('game');
 await spectator.waitForFunction(previous=>{
  const src=document.getElementById('broadcast-main').getAttribute('src');
  return src&&new URL(src,location.href).searchParams.get('game')!==previous;
 },initialGame,{timeout:16500});
 const otherSrc=await spectator.locator('#broadcast-main').getAttribute('src');
 assert.deepEqual(new Set([initialGame,new URL(otherSrc,'http://public.test')
  .searchParams.get('game')]),new Set(matches.map(m=>m.game)));
 assert.equal(await spectator.locator('#broadcast-next').isVisible(),false);
 assert.equal(await spectator.locator('#broadcast-stop').isVisible(),false);
 const forbidden=await hostContext.request.post(base+'/api/move',{data:{
  game:matches[0].game,session:s.session,from:[0,3],to:[1,3]}});
 assert.equal(forbidden.status(),403,'Spectator never obtains a move right');
 console.log('PASS spectator wall rotates live boards and has no play/admin controls');

 await hostContext.request.post(base+'/__test__/two-captures',{data:{}});
 await spectator.waitForFunction(()=>document.querySelectorAll(
  '#broadcast-scenes .broadcast-scene').length===2,null,{timeout:11000});
 const labels=await spectator.locator('#broadcast-scenes .broadcast-scene h3').allTextContents();
 for(const match of matches){
  assert(labels.some(t=>t.includes(match.a)&&t.includes(match.b)));
 }
 const panels=await spectator.locator('#broadcast-scenes .broadcast-scene').evaluateAll(nodes=>
  nodes.map(x=>({game:x.dataset.game,frame:x.querySelector('iframe')?.getAttribute('src')})));
 assert.deepEqual(new Set(panels.map(x=>x.game)),new Set(matches.map(m=>m.game)));
 assert(panels.every(x=>x.frame?.includes('broadcast-view=capture')));
 console.log('PASS two concurrent server-supplied capture scenes have distinct match labels');

 const alice=actors.get('Alice');
 const before=(await api('pending')).pending.length;
 await alice.page.evaluate(()=>{
  sessionStorage.clear();
  for(const key of Object.keys(localStorage))if(key.startsWith('alfastafl.device.'))
   localStorage.removeItem(key);
 });
 await alice.page.reload({waitUntil:'domcontentloaded'});
 await alice.page.waitForFunction(expected=>Boolean(you?.name===expected&&session&&game),
   'Alice',{timeout:17000});
 assert.equal((await api('pending')).pending.length,before,
   'Rescanning a known device must not cause another host approval');
 console.log('PASS device re-enters its match after a fresh browser session without approval');

 await hostContext.request.post(base+'/__test__/clear-captures',{data:{}});
 for(const match of matches){
  const loser=actors.get(match.b);
  const resign=await api('resign',{game:match.game,session:loser.session});
  assert.equal(resign.game.status,'finished');
 }
 const final=await api('tournament/round',{tournament:tid,mode:'fetlar'});
 assert.equal(final.matches.length,1);
 const last=final.matches[0];
 assert.equal(last.round,2);
 assert.deepEqual(new Set([last.a,last.b]),new Set(matches.map(m=>m.a)));
 assert(!matches.some(m=>m.game===last.game));
 for(const name of [last.a,last.b]){
  const actor=actors.get(name);
  await actor.page.evaluate(()=>{
   sessionStorage.clear();
   for(const key of Object.keys(localStorage))if(key.startsWith('alfastafl.device.'))
    localStorage.removeItem(key);
  });
  await actor.page.goto(actor.link,{waitUntil:'domcontentloaded'});
  await actor.page.waitForFunction(expected=>Boolean(
   game?.id===expected&&you?.role==='player'&&session),last.game,{timeout:20000});
 }
 assert.equal((await api('pending')).pending.length,before,
  'Winners must rejoin final with their approved device credentials');
 const finalState=(await api('state?game='+last.game)).game;
 assert.deepEqual(new Set(Object.values(finalState.players)),new Set([last.a,last.b]));
 assert.deepEqual(new Set(Object.values(finalState.players)).size,2);
 console.log('PASS two winners rejoin the final without fresh permission or a stale seat');
 assert.deepEqual(errors,[],'Unexpected browser JavaScript errors');
 for(const actor of actors.values()){
  // Closing the browser context cancels ongoing request routing and polling.
  await actor.context.close();
 }
 await hostContext.close();
}
const timer=setTimeout(()=>{
 browser?.close().catch(()=>{});processHost?.kill('SIGTERM');
},250000);
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;})
.finally(async()=>{
 clearTimeout(timer);
 await browser?.close().catch(()=>{});
 if(processHost&&processHost.exitCode===null&&processHost.signalCode===null){
  const stopped=new Promise(resolve=>processHost.once('exit',resolve));
  processHost.kill('SIGTERM');
  await Promise.race([stopped,new Promise(done=>setTimeout(done,3500))]);
 }
 fs.rmSync(temporary,{recursive:true,force:true,maxRetries:6,retryDelay:100});
});
