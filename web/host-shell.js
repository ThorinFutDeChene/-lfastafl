/* Álfastafl Ubuntu's single-window shell: fullscreen game, permanent
 * invitation rail and native Qt menus that open the existing controls as
 * modal management windows. It never creates a second WebGL renderer.
 *
 * The public/remote HTML keeps its original guest and host layouts. */
(() => {
 'use strict';
 if(!isHost||!isDesktopShell)return;
 const el=id=>document.getElementById(id);
 const ids=['new','saves','settings','game','connections','history','tournament'];
 const dialogs=Object.fromEntries(ids.map(id=>[id,el('shell-'+id+'-dialog')]));
 function take(destination,node){
  if(!node)throw Error('Fenêtre de gestion incomplète : '+destination.id);
  destination.append(node);
 }
 const newContent=el('shell-new-content');
 const settingsContent=el('shell-settings-content');
 const savesContent=el('shell-saves-content');
 const gameContent=el('shell-game-content');
 const connContent=el('shell-connections-content');
 const histContent=el('shell-history-content');
 // Keep *original* inputs and buttons, not clones: their event listeners
 // are already installed by app.js and BoardView, and are not duplicated.
 take(newContent,document.querySelector('#host .host-actions'));
 const tutorialTrigger=el('tutorial-open');
 take(el('host'),tutorialTrigger);
 take(settingsContent,el('mode').closest('label'));
 take(settingsContent,document.querySelector('#host .game-setup'));
 take(settingsContent,document.querySelector('#game-board-view .board-tools'));
 take(savesContent,document.querySelector('#host .saved-games'));
 const hostControls=el('host-game-controls');
 take(savesContent,el('save-leave'));
 take(savesContent,el('resume-game'));
 take(gameContent,hostControls);
 take(gameContent,el('player-controls'));
 // The DEV8 "second window" control is obsolete in this single-window shell.
 el('host-open-board').hidden=true;
 el('host-board-note').hidden=true;
 take(connContent,el('lan-status'));
 take(connContent,el('invitations'));
 take(connContent,el('pending'));
 take(histContent,el('moves'));
 for(const modal of Object.values(dialogs)){
  modal.addEventListener('click',event=>{
   if(event.target.closest('[data-shell-close]'))modal.close();
   // A click on the dimmed backdrop closes the panel, never the board.
   else if(event.target===modal)modal.close();
  });
 }
 const qrRoles=[
  {role:'player',figure:el('shell-player-code'),img:el('shell-player-image'),
   note:el('shell-player-note')},
  {role:'spectator',figure:el('shell-spectator-code'),img:el('shell-spectator-image'),
   note:el('shell-spectator-note')},
 ];
 function updateStatus(){
  const active=Boolean(game&&game.id===gameId);
  el('shell-empty-board').hidden=active;
  const title=active ? 'Partie '+game.id.slice(0,8)+' • '+game.mode :
    'Álfastafl • Aucune partie';
  document.title=title;
 }
 function syncInvites(invites,address,id){
  // While broadcasting, the left-hand QRs belong to the WHOLE tournament,
  // not whichever match happens to be displayed this second.
  if(globalThis.AlfastaflBroadcast?.currentTournament())return;
  const visible=Boolean(id&&game&&game.id===id&&game.status==='active'&&
   invites?.player&&invites?.spectator&&address?.lan_enabled);
  el('shell-network-status').textContent=address?.lan_enabled
   ? visible?'LAN actif · Joueurs sur validation, spectateurs directs':'LAN actif · Ouvrez une partie'
   :'LAN inactif';
  for(const x of qrRoles){
   x.img.hidden=!visible;
   x.figure.classList.toggle('shell-qr-offline',!visible);
   x.note.textContent=visible ? (x.role==='player'
    ?'Scanner pour demander à jouer':'Scanner pour regarder directement')
    :address?.lan_enabled?'Créez ou reprenez une partie.':
     'Le LAN s’active automatiquement à la création ou reprise d’une partie.';
   if(visible){
    // The server provides a real QR bound to an invitation and the current
    // LAN address. Cache the signature to avoid breaking camera scans.
    const sig=id+'|'+x.role+'|'+address.address+'|'+address.port+'|'+invites[x.role];
    if(x.figure.dataset.signature!==sig){
     x.img.src='/api/qr?game='+encodeURIComponent(id)+'&role='+x.role+'&v='+Date.now();
     x.figure.dataset.signature=sig;
    }
   }else{
    delete x.figure.dataset.signature;
    x.img.removeAttribute('src');
   }
  }
 }
 function open(name){
  // The native menu and the web dialog both use the same idempotent request.
  if(name==='new'||name==='tutorial'||name==='tournament')
   ensureLanForSession();
  if(name==='tutorial'){
   for(const m of Object.values(dialogs))if(m.open)m.close();
   tutorialTrigger.click();return true;
  }
  if(name==='broadcast-stop'){
   globalThis.AlfastaflBroadcast?.stop();return true;
  }
  if(name==='save'){
   if(!game||game.status==='finished'||game.reason==='saved_by_host')return false;
   el('save-leave').click();return true;
  }
  if(name==='top'){el('game-camera-top').click();return true;}
  if(name==='reset-camera'){el('game-camera-reset').click();return true;}
  if(name==='quit'){window.close();return true;}
  const target=dialogs[name];
  if(!target)return false;
  if(target.open){target.focus();return true;}
  for(const modal of Object.values(dialogs))if(modal.open)modal.close();
  if(name==='saves')listGames(true).catch(()=>{});
  if(name==='connections')pending().catch(()=>{});
  if(name==='tournament')window.AlfastaflTournaments?.refresh();
  target.showModal();
  target.querySelector('[data-shell-close]')?.focus({preventScroll:true});
  return true;
 }
 function onCreated(){
  for(const name of ['new','saves'])if(dialogs[name].open)dialogs[name].close();
  updateStatus();
 }
 function onSelected(){
  globalThis.AlfastaflBroadcast?.stop();
  if(dialogs.saves.open)dialogs.saves.close();
  updateStatus();
 }
 // React to save/resume without changing any game rules or session tokens.
 el('resume-game').addEventListener('click',()=>{if(dialogs.saves.open)dialogs.saves.close();});
 el('host-play-dwarf').addEventListener('click',()=>{if(dialogs.game.open)dialogs.game.close();});
 el('host-play-elf').addEventListener('click',()=>{if(dialogs.game.open)dialogs.game.close();});
 el('host-watch').addEventListener('click',()=>{if(dialogs.game.open)dialogs.game.close();});
 // No active game should ever display dead, scannable invitations.
 updateStatus();
 syncInvites(null,null,null);
 // Keep the ephemeral LAN open while the organizer is preparing an
 // invitation, managing a tournament, or showing the live tournament wall.
 // Closing those views stops heartbeats; the native idle grace closes UFW.
 setInterval(()=>{
  if(!(dialogs.new.open||dialogs.tournament.open||
       globalThis.AlfastaflBroadcast?.currentTournament()))return;
  fetch('/api/lan/activity',{method:'POST',
   headers:{'X-Alfastafl-Host-Action':'lan-activity'}}).catch(()=>{});
 },4500);
 window.AlfastaflShell={open,syncInvites,onCreated,onSelected,updateStatus};
})();
