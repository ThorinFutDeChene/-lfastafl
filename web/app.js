'use strict';
const $=id=>document.getElementById(id);
const q=new URLSearchParams(location.search);
const isHost=['127.0.0.1','localhost','::1'].includes(location.hostname);
let gameId=q.get('game')||sessionStorage.getItem('alfastafl.game')||'';
// Retain an approved device session across browser restarts for reconnection.
function deviceSession(id){try{return localStorage.getItem('alfastafl.device.'+id)||'';}catch(_){return '';}}
function rememberDevice(id,token){try{localStorage.setItem('alfastafl.device.'+id,token);}catch(_){} }
function clearDevice(id){try{localStorage.removeItem('alfastafl.device.'+id);}catch(_){} }
let session=q.get('session')||deviceSession(gameId)||sessionStorage.getItem('alfastafl.session')||'';
let selected=null,legalDestinations=[],game=null,requestId='',you=null,reviewVotes={};
let clockReceivedAt=0,serverTimeReceivedAt=0;let gameListUpdatedAt=0;
if(!isHost)$('host').hidden=true;
async function api(path,data){
 const opts=data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{};
 const response=await fetch('/api/'+path,opts);
 const result=await response.json();
 if(!response.ok)throw Error(result.error||response.status);
 return result;
}
function say(s){$('msg').textContent=s;}
function fmtTime(value){
 if(value===null||value===undefined)return '∞';
 const n=Math.max(0,Math.ceil(value));
 return `${Math.floor(n/3600)?String(Math.floor(n/3600))+':':''}${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}
function renderClocks(){
 if(!game||!game.clock)return;
 const c=game.clock;
 const decrease=(game.status==='active'&&c.started)?Math.max(0,(performance.now()-clockReceivedAt)/1000):0;
 const active=game.turn;
 for(const camp of ['elf','dwarf']){
  let remaining=null;
  if(c.mode==='total')remaining=Math.max(0,c.remaining[camp]-(active===camp?decrease:0));
  if(c.mode==='move')remaining=active===camp?Math.max(0,c.turn_remaining-decrease):c.seconds;
  const box=$('clock-'+camp);box.textContent=fmtTime(remaining);
  box.parentElement.classList.toggle('current',camp===active&&c.started&&game.status==='active');
  box.parentElement.classList.toggle('critical',remaining!==null&&remaining<=10);
 }
 $('clock-mode-label').textContent=c.mode==='unlimited'?'Sans chronomètre':
  c.mode==='move'?`Par coup : ${fmtTime(c.seconds)}`:`Total : ${fmtTime(c.seconds)} par joueur`;
 $('clock-status').textContent=game.status==='finished'?'Partie terminée':
  game.status==='paused'?'Horloges suspendues':
  !c.started?'En attente des deux joueurs':'Horloge active';
}
function showTimeOption(){
 const mode=$('time-mode').value;
 $('time-limit-label').hidden=mode==='unlimited';
 $('time-seconds').value=mode==='total'?'600':'60';
}
$('time-mode').onchange=showTimeOption;
showTimeOption();
async function listGames(force=false){
 if(!isHost||(!force&&Date.now()-gameListUpdatedAt<5000))return;
 try{
  const data=await api('games');gameListUpdatedAt=Date.now();
  $('game-list').replaceChildren();
  if(!data.games.length){$('game-list').textContent='Aucune partie enregistrée.';return;}
  for(const g of data.games){
   const button=document.createElement('button');button.type='button';
   button.classList.toggle('active-game',g.id===gameId);
   button.textContent=`${g.mode} • ${g.moves} coups • ${g.status} • ${g.id.slice(0,8)}`;
   button.title='Sélectionner cette partie';
   button.onclick=async()=>{
    gameId=g.id;session='';selected=null;legalDestinations=[];
    sessionStorage.setItem('alfastafl.game',gameId);
    await load();await listGames(true);
   };
   $('game-list').append(button);
  }
 }catch(error){say(error.message);}
}
function renderHostControls(){
 const controls=$('host-game-controls');controls.hidden=!(isHost&&game);
 if(controls.hidden)return;
 const review=['repetition_review','draw_proposal'].includes(game.reason);
 $('host-game-info').textContent=`Partie ${game.id.slice(0,8)} • ${game.status} • ${game.reason||'aucun incident'}`;
 $('save-leave').hidden=game.status==='finished'||game.reason==='saved_by_host';
 $('resume-game').hidden=game.status!=='paused'||review||game.reason==='disconnected'||game.reason==='awaiting_substitute';
 const incident=game.status==='paused'&&game.reason==='disconnected'&&game.disconnect&&game.disconnect.action_required;
 $('disconnect-actions').hidden=!incident;
 if(incident){
  const select=$('forfeit-camp');const previous=select.value;select.replaceChildren();
  for(const camp of game.disconnect.missing){
   const opt=document.createElement('option');opt.value=camp;
   opt.textContent=camp==='elf'?'Elfes':'Nains';select.append(opt);
  }
  if([...select.options].some(o=>o.value===previous))select.value=previous;
 }
}
function renderConnection(){
 const bar=$('connection-state');
 const info=game?.disconnect;
 bar.hidden=!info;
 if(!info)return;
 const camps=info.missing.map(c=>c==='elf'?'Elfes':'Nains').join(', ');
 if(game.reason==='awaiting_substitute'){
  bar.textContent=`En attente d'un remplaçant autorisé pour : ${camps}. Les horloges restent arrêtées.`;
 }else{
  const serverNow=serverTimeReceivedAt+(performance.now()-clockReceivedAt)/1000;
  const remaining=Math.max(0,Math.ceil(info.deadline-serverNow));
  bar.textContent=`Connexion perdue : ${camps}. Horloges suspendues. `+
   (info.action_required?'Délai expiré : décision de l’hôte requise.':`Délai restant : ${fmtTime(remaining)}.`);
 }
}

function available(r,c){return legalDestinations.some(m=>m[0]===r&&m[1]===c);}
function myTurn(){return Boolean(game&&you&&you.role==='player'&&you.camp===game.turn&&game.status==='active'&&
 (game.clock?.mode==='unlimited'||game.clock?.started));}
function render(){
 if(!game)return;
 $('state').textContent=game.mode+' · '+game.status+' · tour '+game.turn+
    (game.reason?' · '+game.reason:'');
 const board=$('board');board.replaceChildren();
 for(let r=0;r<11;r++)for(let c=0;c<11;c++){
  const square=document.createElement('button');square.type='button';
  square.className='square'+((r+c)%2?' alt':'');
  if((r===5&&c===5)||([0,10].includes(r)&&[0,10].includes(c)))square.className+=' special';
  if(selected&&selected[0]===r&&selected[1]===c)square.className+=' selected';
  if(available(r,c))square.className+=' legal';
  const piece=game.board[r][c];
  if(piece!=='.'){
   const shape=document.createElement('span');shape.className='piece '+piece;
   shape.textContent=piece==='N'?'ᚦ':piece==='E'?'ᛟ':'♛';square.append(shape);
  }
  square.setAttribute('aria-label',`Case ${String.fromCharCode(65+c)}${11-r} ${piece}`);
  square.onclick=()=>clickSquare(r,c);board.append(square);
 }
 renderClocks();renderConnection();renderHostControls();
 $('moves').replaceChildren();
 for(const move of game.history){
  const item=document.createElement('li');
  item.textContent=`${move.n}. ${move.piece} ${move.from.join(',')} -> ${move.to.join(',')} · ${move.captured.length} capture(s)`;
  $('moves').append(item);
 }
 const playing=Boolean(you&&you.role==='player'&&session);
 $('player-controls').hidden=!playing||game.status!=='active';
 $('draw-response').hidden=!(playing&&game.status==='active'&&game.draw_offer&&game.draw_offer!==you.camp);
 $('repetition-review').hidden=!['repetition_review','draw_proposal'].includes(game.reason);
 if(!$('repetition-review').hidden){
  const pending=Object.entries(reviewVotes).map(([side,vote])=>side+' : '+vote).join(' ; ');
  $('repetition-info').textContent=game.reason==='draw_proposal'
   ?'Aucun autre coup legal. Proposition de partie nulle soumise aux deux joueurs.'
   :'La meme position est revenue trois fois. Les joueurs doivent convenir de l issue. '+pending;
  $('repetition-options').hidden=!playing;
  for(const button of $('repetition-options').querySelectorAll('button')){
   button.hidden=game.reason==='draw_proposal'&&button.dataset.vote!=='draw';
  }
 }
}
async function load(){
 if(!gameId)return;
 try{
  const state=await api('state?game='+encodeURIComponent(gameId)+'&session='+encodeURIComponent(session));
  game=state.game;you=state.you;reviewVotes=state.review_votes||{};
  clockReceivedAt=performance.now();serverTimeReceivedAt=state.server_now||Date.now()/1000;
  if(!myTurn()){selected=null;legalDestinations=[];}
  render();
  if(state.invites&&isHost){
   const addr=await api('address');const origin='http://'+addr.address+':'+addr.port;
   const panel=$('invitations');
   if(!addr.lan_enabled){panel.hidden=true;return;}
   $('hostmsg').textContent=`Identifiant : ${gameId}`;
   $('link-player').href=origin+'/?game='+encodeURIComponent(gameId)+'&invite='+encodeURIComponent(state.invites.player);
   $('link-spectator').href=origin+'/?game='+encodeURIComponent(gameId)+'&invite='+encodeURIComponent(state.invites.spectator);
   // Keep QR images steady during periodic polling; reloading interrupts camera scans.
   const qrSignature=gameId+origin+state.invites.player+state.invites.spectator;
   if(panel.dataset.signature!==qrSignature){
    $('qr-player').src='/api/qr?game='+encodeURIComponent(gameId)+'&role=player&v='+Date.now();
    $('qr-spectator').src='/api/qr?game='+encodeURIComponent(gameId)+'&role=spectator&v='+Date.now();
    panel.dataset.signature=qrSignature;
   }
   panel.hidden=false;
  }else if(isHost){$('invitations').hidden=true;}
 }catch(error){
  if(session&&error.message==='Unauthorized'){
   clearDevice(gameId);
   session='';
   sessionStorage.removeItem('alfastafl.session');
  }
  say(error.message);
 }
}
async function clickSquare(r,c){
 if(!game||!myTurn())return;
 const piece=game.board[r][c];
 if(selected&&available(r,c)){
  try{
   await api('move',{game:gameId,session,'from':selected,'to':[r,c]});
   selected=null;legalDestinations=[];say('');await load();
  }catch(error){say(error.message);await load();}
  return;
 }
 if(piece!=='.'&&(piece==='N'?'dwarf':'elf')===you.camp){
  try{
   const reply=await api('legal?game='+encodeURIComponent(gameId)+
    '&session='+encodeURIComponent(session)+'&row='+r+'&col='+c);
   selected=[r,c];legalDestinations=reply.moves;render();
  }catch(error){say(error.message);}
 }else{
  selected=null;legalDestinations=[];render();
 }
}
$('create').onclick=async()=>{
 try{
  const timeMode=$('time-mode').value;
  const seconds=timeMode==='unlimited'?0:Number($('time-seconds').value);
  const reconnect=Number($('reconnect-minutes').value)*60;
  if((timeMode!=='unlimited'&&(!Number.isInteger(seconds)||seconds<1||seconds>86400))||
      !Number.isInteger(reconnect)||reconnect<60||reconnect>3600){throw Error('Durée ou délai de reconnexion invalide.');}
  const created=await api('create',{mode:$('mode').value,settings:{
   time_control:{mode:timeMode,seconds},reconnect_timeout_seconds:reconnect
  }});
  gameId=created.game;session='';selected=null;legalDestinations=[];
  sessionStorage.setItem('alfastafl.game',gameId);
  await load();await listGames(true);
 }catch(error){say(error.message);}

};
$('request').onclick=async()=>{
 try{gameId=$('gid').value;requestId=(await api('join',{
  game:gameId,invite:$('invite').value,name:$('name').value})).request;
  $('joinmsg').textContent='Demande envoyee, en attente de validation.';
 }catch(error){$('joinmsg').textContent=error.message;}
};
$('draw-offer').onclick=async()=>{
 try{await api('draw/offer',{game:gameId,session});say('Proposition envoyee.');await load();}
 catch(error){say(error.message);}
};
$('draw-accept').onclick=()=>respondDraw(true);
$('draw-decline').onclick=()=>respondDraw(false);
async function respondDraw(accept){
 try{await api('draw/respond',{game:gameId,session,accept});await load();}
 catch(error){say(error.message);}
}
$('resign').onclick=async()=>{
 if(!confirm('Confirmer votre abandon ?'))return;
 try{await api('resign',{game:gameId,session});await load();}
 catch(error){say(error.message);}
};
for(const button of $('repetition-options').querySelectorAll('button')){
 button.onclick=async()=>{
  try{const answer=await api('repetition/vote',{game:gameId,session,outcome:button.dataset.vote});
   say(answer.result==='waiting'?'Votre decision a ete enregistree, en attente de l adversaire.':
    answer.result==='undo'?'Dernier coup annule. Il ne peut pas etre rejoue immediatement.':'Arbitrage accepte.');
   await load();
  }catch(error){say(error.message);}
 };
}
async function hostAction(path,body,confirmation){
 if(confirmation&&!confirm(confirmation))return;
 try{await api(path,body);say('Opération enregistrée.');await load();await listGames(true);}
 catch(error){say(error.message);}
}
$('save-leave').onclick=()=>hostAction('pause',{game:gameId},
 'Sauvegarder et fermer cette partie ? Les invitations existantes seront révoquées.');
$('resume-game').onclick=()=>hostAction('resume',{game:gameId});
$('save-disconnected').onclick=()=>hostAction('disconnect/decide',
 {game:gameId,action:'save'});
$('substitute').onclick=()=>hostAction('disconnect/decide',
 {game:gameId,action:'substitute'},'Autoriser un remplaçant ? Les anciennes sessions concernées seront révoquées.');
$('forfeit').onclick=()=>hostAction('disconnect/decide',
 {game:gameId,action:'forfeit',camp:$('forfeit-camp').value},
 'Confirmer le forfait du joueur désigné ? La partie sera définitivement terminée.');
async function pending(){
 if(!isHost)return;
 try{
  const results=await api('pending');$('pending').replaceChildren();
  for(const request of results.pending){
   const div=document.createElement('div');
   div.textContent=`${request.name} · ${request.role} · partie ${request.game.slice(0,8)} `;
   for(const camp of request.role==='player'?['elf','dwarf']:['spectator']){
    const b=document.createElement('button');b.textContent=camp;
    b.onclick=async()=>{try{await api('approve',{request:request.id,camp:camp==='spectator'?null:camp});await pending();}
      catch(error){say(error.message);}};
    div.append(b);
   }
   $('pending').append(div);
  }
 }catch(error){}
}
async function tick(){
 if(isHost){try{const n=await api('address');$('lan-status').textContent=n.lan_enabled?
  `Serveur réseau actif : http://${n.address}:${n.port}/`:
  'Mode local. Activez l’accès LAN dans la barre d’outils pour connecter des joueurs.';
 }catch(error){$('lan-status').textContent='Etat du réseau indisponible.';}}
 if(requestId&&!session){
  try{
   const reply=await api('request?id='+encodeURIComponent(requestId));
   if(reply.status==='approved'){
    session=reply.session;sessionStorage.setItem('alfastafl.session',session);
    rememberDevice(gameId,session);
    sessionStorage.setItem('alfastafl.game',gameId);
    $('joinmsg').textContent='Connexion autorisee';await load();
   }else if(reply.status==='rejected'){$('joinmsg').textContent='Demande refusee';requestId='';}
  }catch(error){}
 }
 await pending();if(gameId&&(session||isHost))await load();
 await listGames();
}
if(q.has('invite')){$('gid').value=q.get('game')||'';$('invite').value=q.get('invite')||'';}
setInterval(tick,1800);
setInterval(()=>{renderClocks();renderConnection();},250);
tick();
