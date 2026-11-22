/* Host Chromium: odd tournament exemptions, visible standings, knockout replays. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'alfastafl-edge-tournaments-'));
const env={...process.env,PYTHONPATH:[path.join(root,'src'),process.env.PYTHONPATH]
 .filter(Boolean).join(path.delimiter)};
const python=process.env.TUTORIAL_TEST_PYTHON||'python3';
const code=`
import json,signal,sys
from alfastafl.server import Store,run,AppHandler
store=Store(sys.argv[1])
server=run('127.0.0.1',0,store)
server.lan_enabled=True
server.lan_address='127.0.0.1'
class Handler(AppHandler):
 def do_POST(self):
  if self.path=='/__test__/finish':
   d=self.read_json()
   with self.server.store.lock:
    g=self.server.store.games[d['game']]
    if g.status!='active':return self.send({'error':'Game not active'},400)
    g.status='finished';g.winner=d.get('camp')
    g.reason='test_finished';g.clock['started']=False
    self.server.store.save(g)
   return self.send({'finished':True})
  super().do_POST()
server.RequestHandlerClass=Handler
def stop(*_):raise KeyboardInterrupt
signal.signal(signal.SIGTERM,stop)
print(json.dumps({'port':server.server_address[1]}),flush=True)
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:store.shutdown();server.server_close()
`;
let server,browser;
async function startServer(){
 server=spawn(python,['-u','-c',code,path.join(temp,'games')],{
  cwd:root,env,stdio:['ignore','pipe','pipe']});
 return new Promise((resolve,reject)=>{
  let data='',error='';
  const timeout=setTimeout(()=>reject(Error('Host startup timeout: '+error)),16000);
  server.stderr.on('data',x=>error+=x.toString());
  server.once('exit',status=>reject(Error('Host exited '+status+': '+error)));
  server.stdout.on('data',x=>{
   data+=x.toString();if(!data.includes('\n'))return;
   try{clearTimeout(timeout);
    resolve('http://127.0.0.1:'+JSON.parse(data.split('\n')[0]).port);
   }catch(e){reject(e);}
  });
 });
}
async function main(){
 const base=await startServer();
 browser=await chromium.launch({headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1320,height:820}});
 const host=await context.newPage();host.setDefaultTimeout(17000);
 const errors=[];host.on('pageerror',error=>errors.push(error.message));
 const api=async(route,payload)=>{
  const response=payload===undefined?
    await context.request.get(base+'/api/'+route):
    await context.request.post(base+'/api/'+route,{data:payload});
  assert.equal(response.status(),200,route+' '+await response.text());
  return response.json();
 };
 await host.goto(base+'/?desktop=shell',{waitUntil:'domcontentloaded'});
 await host.waitForFunction(()=>Boolean(window.AlfastaflShell));
 await host.evaluate(()=>window.AlfastaflShell.open('tournament'));
 await host.locator('#shell-tournament-dialog[open]').waitFor();
 async function newTournament(name,format,players){
  // Historical pre-registered tournaments still load and display correctly.
  // New host UI intentionally no longer exposes manual player enrollment.
  const result=await api('tournament/create',{name,format,players,rounds:3});
  await host.evaluate(()=>window.AlfastaflTournaments.refresh());
  await host.waitForFunction(expected=>[...document.querySelectorAll(
   '#tournament-list .tournament-title')].some(x=>x.textContent.includes(expected)),name);
  return result.tournament;
 }
 async function row(name){
  return host.locator('#tournament-list .tournament-item')
   .filter({has:host.locator('.tournament-title',{hasText:name})});
 }
 // Browser UI must not lie about missing odd-numbered matches.
 const every=await newTournament('Tous impairs','round_robin',['A','B','C']);
 let group=await row(every.name);
 await group.locator('.tournament-next').click();
 await group.locator('.tournament-match').nth(1).waitFor();
 assert.equal(await group.locator('.tournament-match').count(),2);
 assert.match(await group.locator('.tournament-match').allTextContents()
  .then(items=>items.join(' ')),/Exemption.*Repos.*aucun point/);
 assert.equal(await group.locator('.tournament-match button').count(),1,
  'No fake board or playable button is created for an exemption');
 assert.equal(await group.locator('.tournament-standings span').count(),3);
 console.log('PASS odd round-robin hosts a visible zero-point bye without phantom game');

 const swiss=await newTournament('Suisse impair','swiss',['D','E','F','G','H']);
 group=await row(swiss.name);
 await group.locator('.tournament-next').click();
 await group.locator('.tournament-match').nth(2).waitFor();
 assert.equal(await group.locator('.tournament-match').count(),3);
 assert.match((await group.locator('.tournament-match').allTextContents()).join(' '),
  /Exemption.*3 points attribués/);
 assert.match((await group.locator('.tournament-standings span').allTextContents())
  .join(' '),/3 point/);
 assert.equal(await group.locator('.tournament-match button').count(),2);
 console.log('PASS odd Swiss visibly scores and rotates its real bye');

 const knockout=await newTournament('Coupe à cinq','knockout',['I','J','K','L','M']);
 group=await row(knockout.name);
 await group.locator('.tournament-next').click();
 await host.waitForFunction(name=>[...document.querySelectorAll(
  '.tournament-item')].filter(x=>x.querySelector('.tournament-title')
  ?.textContent.includes(name)).some(x=>x.querySelectorAll('.tournament-match').length===4),
  knockout.name);
 const data=(await api('tournaments')).tournaments.find(t=>t.id===knockout.id);
 assert.equal(data.matches.filter(m=>m.bye).length,3);
 assert.equal(await group.locator('.tournament-match button').count(),1);
 assert.match((await group.locator('.tournament-match').allTextContents()).join(' '),
  /Qualification automatique/);
 const original=data.matches.find(m=>m.game);
 await context.request.post(base+'/__test__/finish',{data:{game:original.game}});
 await group.locator('.tournament-next').click();
 await host.waitForFunction(name=>[...document.querySelectorAll(
  '.tournament-item')].filter(x=>x.querySelector('.tournament-title')
  ?.textContent.includes(name)).some(x=>x.querySelectorAll('.tournament-match').length===5),
  knockout.name);
 const updated=(await api('tournaments')).tournaments.find(t=>t.id===knockout.id);
 const replay=updated.matches.find(m=>m.replay_of===original.id);
 assert(replay&&replay.game);
 assert.equal(replay.round,1);
 assert.match((await group.locator('.tournament-match').allTextContents()).join(' '),
  /Nul.*revanche enregistrée|Revanche/);
 assert.equal(await group.locator('.tournament-match button').count(),2,
  'Only real games have a board navigation button');
 console.log('PASS a knockout draw creates and labels a real replay in the SAME round');

 await host.locator('#tournament-format-help').click();
 const text=await host.locator('[data-tournament-format="knockout"]').textContent();
 assert.match(text,/revanche/i);
 assert.match(text,/exemptions/i);
 await host.locator('#tournament-format').selectOption('round_robin');
 assert.match(await host.locator('[data-tournament-format="round_robin"]').textContent(),
  /impair|exemption/i);
 await host.locator('#tournament-format').selectOption('swiss');
 assert.match(await host.locator('[data-tournament-format="swiss"]').textContent(),
  /3 points/i);
 console.log('PASS help text matches real odd and drawn-match behavior');
 assert.deepEqual(errors,[],'No uncaught errors in the host interface');
 await context.close();
}
const timeout=setTimeout(()=>{browser?.close().catch(()=>{});server?.kill('SIGTERM')},210000);
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;})
.finally(async()=>{
 clearTimeout(timeout);
 await browser?.close().catch(()=>{});
 if(server&&server.exitCode===null&&server.signalCode===null){
  const stop=new Promise(resolve=>server.once('exit',resolve));
  server.kill('SIGTERM');
  await Promise.race([stop,new Promise(done=>setTimeout(done,3000))]);
 }
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
});
