'use strict';
const $=id=>document.getElementById(id);
const q=new URLSearchParams(location.search);
const isHost=['127.0.0.1','localhost','::1'].includes(location.hostname);
let gameId=q.get('game')||sessionStorage.getItem('alfastafl.game')||'';
let session=q.get('session')||sessionStorage.getItem('alfastafl.session')||'';
let selected=null,legalDestinations=[],game=null,requestId='',you=null,reviewVotes={};
if(!isHost)$('host').hidden=true;
async function api(path,data){
 const opts=data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{};
 const response=await fetch('/api/'+path,opts);
 const result=await response.json();
 if(!response.ok)throw Error(result.error||response.status);
 return result;
}
function say(s){$('msg').textContent=s;}
function available(r,c){return legalDestinations.some(m=>m[0]===r&&m[1]===c);}
function myTurn(){return Boolean(game&&you&&you.role==='player'&&you.camp===game.turn&&game.status==='active');}
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
  if(!myTurn()){selected=null;legalDestinations=[];}
  render();
  if(state.invites&&isHost){
   const addr=await api('address');const origin='http://'+addr.address+':'+addr.port;
   const panel=$('invitations');
   $('hostmsg').textContent=`Identifiant : ${gameId}`;
   $('link-player').href=origin+'/?game='+encodeURIComponent(gameId)+'&invite='+encodeURIComponent(state.invites.player);
   $('link-spectator').href=origin+'/?game='+encodeURIComponent(gameId)+'&invite='+encodeURIComponent(state.invites.spectator);
   // Keep QR images steady during periodic polling; reloading interrupts camera scans.
   if(panel.dataset.game!==gameId){
    $('qr-player').src='/api/qr?game='+encodeURIComponent(gameId)+'&role=player';
    $('qr-spectator').src='/api/qr?game='+encodeURIComponent(gameId)+'&role=spectator';
    panel.dataset.game=gameId;
   }
   panel.hidden=false;
  }
 }catch(error){say(error.message);}
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
 try{const created=await api('create',{mode:$('mode').value});
  gameId=created.game;session='';selected=null;legalDestinations=[];
  await load();}catch(error){say(error.message);}
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
 if(requestId&&!session){
  try{
   const reply=await api('request?id='+encodeURIComponent(requestId));
   if(reply.status==='approved'){
    session=reply.session;sessionStorage.setItem('alfastafl.session',session);
    sessionStorage.setItem('alfastafl.game',gameId);
    $('joinmsg').textContent='Connexion autorisee';await load();
   }else if(reply.status==='rejected'){$('joinmsg').textContent='Demande refusee';requestId='';}
  }catch(error){}
 }
 await pending();if(gameId&&(session||isHost))await load();
}
if(q.has('invite')){$('gid').value=q.get('game')||'';$('invite').value=q.get('invite')||'';}
setInterval(tick,1800);tick();
