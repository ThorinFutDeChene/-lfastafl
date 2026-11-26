/* Live tournament screen, not a recording of the host computer.
 * One large live 3D match rotates every 12 seconds; several simultaneous
 * captures open separate real 3D cutscene panels, each labeled with the
 * participant names. The observer has no game-control permissions. */
(()=>{
 'use strict';
 if(q.has('broadcast-view'))return; // Prevent recursive video walls.
 const root=document.getElementById('broadcast-wall');
 const main=document.getElementById('broadcast-main');
 const scenes=document.getElementById('broadcast-scenes');
 const heading=document.getElementById('broadcast-name');
 const round=document.getElementById('broadcast-round');
 const pairing=document.getElementById('broadcast-pairing');
 const stopButton=document.getElementById('broadcast-stop');
 const nextButton=document.getElementById('broadcast-next');
 let current=null,interval=null,busy=false,lastSwitch=0,activeGame=null;
 const overlays=new Map();
 const PERIOD_MS=12000,MAX_SIMULTANEOUS_SCENES=6;
 const encoded=v=>encodeURIComponent(v||'');
 const playerLabel=m=>m.a+' (Elfes) · '+m.b+' (Nains)';
 function matchLabel(m){
  const elf=m.camp_a==='elf'?m.a:m.b;
  const dwarf=m.camp_a==='dwarf'?m.a:m.b;
  return elf+' (Elfes) contre '+dwarf+' (Nains)';
 }
 function frameUrl(match,kind){
  const parameters=new URLSearchParams();
  parameters.set('game',match.game);
  if(match.session)parameters.set('session',match.session);
  parameters.set('broadcast-view',kind);
  return '/?'+parameters.toString();
 }
 function showGame(match){
  const url=frameUrl(match,'main');
  if(main.getAttribute('src')!==url)main.setAttribute('src',url);
  activeGame=match.game;
  pairing.textContent=matchLabel(match)+' · '+(match.status==='active'?
   'En cours':'En attente')+' · '+match.moves+' déplacements';
 }
 function removeScene(game){
  const scene=overlays.get(game);
  if(scene){scene.node.remove();overlays.delete(game);}
 }
 function updateScenes(matches){
  const keep=new Set();
  for(const m of matches){
   const cue=m.cinematic;
   if(!cue||!cue.move||cue.remaining<=0)continue;
   const key=m.game+':'+cue.move.n;
   keep.add(m.game);
   const previous=overlays.get(m.game);
   if(previous?.key===key){
    previous.label.textContent=matchLabel(m)+' · prise en direct';
    continue;
   }
   if(previous)removeScene(m.game);
   if(overlays.size>=MAX_SIMULTANEOUS_SCENES)continue;
   const node=document.createElement('section');
   node.className='broadcast-scene';
   node.dataset.game=m.game;
   node.dataset.move=String(cue.move.n);
   const title=document.createElement('h3');
   title.textContent=matchLabel(m)+' · prise en direct';
   const iframe=document.createElement('iframe');
   iframe.title='Cinématique de prise de '+matchLabel(m);
   iframe.loading='eager';
   iframe.referrerPolicy='same-origin';
   iframe.setAttribute('src',frameUrl(m,'capture'));
   node.append(title,iframe);
   scenes.append(node);
   overlays.set(m.game,{key,label:title,node});
  }
  for(const game of Array.from(overlays.keys()))if(!keep.has(game))removeScene(game);
 }
 function updateTournamentRail(tid,addr){
  if(!isHost||!isDesktopShell)return;
  if(globalThis.AlfastaflTournaments?.active()===tid){
   globalThis.AlfastaflTournaments.syncRail(addr,tid).catch(()=>{});
   return;
  }
  const valid=Boolean(addr?.lan_enabled);
  for(const role of ['player','spectator']){
   const img=document.getElementById('shell-'+role+'-image');
   const card=document.getElementById('shell-'+role+'-code');
   const note=document.getElementById('shell-'+role+'-note');
   if(!img||!card)continue;
   img.hidden=!valid;card.classList.toggle('shell-qr-offline',!valid);
   note.textContent=valid
    ?role==='player'?'QR du tournoi · jouer sa prochaine rencontre'
       :'QR du tournoi · accès spectateur direct'
    :'Activer le réseau pour partager ce tournoi.';
   const id='tournament:'+tid+'|'+role+'|'+addr.address+'|'+addr.port;
   if(valid&&card.dataset.signature!==id){
    img.src='/api/qr?tournament='+encoded(tid)+'&role='+role;
    card.dataset.signature=id;
   }else if(!valid)delete card.dataset.signature;
  }
  const label=document.getElementById('shell-network-status');
  if(label)label.textContent=valid?'Tournoi en réseau · validation des joueurs uniquement':'LAN inactif';
 }
 async function poll(){
  if(!current||busy)return;
  const state=current;busy=true;
  try{
   const params=new URLSearchParams({tournament:state.id});
   if(!isHost)params.set('session',state.session);
   const data=await api('tournament/broadcast?'+params.toString());
   if(current!==state)return;
   heading.textContent=data.name;
   round.textContent='Ronde '+data.round;
   if(data.completed&&data.rankings?.length){
    if(data.ceremony_dismissed){
     AlfastaflTournamentPodium.close();
     pairing.textContent='Tournoi terminé · '+data.rankings.slice(0,3).join(' · ');
     if(isHost&&isDesktopShell){
      // Return organizer to normal management after confirmation.
      stop();
      globalThis.AlfastaflTournaments?.refresh?.();
      return;
     }
    }else AlfastaflTournamentPodium.show({id:state.id,name:data.name,
      rankings:data.rankings,organizer:isHost&&isDesktopShell,
      onDismiss:()=>api('tournament/ceremony/dismiss',{tournament:state.id})});
    main.removeAttribute('src');activeGame=null;updateScenes([]);
    return;
   }
   AlfastaflTournamentPodium.close();
   const matches=data.matches||[];
   const visible=matches.filter(m=>m.game);
   if(!visible.length){
    pairing.textContent='En attente de la prochaine ronde';
    main.removeAttribute('src');activeGame=null;
   }else{
    let index=visible.findIndex(m=>m.game===activeGame);
    const first=index<0;
    if(first||Date.now()-lastSwitch>=PERIOD_MS){
     index=first?0:(index+1)%visible.length;
     showGame(visible[index]);
     lastSwitch=Date.now();
    }else{
     const match=visible[index];
     pairing.textContent=matchLabel(match)+' · '+(match.status==='active'?
      'En cours':'En attente')+' · '+match.moves+' déplacements';
    }
   }
   updateScenes(matches);
   if(isHost&&isDesktopShell){
    const addr=await api('address');
    if(current===state)updateTournamentRail(state.id,addr);
   }
  }catch(error){
   if(current!==state)return;
   pairing.textContent='Diffusion indisponible : '+(error.message||String(error));
  }finally{busy=false;}
 }
 function currentTournament(){return current?.id||null;}
 function stop(){
  AlfastaflTournamentPodium.close();
  current=null;
  if(interval){clearInterval(interval);interval=null;}
  activeGame=null;lastSwitch=0;
  root.hidden=true;
  document.body.classList.remove('tournament-broadcast');
  main.removeAttribute('src');
  for(const game of Array.from(overlays.keys()))removeScene(game);
 }
 function start(id){
  if(!id||q.has('broadcast-view'))return false;
  const proof=isHost?'host':session;
  if(current?.id===id&&current.session===proof)return true;
  stop();
  current={id,session:proof};
  root.hidden=false;
  document.body.classList.add('tournament-broadcast');
  stopButton.hidden=!(isHost&&isDesktopShell);
  nextButton.hidden=!(isHost&&isDesktopShell);
  heading.textContent='Tournoi';
  pairing.textContent='Connexion aux rencontres…';
  poll();
  interval=setInterval(poll,1700);
  return true;
 }
 function next(){
  if(!current)return false;
  lastSwitch=0;poll();return true;
 }
 stopButton.addEventListener('click',stop);
 nextButton.addEventListener('click',next);
 window.AlfastaflBroadcast={start,stop,next,currentTournament};
})();
