/* Read-only synchronized tutorial viewer. No game/player APIs or controls. */
(() => {
  'use strict';
  const params = new URLSearchParams(window.location.search);
  const token = params.get('tutorial_view') || '';
  const el = name => document.getElementById('tutorial-' + name);
  const square = (r, c) => String.fromCharCode(65 + c) + (11 - r);
  const pieces = {N:'nain', E:'elfe', R:'roi elfe', '.':'case vide'};
  const board = el('board');
  const boardView = new AlfastaflBoardView({
    prefix:'tutorial', flat:el('flat-board'), active:true, callbacks:{}
  });
  const connection = el('remote-connection');
  let revision = 0;
  let lesson = null;
  let busy = false;
  let closed = false;
  let interval;
  const has = (points,r,c) => Array.isArray(points) &&
    points.some(point => point[0] === r && point[1] === c);

  for(let i=0;i<11;i++){
    const file=document.createElement('span');
    file.textContent=String.fromCharCode(65+i);
    el('files').append(file);
    const rank=document.createElement('span');
    rank.textContent=String(11-i);
    el('ranks').append(rank);
  }

  function flatBoard(state, selected, legal, captures) {
    board.replaceChildren();
    for(let r=0;r<11;r++)for(let c=0;c<11;c++){
      const piece=state.board[r][c];
      const cell=document.createElement('div');
      cell.className='square'+((r+c)%2?' alt':'');
      cell.setAttribute('role','gridcell');
      const special=(r===5&&c===5) ||
        (state.mode!=='historical'&&[0,10].includes(r)&&[0,10].includes(c));
      if(special)cell.classList.add('special');
      if(has(state.targets,r,c)&&!state.completed)cell.classList.add('tutorial-target');
      if(has(state.focus,r,c)&&!state.completed)cell.classList.add('tutorial-focus');
      if(has(legal,r,c))cell.classList.add('legal');
      if(has(captures,r,c))cell.classList.add('capture');
      if(has(selected?[selected]:[],r,c))cell.classList.add('selected');
      cell.setAttribute('aria-label',square(r,c)+', '+pieces[piece]);
      if(piece!=='.'){
        const shape=document.createElement('span');
        shape.className='piece '+piece;
        shape.textContent=piece==='N'?'ᚦ':piece==='E'?'ᛟ':'♛';
        shape.setAttribute('aria-hidden','true');
        cell.append(shape);
      }
      board.append(cell);
    }
  }

  function paint(data) {
    const state=data.state;
    if(!state||!Array.isArray(state.board)||state.board.length!==11)return;
    const previousRevision=revision;
    const previousLesson=lesson;
    revision=data.revision;
    lesson=state.lesson;
    el('remote-mode').textContent=state.mode_label;
    el('remote-progress').textContent='Exercice '+(state.lesson_index+1)+' / '+state.lesson_count;
    el('remote-title').textContent=state.title;
    el('remote-camp').textContent=state.camp==='dwarf'
      ?'Le PC hôte montre le camp des Nains.'
      :'Le PC hôte montre les Elfes et leur roi.';
    el('remote-explanation').replaceChildren();
    for(const explanation of state.explanation||[]){
      const p=document.createElement('p');
      p.textContent=explanation;
      el('remote-explanation').append(p);
    }
    el('remote-objective').textContent=state.objective;
    el('remote-feedback').textContent=state.feedback ||
      (data.selected?'Une pièce est sélectionnée.':'Le présentateur choisit un déplacement.');
    el('remote-feedback').dataset.kind=state.feedback_kind || 'info';
    el('remote-hint').hidden=!data.hint_visible;
    el('remote-hint').textContent=data.hint_visible?state.hint:'';
    const viewState={
      board:state.board, mode:state.mode,
      selected:data.selected||null,
      legal:data.legal||[], captures:data.captures||[],
      targets:state.completed?[]:state.targets,
      focus:state.completed?[]:state.focus,
      interactive:false,disabled:true,
    };
    flatBoard(state,viewState.selected,viewState.legal,viewState.captures);
    boardView.update(viewState);
    if(previousRevision&&previousLesson===state.lesson&&
        data.event&&state.completed) {
      // A confirmed new move is shown as 3D motion; a late joiner starts
      // directly from the current authoritative position without replay.
      boardView.playMove(data.event).catch(()=>{});
    }
    connection.textContent='Diffusion en direct · lecture seule';
    connection.dataset.status='live';
  }

  async function poll() {
    if(closed||busy)return;
    busy=true;
    try{
      if(!token||token.length>200)throw Error('Lien de tutoriel invalide.');
      const result=await fetch('/api/tutorial/live/state?token='+encodeURIComponent(token),
        {cache:'no-store'});
      if(!result.ok){
        if(result.status===403||result.status===404||result.status===503){
          closed=true;
          connection.textContent='La présentation est terminée ou le réseau local est fermé.';
          connection.dataset.status='closed';
          boardView.setActive(false);
          if(interval)clearInterval(interval);
          return;
        }
        throw Error('Connexion indisponible ('+result.status+')');
      }
      const data=await result.json();
      if(data.revision!==revision)paint(data);
      else if(connection.dataset.status==='error'){
        connection.textContent='Diffusion en direct · lecture seule';
        connection.dataset.status='live';
      }
    }catch(error){
      if(!closed){
        connection.textContent=error.message;
        connection.dataset.status='error';
      }
    }finally{
      busy=false;
    }
  }
  if(!token){
    connection.textContent='QR code de tutoriel manquant.';
    connection.dataset.status='closed';
    boardView.setActive(false);
  }else{
    poll();
    interval=setInterval(poll,900);
  }
  window.addEventListener('pagehide',()=>{
    clearInterval(interval);
    boardView.dispose();
  },{once:true});
})();
