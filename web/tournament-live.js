/* Multi-match tournament director. Server-only results and identities; the
 * browser is a read-only switcher except for its own authenticated game seat.
 * An approved device token is not an address MAC: browser MACs are inaccessible.
 */
(()=>{
 'use strict';
 const captureOnly=q.get('capture_only')==='1';
 if(captureOnly)document.body.classList.add('tournament-capture-only');
 const el=id=>document.getElementById(id);
 const key='alfastafl.tournament.credentials';
 let currentAccess=null,restoring=false,live=null,liveBusy=false,lastMine=0;
 let broadcastSuppressed=false;
 const creds=()=>{
  try{const value=JSON.parse(localStorage.getItem(key)||'{}');
   return value&&typeof value==='object'?value:{};}catch(_){return {};}
 };
 function remember(access){
  if(!access||!access.tournament||!access.credential)return;
  const saved=creds();
  saved[access.tournament]={credential:access.credential,role:access.role};
  try{localStorage.setItem(key,JSON.stringify(saved));}catch(_){}
  currentAccess={...access};
  if(!captureOnly&&!isHost){
   el('my-tournament').hidden=false;
   refreshMine().catch(()=>{});
   if(access.role==='spectator'&&!live&&!broadcastSuppressed)start(access.tournament,'guest');
  }
 }
 async function identify(id){
  if(!id)return null;
  try{return await api('tournament/identify?game='+encodeURIComponent(id));}
  catch(_){return null;}
 }
 async function openExistingTournamentInvitation(){
  const tournament=q.get('tournament');
  if(!tournament||isHost||captureOnly)return;
  const record=creds()[tournament];
  if(!record||record.role!==(q.get('role')||'player'))return;
  try{
   const mine=await api('tournament/mine',{credential:record.credential});
   const chosen=mine.matches.find(m=>m.status==='active')||
    (record.role==='spectator'?mine.matches[0]:null);
   if(!chosen){
    el('joinmsg').textContent='Aucune rencontre en cours pour cet appareil.';
    return;
   }
   currentAccess={tournament,credential:record.credential,role:record.role};
   await switchGame(chosen.game,true);
  }catch(error){el('joinmsg').textContent='Reconnexion au tournoi impossible : '+error.message;}
 }
 async function restore(id){
  if(isHost||captureOnly||restoring||session||!id)return false;
  restoring=true;
  try{
   const match=await identify(id);
   const credential=match&&creds()[match.id]?.credential;
   if(!credential)return false;
   const entered=await api('tournament/enter',{game:id,credential});
   session=entered.session;
   sessionStorage.setItem('alfastafl.session',session);
   sessionStorage.setItem('alfastafl.game',id);
   rememberDevice(id,session);
   currentAccess={tournament:match.id,credential,role:entered.role};
   return true;
  }catch(_){return false;}
  finally{restoring=false;}
 }
 async function switchGame(id,useNewSeat){
  if(!id||id===gameId&&!useNewSeat)return;
  if(useNewSeat){
   const credential=currentAccess?.credential;
   if(!credential)throw Error('Autorisation de tournoi manquante.');
   const joined=await api('tournament/enter',{game:id,credential});
   session=joined.session;
   rememberDevice(id,session);
   sessionStorage.setItem('alfastafl.session',session);
  }else if(isHost){
   session='';
   sessionStorage.removeItem('alfastafl.session');
  }
  clearCinematic();
  gameId=id;game=null;you=null;hostSeats={};reviewVotes={};
  invalidateBoardInteraction();
  sessionStorage.setItem('alfastafl.game',id);
  if(!isHost)rememberDevice(id,session);
  render();
  await load();
 }
 function makeButton(title,fn){
  const b=document.createElement('button');b.type='button';b.textContent=title;
  b.addEventListener('click',async()=>{
   b.disabled=true;
   try{await fn();}catch(error){el('tournament-personal-status').textContent=error.message;}
   finally{b.disabled=false;}
  });return b;
 }
 async function refreshMine(){
  if(captureOnly||isHost||!currentAccess)return;
  if(Date.now()-lastMine<4200)return;
  lastMine=Date.now();
  const data=await api('tournament/mine',{credential:currentAccess.credential});
  const holder=el('tournament-personal-list');holder.replaceChildren();
  el('my-tournament-name').textContent=data.name+' — '+(data.role==='spectator'?'Spectateur':'Joueur');
  for(const match of data.matches){
   const card=document.createElement('div');card.className='tournament-personal-match';
   const label=document.createElement('span');
   label.textContent='Ronde '+match.round+' • '+match.a+' / '+match.b+
     ' • '+(match.status==='finished'?'Terminé':match.status==='active'?'Disponible':'Suspendu');
   card.append(label);
   if(match.status==='active'||match.status==='paused'){
    const active=gameId===match.game;
    if(!active&&data.role==='player'){
     card.append(makeButton('Rejoindre cette rencontre',async()=>{
      stop();
      await switchGame(match.game,true);
      el('my-tournament').open=false;
     }));
    }
   }
   holder.append(card);
  }
  if(data.role==='spectator'&&!live)holder.append(makeButton('Reprendre la diffusion',()=>start(data.tournament,'guest')));
 }
 function label(match){
  return 'Ronde '+match.round+' • '+match.a+' contre '+match.b;
 }
 function captureId(match){
  const cue=match.cinematic;
  return cue?match.game+':'+cue.move.n+':'+cue.move.reason:'';
 }
 function renderCaptures(matches){
  const holder=el('tournament-captures'),active=new Set();
  for(const match of matches){
   const id=captureId(match);
   if(!id||!match.game)continue;
   active.add(id);
   if([...holder.children].some(x=>x.dataset.cue===id))continue;
   const card=document.createElement('section');card.className='tournament-capture-card';
   card.dataset.cue=id;
   const h=document.createElement('h3');h.textContent='Capture • '+label(match);
   const frame=document.createElement('iframe');frame.title='Cinématique '+label(match);
   frame.setAttribute('loading','eager');frame.setAttribute('allow','autoplay');
   const url=new URL('/',location.href);
   url.search='';
   url.searchParams.set('game',match.game);
   url.searchParams.set('capture_only','1');
   if(isHost)url.searchParams.set('desktop','board');
   else url.searchParams.set('session',session);
   frame.src=url.pathname+url.search;
   card.append(h,frame);holder.append(card);
  }
  for(const card of [...holder.children])if(!active.has(card.dataset.cue))card.remove();
  holder.hidden=holder.childElementCount===0;
 }
 function showBanner(info,match){
  const bar=el('tournament-broadcast-bar');bar.hidden=false;
  el('tournament-broadcast-name').textContent=info.name+' • Ronde '+info.round_no;
  el('tournament-broadcast-match').textContent=match?label(match):'En attente des rencontres';
 }
 async function poll(){
  if(!live||liveBusy)return;
  liveBusy=true;
  const mode=live.mode,tournament=live.tournament;
  try{
   const url='tournament/live?tournament='+encodeURIComponent(tournament)+
    (mode==='guest'?'&session='+encodeURIComponent(session):'');
   const result=await api(url);
   if(!live||live.tournament!==tournament||live.mode!==mode)return;
   renderCaptures(result.matches);
   const candidates=result.matches.filter(m=>m.game&&m.status==='active');
   const playing=candidates.filter(m=>m.players_seated>0);
   const available=playing.length?playing:candidates;
   const now=Date.now();
   if(available.length){
    const current=available.findIndex(m=>m.game===live.current);
    const shouldRotate=current<0||now-live.lastSwitch>=8500;
    if(shouldRotate){
     const match=available[(current+1)%available.length];
     live.current=match.game;live.lastSwitch=now;
     if(match.game!==gameId)await switchGame(match.game,false);
    }
    showBanner(result.tournament,available.find(m=>m.game===live.current)||available[0]);
   }else{
    showBanner(result.tournament,null);
   }
  }catch(error){
   if(live)el('tournament-broadcast-match').textContent='Diffusion interrompue : '+error.message;
  }finally{liveBusy=false;}
 }
 function start(tournament,mode){
  if(captureOnly||!tournament)return;
  broadcastSuppressed=false;
  if(mode==='guest'&&isHost)return;
  if(mode==='host'&&!isHost)return;
  if(live?.tournament===tournament&&live.mode===mode)return;
  stop();
  live={tournament,mode,current:null,lastSwitch:0,period:null};
  document.body.classList.add('tournament-broadcast');
  el('tournament-broadcast-bar').hidden=false;
  el('tournament-broadcast-stop').textContent=mode==='host'?'Arrêter la diffusion':'Arrêter le défilement';
  live.period=setInterval(poll,1600);
  poll();
 }
 function stop(manual=false){
  if(manual)broadcastSuppressed=true;
  if(live?.period)clearInterval(live.period);
  live=null;
  document.body.classList.remove('tournament-broadcast');
  el('tournament-broadcast-bar').hidden=true;
  const captures=el('tournament-captures');
  captures.replaceChildren();captures.hidden=true;
 }
 el('tournament-broadcast-stop').addEventListener('click',()=>stop(true));
 el('my-tournament').addEventListener('toggle',()=>{if(el('my-tournament').open)refreshMine().catch(()=>{});});
 if(q.has('tournament')&&!isHost&&!captureOnly)
  openExistingTournamentInvitation().catch(()=>{});
 window.AlfastaflTournamentLive={
  remember,restore,start,stop,refreshMine,
  hostTournament:()=>isHost&&live?.mode==='host'?live.tournament:null,
  onState(state){
   if(captureOnly||isHost||!state?.tournament_access)return;
   remember(state.tournament_access);
  }
 };
})();