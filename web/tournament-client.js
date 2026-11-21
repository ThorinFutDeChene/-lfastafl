/* One tournament QR covers the next eligible match for each registered
 * player. Browser storage holds a scoped secret; no browser can read a MAC.
 * Already approved devices resume across rounds without another approval. */
(()=>{
 'use strict';
 if(isHost||!q.get('tournament')||!q.get('invite')||q.has('broadcast-view'))return;
 const tid=q.get('tournament'),invite=q.get('invite');
 const element=id=>document.getElementById(id);
 const panel=element('tournament-connect');
 const input=element('tournament-entrant-name');
 const message=element('tournament-enter-status');
 const action=element('tournament-enter');
 let busy=false,pending=false,approved=false;
 const stored=key=>{try{return localStorage.getItem(key)||'';}catch(_){return '';}};
 const remember=(key,value)=>{try{localStorage.setItem(key,value);}catch(_){}};
 const nameKey='alfastafl.last-name.'+tid;
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
  const name=input.value.trim();
  if(!name){message.textContent='Indiquez votre nom d’inscription.';return;}
  busy=true;action.disabled=true;
  remember(nameKey,name);
  try{
   const response=await api('tournament/enter',{tournament:tid,invite,
     name,device_token:proof(name)});
   if(response.status==='waiting_match'){
    message.textContent='Aucune rencontre à jouer actuellement. La recherche se poursuit automatiquement.';
   }else if(response.status==='awaiting_host'){
    message.textContent=response.message;
   }else if(response.status==='approved'){
    approved=true;
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
   }else if(response.status==='pending'){
    pending=true;gameId=response.game;requestId=response.request;
    session='';invalidateBoardInteraction();
    message.textContent='Demande transmise à l’hôte. Cette première autorisation enregistrera l’appareil.';
   }else{
    throw Error('Réponse de connexion non reconnue.');
   }
  }catch(error){message.textContent=error.message||String(error);}
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
 if(input.value&&proof(input.value))enter();
 else if(input.value)message.textContent='Vérifiez votre nom puis rejoignez la rencontre.';
 // A recognized player who has a bye or whose next round is not yet created
 // can leave the screen open and join when the server schedules the match.
 setInterval(()=>{
  if(!busy&&!pending&&!approved&&proof(input.value.trim())&&
     message.textContent.includes('Aucune rencontre'))enter();
 },8000);
})();
