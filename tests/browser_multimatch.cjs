/* End-to-end concurrent tournament display, guest permissions and reconnect. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'alfastafl-multimatch-'));
const python=process.env.TUTORIAL_TEST_PYTHON||'python3';
const environment={...process.env,
 PYTHONPATH:[path.join(root,'src'),process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)};
let server,browser;
const code=`
import json,signal,sys
from alfastafl.server import Store,run,AppHandler
store=Store(sys.argv[1])
server=run('127.0.0.1',0,store)
server.lan_enabled=True
server.lan_address='127.0.0.1'
class TestHandler(AppHandler):
 def do_GET(self):
  if self.path.startswith('/__test__/invitation?'):
   from urllib.parse import urlparse,parse_qs
   q=parse_qs(urlparse(self.path).query)
   return self.send({'token':self.server.store.tournament_invitation(
    q.get('tournament',[''])[0],q.get('role',['player'])[0])})
  super().do_GET()
 def do_POST(self):
  if self.path=='/__test__/captures':
   with self.server.store.lock:
    matches=[m for t in self.server.store.tournaments.values() for m in t['matches']]
    now=self.server.store.monotonic()
    for idx,m in enumerate(matches):
     if m['round']!=1:continue
     self.server.store._cinematics[m['game']]={'deadline':now+11,'duration':11,
      'move':{'n':idx+1,'piece':'N','from':[2,idx],'to':[3,idx],
       'captured':[[4,idx]],'reason':'capture'}}
   return self.send({'ok':True})
  if self.path=='/__test__/sessions-reset':
   with self.server.store.lock:self.server.store.sessions.clear()
   return self.send({'ok':True})
  super().do_POST()
server.RequestHandlerClass=TestHandler
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
  let out='',err='';
  const timer=setTimeout(()=>reject(Error('Server startup timeout: '+err)),15000);
  server.stderr.on('data',chunk=>err+=chunk.toString());
  server.once('exit',status=>reject(Error('Server exited '+status+': '+err)));
  server.stdout.on('data',chunk=>{
   out+=chunk.toString();if(!out.includes('\n'))return;
   try{const cfg=JSON.parse(out.split('\n')[0]);clearTimeout(timer);
    resolve('http://127.0.0.1:'+cfg.port);}catch(error){reject(error);}
  });
 });
}
async function main(){
 const base=await startServer();
 browser=await chromium.launch({headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const hostContext=await browser.newContext({viewport:{width:1400,height:850}});
 const host=await hostContext.newPage();host.setDefaultTimeout(16000);
 const errors=[];
 host.on('pageerror',error=>errors.push(String(error)));
 const api=async(endpoint,payload)=>{
  const response=payload===undefined
   ?await hostContext.request.get(base+'/api/'+endpoint)
   :await hostContext.request.post(base+'/api/'+endpoint,{data:payload});
  const result=await response.json();
  if(!response.ok())throw Error(endpoint+': '+JSON.stringify(result));
  return result;
 };
 await host.goto(base+'/?desktop=shell',{waitUntil:'domcontentloaded'});
 await host.waitForFunction(()=>Boolean(window.AlfastaflShell&&window.AlfastaflTournamentLive));
 const created=await api('tournament/create',{name:'Tournoi à quatre',
  format:'knockout',players:['Alice','Bruno','Chloé','David']});
 const tournament=created.tournament.id;
 const round=await api('tournament/round',{tournament});
 const matches=round.matches;
 assert.equal(matches.length,2);
 assert.equal(new Set(matches.map(x=>x.game)).size,2);
 console.log('PASS 4-player tournament schedules two independent live fixtures');
 await host.evaluate(()=>window.AlfastaflShell.open('tournament'));
 await host.waitForFunction(()=>document.querySelectorAll(
  '#tournament-list .tournament-match').length===2);
 await host.locator('#tournament-list .tournament-broadcast-start').click();
 await host.waitForFunction(()=>document.body.classList.contains('tournament-broadcast')&&
  document.getElementById('tournament-broadcast-name').textContent===
    'Tournoi à quatre • Ronde 1' &&
  document.getElementById('tournament-broadcast-match').textContent.startsWith('Ronde 1 • '));
 assert.equal(await host.locator('#tournament-broadcast-name').textContent(),
  'Tournoi à quatre • Ronde 1');
 await host.waitForFunction(()=>['shell-player-image','shell-spectator-image'].every(id=>
  document.getElementById(id).getAttribute('src')?.includes('tournament/qr')));
 const playerQR=await host.locator('#shell-player-image').getAttribute('src');
 const spectatorQR=await host.locator('#shell-spectator-image').getAttribute('src');
 assert(playerQR.includes('role=player')&&spectatorQR.includes('role=spectator'));
 const first=await host.evaluate(()=>gameId);
 assert(matches.some(m=>m.game===first));
 await host.waitForFunction(previous=>gameId!==previous,first,{timeout:13500});
 const second=await host.evaluate(()=>gameId);
 assert(matches.some(m=>m.game===second));
 assert.equal(await host.locator('#shell-player-image').getAttribute('src'),playerQR);
 assert.equal(await host.locator('#shell-spectator-image').getAttribute('src'),spectatorQR);
 console.log('PASS host rotates boards without changing tournament-wide QR codes');
 await hostContext.request.post(base+'/__test__/captures',{data:{}});
 await host.waitForFunction(()=>document.querySelectorAll('.tournament-capture-card').length===2,
  {timeout:11000});
 const captureLabels=await host.locator('.tournament-capture-card h3').allTextContents();
 assert(captureLabels.some(x=>x.includes('Alice')&&x.includes('Bruno')));
 assert(captureLabels.some(x=>x.includes('Chloé')&&x.includes('David')));
 const sources=await host.locator('.tournament-capture-card iframe').evaluateAll(
  frames=>frames.map(f=>f.getAttribute('src')));
 assert.equal(new Set(sources.map(s=>new URL(s,'http://localhost').searchParams.get('game'))).size,2);
 assert(sources.every(src=>src.includes('capture_only=1')));
 console.log('PASS two concurrent capture windows identify their own matches');
 await host.evaluate(()=>window.AlfastaflTournamentLive.stop());
 const request=await api('join',{game:matches[0].game,
  invite:(await api('state?game='+matches[0].game)).invites.spectator,name:'Spectateur'});
 const spectator=await api('approve',{request:request.request});
 const guestContext=await browser.newContext({viewport:{width:1100,height:740}});
 guestContext.setDefaultTimeout(17000);
 await guestContext.route('**/*',async route=>{
  const source=route.request(),url=new URL(source.url());
  if(url.hostname!=='guest.test')return route.abort();
  const target=base+url.pathname+url.search;
  const init={method:source.method(),headers:source.headers()};
  if(source.postDataBuffer())init.data=source.postDataBuffer();
  try{
   const response=await guestContext.request.fetch(target,init);
   await route.fulfill({response});
  }catch(error){if(!route.isInterceptResolutionHandled())await route.abort();}
 });
 const guest=await guestContext.newPage();guest.on('pageerror',error=>errors.push(String(error)));
 await guest.goto('http://guest.test/?game='+matches[0].game+
  '&session='+encodeURIComponent(spectator.session),{waitUntil:'domcontentloaded'});
 await guest.waitForFunction(()=>document.body.classList.contains('guest-board-only')&&
  document.body.classList.contains('tournament-broadcast'),{timeout:16000});
 assert.equal(await guest.locator('#my-tournament').isVisible(),true);
 const current=await guest.evaluate(()=>gameId);
 await guest.waitForFunction(old=>gameId!==old,current,{timeout:14000});
 const switched=await guest.evaluate(()=>gameId);
 assert(matches.some(m=>m.game===switched));
 console.log('PASS spectator automatically rotates all fixtures with a single authorization');
 await guestContext.unrouteAll({behavior:'wait'});
 await guestContext.close();
 const playerReq=await api('join',{game:matches[0].game,
  invite:(await api('state?game='+matches[0].game)).invites.player,name:'Alice'});
 const approved=await api('approve',{request:playerReq.request});
 const playerContext=await browser.newContext({viewport:{width:900,height:660}});
 playerContext.setDefaultTimeout(16000);
 await playerContext.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.hostname!=='player.test')return route.abort();
  const init={method:req.method(),headers:req.headers()};
  if(req.postDataBuffer())init.data=req.postDataBuffer();
  try{const response=await playerContext.request.fetch(
   base+url.pathname+url.search,init);await route.fulfill({response});}
  catch(_){if(!route.isInterceptResolutionHandled())await route.abort();}
 });
 const player=await playerContext.newPage();player.on('pageerror',error=>errors.push(String(error)));
 await player.goto('http://player.test/?game='+matches[0].game+
  '&session='+encodeURIComponent(approved.session),{waitUntil:'domcontentloaded'});
 await player.waitForFunction(()=>document.body.classList.contains('guest-board-only')&&
  localStorage.getItem('alfastafl.tournament.credentials'),{timeout:15000});
 assert.equal(await player.locator('#my-tournament').isVisible(),true);
 await player.locator('#my-tournament summary').click();
 await player.waitForFunction(()=>document.querySelectorAll(
  '.tournament-personal-match').length===1);
 console.log('PASS approved player sees only their own fixture and stores device approval');
 await hostContext.request.post(base+'/__test__/sessions-reset',{data:{}});
 await player.reload({waitUntil:'domcontentloaded'});
 await player.waitForFunction(()=>you?.name==='Alice'&&you.role==='player'&&session&&
  document.body.classList.contains('guest-board-only'),{timeout:20000});
 console.log('PASS player automatically re-enters without a new host approval after session reset');
 await playerContext.unrouteAll({behavior:'wait'});
 await playerContext.close();

 // One shared QR (not one QR per match) assigns a new player by name and
 // still requires a deliberate, first-time approval from the host.
 const shared=await (await hostContext.request.get(base+'/__test__/invitation?'+
  new URLSearchParams({tournament,role:'player'}))).json();
 const qrContext=await browser.newContext({viewport:{width:960,height:680}});
 qrContext.setDefaultTimeout(16000);
 await qrContext.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.hostname!=='tournament.test')return route.abort();
  const init={method:req.method(),headers:req.headers()};
  if(req.postDataBuffer())init.data=req.postDataBuffer();
  try{const response=await qrContext.request.fetch(base+url.pathname+url.search,init);
   await route.fulfill({response});}
  catch(_){if(!route.isInterceptResolutionHandled())await route.abort();}
 });
 const qrPage=await qrContext.newPage();
 qrPage.on('pageerror',error=>errors.push(String(error)));
 await qrPage.goto('http://tournament.test/?'+new URLSearchParams({
  tournament,role:'player',invite:shared.token}),{waitUntil:'domcontentloaded'});
 await qrPage.locator('#name').fill('Chloé');
 await qrPage.locator('#request').click();
 await qrPage.waitForFunction(()=>Boolean(gameId&&requestId),{timeout:15000});
 const routed=await qrPage.evaluate(()=>({game:gameId,request:requestId}));
 assert.equal(routed.game,matches[1].game,'Shared QR must route Chloé to her scheduled fixture');
 const waiting=(await api('pending')).pending.find(x=>x.id===routed.request);
 assert(waiting&&waiting.name==='Chloé');
 await api('approve',{request:routed.request});
 await qrPage.waitForFunction(()=>you?.name==='Chloé'&&you.role==='player',
  {timeout:16000});
 assert.equal(await qrPage.locator('#my-tournament').isVisible(),true);
 console.log('PASS tournament-wide QR maps newcomers by name with first-time approval');
 await qrContext.unrouteAll({behavior:'wait'});
 await qrContext.close();
 assert.deepEqual(errors,[],'Unexpected browser errors');
 await hostContext.close();
}
const timer=setTimeout(()=>{server?.kill('SIGTERM');browser?.close().catch(()=>{})},240000);
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;})
 .finally(async()=>{
  clearTimeout(timer);
  await browser?.close().catch(()=>{});
  if(server&&server.exitCode===null&&server.signalCode===null){
   const exited=new Promise(done=>server.once('exit',done));
   server.kill('SIGTERM');
   await Promise.race([exited,new Promise(done=>setTimeout(done,3000))]);
  }
  fs.rmSync(temporary,{recursive:true,force:true,maxRetries:6,retryDelay:100});
 });
