/* One tournament QR covers the next eligible match for each registered
 * player. Browser storage holds a scoped secret; no browser can read a MAC.
 * Already approved devices resume across rounds without another approval. */
(async()=>{
 'use strict';
 if(isHost||!q.get('tournament')||!q.get('invite')||q.has('broadcast-view'))return;
 const tid=q.get('tournament'),invite=q.get('invite');
 // Read the invitation role once and retry temporary transport failures.
 const rolePath='tournament/invite/role?tournament='+encodeURIComponent(tid)+
  '&invite='+encodeURIComponent(invite);
 const retryable=error=>!error.status||error.status>=500||[408,429].includes(error.status);
 let info,delay=1200;
 for(;;){
  try{info=await api(rolePath);break;}
  catch(error){
   const panel=document.getElementById('tournament-connect');
   const result=document.getElementById('tournament-enter-status');
   if(panel)panel.hidden=false;
   if(result)result.textContent=retryable(error)
    ?'Connexion au tournoi interrompue. Nouvelle tentative…':error.message||String(error);
   if(!retryable(error))return;
   await new Promise(resolve=>setTimeout(resolve,delay));
   delay=Math.min(8000,delay*2);
  }
 }
 if(info.registration_open&&info.role==='player'){
  await globalThis.AlfastaflOpenTournamentClient.start({tid,invite});
  return;
 }
 const element=id=>document.getElementById(id);
 const panel=element('tournament-connect');
 const input=element('tournament-entrant-name');
 const message=element('tournament-enter-status');
 const action=element('tournament-enter');
 let busy=false,pending=false,approved=false,spectatorQR=false,retryTrusted=false;
 const stored=key=>{try{return localStorage.getItem(key)||'';}catch(_){return '';}};
 const remember=(key,value)=>{try{localStorage.setItem(key,value);}catch(_){}};
 const nameKey='alfastafl.last-name.'+tid;
 const spectatorKey='alfastafl.spectator.'+tid;
 input.value=stored(nameKey);
 panel.hidden=false;
 function proof(name){
  const preferred=stored('alfastafl.tournament.role.'+tid);
  const roles=preferred?[preferred,preferred==='player'?'spectator':'player']:['player','spectator'];
  for(const role of roles){
   const secret=stored('alfastafl.credential.'+tid+'.'+role+'.'+name);
   if(secret)return secret;
  }
  return '';
 }
 async function enter(){
  if(busy||approved||pending)return;
  const name=spectatorQR?'Spectateur':input.value.trim();
  if(!name){message.textContent='Indiquez votre nom d’inscription.';return;}
  busy=true;action.disabled=true;
  if(!spectatorQR)remember(nameKey,name);
  try{
   const deviceProof=spectatorQR?(stored(spectatorKey)||session):proof(name);
   const response=await api('tournament/enter',{tournament:tid,invite,
     name,device_token:deviceProof});
   retryTrusted=false;
   if(response.status==='waiting_match'){
    message.textContent=spectatorQR?'En attente du lancement des rencontres.':'Aucune rencontre à jouer actuellement. La recherche se poursuit automatiquement.';
    if(spectatorQR)$('guest-waiting-message').textContent=message.textContent;
   }else if(response.status==='awaiting_host'){
    message.textContent=response.message;
   }else if(response.status==='approved'){
    approved=true;
    if(spectatorQR){
     spectatorConnecting=false;
     remember(spectatorKey,response.session);
    }
    gameId=response.game;session=response.session;
    requestId='';
    remember('alfastafl.tournament.role.'+tid,response.role);
    rememberDevice(gameId,session);
    sessionStorage.setItem('alfastafl.game',gameId);
    sessionStorage.setItem('alfastafl.session',session);
    invalidateBoardInteraction();
    panel.hidden=true;
    message.textContent='Appareil reconnu. Accès rétabli sans nouvelle autorisation.';
    await load();
    if(spectatorQR&&session){syncGuestLayout();globalThis.AlfastaflBroadcast?.start(tid);}
   }else if(response.status==='pending'){
    pending=true;gameId=response.game;requestId=response.request;
    session='';invalidateBoardInteraction();syncGuestLayout();
    message.textContent='Demande transmise à l’hôte. Cette première autorisation enregistrera l’appareil.';
   }else{
    throw Error('Réponse de connexion non reconnue.');
   }
  }catch(error){
   retryTrusted=!spectatorQR&&Boolean(proof(name))&&retryable(error);
   message.textContent=error.message||String(error);
   if(spectatorQR)$('guest-waiting-message').textContent=message.textContent;
  }
  finally{busy=false;action.disabled=false;}
 }
 action.addEventListener('click',enter);
 input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();enter();}});
 // The original per-game approval poll is authoritative. When it grants
 // this browser a session, app.js saves the strong tournament proof.
 setInterval(()=>{
  if(requestId=== ''&&pending&&session){
   pending=false;approved=true;
   panel.hidden=true;
  }
  if(requestId===''&&pending&&!session){
   // A rejected request is never silently resubmitted.
   const status=element('joinmsg').textContent;
   if(status.includes('refusee')||status.includes('refusée')){
    pending=false;message.textContent='Demande refusée par l’hôte.';
   }
  }
 },600);
 // Prior device credentials are tried immediately on a newly scanned QR;
 // requests with no credential always require a deliberate button press.
 function recoverSpectator(){
  if(!spectatorQR||busy)return;
  approved=false;
  spectatorConnecting=true;
  globalThis.AlfastaflBroadcast?.stop();
  $('guest-waiting-message').textContent='Diffusion interrompue. Reconnexion automatique…';
  syncGuestLayout();
  enter();
 }
 window.AlfastaflTournamentConnection={recoverSpectator};
 if(info.role==='spectator'){
  spectatorQR=true;
  panel.hidden=true;
  document.body.classList.add('guest-tournament-spectator');
  spectatorConnecting=true;
  $('guest-waiting-message').textContent='Connexion à la diffusion en cours…';
  syncGuestLayout();
  enter();
 }else if(input.value&&proof(input.value))enter();
 else if(input.value)message.textContent='Vérifiez votre nom puis rejoignez la rencontre.';
 // Only spectators and known players reconnect automatically.
 function retry(){
  if(busy||pending)return;
  if(spectatorQR&&approved&&!session){recoverSpectator();return;}
  if(!approved&&(spectatorQR||retryTrusted||
    (proof(input.value.trim())&&message.textContent.includes('Aucune rencontre'))))enter();
 }
 setInterval(retry,4000);
 globalThis.addEventListener?.('online',retry);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)retry();});
})();
