/* New QR-only tournament: host rail, 2 registered phones, spectator and trophies.
 * Each phone uses a distinct browser context with no shared local storage. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium,firefox,webkit}=require('playwright');
const browserName=process.env.ALFASTAFL_BROWSER||'chromium';
const engines={chromium,firefox,webkit};
const root=path.resolve(__dirname,'..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'alfastafl-qr-tournament-'));
const code=`
import json,sys
from alfastafl.server import Store,run
store=Store(sys.argv[1])
server=run('127.0.0.1',0,store)
server.lan_enabled=True
server.lan_address='127.0.0.1'
print(json.dumps({'port':server.server_address[1]}),flush=True)
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:store.shutdown();server.server_close()
`;
const env={...process.env,PYTHONPATH:path.join(root,'src')};
let server,browser,base,port;
async function launchServer(){
 server=spawn('python3',['-u','-c',code,path.join(temporary,'games')],
  {cwd:root,env});
 const output=await new Promise((resolve,reject)=>{
  let seen='';
  const timer=setTimeout(()=>reject(Error('Tournament server timeout')),16000);
  server.stdout.on('data',chunk=>{
   seen+=chunk.toString();
   if(seen.includes('\n')){clearTimeout(timer);resolve(seen.split('\n')[0]);}
  });
  server.once('error',reject);
  server.once('exit',code=>reject(Error('Server exited: '+code)));
 });
 port=JSON.parse(output).port;
 base='http://127.0.0.1:'+port;
}
async function guest(alias,tid,invite){
 const context=await browser.newContext({
  viewport:{width:390,height:840},isMobile:true,hasTouch:true,
 });
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname!==alias)return route.abort();
  if(url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
  try{
   const response=await context.request.fetch(base+url.pathname+url.search,{
    method:request.method(),
    headers:request.headers()['content-type']?{'content-type':request.headers()['content-type']}:undefined,
    data:request.postDataBuffer()||undefined,
   });
   const body=await response.body();
   await route.fulfill({status:response.status(),headers:response.headers(),body});
  }catch(error){
   await route.abort().catch(()=>{});
  }
 });
 const page=await context.newPage();
 page.setDefaultTimeout(16000);
 await page.goto('http://'+alias+':'+port+'/?'+new URLSearchParams({
  tournament:tid,invite
 }),{waitUntil:'domcontentloaded'});
 return {page,context};
}
async function main(){
 await launchServer();
 const errors=[],contexts=[];
 try{
  browser=await engines[browserName].launch(browserName==='chromium'
   ?{headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}
   :{headless:true});
  const context=await browser.newContext({viewport:{width:1450,height:930}});
  contexts.push(context);
  const host=await context.newPage();
  host.setDefaultTimeout(16000);
  host.on('pageerror',error=>errors.push('host: '+error.message));
  const api=async(endpoint,data)=>{
   const response=data===undefined?
    await context.request.get(base+'/api/'+endpoint):
    await context.request.post(base+'/api/'+endpoint,{data});
   const body=await response.json();
   assert.equal(response.status(),200,endpoint+': '+JSON.stringify(body));
   return body;
  };
  await host.goto(base+'/?desktop=shell',{waitUntil:'domcontentloaded'});
  await host.waitForFunction(()=>Boolean(window.AlfastaflShell));
  await host.evaluate(()=>window.AlfastaflShell.open('tournament'));
  assert.equal(await host.locator('#tournament-players').count(),0);
  await host.locator('#tournament-name').fill('Rencontres des runes');
  await host.locator('#tournament-format').selectOption('knockout');
  await host.locator('#tournament-create').click();
  await host.waitForFunction(()=>!document.querySelector('#shell-tournament-dialog').open);
  const t=(await api('tournaments')).tournaments.find(x=>x.name==='Rencontres des runes');
  assert(t&&t.registration_open);
  assert.deepEqual(t.players,[]);
  const tid=t.id;
  await host.waitForFunction(()=>document.querySelector('#shell-player-image')
   ?.getAttribute('src')?.includes('tournament='));
  const invites=(await api('tournament/invites?tournament='+tid)).invites;
  assert.notEqual(invites.player,invites.spectator);
  console.log('PASS host creates an empty QR tournament and displays both permanent rail invitations');

  const spectator=await guest('viewer.test',tid,invites.spectator);
  contexts.push(spectator.context);
  spectator.page.on('pageerror',e=>errors.push('spectator: '+e.message));
  await spectator.page.waitForFunction(()=>
   document.body.classList.contains('tournament-broadcast')&&Boolean(session),null,{timeout:20000});
  assert.equal(await spectator.page.locator('#tournament-connect').isVisible(),false);
  assert.equal((await api('spectators')).connected,1);
  console.log('PASS spectator automatically joins before round one without an approval request');

  async function player(alias,name){
   const device=await guest(alias,tid,invites.player);
   contexts.push(device.context);
   device.page.on('pageerror',e=>errors.push(name+': '+e.message));
   await device.page.locator('#tournament-connect').waitFor({state:'visible'});
   assert.equal(await device.page.locator('#join').isVisible(),false);
   await device.page.locator('#tournament-entrant-name').fill(name);
   await device.page.locator('#tournament-enter').click();
   await device.page.locator('#guest-waiting').waitFor({state:'visible'});
   const item=host.locator('#rail-tournament-requests .rail-request').filter({hasText:name});
   await item.waitFor();
   await item.locator('.rail-approve').click();
   await device.page.waitForFunction(()=>document.body.classList.contains('tournament-open-lobby'),
    null,{timeout:20000});
   assert.equal(await device.page.locator('#tournament-stage-message').isVisible(),true);
   assert.match(await device.page.locator('#tournament-stage-message').textContent(),/En attente du partenaire/);
   assert.equal(await device.page.locator('#guest-view-2d').isVisible(),true);
   assert.equal(await device.page.locator('#guest-view-3d').isVisible(),true);
   await device.page.locator('#guest-view-2d').click();
   assert.equal(await device.page.locator('#guest-view-2d').getAttribute('aria-pressed'),'true');
   assert.equal(await device.page.locator('#board .square').count(),121);
   return device;
  }
  const alice=await player('alice.test','Alice');
  const bruno=await player('bruno.test','Bruno');
  assert.equal((await api('tournament/registrations?tournament='+tid)).players.length,2);
  await host.waitForFunction(()=>!document.querySelector('#rail-tournament-draw').disabled);
  await host.locator('#rail-tournament-draw').click();
  await alice.page.waitForFunction(()=>Boolean(gameId&&session&&you?.role==='player'),
   null,{timeout:22000});
  await bruno.page.waitForFunction(()=>Boolean(gameId&&session&&you?.role==='player'),
   null,{timeout:22000});
  const pairing=(await api('tournaments')).tournaments.find(x=>x.id===tid).matches[0];
  assert.equal(pairing.placement,'final');
  const a=await alice.page.evaluate(()=>({name:you.name,camp:you.camp,game:gameId,session}));
  const b=await bruno.page.evaluate(()=>({name:you.name,camp:you.camp,game:gameId,session}));
  assert.equal(a.game,b.game);
  assert.notEqual(a.camp,b.camp);
  assert.equal(a.name,'Alice');
  assert.equal(b.name,'Bruno');
  await alice.page.locator('#tournament-opponent-label').waitFor({state:'visible'});
  assert.match(await alice.page.locator('#tournament-opponent-label').textContent(),/Bruno/);
  assert.equal(await alice.page.locator('#guest-view-2d').isVisible(),true);
  assert.equal(await spectator.page.locator('#broadcast-wall').isVisible(),true);
  console.log('PASS host draws a round: approved players receive opponent, faction ceremony and 2D/3D');
  const loser=pairing.b;
  const lost=loser==='Alice'?a:b;
  await api('resign',{game:pairing.game,session:lost.session});
  const winning=loser==='Alice'?bruno:alice;
  const losing=loser==='Alice'?alice:bruno;
  await winning.page.waitForFunction(()=>document.body.classList.contains('tournament-open-lobby'),
   null,{timeout:24000});
  await winning.page.locator('.tournament-ceremony.award').waitFor({state:'visible',timeout:24000});
  await losing.page.waitForFunction(()=>document.body.classList.contains('tournament-open-lobby'),
   null,{timeout:24000});
  const ranking=(await api('tournaments')).tournaments.find(x=>x.id===tid);
  assert.equal(ranking.completed,true);
  assert.equal(ranking.rankings.length,2);
  assert.equal(await host.locator('#rail-tournament-draw').isVisible(),false);
  console.log('PASS medals appear and all final placements survive without a saved game');
  assert.deepEqual(errors,[]);
 }finally{
  for(const ctx of contexts)await ctx.close().catch(()=>{});
  await browser?.close().catch(()=>{});
  server?.kill('SIGTERM');
  fs.rmSync(temporary,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
