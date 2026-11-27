#!/usr/bin/env node
'use strict';

/* Run the complete, unmodified app.js with controlled HTTP responses.
 * Only DOM/rendering and transport are replaced: selection, polling, revision
 * checks and drag/drop use the production functions. No browser or server.
 * This test does not check WebGL rendering or browser event dispatch.
 *
 * Run: node tests/ui_move_race.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'web', 'app.js');
const source = fs.readFileSync(appPath, 'utf8');
const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const gameId = 'move-race-game';
const session = 'move-race-player';
const clone = value => JSON.parse(JSON.stringify(value));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

function storage(entries = []) {
  const values = new Map(entries);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

function makeDocument() {
  const document = {activeElement: null};
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.dataset = {};
      this.attributes = new Map();
      this.className = '';
      this.textContent = '';
      this.value = '';
      this.hidden = false;
      this.disabled = false;
      this.parentElement = null;
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        toggle: (name, force) => {
          const names = new Set(this.className.split(/\s+/).filter(Boolean));
          const present = force === undefined ? !names.has(name) : Boolean(force);
          if (present) names.add(name); else names.delete(name);
          this.className = [...names].join(' ');
          return present;
        },
      };
    }
    append(...children) {
      for (const child of children) { child.parentElement = this; this.children.push(child); }
    }
    replaceChildren(...children) {
      for (const child of this.children) child.parentElement = null;
      this.children = [];
      this.append(...children);
    }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    addEventListener() {} // Only the unused variant selector registers a listener.
    focus() { if (!this.disabled && !this.hidden) document.activeElement = this; }
    querySelectorAll(selector) {
      assert.equal(selector, 'button', 'Unexpected DOM selector in this focused harness');
      return this.children.flatMap(child => [
        ...(child.tagName === 'BUTTON' ? [child] : []), ...child.querySelectorAll(selector),
      ]);
    }
    querySelector(selector) {
      const match = /^\[data-row="(\d+)"\]\[data-col="(\d+)"\]$/.exec(selector);
      assert(match, 'Unexpected DOM selector: ' + selector);
      return this.querySelectorAll('button').find(child =>
        child.dataset.row === match[1] && child.dataset.col === match[2]) || null;
    }
  }
  // Use the real page's IDs, so a missing integration element fails explicitly.
  const elements = new Map([...html.matchAll(/<([a-z][\w:-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)]
    .map(match => [match[2], new Element(match[1])]));
  document.getElementById = id => {
    assert(elements.has(id), 'Missing page element: ' + id);
    return elements.get(id);
  };
  document.createElement = tag => new Element(tag);
  document.body = new Element('body');
  document.addEventListener = () => {}; // Guest view keyboard shortcut is not exercised here.
  document.activeElement = new Element('body');
  for (const camp of ['elf', 'dwarf']) {
    new Element().append(document.getElementById('clock-' + camp));
  }
  document.getElementById('mode').value = 'fetlar';
  document.getElementById('time-mode').value = 'unlimited';
  return document;
}

function initialGame() {
  const board = Array.from({length: 11}, () => Array(11).fill('.'));
  for (const [r, c, piece] of [
    [2, 2, 'N'], [4, 2, 'N'], [4, 4, 'E'], [4, 5, 'N'], [5, 5, 'R'], [7, 7, 'E'],
  ]) board[r][c] = piece;
  return {id: gameId, mode: 'fetlar', board, turn: 'dwarf', status: 'active',
    winner: null, reason: null, history: [], draw_offer: null, disconnect: null,
    clock: {mode: 'unlimited', started: true}};
}

// Fixture transitions represent committed API states, not a second rule engine.
function advance(game, from, to, captured = []) {
  const piece = game.board[from[0]][from[1]];
  game.board[from[0]][from[1]] = '.';
  game.board[to[0]][to[1]] = piece;
  for (const [r, c] of captured) game.board[r][c] = '.';
  game.turn = game.turn === 'dwarf' ? 'elf' : 'dwarf';
  const event = {n: game.history.length + 1, from, to, piece, captured,
    status: 'active', winner: null, reason: null};
  game.history.push(event);
  return clone(event);
}

async function makeHarness() {
  const document = makeDocument();
  const serverGame = initialGame();
  const pendingMove = deferred();
  const moves = [];
  const unexpected = [];
  const timers = new Map();
  let firstEvent;
  let stateReads = 0;
  let heldState = null;
  const response = (body, status = 200) => {
    const snapshot = clone(body);
    return {ok: status >= 200 && status < 300, status, json: async () => clone(snapshot)};
  };
  async function fetch(input, options = {}) {
    try {
      const url = new URL(input, 'http://player.test');
      if (url.pathname === '/api/state' || url.pathname === '/api/legal') {
        assert.equal(options.method || 'GET', 'GET');
        assert.equal(url.searchParams.get('game'), gameId);
        assert.equal(url.searchParams.get('session'), session);
        if (url.pathname === '/api/state') {
          stateReads++;
          const result = response({game: serverGame, you: {role: 'player', camp: 'dwarf'},
            review_votes: {}, server_now: 1000});
          if (heldState) await heldState.promise;
          return result;
        }
        const square = [Number(url.searchParams.get('row')), Number(url.searchParams.get('col'))];
        if (square[0] === 2 && square[1] === 2) {
          return response({moves: [[2, 3]], captures: []});
        }
        assert.deepEqual(square, [4, 2], 'Unexpected legal-move request');
        return response({moves: [[4, 3], [3, 2]], captures: [[4, 3]]});
      }
      assert.equal(url.pathname, '/api/move', 'Unexpected endpoint');
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body);
      assert.equal(body.game, gameId);
      assert.equal(body.session, session);
      moves.push(body);
      if (moves.length === 1) {
        assert.deepEqual([body.from, body.to], [[2, 2], [2, 3]]);
        firstEvent = advance(serverGame, body.from, body.to);
        // The server has committed the move, while its response is still held.
        return pendingMove.promise;
      }
      assert.equal(moves.length, 2, 'A stale response must not submit an extra move');
      assert.deepEqual([body.from, body.to], [[4, 2], [4, 3]]);
      return response({event: advance(serverGame, body.from, body.to, [[4, 4, 'E']])});
    } catch (error) {
      unexpected.push(error.message);
      throw error;
    }
  }
  class BoardViewStub {
    constructor({flat, callbacks, active = true}) {
      this.active = active;
      this.callbacks = callbacks;
      flat.hidden = true; // This scenario represents the 3D drag/drop callbacks.
    }
    update(state) { this.state = clone(state); }
    // Presentation-only client animation must never change the legal move race.
    async playMove() { return false; }
  }
  const context = vm.createContext({
    document, fetch, URLSearchParams,
    location: {hostname: 'player.test', search: ''},
    sessionStorage: storage([['alfastafl.game', gameId], ['alfastafl.session', session]]),
    localStorage: storage(), AlfastaflBoardView: BoardViewStub,
    performance: {now: () => 1000},
    setInterval: (callback, delay) => { timers.set(delay, callback); return delay; },
    confirm: () => { throw new Error('Unexpected confirmation'); },
  });
  const evaluate = code => vm.runInContext(code, context, {timeout: 1000});
  vm.runInContext(source, context, {filename: appPath, timeout: 1000});
  // Drain the immediate bootstrap tick; no real polling timer is installed.
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(unexpected, []);
  assert.equal(stateReads, 1, 'The real bootstrap tick must load the initial state');
  assert.equal(document.getElementById('board').children.length, 121);
  return {
    document, moves, unexpected, evaluate,
    get stateReads() { return stateReads; },
    poll: () => timers.get(1800)(),
    holdState: () => {heldState = deferred();},
    releaseState: () => {const pending=heldState;heldState=null;pending.resolve();},
    opponentMove: () => advance(serverGame, [7, 7], [7, 6]),
    release: outcome => {
      if (outcome === 'success') pendingMove.resolve(response({event: firstEvent}));
      else if (outcome === 'http-error') pendingMove.resolve(response({error: 'Old HTTP failure'}, 502));
      else pendingMove.reject(new Error('Old network failure'));
    },
    snapshot: () => JSON.parse(evaluate('JSON.stringify({' +
      'selected, legalDestinations, captureDestinations, gameBusy, boardRevision,' +
      'dragging: Boolean(gameDrag), game, view: gameBoardView.state,' +
      'message: $("msg").textContent})')),
  };
}

for (const outcome of ['success', 'http-error', 'network-error']) {
  test('Late move ' + outcome + ' preserves the next turn selection and drag', {timeout: 3000}, async () => {
    const app = await makeHarness();
    await app.evaluate('clickSquare(2, 2)');
    const oldMove = app.evaluate('clickSquare(2, 3)');
    assert.equal(app.moves.length, 1);
    assert.equal(app.snapshot().gameBusy, true);

    await app.poll(); // See the committed move before its HTTP response.
    assert.equal(app.snapshot().game.turn, 'elf');
    app.opponentMove();
    await app.poll(); // The same player now owns a genuinely new turn.
    assert.equal(app.snapshot().game.turn, 'dwarf');
    assert.equal(app.snapshot().game.history.length, 2);
    assert.equal(await app.evaluate('beginGameDrag(4, 2)'), true);

    const before = app.snapshot();
    assert.deepEqual(before.selected, [4, 2]);
    assert.deepEqual(before.legalDestinations, [[4, 3], [3, 2]]);
    assert.deepEqual(before.captureDestinations, [[4, 3]]);
    assert.equal(before.dragging, true);
    assert.equal(before.gameBusy, false);
    const readsBeforeResponse = app.stateReads;

    app.release(outcome);
    await oldMove;
    assert.deepEqual(app.snapshot(), before, 'An old response changed the current interaction');
    assert.equal(app.stateReads, readsBeforeResponse, 'An old response started a redundant state load');
    const board = app.document.getElementById('board');
    assert.equal(board.querySelector('[data-row="4"][data-col="2"]').getAttribute('aria-pressed'), 'true');
    assert.equal(board.querySelector('[data-row="4"][data-col="3"]').classList.contains('capture'), true);

    // The protected interaction must still complete through the real drop and
    // move functions; a blanket suppression of all responses would fail here.
    await app.evaluate('dropGamePiece([4, 2], [4, 3])');
    assert.equal(app.moves.length, 2);
    const after = app.snapshot();
    assert.equal(after.game.history.length, 3);
    assert.equal(after.game.board[4][3], 'N');
    assert.equal(after.game.board[4][4], '.');
    assert.equal(after.game.turn, 'elf');
    assert.equal(after.selected, null);
    assert.equal(after.gameBusy, false);
    assert.deepEqual(app.unexpected, []);
  });
}

test('A stalled periodic state request never overlaps another poll', {timeout:3000}, async()=>{
  const app=await makeHarness();
  app.holdState();
  const pending=app.poll();
  const reads=app.stateReads;
  await app.poll();await app.poll();
  assert.equal(app.stateReads,reads,'No duplicate polling during a network stall');
  app.releaseState();await pending;
  await app.poll();
  assert.equal(app.stateReads,reads+1,'Polling resumes when the response arrives');
  assert.deepEqual(app.unexpected,[]);
});
