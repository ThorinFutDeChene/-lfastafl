/* Host browser archive UI: open old results and delete old tournaments safely. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'alfastafl-tournament-history-'));
const env={...process.env,PYTHONPATH:path.join(root,'src')};
const python=`
import json,signal,sys
from alfastafl.server import Store,run,AppHandler
store=Store(sys.argv[1])
server=run('127.0.0.1',0,store)
server.lan_enabled=True
server.lan_address='127.0.0.1'
class Handler(AppHandler):
 def do_POST(self):
  if self.path=='/api/__test__/finish':
   d=self.read_json()
   with self.server.store.lock:
    g=self.server.store.games[d['game']]
    m=self.server.store.tournament_match(g.id)
    g.status='finished'
    g.winner=m['camp_a']
    g.clock['started']=False
    self.server.store.save(g)
   return self.send({'finished':True})
  return super().do_POST()
server.RequestHandlerClass=Handler
def stop(*_):raise KeyboardInterrupt
signal.signal(signal.SIGTERM,stop)
print(json.dumps({'port':server.server_address[1]}),flush=True)
try: server.serve_forever()
except KeyboardInterrupt:pass
finally:store.shutdown();server.server_close()
`;
let child,browser;
async function start(){
 child=spawn('python3',['-u','-c',python,path.join(temp,'data')],{
  cwd:root,env,stdio:['ignore','pipe','pipe']});
 return await new Promise((resolve,reject)=>{
  let buffer='',errors='';
  const timer=setTimeout(()=>reject(Error('Server timeout '+errors)),16000);
  child.stderr.on('data',c=>errors+=String(c));
  child.once('exit',code=>reject(Error('Server exited '+code+' '+errors)));
  child.stdout.on('data',c=>{
   buffer+=String(c);
   if(!buffer.includes('\n'))return;
   clearTimeout(timer);
   resolve('http://127.0.0.1:'+JSON.parse(buffer.split('\n')[0]).port);
  });
 });
}
async function main(){
 const base=await start();
 try{
  browser=await chromium.launch({headless:true,args:[
   '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();page.setDefaultTimeout(18000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function api(path,payload){
   const response=payload===undefined?
    await context.request.get(base+'/api/'+path):
    await context.request.post(base+'/api/'+path,{data:payload});
   const json=await response.json();
   assert.equal(response.status(),200,path+' '+JSON.stringify(json));
   return json;
  }
  const legacy=await api('tournament/create',{
   name:'Ancienne coupe',format:'round_robin',players:['Alice','Bruno']});
  const lid=legacy.tournament.id;
  const [match]= (await api('tournament/round',{tournament:lid})).matches;
  await api('__test__/finish',{game:match.game});
  const unstarted=await api('tournament/create',{
   name:'Premier essai à effacer',format:'knockout',players:['X','Y']});
  const uid=unstarted.tournament.id;

  const qr=await api('tournament/create',{
   name:'Tournoi QR terminé',format:'knockout'});
  const tid=qr.tournament.id;
  const token=(await api('tournament/invites?tournament='+tid)).invites.player;
  for(const name of ['Chloé','David']){
   const signup=await api('tournament/register',{
    tournament:tid,invite:token,name});
   await api('tournament/registration/decide',{request:signup.request,approve:true});
  }
  const [final]= (await api('tournament/round',{tournament:tid})).matches;
  await api('__test__/finish',{game:final.game});
  const completed=(await api('tournaments')).tournaments.find(t=>t.id===tid);
  assert.equal(completed.completed,true);
  assert.deepEqual(completed.rankings.sort(),['Chloé','David']);
  await page.goto(base+'/?desktop=shell',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.AlfastaflTournaments));
  await page.evaluate(()=>window.AlfastaflShell.open('tournament'));
  await page.waitForFunction(()=>document.querySelectorAll(
   '#tournament-list .tournament-item').length===3);
  const archive=page.locator('.tournament-archive .tournament-item');
  const ongoing=page.locator('.tournament-current .tournament-item');
  assert.equal(await archive.count(),2);
  assert.equal(await ongoing.count(),1);
  console.log('PASS older completed tournaments and unstarted tournaments are separated');

  const old=archive.filter({hasText:'Ancienne coupe'});
  assert.equal(await old.locator('.tournament-detail').isVisible(),false);
  assert.equal(await old.locator('.tournament-results-toggle').getAttribute('aria-expanded'),'false');
  await old.locator('.tournament-results-toggle').click();
  assert.equal(await old.locator('.tournament-detail').isVisible(),true);
  assert.match(await old.locator('.tournament-match').textContent(),/Alice.*Bruno.*Victoire : Alice/s);
  assert.match(await old.locator('.tournament-standings').textContent(),/Alice.*3 point/);
  await old.locator('.tournament-results-toggle').click();
  assert.equal(await old.locator('.tournament-detail').isVisible(),false);
  console.log('PASS old results can be expanded and collapsed without a saved game board');

  const historic=archive.filter({hasText:'Tournoi QR terminé'});
  await historic.locator('.tournament-results-toggle').click();
  assert.match(await historic.locator('.tournament-podium-results').textContent(),
   /1ᵉ.*Coupe d’or.*2ᵉ.*Argent/s);
  assert.match(await historic.locator('.tournament-match').textContent(),/Victoire/);
  console.log('PASS saved QR podium and round results are visible in the archive');

  const unfinished=ongoing.filter({hasText:'Premier essai à effacer'});
  page.once('dialog',dialog=>dialog.dismiss());
  await unfinished.locator('.tournament-delete').click();
  assert((await api('tournaments')).tournaments.some(t=>t.id===uid));
  page.once('dialog',dialog=>dialog.accept());
  await unfinished.locator('.tournament-delete').click();
  await page.waitForFunction(id=>![...document.querySelectorAll('.tournament-item')]
   .some(x=>x.dataset.tournament===id),uid);
  assert(!(await api('tournaments')).tournaments.some(t=>t.id===uid));
  console.log('PASS cancelled deletion preserves an old tournament; confirmed deletion removes it');

  page.once('dialog',dialog=>dialog.accept());
  await historic.locator('.tournament-delete').click();
  await page.waitForFunction(id=>![...document.querySelectorAll('.tournament-item')]
   .some(x=>x.dataset.tournament===id),tid);
  assert.equal((await api('tournaments')).tournaments.length,1);
  assert.equal(await old.count(),1);
  assert.equal(await old.locator('.tournament-results-toggle').isVisible(),true);
  console.log('PASS deleting a QR archive leaves unrelated historical results intact');
  assert.deepEqual(errors,[]);
 }finally{
  await browser?.close().catch(()=>{});
  child?.kill('SIGTERM');
  fs.rmSync(temp,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
