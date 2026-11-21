'use strict';
const $=id=>document.getElementById(id);
const q=new URLSearchParams(location.search);
const isHost=['127.0.0.1','localhost','::1'].includes(location.hostname);
const desktopMode=isHost&&['host','board','tutorial','shell'].includes(q.get('desktop'))?q.get('desktop'):'';
const isDesktopManager=desktopMode==='host';
const isDesktopBoard=desktopMode==='board';
const isDesktopTutorial=desktopMode==='tutorial';
const isDesktopShell=desktopMode==='shell';
document.body.classList.toggle('desktop-shell',isDesktopShell);
document.body.classList.toggle('desktop-host-manager',isDesktopManager);
document.body.classList.toggle('desktop-board-only',isDesktopBoard);
document.body.classList.toggle('desktop-tutorial-only',isDesktopTutorial);
document.body.classList.toggle('broadcast-frame',q.has('broadcast-view'));
let gameId=isDesktopTutorial?'':q.get('game')||sessionStorage.getItem('alfastafl.game')||'';
// Retain an approved device session across browser restarts for reconnection.
function deviceSession(id){try{return localStorage.getItem('alfastafl.device.'+id)||'';}catch(_){return '';}}
function rememberDevice(id,token){try{localStorage.setItem('alfastafl.device.'+id,token);}catch(_){} }
function clearDevice(id){try{localStorage.removeItem('alfastafl.device.'+id);}catch(_){} }
let session=isDesktopTutorial?'':q.get('session')||deviceSession(gameId)||
 sessionStorage.getItem('alfastafl.session')||'';
function hostDisplayURL(kind){
 const url=new URL('/',location.href);
 url.searchParams.set('desktop',kind);
 if(kind==='board'){
  url.searchParams.set('game',gameId);
  if(session)url.searchParams.set('session',session);
 }else if(kind==='tutorial')url.searchParams.set('mode',$('mode').value);
 return url.href;
}
function reserveHostBoard(){
 if(!isDesktopManager)return null;
 const popup=window.open('about:blank','alfastafl-plateau');
 if(!popup)say('Fenêtre du plateau bloquée. Autorisez les fenêtres de l’application.');
 return popup;
}
function showReservedBoard(popup){
 if(!popup||popup.closed||!gameId)return;
 popup.location.replace(hostDisplayURL('board'));popup.focus();
}
function openHostBoard(){
 if(!isDesktopManager||!gameId)return;
 const popup=window.open(hostDisplayURL('board'),'alfastafl-plateau');
 if(!popup){say('Impossible d’ouvrir le plateau : fenêtre bloquée.');return;}
 popup.focus();
}
function openHostTutorial(){
 if(!isDesktopManager)return;
 const popup=window.open(hostDisplayURL('tutorial'),'alfastafl-tutoriel');
 if(!popup)say('Impossible d’ouvrir le tutoriel : fenêtre bloquée.');
 else popup.focus();
}
let selected=null,legalDestinations=[],captureDestinations=[],game=null,requestId='',you=null,reviewVotes={},hostSeats={};
let clockReceivedAt=0,serverTimeReceivedAt=0;let gameListUpdatedAt=0;
let gameBusy=false,boardRevision=0,loadRevision=0,appliedLoadRevision=0,gameDrag=null;
let cinematicCue=null,seenCinematic='',skippedCinematic='',captureVisualPlaying=false;
const soundscape=typeof AlfastaflSoundscape==='function'?new AlfastaflSoundscape():{
 enabled:false,status:()=>({available:false,enabled:false,ready:false,music:0,effects:0}),
 unlock:async()=>false,setEnabled:()=>{},setVolume:()=>{},setGame:()=>{},effect:()=>{}
};
function redrawSoundControls(){
 const state=soundscape.status();
 $('audio-toggle').textContent=!state.available?'Son indisponible':
  state.enabled?(state.ready?'Couper le son':'Activer le son'):'Activer le son';
 $('audio-toggle').setAttribute('aria-pressed',String(state.enabled&&state.ready));
 $('audio-toggle').disabled=!state.available;
}
$('audio-music').value=String(Math.round(soundscape.musicVolume*100 || 0));
$('audio-effects').value=String(Math.round(soundscape.effectsVolume*100 || 0));
$('audio-music').oninput=event=>soundscape.setVolume('music',Number(event.target.value)/100);
$('audio-effects').oninput=event=>soundscape.setVolume('effects',Number(event.target.value)/100);
$('audio-toggle').onclick=async()=>{
 soundscape.setEnabled(!soundscape.enabled||!soundscape.status().ready);
 if(soundscape.enabled)await soundscape.unlock();
 redrawSoundControls();
};
document.addEventListener('pointerdown',event=>{
 // Do not unlock on the audio toggle's pointerdown: its own click handler
 // must decide whether to enable or mute, avoiding an inverted action.
 if(event.target.closest?.('#audio-toggle'))return;
 if(soundscape.enabled)soundscape.unlock().then(redrawSoundControls).catch(()=>{});
}, {once:true,capture:true});
redrawSoundControls();
document.addEventListener('alfastafl-tutorial-move',()=>soundscape.effect('move'));
let gameKeyboardSquare=[0,0];
if(!isHost)$('host').hidden=true;
async function api(path,data){
 const opts=data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{};
 const response=await fetch('/api/'+path,opts);
 const result=await response.json();
 if(!response.ok)throw Error(result.error||response.status);
 return result;
}
// The first requested activity opens one temporary LAN lease through Qt.
// A failed firewall authorization never prevents local play or loading a save.
let lanRequestPromise=null;
function ensureLanForSession(){
 if(!isHost)return Promise.resolve(false);
 if(lanRequestPromise)return lanRequestPromise;
 lanRequestPromise=(async()=>{
  const response=await fetch('/api/lan/activate',{
   method:'POST',headers:{'X-Alfastafl-Host-Action':'lan-activate'}
  });
  const result=await response.json();
  if(!response.ok)throw Error(result.error||response.status);
  return Boolean(result.active||result.pending);
 })().catch(error=>{
  say('Réseau local indisponible ; la partie reste accessible sur le PC hôte. '+error.message);
  return false;
 }).finally(()=>{lanRequestPromise=null;});
 return lanRequestPromise;
}
function captureKey(cue){
 const e=cue?.move;
 return e ? [gameId,e.n,e.piece,e.from?.join(','),e.to?.join(','),
  (e.captured||[]).map(row=>row.join(',')).join(';')].join(':') : '';
}
function renderCaptureOverlay() {
 const cue=cinematicCue,key=captureKey(cue),skipped=key&&skippedCinematic===key;
 const visible=Boolean(cue&&!skipped&&captureVisualPlaying);
 $('capture-overlay').hidden=!visible;
 if(visible) {
  const label=cue.move.reason==='escape'?
   'Victoire des Elfes — le roi s’échappe à cheval !':
   cue.move.reason==='king_captured'?
    'Victoire des Nains — le roi livre son dernier combat !':
   cue.move.captured.length>1?'Capture multiple !':'Les sculptures livrent combat…';
  $('capture-text').textContent=label;
 }
}
function clearCinematic() {
 gameBoardView?.cancelCapture();
 cinematicCue=null;seenCinematic='';skippedCinematic='';captureVisualPlaying=false;
 renderCaptureOverlay();
}
$('capture-skip').onclick=()=>{
 const key=captureKey(cinematicCue);
 if(key)skippedCinematic=key;
 gameBoardView.cancelCapture();
 captureVisualPlaying=false;
 renderCaptureOverlay();
};
function setGuestMenu(open) {
 const visible = (document.body.classList.contains('guest-board-only')||isDesktopBoard)&&Boolean(open);
 document.body.classList.toggle('guest-menu-open', visible);
 $('guest-menu-toggle').setAttribute('aria-expanded', String(visible));
}
function syncGuestLayout() {
 // URL invites or saved strings are not authorization: trust only /api/state.
 const authorized = !isHost && Boolean(session && game && game.id === gameId &&
  you && ['player', 'spectator'].includes(you.role));
 document.body.classList.toggle('guest-board-only', authorized);
 document.body.dataset.guestRole = authorized ? you.role : '';
 document.body.dataset.guestTimed = String(authorized && game.clock && game.clock.mode !== 'unlimited');
 $('join').hidden = authorized;
 $('guest-menu-toggle').hidden = !authorized&&!isDesktopBoard;
 if (!authorized&&!isDesktopBoard) setGuestMenu(false);
 document.body.dataset.guestTimed=String((authorized||isDesktopBoard)&&
   game&&game.clock&&game.clock.mode!=='unlimited');
}
$('guest-menu-toggle').onclick = () => setGuestMenu(!document.body.classList.contains('guest-menu-open'));
$('host-close-board').onclick=()=>{
 if(isDesktopBoard)window.close();
};
$('host-fullscreen').onclick=()=>{
 if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
 else document.documentElement.requestFullscreen?.().catch(()=>{});
};
$('host-open-board').onclick=openHostBoard;
document.addEventListener('keydown', event => {
 if (event.key === 'Escape' && document.body.classList.contains('guest-menu-open')) {
  setGuestMenu(false);
  $('guest-menu-toggle').focus({preventScroll: true});
 }
});
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
  cinematicCue?'Cinématique : chronomètres suspendus':
  !c.started?'En attente des deux joueurs':'Horloge active';
}
function showTimeOption(){
 const mode=$('time-mode').value;
 $('time-limit-label').hidden=mode==='unlimited';
 $('time-seconds').value=mode==='total'?'600':'60';
}
$('time-mode').onchange=showTimeOption;
showTimeOption();
function clearSelectedGame(){
 // Invalidates in-flight state responses before the deleted game can repaint.
 gameId='';session='';game=null;you=null;reviewVotes={};hostSeats={};requestId='';
 clearCinematic();soundscape.setGame(null);
 invalidateBoardInteraction();
 sessionStorage.removeItem('alfastafl.game');
 sessionStorage.removeItem('alfastafl.session');
 render();
 globalThis.AlfastaflShell?.syncInvites(null,null,null);
 globalThis.AlfastaflShell?.updateStatus();
}
async function listGames(force=false){
 if(!isHost||(!force&&Date.now()-gameListUpdatedAt<5000))return;
 try{
  const data=await api('games');gameListUpdatedAt=Date.now();
  $('game-list').replaceChildren();
  if(!data.games.length){$('game-list').textContent='Aucune partie enregistrée.';return;}
  for(const g of data.games){
   const entry=document.createElement('div');entry.className='game-entry';
   const button=document.createElement('button');button.type='button';
   button.className='game-select';
   button.dataset.game=g.id;
   button.classList.toggle('active-game',g.id===gameId);
   button.textContent=`${g.mode} • ${g.moves} coups • ${g.status} • ${g.id.slice(0,8)}`;
   button.title='Sélectionner cette partie';
   button.onclick=async()=>{
    // Selecting an existing save is the moment multiplayer access is needed.
    ensureLanForSession();
    clearCinematic();
    gameId=g.id;session='';game=null;you=null;hostSeats={};invalidateBoardInteraction();render();
    const popup=reserveHostBoard();
    sessionStorage.setItem('alfastafl.game',gameId);
    sessionStorage.removeItem('alfastafl.session');
    await load();showReservedBoard(popup);await listGames(true);
    globalThis.AlfastaflShell?.onSelected();
   };
   const remove=document.createElement('button');remove.type='button';
   remove.className='game-delete';remove.textContent='Supprimer';
   remove.setAttribute('aria-label',`Supprimer la partie ${g.mode} ${g.id.slice(0,8)}`);
   remove.disabled=g.status==='active';
   remove.title=remove.disabled?'Sauvegardez et quittez la partie active avant de la supprimer.':
    'Effacer définitivement cette partie et sa sauvegarde';
   remove.onclick=async()=>{
    const title=`${g.mode} • ${g.moves} coup(s) • ${g.id.slice(0,8)}`;
    if(!confirm(`Supprimer définitivement la partie ${title} ?\n\nCette opération efface la sauvegarde et ne peut pas être annulée.`))return;
    remove.disabled=true;
    try{
     const result=await api('delete',{game:g.id});
     if(result.deleted!==true)throw Error('Le serveur n’a pas confirmé la suppression.');
     clearDevice(g.id);
     if(gameId===g.id)clearSelectedGame();
     say(`Partie ${g.id.slice(0,8)} supprimée définitivement.`);
    }catch(error){say('Suppression impossible : '+error.message);}
    await listGames(true);
   };
   entry.append(button,remove);
   $('game-list').append(entry);
  }
 }catch(error){say(error.message);}
}
function renderHostControls(){
 const controls=$('host-game-controls');controls.hidden=!(isHost&&game);
 if(controls.hidden)return;
 const review=['repetition_review','draw_proposal'].includes(game.reason);
 $('host-game-info').textContent=`Partie ${game.id.slice(0,8)} • ${game.status} • ${game.reason||'aucun incident'}`;
 const hostCamp=you&&you.role==='player'&&session&&hostSeats[you.camp]?.host?you.camp:null;
 const roleText=hostCamp==='dwarf'?'Nains':hostCamp==='elf'?'Elfes':'Spectateur';
 const seatsText=['dwarf','elf'].filter(c=>hostSeats[c]&&!hostSeats[c].host)
  .map(c=>(c==='dwarf'?'Nains':'Elfes')+' : '+hostSeats[c].name);
 $('host-player-status').textContent='PC hôte : '+roleText+(seatsText.length?' • Occupés : '+seatsText.join(' ; '):'');
 const roleLocked=Boolean(hostCamp&&(game.history.length||game.clock?.started));
 for(const camp of ['dwarf','elf']){
  const button=$(camp==='dwarf'?'host-play-dwarf':'host-play-elf');
  const occupied=Boolean(hostSeats[camp]&&!hostSeats[camp].host);
  button.disabled=game.status!=='active'||occupied||roleLocked||hostCamp===camp;
  button.setAttribute('aria-pressed',String(hostCamp===camp));
  button.title=occupied?'Ce camp est déjà pris.':
   game.status!=='active'?'Reprenez la partie pour choisir un camp.':
   roleLocked?'Le camp ne peut pas être changé après le début de la partie.':'';
 }
 $('host-watch').disabled=!hostCamp||game.status!=='active'||roleLocked;
 $('host-watch').setAttribute('aria-pressed',String(!hostCamp));
 $('save-leave').hidden=game.status==='finished'||game.reason==='saved_by_host';
 $('host-open-board').disabled=!gameId;
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
function myTurn(){return Boolean(!cinematicCue&&game&&game.id===gameId&&you&&you.role==='player'&&you.camp===game.turn&&game.status==='active'&&
 (game.clock?.mode==='unlimited'||game.clock?.started));}
function positionKey(){
 return game ? [gameId,session,game.id,game.turn,game.status,game.reason,
  Boolean(game.clock?.started),game.history.length,game.board.map(row=>row.join('')).join('')].join('|') : '';
}
function invalidateBoardInteraction(){
 boardRevision++;gameBusy=false;gameDrag=null;selected=null;legalDestinations=[];captureDestinations=[];
}
function ownsGamePiece(r,c){
 const piece=game?.board?.[r]?.[c];
 return Boolean(piece&&piece!=='.'&&you&&(piece==='N'?'dwarf':'elf')===you.camp);
}
function canDragGamePiece(r,c){return !gameBusy&&myTurn()&&ownsGamePiece(r,c);}
const gameBoardView=new AlfastaflBoardView({
 prefix:'game',flat:$('board'),callbacks:{
  onClick:clickSquare,canDrag:canDragGamePiece,
  onDragStart:beginGameDrag,onDrop:dropGamePiece
 }
});
function syncGameBoard(){
 if(isDesktopManager||isDesktopTutorial){
  gameBoardView.setActive(false);
  return;
 }
 const visibleGame=game&&game.id===gameId?game:null;
 gameBoardView.update({board:visibleGame?visibleGame.board:null,
  mode:visibleGame?visibleGame.mode:$('mode').value,
  selected,legal:legalDestinations,captures:captureDestinations,targets:[],focus:[],
  interactive:Boolean(visibleGame&&myTurn()),disabled:gameBusy||!visibleGame||!myTurn()});
 $('game-board-empty').hidden=Boolean(visibleGame);
}
function focusGameSquare(position){
 gameKeyboardSquare=position;
 for(const button of $('board').querySelectorAll('button')){
  button.tabIndex=Number(button.dataset.row)===position[0]&&Number(button.dataset.col)===position[1]?0:-1;
 }
 if(!$('board').hidden)$('board').querySelector(`[data-row="${position[0]}"][data-col="${position[1]}"]`)?.focus({preventScroll:true});
}
function render(){
 syncGuestLayout();
 syncGameBoard();
 if(!game||game.id!==gameId){
  $('host-spectator-qr').hidden=true;
  $('board').replaceChildren();
  $('state').textContent='Aucune partie sélectionnée';
  $('moves').replaceChildren();
  for(const id of ['clocks','connection-state','host-game-controls',
                   'player-controls','draw-response','repetition-review','invitations',
                   'save-leave','resume-game'])
   $(id).hidden=true;
  globalThis.AlfastaflShell?.updateStatus();
  return;
 }
 $('clocks').hidden=false;

 $('state').textContent=game.mode+' · '+game.status+' · tour '+game.turn+
    (game.reason?' · '+game.reason:'');
 const board=$('board');
 const headlessBoard=isDesktopManager||isDesktopTutorial;
 const focused=!headlessBoard&&board.contains(document.activeElement)
  ?[Number(document.activeElement.dataset.row),Number(document.activeElement.dataset.col)]:null;
 board.replaceChildren();
 if(!headlessBoard)for(let r=0;r<11;r++)for(let c=0;c<11;c++){
  const square=document.createElement('button');square.type='button';
  square.dataset.row=String(r);square.dataset.col=String(c);
  square.disabled=gameBusy||!myTurn();
  square.tabIndex=gameKeyboardSquare[0]===r&&gameKeyboardSquare[1]===c?0:-1;
  square.setAttribute('aria-pressed',String(Boolean(selected&&selected[0]===r&&selected[1]===c)));
  square.className='square'+((r+c)%2?' alt':'');
  if((r===5&&c===5)||(game.mode!=='historical'&&[0,10].includes(r)&&[0,10].includes(c)))square.className+=' special';
  if(selected&&selected[0]===r&&selected[1]===c)square.className+=' selected';
  if(available(r,c))square.className+=' legal';
  if(captureDestinations.some(pos=>pos[0]===r&&pos[1]===c))square.className+=' capture';
  const piece=game.board[r][c];
  if(piece!=='.'){
   const shape=document.createElement('span');shape.className='piece '+piece;
   shape.textContent=piece==='N'?'ᚦ':piece==='E'?'ᛟ':'♛';square.append(shape);
  }
  square.setAttribute('aria-label',`Case ${String.fromCharCode(65+c)}${11-r} ${piece}`);
  square.onclick=()=>clickSquare(r,c);
  square.onkeydown=event=>{
   const offsets={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
   if(offsets[event.key]){
    event.preventDefault();const [dr,dc]=offsets[event.key];
    focusGameSquare([Math.max(0,Math.min(10,r+dr)),Math.max(0,Math.min(10,c+dc))]);
   }else if(event.key==='Home'||event.key==='End'){
    event.preventDefault();focusGameSquare([event.ctrlKey?(event.key==='Home'?0:10):r,event.key==='Home'?0:10]);
   }
  };
  board.append(square);
 }
 if(focused&&focused.every(Number.isInteger)&&!gameBusy)focusGameSquare(focused);
 renderClocks();renderConnection();renderHostControls();
 globalThis.AlfastaflShell?.updateStatus();
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
 const requestedGame=gameId,requestedSession=session,request=++loadRevision;
 const currentRequest=()=>request>=appliedLoadRevision&&requestedGame===gameId&&requestedSession===session;
 try{
  const state=await api('state?game='+encodeURIComponent(requestedGame)+'&session='+encodeURIComponent(requestedSession));
  if(!currentRequest())return;
  // Remote clients cannot trust HTTP 200 without an approved identity.
  if(!isHost&&requestedSession&&(!state.you||!['player','spectator'].includes(state.you.role)))
   throw Error('Unauthorized');
  appliedLoadRevision=request;
  const before=positionKey();
  const previous=game&&game.id===requestedGame?game:null;
  const previousHistoryCount=previous?.history?.length||0;
  game=state.game;you=state.you;reviewVotes=state.review_votes||{};hostSeats=state.seats||{};
  // A tournament spectator follows every match on the authenticated live
  // tournament wall. Embedded board frames must never start nested walls.
  if(!isHost&&!q.has('broadcast-view')&&you?.role==='spectator'&&
      state.tournament?.id)
   globalThis.AlfastaflBroadcast?.start(state.tournament.id);
  soundscape.setGame(game);
  // Only animate a newly confirmed server move, never a restored snapshot or
  // a backlog of moves received after reconnecting a sleeping phone.
  const newestMove=previous&&game.history.length===previousHistoryCount+1
    ? game.history[game.history.length-1] : null;
  const cue=state.cinematic||null;
  const cueKey=cue? [requestedGame,cue.move.n,cue.move.piece,cue.move.from?.join(','),
    cue.move.to?.join(','),(cue.move.captured||[]).map(row=>row.join(',')).join(';')].join(':'):'';
  if(!cue && cinematicCue) {
   gameBoardView.cancelCapture();
   captureVisualPlaying=false;
  }
  cinematicCue=cue;
  if(isHost&&session&&!you){
   session='';sessionStorage.removeItem('alfastafl.session');
  }
  clockReceivedAt=performance.now();serverTimeReceivedAt=state.server_now||Date.now()/1000;
  if(before!==positionKey()||!myTurn())invalidateBoardInteraction();
  render();
  if(newestMove&&!cue&&!isDesktopManager&&!isDesktopTutorial){
   soundscape.effect('move');
   // A hidden/2D client still receives the authoritative board immediately.
   // The interpolated motion is entirely local and never delays a turn.
   gameBoardView.playMove(newestMove).catch(()=>{});
  }
  if(cue&&cueKey!==seenCinematic&&!isDesktopManager&&!isDesktopTutorial) {
   seenCinematic=cueKey;
   if(skippedCinematic!==cueKey) {
    captureVisualPlaying=true;
    renderCaptureOverlay();
    const playback=gameBoardView.playCapture(cue.move,{
     duration:cue.duration,remaining:cue.remaining,
     onEffect:name=>soundscape.effect(name),
     onComplete:()=>{if(captureKey(cinematicCue)===cueKey){
      captureVisualPlaying=false;renderCaptureOverlay();}}
    });
    Promise.resolve(playback).then(started=>{
     if(!started&&captureKey(cinematicCue)===cueKey) {
      captureVisualPlaying=false;renderCaptureOverlay();
      if(cue.move.reason==='escape')soundscape.effect('royal-horns');
      else{soundscape.effect('strike');soundscape.effect('shatter',.1);}
     }
    }).catch(()=>{
     captureVisualPlaying=false;renderCaptureOverlay();
    });
   }
  }else renderCaptureOverlay();
  if(state.invites&&isHost){
   const addr=await api('address');
   if(!currentRequest())return;
   globalThis.AlfastaflShell?.syncInvites(state.invites,addr,requestedGame);
   const origin='http://'+addr.address+':'+addr.port;
   const panel=$('invitations');
   const spectatorQR=$('host-spectator-qr');
   const showSpectatorQR=Boolean(isDesktopBoard&&addr.lan_enabled&&
     game?.status==='active'&&state.invites.spectator&&gameId);
   spectatorQR.hidden=!showSpectatorQR;
   if(showSpectatorQR){
    const signature=gameId+'|'+addr.address+'|'+addr.port+'|'+state.invites.spectator;
    if(spectatorQR.dataset.signature!==signature){
     $('host-spectator-qr-image').src='/api/qr?game='+
       encodeURIComponent(gameId)+'&role=spectator&v='+Date.now();
     spectatorQR.dataset.signature=signature;
    }
   }
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
  }else if(isHost){$('invitations').hidden=true;$('host-spectator-qr').hidden=true;}
 }catch(error){
  if(!currentRequest())return;
  if(session&&['Unauthorized','Unknown game'].includes(error.message)){
   clearDevice(gameId);
   session='';
   sessionStorage.removeItem('alfastafl.session');
   you=null;game=null;clearCinematic();soundscape.setGame(null);invalidateBoardInteraction();render();
  }
  say(error.message);
 }
}
async function selectGamePiece(r,c){
 if(!canDragGamePiece(r,c))return false;
 const context=positionKey(),token=++boardRevision;
 const returnToFlat=$('board').contains(document.activeElement);
 gameBusy=true;render();
 try{
  const reply=await api('legal?game='+encodeURIComponent(gameId)+
   '&session='+encodeURIComponent(session)+'&row='+r+'&col='+c);
  if(token!==boardRevision||context!==positionKey()||!myTurn())return false;
  selected=[r,c];legalDestinations=reply.moves;captureDestinations=reply.captures||[];gameKeyboardSquare=[r,c];
  return true;
 }catch(error){if(token===boardRevision&&context===positionKey())say(error.message);return false;}
 finally{
  if(token===boardRevision){gameBusy=false;render();if(returnToFlat)focusGameSquare([r,c]);}
 }
}
async function sendGameMove(from,to){
 if(gameBusy||!myTurn())return;
 const requestedGame=gameId,requestedSession=session,token=++boardRevision;
 gameBusy=true;gameDrag=null;render();
 const sameSession=()=>requestedGame===gameId&&requestedSession===session;
 try{
  await api('move',{game:requestedGame,session:requestedSession,'from':from,'to':to});
  if(!sameSession()||token!==boardRevision)return;
  selected=null;legalDestinations=[];captureDestinations=[];say('');await load();
 }catch(error){if(sameSession()&&token===boardRevision){say(error.message);await load();}}
 finally{if(token===boardRevision){gameBusy=false;render();}}
}
async function clickSquare(r,c){
 if(!game||!myTurn()||gameBusy)return;
 gameDrag=null;
 if(selected&&available(r,c)){
  await sendGameMove([...selected],[r,c]);
  return;
 }
 if(ownsGamePiece(r,c)){
  await selectGamePiece(r,c);
 }else{
  const returnToFlat=$('board').contains(document.activeElement);
  boardRevision++;selected=null;legalDestinations=[];captureDestinations=[];render();
  if(returnToFlat)focusGameSquare([r,c]);
 }
}
function beginGameDrag(r,c){
 if(!canDragGamePiece(r,c)||!gameBoardView.active)return;
 const drag={from:[r,c],context:positionKey(),promise:null};
 gameDrag=drag;drag.promise=selectGamePiece(r,c);
 return drag.promise;
}
async function dropGamePiece(from,to){
 const drag=gameDrag;
 if(!drag||drag.from[0]!==from[0]||drag.from[1]!==from[1])return;
 const selectedSuccessfully=await drag.promise;
 if(gameDrag!==drag)return;
 gameDrag=null;
 if(!selectedSuccessfully||!gameBoardView.active||drag.context!==positionKey()||gameBusy||!myTurn()||
    !selected||selected[0]!==from[0]||selected[1]!==from[1])return;
 if(!to||from[0]===to[0]&&from[1]===to[1])return;
 if(!available(to[0],to[1])){say('Cette destination n’est pas autorisée pour la pièce sélectionnée.');return;}
 await sendGameMove([...from],[...to]);
}
$('create').onclick=async()=>{
 try{
  // Direct game creation works even when the native menu was bypassed.
  ensureLanForSession();
  const timeMode=$('time-mode').value;
  const seconds=timeMode==='unlimited'?0:Number($('time-seconds').value);
  const reconnect=Number($('reconnect-minutes').value)*60;
  if((timeMode!=='unlimited'&&(!Number.isInteger(seconds)||seconds<1||seconds>86400))||
      !Number.isInteger(reconnect)||reconnect<60||reconnect>3600){throw Error('Durée ou délai de reconnexion invalide.');}
  const popup=reserveHostBoard();
  try{
  const created=await api('create',{mode:$('mode').value,settings:{
   time_control:{mode:timeMode,seconds},reconnect_timeout_seconds:reconnect,
   capture_cinematic_seconds:Number($('capture-duration').value)
  },host_camp:$('create-host-camp').value||null});
  clearCinematic();
  gameId=created.game;session=created.host_session||'';game=null;you=null;hostSeats={};
  invalidateBoardInteraction();render();
  sessionStorage.setItem('alfastafl.game',gameId);
  if(session)sessionStorage.setItem('alfastafl.session',session);
  else sessionStorage.removeItem('alfastafl.session');
  await load();showReservedBoard(popup);await listGames(true);
  globalThis.AlfastaflShell?.onCreated();
  }catch(error){if(popup&&!popup.closed)popup.close();throw error;}
 }catch(error){say(error.message);}

};
$('request').onclick=async()=>{
 try{gameId=$('gid').value;invalidateBoardInteraction();requestId=(await api('join',{
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
 if(path==='resume')ensureLanForSession();
 try{await api(path,body);say('Opération enregistrée.');await load();await listGames(true);}
 catch(error){say(error.message);}
}
async function chooseHostCamp(camp){
 if(!gameId||!game||game.id!==gameId)return;
 const popup=reserveHostBoard();
 try{
  const response=await api('host/seat',{game:gameId,camp});
  session=response.session||'';
  if(session)sessionStorage.setItem('alfastafl.session',session);
  else sessionStorage.removeItem('alfastafl.session');
  invalidateBoardInteraction();
  say(camp==='dwarf'?'Le PC hôte joue les Nains.':
      camp==='elf'?'Le PC hôte joue les Elfes.':'Le PC hôte reste spectateur.');
  await load();showReservedBoard(popup);await listGames(true);
 }catch(error){if(popup&&!popup.closed)popup.close();say(error.message);await load();}
}
$('host-play-dwarf').onclick=()=>chooseHostCamp('dwarf');
$('host-play-elf').onclick=()=>chooseHostCamp('elf');
$('host-watch').onclick=()=>chooseHostCamp(null);
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
   div.className='pending-request';
   div.dataset.role=request.role;
   div.dataset.request=request.id;
   const player=request.role==='player';
   const camps=player?(request.available_camps||[]):[];
   const roleText=player?'Joueur':'Spectateur';
   const label=document.createElement('span');
   label.textContent=`${request.name} · ${roleText} · partie ${request.game.slice(0,8)} `;
   div.append(label);
   const campLabel=camp=>camp==='elf'?'Elfes':'Nains';
   function action(title,endpoint,chosenCamp=null){
    const button=document.createElement('button');
    button.type='button';
    button.className=endpoint==='approve'?'pending-approve':'pending-reject';
    button.textContent=title;
    if(chosenCamp)button.dataset.camp=chosenCamp;
    button.onclick=async()=>{
     button.disabled=true;
     try{
      await api(endpoint,{request:request.id,camp:chosenCamp});
      await pending();
     }catch(error){say(error.message);await pending();}
    };
    div.append(button);
   }
   if(!player)action('Autoriser à regarder','approve');
   else if(camps.length===1){
    // The server assigns the ONLY legal faction; the host cannot pick
    // an occupied side or override a tournament's preassigned camp.
    const only=camps[0];
    action('Autoriser — '+campLabel(only),'approve');
   }else if(camps.length===2){
    // First remote player in a match with two vacant sides chooses once;
    // the next player automatically inherits the other available side.
    for(const camp of camps)action('Attribuer '+campLabel(camp),'approve',camp);
   }else{
    const unavailable=document.createElement('em');
    unavailable.textContent=' Aucune faction libre ou attribuée à cette personne.';
    div.append(unavailable);
   }
   action('Refuser','reject');
   $('pending').append(div);
  }
 }catch(error){}
}
async function tick(){
 if(isHost&&!isDesktopBoard&&!isDesktopTutorial){try{const n=await api('address');$('lan-status').textContent=n.lan_enabled?
  `Serveur réseau actif : http://${n.address}:${n.port}/`:
  'Mode local · le LAN s’ouvre automatiquement à la création ou reprise d’une partie.';
 }catch(error){$('lan-status').textContent='Etat du réseau indisponible.';}}
 if(requestId&&!session){
  try{
   const reply=await api('request?id='+encodeURIComponent(requestId));
   if(reply.status==='approved'){
    session=reply.session;requestId='';invalidateBoardInteraction();sessionStorage.setItem('alfastafl.session',session);
    if(reply.tournament&&reply.token&&reply.name&&reply.role){
     // Raw device proof stays in this browser, not the server save. It is
     // scoped to exactly one tournament identity and role.
     try{localStorage.setItem('alfastafl.credential.'+reply.tournament+'.'+
       reply.role+'.'+reply.name,reply.token);
       localStorage.setItem('alfastafl.last-name.'+reply.tournament,reply.name);
       localStorage.setItem('alfastafl.tournament.role.'+reply.tournament,reply.role);}catch(_){}
    }
    rememberDevice(gameId,session);
    sessionStorage.setItem('alfastafl.game',gameId);
    $('joinmsg').textContent='Connexion autorisee';await load();
   }else if(reply.status==='rejected'){$('joinmsg').textContent='Demande refusee';requestId='';}
  }catch(error){}
 }
 if(!isDesktopBoard&&!isDesktopTutorial)await pending();
 if(gameId&&(session||isHost))await load();
 if(!isDesktopBoard&&!isDesktopTutorial)await listGames();
}
if(q.has('invite')){$('gid').value=q.get('game')||'';$('invite').value=q.get('invite')||'';}
$('mode').addEventListener('change',()=>{if(!game)syncGameBoard();});
render();
setInterval(tick,1800);
setInterval(()=>{renderClocks();renderConnection();},250);
tick();
