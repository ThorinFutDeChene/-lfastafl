/* Native QR semantics exercised from distinct non-loopback browser origins. */
'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'alfastafl-mobile-'));
const code=`
import sys
from alfastafl.server import Store,run
server=run('127.0.0.1',0,Store(sys.argv[1]))
server.lan_enabled=True
server.lan_address='127.0.0.1'
print(server.server_address[1],flush=True)
server.serve_forever()
`;
async function start(){
 const child=spawn('python3',['-u','-c',code,path.join(temporary,'games')],{
  cwd:root,env:{...process.env,PYTHONPATH:path.join(root,'src')}});
 const port=await new Promise((resolve,reject)=>{
  let data='';
  const timer=setTimeout(()=>reject(Error('server timeout')),12000);
  child.stdout.on('data',part=>{
   data+=part.toString();
   if(data.includes('\n')){clearTimeout(timer);resolve(Number(data.trim().split('\n')[0]));}
  });
  child.once('error',reject);
  child.once('exit',status=>reject(Error('server exit '+status)));
 });
 return {child,base:'http://127.0.0.1:'+port,port};
}
async function mobile(browser,base,port,hostname,game,invite){
 const context=await browser.newContext({viewport:{width:390,height:800}});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname!==hostname)return route.abort();
  if(url.pathname==='/board3d.js')return route.abort();
  const opts={method:request.method(),headers:request.headers()};
  if(request.postDataBuffer())opts.data=request.postDataBuffer();
  try{
   const forwarded=await context.request.fetch(base+url.pathname+url.search,opts);
   await route.fulfill({response:forwarded});
  }catch(_){await route.abort().catch(()=>{});}
 });
 const page=await context.newPage();
 page.setDefaultTimeout(12000);
 await page.goto('http://'+hostname+':'+port+'/?'+
  new URLSearchParams({game,invite}),{waitUntil:'domcontentloaded'});
 return {context,page};
}
async function main(){
 const server=await start();let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--disable-gpu']});
  const request=await browser.newContext();
  const api=async(endpoint,data)=>{
   const r=data===undefined?await request.request.get(server.base+'/api/'+endpoint):
    await request.request.post(server.base+'/api/'+endpoint,{data});
   return {status:r.status(),body:await r.json()};
  };
  const created=await api('create',{host_camp:'dwarf'});
  assert.equal(created.status,200);
  const game=created.body.game,invites=created.body.invites;
  const player=await mobile(browser,server.base,server.port,'player.test',game,invites.player);
  await player.page.locator('#join').waitFor({state:'visible'});
  assert.equal(await player.page.locator('#gid').isVisible(),false);
  assert.equal(await player.page.locator('#invite').isVisible(),false);
  assert.equal(await player.page.locator('#guest-waiting').isVisible(),false);
  await player.page.locator('#name').fill('Hervé');
  await player.page.locator('#request').click();
  await player.page.locator('#guest-waiting').waitFor({state:'visible'});
  const pending=await api('pending');
  assert.equal(pending.body.pending.length,1);
  assert.equal(pending.body.pending[0].role,'player');
  const approved=await api('approve',{request:pending.body.pending[0].id,camp:'elf'});
  assert.equal(approved.status,200);
  await player.page.waitForFunction(()=>document.body.classList.contains('guest-board-only'));
  assert.equal(await player.page.locator('#join').isVisible(),false);
  assert.equal(await player.page.locator('#guest-view-2d').isVisible(),true);
  assert.equal(await player.page.locator('#guest-view-3d').isVisible(),true);
  await player.page.locator('#guest-view-2d').click();
  assert.equal(await player.page.locator('#guest-view-2d').getAttribute('aria-pressed'),'true');
  console.log('PASS player nickname, awaiting host and full board with only 2D/3D buttons');
  const viewer=await mobile(browser,server.base,server.port,'viewer.test',game,invites.spectator);
  await viewer.page.waitForFunction(()=>document.body.dataset.guestRole==='spectator',
   null,{timeout:15000});
  assert.equal(await viewer.page.locator('#join').isVisible(),false);
  assert.equal(await viewer.page.locator('#guest-view-2d').isVisible(),false);
  assert.equal(await viewer.page.locator('#guest-menu-toggle').isVisible(),false);
  assert.equal(await viewer.page.locator('#player-controls').isVisible(),false);
  assert.equal(await viewer.page.locator('#board').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
  assert.equal((await api('pending')).body.pending.length,0);
  const stats=await api('spectators');
  assert.deepEqual(stats.body,{connected:1,limit:10});
  const limited=await api('spectators/limit',{limit:1});
  assert.deepEqual(limited.body,{connected:1,limit:1});
  const refused=await mobile(browser,server.base,server.port,'viewer2.test',game,invites.spectator);
  await refused.page.waitForFunction(()=>
   document.getElementById('guest-waiting-message').textContent.includes('maximal'),
   null,{timeout:15000});
  assert.equal(await refused.page.locator('#join').isVisible(),false);
  assert.equal((await api('spectators')).body.connected,1);
  console.log('PASS spectator admitted directly, read-only and counted independently of host/players');
  await Promise.all([player.context.close(),viewer.context.close(),refused.context.close(),request.close()]);
 }finally{
  await browser?.close().catch(()=>{});
  server.child.kill('SIGTERM');
  fs.rmSync(temporary,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
