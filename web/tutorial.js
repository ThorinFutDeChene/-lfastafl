/* Local learning exercises. Normal games and player sessions are untouched. */
(() => {
  'use strict';

  const trigger = document.getElementById('tutorial-open');
  const panel = document.getElementById('tutorial-panel');
  if (!isHost) {
    trigger.remove();
    panel.remove();
    return;
  }

  const el = id => document.getElementById('tutorial-' + id);
  const board = el('board');
  const pieceNames = {N: 'nain', E: 'elfe', R: 'roi elfe', '.': 'case vide'};
  let state = null;
  let mode = '';
  let active = false;
  let busy = false;
  let revision = 0;
  let selected = null;
  let legal = [];
  let captures = [];
  let keyboardSquare = [0, 0];
  let returnFocus = null;
  let passed = new Set();
  let dragSelection = null;
  const boardView = new AlfastaflBoardView({
    prefix: 'tutorial', flat: el('flat-board'), active: false,
    callbacks: {
      onClick: clickSquare,
      canDrag: canDragPiece,
      onDragStart: beginDrag,
      onDrop: dropPiece,
    },
  });

  const contains = (positions, r, c) => positions.some(p => p[0] === r && p[1] === c);
  const coordinate = (r, c) => String.fromCharCode(65 + c) + (11 - r);
  const current = token => active && panel.open && token === revision;
  const ownPiece = piece => Boolean(state) && (piece === 'N' ? 'dwarf' : ['E', 'R'].includes(piece) ? 'elf' : null) === state.camp;

  function syncBoardView() {
    boardView.update({
      board: state ? state.board : null, mode: state ? state.mode : mode || 'fetlar',
      selected, legal, captures, targets: state && !state.completed ? state.targets : [],
      focus: state && !state.completed ? state.focus : [],
      interactive: active && Boolean(state) && !state.completed,
      disabled: busy || !active || !state || state.completed,
    });
  }

  function canDragPiece(r, c) {
    return Boolean(active && panel.open && !busy && state && !state.completed && ownPiece(state.board[r][c]));
  }

  for (let n = 0; n < 11; n++) {
    const file = document.createElement('span');
    file.textContent = String.fromCharCode(65 + n);
    el('files').append(file);
    const rank = document.createElement('span');
    rank.textContent = String(11 - n);
    el('ranks').append(rank);
  }

  function feedback(message, kind = 'info') {
    el('feedback').textContent = message;
    el('feedback').dataset.kind = kind;
  }

  function controls() {
    panel.setAttribute('aria-busy', String(busy));
    el('lessons').disabled = busy || !state;
    el('prev').disabled = busy || !state || state.lesson_index === 0;
    el('next').disabled = busy || !state;
    el('retry').disabled = busy;
    el('retry').textContent = state ? 'Recommencer l’exercice' : 'Réessayer';
    el('hint').disabled = busy || !state || !state.hint;
    el('next').textContent = state && state.lesson_index === state.lesson_count - 1
      ? 'Terminer le tutoriel' : 'Suivant →';
    for (const square of board.querySelectorAll('button')) {
      square.disabled = busy || Boolean(state && state.completed);
    }
    syncBoardView();
  }

  function setBusy(value) {
    busy = value;
    controls();
  }

  function focusSquare(position) {
    if (!position || !state || state.completed || busy) return;
    keyboardSquare = position;
    for (const square of board.querySelectorAll('button')) {
      square.tabIndex = Number(square.dataset.row) === position[0] &&
        Number(square.dataset.col) === position[1] ? 0 : -1;
    }
    const square = board.querySelector(`[data-row="${position[0]}"][data-col="${position[1]}"]`);
    if (square && !square.closest('[hidden]')) square.focus({preventScroll: true});
  }

  function renderBoard() {
    board.replaceChildren();
    syncBoardView();
    if (!state) return;
    board.setAttribute('aria-label', 'Plateau d’exercice : ' + state.title);
    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) {
        const piece = state.board[r][c];
        const square = document.createElement('button');
        square.type = 'button';
        square.className = 'square' + ((r + c) % 2 ? ' alt' : '');
        square.dataset.row = String(r);
        square.dataset.col = String(c);
        square.tabIndex = keyboardSquare[0] === r && keyboardSquare[1] === c ? 0 : -1;
        square.disabled = busy || state.completed;
        const throne = r === 5 && c === 5;
        const corner = [0, 10].includes(r) && [0, 10].includes(c);
        const target = !state.completed && contains(state.targets, r, c);
        const focus = !state.completed && contains(state.focus, r, c);
        const possible = contains(legal, r, c);
        const chosen = selected && selected[0] === r && selected[1] === c;
        if (throne || (corner && state.mode !== 'historical')) square.classList.add('special');
        if (target) square.classList.add('tutorial-target');
        if (focus) square.classList.add('tutorial-focus');
        if (possible) square.classList.add('legal');
        if (contains(captures, r, c)) square.classList.add('capture');
        if (chosen) square.classList.add('selected');
        square.setAttribute('aria-pressed', String(Boolean(chosen)));
        const descriptions = [coordinate(r, c), pieceNames[piece]];
        if (throne) descriptions.push('trône');
        if (corner && state.mode !== 'historical') descriptions.push('coin de fuite');
        if (target) descriptions.push('objectif');
        if (possible) descriptions.push('destination légale');
        if (contains(captures, r, c)) descriptions.push('capture possible');
        square.setAttribute('aria-label', descriptions.join(', '));
        square.title = descriptions.join(' · ');
        if (piece !== '.') {
          const shape = document.createElement('span');
          shape.className = 'piece ' + piece;
          shape.textContent = piece === 'N' ? 'ᚦ' : piece === 'E' ? 'ᛟ' : '♛';
          shape.setAttribute('aria-hidden', 'true');
          square.append(shape);
        }
        square.addEventListener('click', () => clickSquare(r, c));
        square.addEventListener('keydown', event => {
          const offsets = {ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]};
          if (offsets[event.key]) {
            event.preventDefault();
            const [dr, dc] = offsets[event.key];
            focusSquare([Math.max(0, Math.min(10, r + dr)), Math.max(0, Math.min(10, c + dc))]);
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            focusSquare([event.ctrlKey ? (event.key === 'Home' ? 0 : 10) : r,
              event.key === 'Home' ? 0 : 10]);
          }
        });
        board.append(square);
      }
    }
    el('selection').textContent = state.completed
      ? 'Exercice validé. Passez au suivant ou recommencez pour vous entraîner.'
      : selected
        ? `${pieceNames[state.board[selected[0]][selected[1]]]} en ${coordinate(...selected)} sélectionné. ` +
          (legal.length ? 'Les points indiquent les destinations légales.' : 'Cette pièce n’a aucun coup légal.')
        : 'Choisissez une pièce, puis sa destination, ou faites-la glisser. Pour jouer au clavier, choisissez la vue 2D.';
  }

  function renderMemo() {
    el('rules-summary').textContent = 'Mémo des règles · ' + state.mode_label;
    const list = el('rule-list');
    list.replaceChildren();
    for (const rule of state.rules) {
      const term = document.createElement('dt');
      term.textContent = rule.title;
      const description = document.createElement('dd');
      description.textContent = rule.text;
      list.append(term, description);
    }
    const limitations = el('limitations');
    limitations.replaceChildren();
    limitations.hidden = state.limitations.length === 0;
    for (const message of state.limitations) {
      const item = document.createElement('li');
      item.textContent = message;
      limitations.append(item);
    }
    const sources = el('sources');
    sources.replaceChildren();
    for (const source of state.sources) {
      try {
        const url = new URL(source.url);
        if (url.protocol !== 'https:') continue;
        const link = document.createElement('a');
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = source.title;
        sources.append(link);
      } catch (_) { /* An invalid reference must not interrupt an exercise. */ }
    }
  }

  function render() {
    el('mode-label').textContent = state.mode_label;
    el('progress').textContent = `Exercice ${state.lesson_index + 1} / ${state.lesson_count}`;
    el('camp').textContent = 'Vous jouez : ' + (state.camp === 'dwarf' ? 'les Nains' : 'les Elfes et leur roi');
    el('lesson-title').textContent = state.title;
    el('explanation').replaceChildren();
    for (const text of state.explanation) {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      el('explanation').append(paragraph);
    }
    el('objective').textContent = state.objective;
    el('hint-text').textContent = state.hint;
    el('hint-text').hidden = true;
    el('hint').setAttribute('aria-expanded', 'false');
    el('hint').textContent = 'Afficher un indice';
    if (state.completed) passed.add(state.lesson);
    el('lessons').replaceChildren();
    for (let index = 0; index < state.lessons.length; index++) {
      const lesson = state.lessons[index];
      const option = document.createElement('option');
      option.value = lesson.id;
      option.textContent = `${index + 1}. ${lesson.title}` + (passed.has(lesson.id) ? ' ✓' : '');
      el('lessons').append(option);
    }
    el('lessons').value = state.lesson;
    feedback(state.feedback || 'Sélectionnez une pièce pour voir ses coups légaux.', state.feedback_kind);
    renderMemo();
    renderBoard();
    controls();
  }

  async function loadLesson(lesson) {
    const token = ++revision;
    dragSelection = null;
    selected = null;
    legal = [];
    captures = [];
    setBusy(true);
    feedback('Chargement de l’exercice…');
    const query = new URLSearchParams({mode});
    if (lesson) query.set('lesson', lesson);
    try {
      const result = await api('tutorial?' + query);
      if (!current(token)) return;
      state = result.tutorial;
      keyboardSquare = state.focus.length ? [...state.focus[0]] : [0, 0];
      render();
      el('lesson-title').focus({preventScroll: true});
    } catch (error) {
      if (current(token)) {
        if (state) {
          el('lessons').value = state.lesson;
          renderBoard();
        }
        feedback('Impossible de charger cet exercice : ' + error.message, 'error');
      }
    } finally {
      if (current(token)) setBusy(false);
    }
  }

  async function selectSquare(r, c) {
    if (!canDragPiece(r, c)) return false;
    const token = ++revision;
    setBusy(true);
    const query = new URLSearchParams({mode, lesson: state.lesson, row: String(r), col: String(c)});
    try {
      const result = await api('tutorial/legal?' + query);
      if (!current(token)) return false;
      selected = [r, c];
      legal = result.moves;
      captures = result.captures || [];
      keyboardSquare = [r, c];
      renderBoard();
      feedback(legal.length ? 'Choisissez une destination pour cette pièce.' : 'Cette pièce est bloquée. Choisissez-en une autre.');
      return true;
    } catch (error) {
      if (current(token)) feedback(error.message, 'error');
      return false;
    } finally {
      if (current(token)) {
        setBusy(false);
        focusSquare([r, c]);
      }
    }
  }

  async function moveSquare(r, c) {
    if (!active || !panel.open || busy || !state || state.completed || !selected) return;
    dragSelection = null;
    const token = ++revision;
    const origin = [...selected];
    setBusy(true);
    try {
      const result = await api('tutorial/move', {mode, lesson: state.lesson, from: origin, to: [r, c]});
      if (!current(token)) return;
      state = result.tutorial;
      selected = null;
      legal = [];
      captures = [];
      keyboardSquare = state.completed ? [r, c] : origin;
      render();
      if (state.completed && state.last_move) {
        // Only a successful, server-confirmed practice move changes the board.
        // Failed objectives reset to the original position and do not animate.
        boardView.playMove(state.last_move).catch(()=>{});
        document.dispatchEvent(new CustomEvent('alfastafl-tutorial-move'));
      }
    } catch (error) {
      if (current(token)) feedback(error.message, 'error');
    } finally {
      if (current(token)) {
        setBusy(false);
        if (state.completed) el('next').focus({preventScroll: true});
        else focusSquare(keyboardSquare);
      }
    }
  }

  function clickSquare(r, c) {
    if (!active || busy || !state || state.completed) return;
    dragSelection = null;
    const piece = state.board[r][c];
    if (selected && selected[0] === r && selected[1] === c) {
      selected = null;
      legal = [];
      captures = [];
      renderBoard();
      feedback('Sélection annulée. Choisissez une pièce.');
      focusSquare([r, c]);
    } else if (ownPiece(piece)) {
      selectSquare(r, c);
    } else if (selected) {
      // Send attempted moves too: the lesson explains why an illegal move fails.
      moveSquare(r, c);
    } else {
      feedback('Choisissez d’abord ' + (state.camp === 'dwarf' ? 'un nain.' : 'un elfe ou le roi.'), 'error');
    }
  }

  function beginDrag(r, c) {
    if (!canDragPiece(r, c)) return;
    const drag = {from: [r, c], mode, lesson: state.lesson, revision: null, promise: null};
    dragSelection = drag;
    drag.promise = selectSquare(r, c);
    drag.revision = revision;
    return drag.promise;
  }

  async function dropPiece(from, to) {
    const drag = dragSelection;
    if (!drag || drag.from[0] !== from[0] || drag.from[1] !== from[1]) return;
    const selectedSuccessfully = await drag.promise;
    if (dragSelection !== drag) return;
    dragSelection = null;
    if (!selectedSuccessfully || !current(drag.revision) || busy || !state || state.completed ||
        state.lesson !== drag.lesson || mode !== drag.mode || !selected ||
        selected[0] !== from[0] || selected[1] !== from[1]) return;
    if (!to || from[0] === to[0] && from[1] === to[1]) return;
    // The tutorial accepts attempted moves too, so its API can explain a refusal.
    await moveSquare(to[0], to[1]);
  }

  function resetSession() {
    if (!active) return;
    active = false;
    dragSelection = null;
    revision++;
    boardView.setActive(false);
    gameBoardView.setActive(true);
    busy = false;
    selected = null;
    legal = [];
    captures = [];
    panel.setAttribute('aria-busy', 'false');
    syncBoardView();
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({preventScroll: true});
  }

  function closeTutorial() {
    if (panel.open) panel.close();
    resetSession();
  }

  trigger.hidden = false;
  trigger.addEventListener('click', () => {
    if (active) return;
    returnFocus = document.activeElement;
    mode = document.getElementById('mode').value;
    state = null;
    selected = null;
    legal = [];
    captures = [];
    passed = new Set();
    dragSelection = null;
    active = true;
    board.replaceChildren();
    el('lessons').replaceChildren();
    el('lesson-title').textContent = 'Préparation du tutoriel';
    el('mode-label').textContent = document.getElementById('mode').selectedOptions[0].textContent;
    for (const id of ['progress', 'camp', 'explanation', 'objective', 'selection', 'hint-text', 'rule-list', 'limitations', 'sources']) {
      el(id).replaceChildren();
    }
    el('rules').open = false;
    el('hint-text').hidden = true;
    el('hint').setAttribute('aria-expanded', 'false');
    panel.showModal();
    syncBoardView();
    gameBoardView.setActive(false);
    boardView.setActive(true);
    el('heading').focus({preventScroll: true});
    loadLesson();
  });
  el('close').addEventListener('click', closeTutorial);
  panel.addEventListener('cancel', event => {
    event.preventDefault();
    closeTutorial();
  });
  panel.addEventListener('close', () => {
    // A queued close event from a previous opening must not cancel a new one.
    if (!panel.open) resetSession();
  });
  el('lessons').addEventListener('change', () => loadLesson(el('lessons').value));
  el('retry').addEventListener('click', () => loadLesson(state ? state.lesson : undefined));
  el('hint').addEventListener('click', () => {
    if (!state || busy) return;
    const showing = el('hint-text').hidden;
    el('hint-text').hidden = !showing;
    el('hint').setAttribute('aria-expanded', String(showing));
    el('hint').textContent = showing ? 'Masquer l’indice' : 'Afficher un indice';
  });
  el('prev').addEventListener('click', () => {
    if (!busy && state && state.lesson_index > 0) loadLesson(state.lessons[state.lesson_index - 1].id);
  });
  el('next').addEventListener('click', () => {
    if (busy || !state) return;
    if (state.lesson_index + 1 < state.lesson_count) loadLesson(state.lessons[state.lesson_index + 1].id);
    else closeTutorial();
  });
})();
