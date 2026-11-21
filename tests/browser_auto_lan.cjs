/* Browser end-to-end: no manual network toggle, auto activation by game activity. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'alfastafl-auto-lan-'));
const python=process.env.TUTORIAL_TEST_PYTHON||'python3';
const env={...process.env,
 PYTHONPATH:[path.join(root,'src'),process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)};
const code=`
import json,signal,sys
from alfastafl.server import Store,run,AppHandler
store=Store(sys.argv[1])
server=run('127.0.0.1',0,store)
server.lan_enabled=False
server.lan_address='127.0.0.1'
server.activation_count=0
def activate():
 server.activation_count+=1
 server.lan_enabled=True
server.lan_activation_requested=activate
class TestHandler(AppHandler):
 def do_POST(self):
  if self.path=='/__test__/lan/off':
   self.server.lan_enabled=False
   return self.send({'ok':True})
  super().do_POST()
 def do_GET(self):
  if self.path=='/__test__/lan/count':
   return self.send({'count':self.server.activation_count})
  super().do_GET()
server.RequestHandlerClass=TestHandler
def stop(*_):raise KeyboardInterrupt
signal.signal(signal.SIGTERM,stop)
print(json.dumps({'port':server.server_address[1]}),flush=True)
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:store.shutdown();server.server_close()
`;
let processHost,browser;
async function serve(){
 processHost=spawn(python,['-u','-c',code,path.join(tmp,'games')],{
  cwd:root,env,stdio:['ignore','pipe','pipe']});
 return new Promise((resolve,reject)=>{
  let out='',errors='';
  const deadline=setTimeout(()=>reject(Error('Python start timeout: '+errors)),16000);
  processHost.stderr.on('data',x=>errors+=x.toString());
  processHost.once('exit',status=>reject(Error('Host exit '+status+': '+errors)));
  processHost.stdout.on('data',chunk=>{
   out+=chunk.toString();
   if(!out.includes('\n'))return;
   try{
    const info=JSON.parse(out.split('\n')[0]);
    clearTimeout(deadline);resolve('http://127.0.0.1:'+info.port);
   }catch(error){reject(error);}
  });
 });
}
async function main(){
 const base=await serve();
 browser=await chromium.launch({headless:true,args:[
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1280,height:820}});
 const page=await context.newPage();page.setDefaultTimeout(18000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',dialog=>dialog.accept());
 const address=async()=>(await(await context.request.get(base+'/api/address')).json());
 const count=async()=>(await(await context.request.get(base+'/__test__/lan/count')).json()).count;
 const off=async()=>{const response=await context.request.post(base+'/__test__/lan/off');
  assert.equal(response.status(),200);};
 const activated=async()=>{await page.waitForFunction(async()=>{
  const result=await(await fetch('/api/address',{cache:'no-store'})).json();
  return result.lan_enabled===true;
 });};
 await page.goto(base+'/?desktop=shell',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>Boolean(window.AlfastaflShell));
 assert.equal((await address()).lan_enabled,false,'Network must not open on application launch');
 assert.equal(await count(),0);
 await page.evaluate(()=>window.AlfastaflShell.open('new'));
 await activated();
 assert.equal(await count(),1,'File > New Game should automatically trigger networking');
 assert.equal(await page.locator('#shell-new-dialog').evaluate(x=>x.open),true);
 console.log('PASS no LAN on startup; new game menu activates LAN without manual toggle');
 await page.locator('#create').click();
 await page.waitForFunction(()=>Boolean(game&&game.status==='active'));
 const id=await page.evaluate(()=>gameId);
 assert(id);
 assert.equal(await count(),1,'Repeated activation requests must be idempotent');
 console.log('PASS actual game creation does not reopen an already-active network');

 await page.evaluate(()=>window.AlfastaflShell.open('saves'));
 await page.locator('#save-leave').click();
 await page.waitForFunction(()=>game?.status==='paused');
 await page.evaluate(()=>window.AlfastaflShell.open('saves'));
 await off();
 assert.equal((await address()).lan_enabled,false);
 // Selecting a saved game, not merely opening the saved-game menu, activates LAN.
 await page.locator('#game-list .game-select').first().click();
 await activated();
 assert.equal(await count(),2);
 console.log('PASS selecting a saved game reopens LAN without an extra action');

 await off();
 await page.evaluate(()=>window.AlfastaflShell.open('saves'));
 await page.locator('#resume-game').click();
 await activated();
 assert.equal(await count(),3);
 console.log('PASS resuming an already selected paused game also reopens LAN');

 await off();
 await page.evaluate(()=>window.AlfastaflShell.open('tutorial'));
 await activated();
 assert.equal(await count(),4);
 await page.waitForFunction(()=>document.getElementById('tutorial-panel').open);
 await page.waitForFunction(()=>!document.getElementById('tutorial-live-qr').hidden);
 console.log('PASS tutorial presentation auto-opens LAN and displays its own QR');
 await page.locator('#tutorial-close').click();

 await off();
 await page.evaluate(()=>window.AlfastaflShell.open('tournament'));
 await activated();
 assert.equal(await count(),5);
 console.log('PASS tournament setup automatically enables LAN for multiple matches');
 assert.deepEqual(errors,[],'No JavaScript errors');
 await context.close();
}
const timeout=setTimeout(()=>{browser?.close().catch(()=>{});processHost?.kill('SIGTERM');},240000);
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;})
.finally(async()=>{
 clearTimeout(timeout);
 await browser?.close().catch(()=>{});
 if(processHost&&processHost.exitCode===null&&processHost.signalCode===null){
  const stopped=new Promise(resolve=>processHost.once('exit',resolve));
  processHost.kill('SIGTERM');
  await Promise.race([stopped,new Promise(resolve=>setTimeout(resolve,3000))]);
 }
 fs.rmSync(tmp,{recursive:true,force:true,maxRetries:6,retryDelay:100});
});
