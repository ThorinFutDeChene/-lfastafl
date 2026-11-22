/* Host-only tournament register, pairings, and faction history.
 * All outcomes and faction assignments come from the Python server.
 * This UI never decides or changes which faction a player receives. */
(()=>{
 'use strict';
 if(!isHost||!isDesktopShell)return;
 const el=id=>document.getElementById(id);
 const list=el('tournament-list'),notice=el('tournament-message');
 const nameInput=el('tournament-name');
 const rail=el('shell-tournament-rail');
 let tournamentsCache=[],activeId=sessionStorage.getItem('alfastafl.active-tournament')||'';
 let railBusy=false,drawBusy=false;
 const formatInput=el('tournament-format'),roundsInput=el('tournament-rounds');
 const campName=c=>c==='elf'?'Elfes':'Nains';
 const status=(message,error=false)=>{
  notice.textContent=message;
  notice.dataset.error=String(error);
 };
 const button=(label,click,className='')=>{
  const b=document.createElement('button');
  b.type='button';b.textContent=label;b.className=className;
  b.addEventListener('click',async()=>{
   b.disabled=true;
   try{await click();}
   catch(error){status(error.message||String(error),true);}
   finally{b.disabled=false;}
  });
  return b;
 };
 const div=(className,text)=>{
  const x=document.createElement('div');x.className=className;
  if(text!==undefined)x.textContent=text;
  return x;
 };
 const text=(node,tag,value)=>{
  const elem=document.createElement(tag);elem.textContent=value;
  node.append(elem);return elem;
 };
 const formatName={round_robin:'Toutes rencontres',swiss:'Suisse',knockout:'Élimination directe'};
 function render(tournaments){
  list.replaceChildren();
  if(!tournaments.length){
   text(list,'p','Aucun tournoi. Créez-en un ci-dessus.');return;
  }
  for(const tournament of tournaments){
   const item=div('tournament-item');
   const title=text(item,'h3',tournament.name+' — '+(formatName[tournament.format]||tournament.format));
   title.className='tournament-title';
   if(tournament.registration_open){
    item.classList.toggle('tournament-selected',activeId===tournament.id);
    item.append(button(activeId===tournament.id?'Tournoi affiché dans la marge':
      'Afficher ce tournoi dans la marge',async()=>activate(tournament.id),'tournament-select'));
    if(tournament.completed&&tournament.rankings?.length){
     const board=div('tournament-podium-results');
     text(board,'h4','Podium définitif');
     for(const [index,player] of tournament.rankings.entries()){
      text(board,'p',String(index+1)+'ᵉ · '+player);
     }
     item.append(board);
    }
   }
   const decided=tournament.matches.filter(m=>m.winner!=null&&!m.bye).length;
   const byes=tournament.matches.filter(m=>m.bye).length;
   text(item,'p',tournament.players.length+' participants · Ronde '+tournament.round_no+
    ' · '+decided+' résultat(s) · '+byes+' exemption(s)');
   const replaced=new Set(tournament.matches.filter(m=>m.replay_of)
      .map(m=>m.replay_of));
   const grouped=new Map();
   for(const match of tournament.matches){
    const round=grouped.get(match.round)||[];
    round.push(match);grouped.set(match.round,round);
   }
   for(const [round,entries] of grouped){
    text(item,'h4','Ronde '+round);
    for(const match of entries){
     const row=div('tournament-match');
     if(match.bye){
      text(row,'span',match.a+' · Exemption (aucune partie)');
      const outcome=tournament.format==='knockout'
       ?'Qualification automatique'
       :tournament.format==='swiss'
        ?'3 points attribués (aucune faction jouée)'
        :'Repos · aucun point';
      text(row,'strong',outcome);
     }else{
      const heading=(match.replay_of?'Revanche · ':'')+
        match.a+' : '+campName(match.camp_a)+
        '  ·  '+match.b+' : '+campName(match.camp_b);
      text(row,'span',heading);
      if(match.winner==='draw')
       text(row,'strong',tournament.format==='knockout'
         ?replaced.has(match.id)?'Nul · revanche enregistrée'
          :'Nul · une revanche est nécessaire':'Match nul');
      else if(match.winner!=null)
       text(row,'strong','Victoire : '+match.winner);
      else
       text(row,'em',match.replay_of
        ?'Revanche à jouer ou à valider':'Partie à jouer ou à valider');
     }
     if(match.game && match.winner==null){
      row.append(button('Afficher le plateau',async()=>{
       await listGames(true);
       const gameButton=Array.from(document.querySelectorAll('#game-list .game-select'))
        .find(x=>x.dataset.game===match.game);
       if(!gameButton)throw Error('La partie du tournoi est introuvable.');
       globalThis.AlfastaflBroadcast?.stop();
       el('shell-tournament-dialog').close();
       gameButton.click();
      },'tournament-view'));
     }
     item.append(row);
    }
   }
   if(tournament.format==='swiss'||tournament.format==='round_robin'){
    const score=Object.fromEntries(tournament.players.map(p=>[p,0]));
    for(const match of tournament.matches){
     if(match.bye){
      if(tournament.format==='swiss')score[match.a]+=3;
     }else if(match.winner==='draw'){
      score[match.a]+=1;score[match.b]+=1;
     }else if(match.winner in score){score[match.winner]+=3;}
    }
    const ranked=[...tournament.players].sort((a,b)=>score[b]-score[a]||
      a.localeCompare(b,'fr'));
    text(item,'h4','Classement par points');
    const standing=div('tournament-standings');
    for(const player of ranked)
     text(standing,'span',player+' : '+score[player]+' point(s)');
    item.append(standing);
   }else if(tournament.round_no){
    const last=tournament.matches.filter(m=>m.round===tournament.round_no);
    const replacedHere=new Set(last.filter(m=>m.replay_of).map(m=>m.replay_of));
    const live=last.filter(m=>!replacedHere.has(m.id));
    if(live.length===1&&live[0].winner!=null&&!live[0].bye&&
       live[0].winner!=='draw')
      text(item,'h4','Tournoi terminé · vainqueur : '+live[0].winner);
   }
   const controls=div('tournament-controls');
   if(!tournament.registration_open)controls.append(button('Diffuser les rencontres en direct',async()=>{
    if(!tournament.round_no)
     throw Error('Commencez par créer la première ronde du tournoi.');
    globalThis.AlfastaflBroadcast?.start(tournament.id);
    el('shell-tournament-dialog').close();
   },'tournament-broadcast-start'));
   item.append(controls);
   const records=[
    ['player',tournament.devices||{},'Joueur'],
    ['spectator',tournament.spectator_devices||{},'Spectateur'],
   ];
   if(records.some(([,people])=>Object.keys(people).length)){
    text(item,'h4','Appareils reconnus · révocation');
    for(const [role,people,label] of records){
     for(const [name,proofs] of Object.entries(people)){
      if(!proofs.length)continue;
      const row=div('tournament-device-row');
      text(row,'span',label+' '+name+' · '+proofs.length+' appareil(s) autorisé(s)');
      row.append(button('Révoquer',async()=>{
       if(!confirm('Révoquer les appareils de '+name+' pour ce tournoi ?'))return;
       await api('tournament/revoke',{tournament:tournament.id,name,role});
       status('Autorisation révoquée. Une nouvelle validation de l’hôte sera nécessaire.');
       await refresh();
      },'tournament-revoke'));
      item.append(row);
     }
    }
   }
   const currentDraws=tournament.matches.filter(m=>m.round===tournament.round_no&&
    m.winner==='draw'&&!replaced.has(m.id));
   const nextLabel=!tournament.round_no?'Tirer la première ronde':
    tournament.format==='knockout'&&currentDraws.length
     ?'Valider les résultats et créer les revanches':
      'Valider les résultats et ronde suivante';
   if(!tournament.registration_open)item.append(button(nextLabel,async()=>{
    // A new round creates real matches: its QR must be ready without
    // asking the host to activate networking separately.
    ensureLanForSession();
    const res=await api('tournament/round',{
     tournament:tournament.id,mode:el('mode').value,
    });
    if(!res.matches?.length)status('Ce tournoi ne comporte plus de ronde à jouer.');
    else {
     const replayCount=res.matches.filter(m=>m.replay_of).length;
     status(replayCount?replayCount+' revanche(s) créée(s) après match nul.':
      res.matches.length+' rencontre(s) créée(s) et indépendantes. Diffusion tournante activée.');
     // All games of the round can be played at the same time. Displaying
     // a match never locks another one or its time control.
     globalThis.AlfastaflBroadcast?.start(tournament.id);
    }
    await refresh();
   },'tournament-next'));
   list.append(item);
  }
 }
 async function refresh(){
  try{
   const data=await api('tournaments');
   tournamentsCache=data.tournaments||[];
   if(activeId&&!tournamentsCache.some(t=>t.id===activeId&&t.registration_open))activeId='';
   if(!activeId){
    // Native host restarts clear sessionStorage. Restore the most recent
    // unfinished QR tournament so its rail and authorization QR return.
    const resumable=tournamentsCache.filter(t=>t.registration_open&&!t.completed);
    if(resumable.length){
     activeId=resumable[resumable.length-1].id;
     sessionStorage.setItem('alfastafl.active-tournament',activeId);
     ensureLanForSession();
     globalThis.AlfastaflBroadcast?.start(activeId);
    }
   }
   render(tournamentsCache);
   await syncRail();
  }catch(error){status('Lecture des tournois impossible : '+error.message,true);}
 }
 async function create(){
  if(!nameInput.value.trim())throw Error('Le tournoi doit avoir un nom.');
  const rounds=Number(roundsInput.value);
  if(!Number.isInteger(rounds)||rounds<1||rounds>20)
   throw Error('Nombre de rondes invalide.');
  ensureLanForSession();
  const result=await api('tournament/create',{
   name:nameInput.value.trim(),format:formatInput.value,rounds,
  });
  if(!result.tournament?.id||!result.tournament?.registration_open)
   throw Error('La création du tournoi sans liste de joueurs a échoué.');
  nameInput.value='';
  activeId=result.tournament.id;
  sessionStorage.setItem('alfastafl.active-tournament',activeId);
  status('Tournoi créé : les joueurs peuvent maintenant scanner le QR.');
  el('shell-tournament-dialog').close();
  await refresh();
  globalThis.AlfastaflBroadcast?.start(activeId);
  ensureLanForSession();
 }
 async function activate(id){
  if(!tournamentsCache.some(x=>x.id===id&&x.registration_open))
   throw Error('Tournoi QR introuvable.');
  activeId=id;
  sessionStorage.setItem('alfastafl.active-tournament',activeId);
  ensureLanForSession();
  el('shell-tournament-dialog').close();
  globalThis.AlfastaflBroadcast?.start(activeId);
  await syncRail();
  render(tournamentsCache);
 }
 const encoded=value=>encodeURIComponent(String(value||''));
 const qrRoles=['player','spectator'];
 async function syncRail(address,overrideId){
  const id=overrideId||activeId;
  if(!id)return;
  const t=tournamentsCache.find(x=>x.id===id);
  if(!t)return;
  if(railBusy)return;
  railBusy=true;
  rail.hidden=false;
  try{
   const addr=address||await api('address');
   const live=Boolean(addr?.lan_enabled);
   for(const role of qrRoles){
    const figure=el('shell-'+role+'-code'),img=el('shell-'+role+'-image');
    const note=el('shell-'+role+'-note');
    const signature='tournament:'+id+'|'+role+'|'+addr.address+'|'+addr.port;
    img.hidden=!live;
    figure.classList.toggle('shell-qr-offline',!live);
    note.textContent=live?
     role==='player'?'Scanner pour s’inscrire au tournoi':
     'Scanner pour regarder sans autorisation':
     'Réseau local en cours d’ouverture…';
    if(live&&figure.dataset.signature!==signature){
     img.src='/api/qr?tournament='+encoded(id)+'&role='+role;
     figure.dataset.signature=signature;
    }else if(!live){
     delete figure.dataset.signature;
     img.removeAttribute('src');
    }
   }
   el('shell-network-status').textContent=live?
    'Tournoi · accès direct des spectateurs':'Réseau du tournoi en cours d’ouverture';
   const data=await api('tournament/registrations?tournament='+encoded(id));
   el('rail-tournament-name').textContent=data.name;
   el('rail-tournament-count').textContent=data.players.length+
    (data.players.length>1?' joueurs inscrits':' joueur inscrit');
   const pending=el('rail-tournament-requests');
   const previous=JSON.stringify(Array.from(pending.querySelectorAll('[data-request]'))
     .map(x=>x.dataset.request));
   const next=JSON.stringify(data.pending.map(x=>x.id));
   if(previous!==next){
    pending.replaceChildren();
    for(const row of data.pending){
     const item=div('rail-request');
     item.dataset.request=row.id;
     text(item,'strong',row.name);
     text(item,'small',row.new?'Demande d’inscription':'Nouvel appareil');
     const actions=div('rail-request-actions');
     for(const [caption,approve] of [['Valider',true],['Refuser',false]]){
      const btn=button(caption,async()=>{
       await api('tournament/registration/decide',{request:row.id,approve});
       await refresh();
      },approve?'rail-approve':'rail-reject');
      actions.append(btn);
     }
     item.append(actions);pending.append(item);
    }
   }
   const roster=el('rail-tournament-roster');
   const key=data.players.join('|');
   if(roster.dataset.players!==key){
    roster.replaceChildren();
    for(const p of data.players)text(roster,'span',p);
    roster.dataset.players=key;
   }
   const draw=el('rail-tournament-draw');
   draw.hidden=data.round>0||data.completed;
   draw.disabled=drawBusy||!live||data.players.length<2||data.pending.length>0;
   const msg=el('rail-tournament-message');
   if(data.completed){msg.textContent='Tournoi terminé · classement définitif';}
   else if(data.round){msg.textContent='Ronde '+data.round+' · suivi automatique';}
   else if(data.pending.length){msg.textContent=data.pending.length+' demande(s) à traiter';}
   else if(data.players.length<2){msg.textContent='Au moins deux inscriptions à valider';}
   else{msg.textContent='Prêt : tirer les premières rencontres';}
  }catch(error){el('rail-tournament-message').textContent=error.message||String(error);}
  finally{railBusy=false;}
 }
 el('rail-tournament-draw').addEventListener('click',async()=>{
  if(drawBusy||!activeId)return;
  drawBusy=true;
  el('rail-tournament-draw').disabled=true;
  try{
   ensureLanForSession();
   const response=await api('tournament/round',{
    tournament:activeId,mode:el('mode').value,
   });
   if(!response.matches?.length)throw Error('Aucune rencontre attribuée.');
   await refresh();
   globalThis.AlfastaflBroadcast?.start(activeId);
  }catch(error){el('rail-tournament-message').textContent=error.message||String(error);}
  finally{drawBusy=false;await syncRail();}
 });
 el('tournament-create').addEventListener('click',async()=>{
  const b=el('tournament-create');b.disabled=true;
  try{await create();}
  catch(error){status(error.message||String(error),true);}
  finally{b.disabled=false;}
 });
 const helpButton=el('tournament-format-help');
 const helpPanel=el('tournament-format-explanation');
 function syncFormatHelp(){
  // Show only the explanation matching the SELECTED tournament format.
  // No invented Swiss or knock-out rules: the text documents the current
  // server implementation, including odd-player and drawn-match limits.
  for(const section of helpPanel.querySelectorAll('[data-tournament-format]'))
   section.hidden=section.dataset.tournamentFormat!==formatInput.value;
  helpButton.setAttribute('aria-expanded',String(!helpPanel.hidden));
 }
 helpButton.addEventListener('click',()=>{
  helpPanel.hidden=!helpPanel.hidden;
  syncFormatHelp();
 });
 formatInput.addEventListener('change',()=>{
  roundsInput.disabled=formatInput.value!=='swiss';
  syncFormatHelp();
 });
 formatInput.dispatchEvent(new Event('change'));
 window.AlfastaflTournaments={
  refresh,active:()=>activeId,syncRail,activate,
 };
 refresh();
 setInterval(()=>{
  const onAir=globalThis.AlfastaflBroadcast?.currentTournament();
  if(activeId&&(!onAir||onAir===activeId))syncRail().catch(()=>{});
 },1800);
})();
