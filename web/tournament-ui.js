/* Host-only tournament register, pairings, and faction history.
 * All outcomes and faction assignments come from the Python server.
 * This UI never decides or changes which faction a player receives. */
(()=>{
 'use strict';
 if(!isHost||!isDesktopShell)return;
 const el=id=>document.getElementById(id);
 const list=el('tournament-list'),notice=el('tournament-message');
 const nameInput=el('tournament-name'),playersInput=el('tournament-players');
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
   text(item,'p',tournament.players.length+' participants · Ronde '+tournament.round_no+
    ' · '+tournament.matches.filter(m=>m.winner!=null).length+
    ' résultat(s) enregistré(s)');
   const grouped=new Map();
   for(const match of tournament.matches){
    const round=grouped.get(match.round)||[];
    round.push(match);grouped.set(match.round,round);
   }
   for(const [round,entries] of grouped){
    text(item,'h4','Ronde '+round);
    for(const match of entries){
     const row=div('tournament-match');
     text(row,'span',match.a+' : '+campName(match.camp_a)+
       '  ·  '+match.b+' : '+campName(match.camp_b));
     if(match.winner!=null)
      text(row,'strong',match.winner==='draw'?'Nul':'Victoire : '+match.winner);
     else
      text(row,'em','Partie à jouer ou à valider');
     if(match.game){
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
   const controls=div('tournament-controls');
   controls.append(button('Diffuser les rencontres en direct',async()=>{
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
   item.append(button(tournament.round_no?'Valider les résultats et ronde suivante':'Tirer la première ronde',async()=>{
    // A new round creates real matches: its QR must be ready without
    // asking the host to activate networking separately.
    ensureLanForSession();
    const res=await api('tournament/round',{
     tournament:tournament.id,mode:el('mode').value,
    });
    if(!res.matches?.length)status('Ce tournoi ne comporte plus de ronde à jouer.');
    else {
     status(res.matches.length+' rencontre(s) créée(s) et indépendantes. Diffusion tournante activée.');
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
   render(data.tournaments||[]);
  }catch(error){status('Lecture des tournois impossible : '+error.message,true);}
 }
 async function create(){
  const players=playersInput.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(players.length<2||new Set(players).size!==players.length)
   throw Error('Il faut au moins deux participants, avec des noms distincts.');
  if(players.some(x=>x.length>60))throw Error('Un nom ne peut pas dépasser 60 caractères.');
  if(!nameInput.value.trim())throw Error('Le tournoi doit avoir un nom.');
  const rounds=Number(roundsInput.value);
  if(!Number.isInteger(rounds)||rounds<1||rounds>20)throw Error('Nombre de rondes invalide.');
  ensureLanForSession();
  const result=await api('tournament/create',{
   name:nameInput.value.trim(),format:formatInput.value,
   players,rounds,
  });
  if(!result.tournament?.id)throw Error('Création du tournoi non confirmée.');
  nameInput.value='';playersInput.value='';
  status('Tournoi créé. Lancez la première ronde pour effectuer le tirage au sort.');
  await refresh();
 }
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
 window.AlfastaflTournaments={refresh};
})();
