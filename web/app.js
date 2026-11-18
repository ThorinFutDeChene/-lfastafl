'use strict';
const $=id=>document.getElementById(id);
const q=new URLSearchParams(location.search);const isHost=['127.0.0.1','localhost','::1'].includes(location.hostname);
let gameId=q.get('game')||sessionStorage.getItem('alfastafl.game')||'',session=q.get('session')||sessionStorage.getItem('alfastafl.session')||'',selected=null,game=null,requestId='';
if(!isHost)$('host').hidden=true;
async function api(path,data){const opts=data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{};const r=await fetch('/api/'+path,opts);const x=await r.json();if(!r.ok)throw Error(x.error||r.status);return x;}
function say(s){$('msg').textContent=s;}
function render(){if(!game)return;$('state').textContent=game.mode+' · '+game.status+' · tour '+game.turn;
 const board=$('board');board.replaceChildren();for(let r=0;r<11;r++)for(let c=0;c<11;c++){
 const s=document.createElement('button');s.type='button';s.className='square'+((r+c)%2?' alt':'');
 if((r==5&&c==5)||([0,10].includes(r)&&[0,10].includes(c)))s.className+=' special';
 if(selected&&selected[0]===r&&selected[1]===c)s.className+=' selected';
 if(selected&&game.board[r][c]==='.'&&(r===selected[0]||c===selected[1]))s.className+=' legal';
 const p=game.board[r][c];if(p!=='.'){const sp=document.createElement('span');sp.className='piece '+p;sp.textContent=p==='N'?'ᚦ':p==='E'?'ᛟ':'♛';s.append(sp)}
 s.setAttribute('aria-label',`Case ${String.fromCharCode(65+c)}${11-r} ${p}`);s.onclick=()=>clickSquare(r,c);board.append(s);
 }$('moves').replaceChildren();for(const move of game.history){const li=document.createElement('li');li.textContent=`${move.n}. ${move.piece} ${move.from.join(',')} → ${move.to.join(',')} · ${move.captured.length} capture(s)`;$('moves').append(li)}
}
async function load(){if(!gameId)return;try{const j=await api('state?game='+encodeURIComponent(gameId)+'&session='+encodeURIComponent(session));game=j.game;render();if(j.invites&&isHost){const addr=await api('address');const origin='http://'+addr.address+':'+addr.port;
const panel=$('invitations');
$('hostmsg').textContent=`Identifiant : ${gameId}`;
$('link-player').href=origin+'/?game='+encodeURIComponent(gameId)+'&invite='+encodeURIComponent(j.invites.player);
$('link-spectator').href=origin+'/?game='+encodeURIComponent(gameId)+'&invite='+encodeURIComponent(j.invites.spectator);
// Le rafraîchissement périodique ne doit pas recharger les QR codes : cela gênerait le scan.
if(panel.dataset.game!==gameId){
 $('qr-player').src='/api/qr?game='+encodeURIComponent(gameId)+'&role=player';
 $('qr-spectator').src='/api/qr?game='+encodeURIComponent(gameId)+'&role=spectator';
 panel.dataset.game=gameId;
}
panel.hidden=false;
}}catch(e){say(e.message)}}
async function clickSquare(r,c){if(!game)return;const p=game.board[r][c],mySide=(session&&p!=='R')?(p==='N'?'dwarf':'elf'):(p==='R'?'elf':null);if(selected&&session){try{await api('move',{game:gameId,session,'from':selected,'to':[r,c]});selected=null;await load();return}catch(e){say(e.message)}}if(p!=='.'){selected=[r,c];render();}}
$('create').onclick=async()=>{try{const j=await api('create',{mode:$('mode').value});gameId=j.game;session='';await load()}catch(e){say(e.message)}};
$('request').onclick=async()=>{try{gameId=$('gid').value;requestId=(await api('join',{game:gameId,invite:$('invite').value,name:$('name').value})).request;$('joinmsg').textContent='Demande envoyée, en attente de validation.';}catch(e){$('joinmsg').textContent=e.message}};
async function pending(){if(!isHost)return;try{const j=await api('pending');$('pending').replaceChildren();for(const p of j.pending){const div=document.createElement('div');div.textContent=`${p.name} · ${p.role} · partie ${p.game.slice(0,8)} `;for(const camp of p.role==='player'?['elf','dwarf']:['spectator']){const b=document.createElement('button');b.textContent=camp;b.onclick=async()=>{try{await api('approve',{request:p.id,camp:camp==='spectator'?null:camp});await pending()}catch(e){say(e.message)}};div.append(b)}$('pending').append(div)}}catch(e){}}
async function tick(){if(requestId&&!session){try{const x=await api('request?id='+encodeURIComponent(requestId));if(x.status==='approved'){session=x.session;sessionStorage.setItem('alfastafl.session',session);sessionStorage.setItem('alfastafl.game',gameId);$('joinmsg').textContent='Connexion autorisée';await load()}else if(x.status==='rejected'){$('joinmsg').textContent='Demande refusée';requestId=''}}catch(e){}}await pending();if(gameId&&(session||isHost))await load()}
if(q.has('invite')){$('gid').value=q.get('game')||'';$('invite').value=q.get('invite')||''}
setInterval(tick,1800);tick();
