/* Chromium: host teaches one exercise; two read-only QR guests see every move. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'alfastafl-tutorial-share-'));
const env={...process.env,
 PYTHONPATH:[path.join(root,'src'),process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)};
let processHost,browser;
const python=process.env.TUTORIAL_TEST_PYTHON||'python3';
const code=`
import json,signal,sys
from alfastafl.server import Store,run
store=Store(sys.argv[1])
server=run('127.0.0.1',0,store)
# Test-only LAN simulation, no privileged firewall operations.
server.lan_enabled=True
server.lan_address='127.0.0.1'
def stop(*_):raise KeyboardInterrupt
signal.signal(signal.SIGTERM,stop)
print(json.dumps({'port':server.server_address[1]}),flush=True)
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:store.shutdown();server.server_close()
`;
async function serve(){
 processHost=spawn(python,['-u','-c',code,path.join(tmp,'games')],{
  cwd:root,env,stdio:['ignore','pipe','pipe']});
 return new Promise((resolve,reject)=>{
  let data='',err='';
  const timeout=setTimeout(()=>reject(Error('Python did not start: '+err)),16000);
  processHost.stderr.on('data',x=>err+=x.toString());
  processHost.once('exit',status=>reject(Error('Python exited '+status+': '+err)));
  processHost.stdout.on('data',x=>{
   data+=x.toString();
   if(!data.includes('\n'))return;
   try{const info=JSON.parse(data.split('\n')[0]);clearTimeout(timeout);
    resolve('http://127.0.0.1:'+info.port);}catch(e){reject(e);}
  });
 });
}
async function main(){
 const base=await serve();
 browser=await chromium.launch({headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const hostContext=await browser.newContext({viewport:{width:1440,height:900}});
 const host=await hostContext.newPage();
 host.setDefaultTimeout(18000);
 const pageErrors=[];
 host.on('pageerror',e=>pageErrors.push('host: '+e.message));
 await host.goto(base,{waitUntil:'domcontentloaded'});
 await host.locator('#tutorial-open').waitFor();
 await host.locator('#tutorial-open').click();
 await host.waitForFunction(()=>document.getElementById('tutorial-panel').open &&
  !document.getElementById('tutorial-live-qr').hidden &&
  document.getElementById('tutorial-live-qr').naturalWidth>0);
 const qrSize=await host.locator('#tutorial-live-qr').boundingBox();
 assert(qrSize.width>=150&&qrSize.height>=150,'QR must be large enough for a smartphone camera');
 const url=await host.locator('#tutorial-live-link').getAttribute('href');
 assert.equal(new URL(url).host,new URL(base).host);
 assert.equal(new URL(url).pathname,'/tutorial-view.html');
 const token=new URL(url).searchParams.get('tutorial_view');
 assert(token&&token.length>48,'QR must use a cryptographic session secret');
 console.log('PASS QR available directly in the open host tutorial');
 const guestContext=await browser.newContext({viewport:{width:1200,height:800}});
 guestContext.setDefaultTimeout(18000);
 await guestContext.route('**/*',async route=>{
  const source=route.request(),url=new URL(source.url());
  if(url.hostname!=='guest.test')return route.abort();
  const options={method:source.method(),headers:source.headers()};
  if(source.postDataBuffer())options.data=source.postDataBuffer();
  try{const response=await guestContext.request.fetch(
   base+url.pathname+url.search,options);
   await route.fulfill({response});}
  catch(_){if(!route.isInterceptResolutionHandled())await route.abort();}
 });
 const guest=await guestContext.newPage();
 guest.on('pageerror',e=>pageErrors.push('guest: '+e.message));
 await guest.goto('http://guest.test'+new URL(url).pathname+new URL(url).search,
  {waitUntil:'domcontentloaded'});
 await guest.waitForFunction(()=>document.querySelectorAll(
  '#tutorial-board [role="gridcell"]').length===121 &&
  document.getElementById('tutorial-remote-connection').dataset.status==='live');
 assert.equal(await guest.locator('#tutorial-remote-title').textContent(),
  'Les camps et le premier coup');
 assert.equal(await guest.locator('#tutorial-open').count(),0);
 assert.equal(await guest.locator('#request').count(),0);
 assert.equal(await guest.locator('#tutorial-board [role="gridcell"]').count(),121);
 console.log('PASS guest sees the correct 3D/2D teaching board, no game controls');
 await guest.evaluate(()=>{
  const view=document.getElementById('tutorial-board-view').boardView;
  window.__tutorialPlayCount=0;
  const original=view.playMove.bind(view);
  view.playMove=(...args)=>{window.__tutorialPlayCount++;return original(...args);};
 });

 const first=(await (await hostContext.request.get(base+'/api/tutorial?mode=fetlar')).json()).tutorial;
 const from=first.focus[0],to=first.targets[0];
 await host.locator('#tutorial-board-mode').selectOption('2d');
 await host.locator('#tutorial-board button[data-row="'+from[0]+'"][data-col="'+from[1]+'"]').click();
 await guest.waitForFunction(pos=>document.querySelector(
  '#tutorial-board .square.selected[data-row="'+pos[0]+'"][data-col="'+pos[1]+'"]'
 )!==null,from);
 assert.equal(await guest.locator('#tutorial-board .square.legal').count()>0,true);
 console.log('PASS spectator sees the current piece selection and legal moves');
 await host.locator('#tutorial-board button[data-row="'+to[0]+'"][data-col="'+to[1]+'"]').click();
 await host.waitForFunction(()=>document.getElementById('tutorial-feedback').dataset.kind==='success');
 await guest.waitForFunction(()=>document.getElementById('tutorial-remote-feedback').dataset.kind==='success' &&
  !document.querySelector('#tutorial-board .square.selected'));
 const snapshot=(await(await hostContext.request.get(base+'/api/tutorial/live/state?token='+
   encodeURIComponent(token))).json());
 assert.equal(snapshot.state.completed,true);
 assert.equal(snapshot.event.n,1);
 assert.deepEqual(snapshot.event.to,to);
 await guest.waitForFunction(()=>window.__tutorialPlayCount===1);
 await host.locator('#tutorial-hint').click();
 await guest.waitForFunction(()=>!document.getElementById('tutorial-remote-hint').hidden);
 assert.equal(await guest.evaluate(()=>window.__tutorialPlayCount),1,
  'A hint on a completed exercise must never replay the move animation');
 console.log('PASS server-confirmed host move is animated once, even after a hint');
 await host.locator('#tutorial-next').click();
 await guest.waitForFunction(()=>document.getElementById('tutorial-remote-title').textContent===
  'Se déplacer en ligne droite');
 console.log('PASS spectators follow lesson changes without reconnecting');
 await host.locator('#tutorial-live-toggle').click();
 await guest.waitForFunction(()=>document.getElementById('tutorial-remote-connection').dataset.status==='closed');
 assert.equal((await hostContext.request.get(base+'/api/tutorial/live/state?token='+
  encodeURIComponent(token))).status(),403);
 console.log('PASS the presenter can revoke a shared QR immediately');
 await host.locator('#tutorial-live-toggle').click();
 await host.waitForFunction(previous=>!document.getElementById('tutorial-live-qr').hidden &&
  new URL(document.getElementById('tutorial-live-link').href).searchParams.get('tutorial_view')!==previous,token);
 const newToken=new URL(await host.locator('#tutorial-live-link').getAttribute('href'))
  .searchParams.get('tutorial_view');
 await host.locator('#tutorial-close').click();
 await host.waitForFunction(async key=>{
  const response=await fetch('/api/tutorial/live/state?token='+encodeURIComponent(key),
   {cache:'no-store'});
  return response.status===403;
 },newToken,{timeout:9000});
 console.log('PASS closing the tutorial shuts the stream without touching saved games');
 const games=(await (await hostContext.request.get(base+'/api/games')).json()).games;
 assert.deepEqual(games,[]);
 assert.deepEqual(pageErrors,[],'No Javascript errors in either browser');
 await guestContext.unrouteAll({behavior:'wait'});
 await guestContext.close();
 await hostContext.close();
}
const timeout=setTimeout(()=>{
 browser?.close().catch(()=>{});processHost?.kill('SIGTERM');
},240000);
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;})
 .finally(async()=>{
  clearTimeout(timeout);
  await browser?.close().catch(()=>{});
  if(processHost&&processHost.exitCode===null&&processHost.signalCode===null){
   const stopped=new Promise(resolve=>processHost.once('exit',resolve));
   processHost.kill('SIGTERM');
   await Promise.race([stopped,new Promise(resolve=>setTimeout(resolve,3000))]);
  }
  fs.rmSync(tmp,{recursive:true,force:true,maxRetries:8,retryDelay:120});
 });
