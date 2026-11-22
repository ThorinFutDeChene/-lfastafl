/* QR-only tournament players: nickname -> host approval -> fullscreen board.
 * The host never chooses factions. A tournament credential identifies only
 * its approved participant; each game receives its own server-bound session. */
(()=>{
 'use strict';
 const el=id=>document.getElementById(id);
 const stored=key=>{try{return localStorage.getItem(key)||'';}catch(_){return '';}};
 const remember=(key,value)=>{try{localStorage.setItem(key,value);}catch(_){}};
 const forget=key=>{try{localStorage.removeItem(key);}catch(_){}};
 const previewKey='alfastafl.tournament.lobby-preview';
 let running=false;

 async function start({tid,invite}){
  if(running||isHost)return;
  running=true;
  const nameKey='alfastafl.last-name.'+tid;
  const registrationKey='alfastafl.signup.'+tid;
  const panel=el('tournament-connect'),input=el('tournament-entrant-name');
  const action=el('tournament-enter'),status=el('tournament-enter-status');
  const waiting=el('guest-waiting-message');
  const banner=el('tournament-stage-message'),opponentLabel=el('tournament-opponent-label');
  let name=stored(nameKey);
  let secret=name?stored('alfastafl.credential.'+tid+'.player.'+name):'';
  let registration=sessionStorage.getItem(registrationKey)||'';
  let busy=false,displayedMatch='',placing=0,preview=null;
  let lastGameFinishedAt=0,previousRank=null,lastSeenMatch='';
  let lastMatchChange=0;
  input.value=name;
  document.body.classList.add('tournament-open-entry');
  el('join').hidden=true;

  function showEntry(message=''){
   spectatorConnecting=false;
   document.body.classList.remove('tournament-open-lobby');
   panel.hidden=false;
   status.textContent=message;
   if(gameId){
    gameId='';session='';game=null;you=null;
    sessionStorage.removeItem('alfastafl.game');
    sessionStorage.removeItem('alfastafl.session');
    clearCinematic();render();
   }
   syncGuestLayout();
  }

  function showApproval(){
   spectatorConnecting=true;
   waiting.textContent='Votre inscription a été transmise. En attente de validation par le PC hôte.';
   panel.hidden=true;
   syncGuestLayout();
  }

  function drawPreview(board){
   if(!Array.isArray(board)||board.length!==11)return;
   preview=board;
   const flat=el('board');
   flat.replaceChildren();
   for(let r=0;r<11;r++)for(let c=0;c<11;c++){
    const square=document.createElement('button');
    square.type='button';square.disabled=true;
    square.className='square'+((r+c)%2?' alt':'');
    if((r===5&&c===5)||([0,10].includes(r)&&[0,10].includes(c)))
     square.className+=' special';
    const piece=board[r]?.[c]||'.';
    if(piece!=='.'){
     const shape=document.createElement('span');
     shape.className='piece '+piece;
     shape.textContent=piece==='N'?'ᚦ':piece==='E'?'ᛟ':'♛';
     square.append(shape);
    }
    flat.append(square);
   }
   el('game-board-empty').hidden=true;
   gameBoardView.update({board,mode:'fetlar',selected:null,legal:[],
    captures:[],targets:[],focus:[],interactive:false,disabled:true});
  }

  function lobbyBoard(message,board){
   if(gameId){
    gameId='';session='';game=null;you=null;
    clearCinematic();invalidateBoardInteraction();
    sessionStorage.removeItem('alfastafl.game');
    sessionStorage.removeItem('alfastafl.session');
    render();
   }
   document.body.classList.add('tournament-open-lobby');
   document.body.classList.remove('tournament-open-entry','guest-awaiting-approval');
   spectatorConnecting=false;
   panel.hidden=true;el('guest-waiting').hidden=true;
   banner.hidden=false;banner.textContent=message;
   opponentLabel.hidden=true;
   syncGuestLayout();
   el('game').hidden=false;
   el('clocks').hidden=true;
   el('player-controls').hidden=true;
   if(board&&!preview)drawPreview(board);
   else if(preview && !el('board').children.length)drawPreview(preview);
  }

  function opponentText(result){
   opponentLabel.hidden=false;
   opponentLabel.textContent='Ronde '+result.round+' · Adversaire : '+result.opponent;
   banner.hidden=true;
  }

  async function requestSignup(){
   if(busy)return;
   const entered=input.value.trim();
   if(!entered){status.textContent='Indiquez votre pseudo.';return;}
   busy=true;action.disabled=true;
   try{
    name=entered;
    remember(nameKey,name);
    secret=stored('alfastafl.credential.'+tid+'.player.'+name);
    const answer=await api('tournament/register',{tournament:tid,
     invite,name,device_token:secret||null});
    if(answer.status==='approved'&&secret){
     registration='';sessionStorage.removeItem(registrationKey);
     await refreshPlayer();
    }else if(answer.status==='pending'&&answer.request){
     registration=answer.request;
     sessionStorage.setItem(registrationKey,registration);
     showApproval();
    }else{
     throw Error('Réponse d’inscription invalide.');
    }
   }catch(error){showEntry(error.message||String(error));}
   finally{busy=false;action.disabled=false;}
  }

  async function refreshRegistration(){
   if(!registration)return;
   const answer=await api('tournament/registration/status?request='+
    encodeURIComponent(registration));
   if(answer.status==='approved'&&answer.token){
    name=answer.name;
    secret=answer.token;
    remember(nameKey,name);
    remember('alfastafl.credential.'+tid+'.player.'+name,secret);
    registration='';
    sessionStorage.removeItem(registrationKey);
    spectatorConnecting=false;
    await refreshPlayer();
   }else if(answer.status==='rejected'){
    registration='';
    sessionStorage.removeItem(registrationKey);
    showEntry('Inscription refusée par l’organisateur.');
   }else if(answer.status==='waiting')showApproval();
  }

  function departingMatch(){
   if(!gameId || !displayedMatch)return false;
   if(game?.status==='finished'){
    if(!lastGameFinishedAt)lastGameFinishedAt=Date.now();
    if(cinematicCue || Date.now()-lastGameFinishedAt<4200)return true;
    return false;
   }
   // Server-side pairings can complete between two browser refreshes.
   // Avoid cutting the final board before the player sees their result.
   if(Date.now()-lastMatchChange<2200)return true;
   return false;
  }

  async function showMatch(answer){
   if(displayedMatch===answer.match&&gameId===answer.game&&session===answer.session){
    opponentText(answer);return;
   }
   if(displayedMatch&&answer.match!==displayedMatch&&departingMatch())return;
   const changed=displayedMatch!==answer.match;
   displayedMatch=answer.match;
   lastMatchChange=Date.now();
   lastGameFinishedAt=0;
   document.body.classList.remove('tournament-open-lobby','tournament-open-entry');
   spectatorConnecting=false;
   panel.hidden=true;banner.hidden=true;
   gameId=answer.game;session=answer.session;
   sessionStorage.setItem('alfastafl.game',gameId);
   sessionStorage.setItem('alfastafl.session',session);
   rememberDevice(gameId,session);
   clearCinematic();invalidateBoardInteraction();
   await load();
   opponentText(answer);
   if(changed){
    const seen='alfastafl.tournament.faction.'+tid+'.'+answer.match;
    if(!stored(seen)){
     remember(seen,'seen');
     globalThis.AlfastaflTournamentCeremony?.faction({
       name,camp:answer.camp,opponent:answer.opponent,round:answer.round,
     });
    }
   }
  }

  async function showRanking(answer){
   if(departingMatch())return;
   lobbyBoard('Tournoi terminé',preview);
   const rank=answer.rank;
   if(rank===previousRank)return;
   previousRank=rank;
   if(rank>0&&rank<=3){
    globalThis.AlfastaflTournamentCeremony?.award({name,rank});
   }else{
    banner.hidden=false;
    banner.textContent='Classement final : '+rank+'ᵉ place';
    document.body.classList.add('tournament-open-ranked');
   }
  }

  async function refreshPlayer(){
   if(!secret||!name)return;
   const result=await api('tournament/player/state',{
    tournament:tid,name,device_token:secret,
   });
   if(result.status==='match'){
    await showMatch(result);
   }else if(result.status==='placed'){
    await showRanking(result);
   }else if(result.status==='waiting'){
    if(departingMatch())return;
    const label=result.round?
     'En attente du partenaire de ronde · Ronde '+result.round:
     'En attente du partenaire de ronde · Tirage non lancé';
    lobbyBoard(label,result.board);
    displayedMatch='';
    lastGameFinishedAt=0;
   }
  }

  async function tick(){
   if(busy)return;
   busy=true;
   try{
    if(registration)await refreshRegistration();
    else if(secret)await refreshPlayer();
   }catch(error){
    const reason=error.message||String(error);
    if(reason.includes('autorisé')||reason.includes('inconnu')){
     secret='';
     forget('alfastafl.credential.'+tid+'.player.'+name);
     showEntry('Cette autorisation n’est plus valable. Demandez un nouvel accès.');
    }else if(registration&&reason.includes('expirée')){
     registration='';sessionStorage.removeItem(registrationKey);
     showEntry('Connexion interrompue. Renouvelez votre inscription.');
    }else if(registration){
     waiting.textContent=reason;
    }else if(!gameId){
     banner.textContent='En attente de connexion · '+reason;
    }
   }finally{busy=false;}
  }

  action.onclick=requestSignup;
  input.onkeydown=event=>{if(event.key==='Enter'){
   event.preventDefault();requestSignup();
  }};
  if(registration){showApproval();}
  else if(secret){
   try{await refreshPlayer();}
   catch(_){showEntry('Autorisation à vérifier : confirmez votre pseudo.');}
  }else showEntry();
  setInterval(tick,1900);
 }

 window.AlfastaflOpenTournamentClient={start};
})();
