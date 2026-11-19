#!/usr/bin/env node
'use strict';

/* Real Chromium/WebGL integration checks. All game data and listeners are local
 * and temporary; this script never enables LAN access or changes the firewall. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results', 'board3d');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'alfastafl-board3d-'));
const python = process.env.BOARD3D_TEST_PYTHON || process.env.TUTORIAL_TEST_PYTHON || 'python3';
const environment = {
  ...process.env,
  PYTHONPATH: [path.join(root, 'src'), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
};
fs.mkdirSync(output, {recursive: true});

const report = {started_at: new Date().toISOString(), scenarios: [], screenshots: [],
  solved: [], limitations: [], unexpected_requests: [], javascript_errors: [], console_errors: []};
const assetResponses = new Map();
let server;
let serverError = '';
let browser;
let failurePage;
let base;
let fixture;
let timedOut = false;

function within(promise, milliseconds, description) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timeout: ' + description)), milliseconds);
  })]).finally(() => clearTimeout(timer));
}

async function scenario(name, action) {
  const started = Date.now();
  try {
    const result = await action();
    const status = result && result.skip ? 'skipped' : 'passed';
    report.scenarios.push({name, status, milliseconds: Date.now() - started,
      ...(result && result.skip ? {reason: result.skip} : {})});
    console.log((status === 'passed' ? 'PASS ' : 'SKIP ') + name);
  } catch (error) {
    report.scenarios.push({name, status: 'failed', milliseconds: Date.now() - started, error: error.message});
    throw error;
  }
}

async function startServer() {
  const code = `
import json, signal, sys
from alfastafl.server import Store, run
store = Store(sys.argv[1])
game = store.create('fetlar', {'time_control': {'mode': 'unlimited'}, 'disconnect_grace_seconds': 60})
sessions = {}
for camp in ('dwarf', 'elf'):
    request = store.request(game.id, store.invites[game.id]['player'], '3D ' + camp)
    sessions[camp] = store.approve(request, camp)
request = store.request(game.id, store.invites[game.id]['spectator'], '3D spectator')
sessions['spectator'] = store.approve(request)
# Dedicated tiny legal capture, with a timed 8-second cinematic.
from alfastafl.core import EMPTY
battle = store.create('fetlar', {'time_control': {'mode':'move', 'seconds':40},
    'capture_cinematic_seconds':12})
battle.board = [[EMPTY]*11 for _ in range(11)]
for row,col,piece in [(5,1,'N'),(5,4,'E'),(5,5,'N'),(8,8,'R')]:
    battle.board[row][col] = piece
battle.positions=[battle.signature()]
store.save(battle)
battle_sessions={}
for camp in ('dwarf', 'elf'):
    request=store.request(battle.id,store.invites[battle.id]['player'],'cinema '+camp)
    battle_sessions[camp]=store.approve(request,camp)
request=store.request(battle.id,store.invites[battle.id]['spectator'],'cinema viewer')
battle_sessions['spectator']=store.approve(request)
server = run('127.0.0.1', 0, store)
def interrupt(*_):
    raise KeyboardInterrupt
signal.signal(signal.SIGTERM, interrupt)
print(json.dumps({'port': server.server_address[1], 'game': game.id, 'sessions': sessions,
    'battle': {'game':battle.id, 'sessions':battle_sessions}}), flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    store.shutdown()
    server.server_close()
`;
  server = spawn(python, ['-u', '-c', code, path.join(temporary, 'parties')], {
    cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', chunk => { serverError = (serverError + chunk.toString()).slice(-8000); });
  const ready = await within(new Promise((resolve, reject) => {
    let text = '';
    const onError = error => reject(error);
    const onExit = code => reject(new Error(`Python server exited (${code}): ${serverError}`));
    const onData = chunk => {
      text += chunk.toString();
      if (!text.includes('\n')) return;
      try {
        const data = JSON.parse(text.slice(0, text.indexOf('\n')));
        assert(Number.isInteger(data.port) && data.port > 0);
        assert(data.game && data.sessions.dwarf && data.sessions.elf && data.sessions.spectator);
        server.stdout.off('data', onData);
        server.off('error', onError);
        server.off('exit', onExit);
        resolve(data);
      } catch (error) { reject(error); }
    };
    server.once('error', onError);
    server.once('exit', onExit);
    server.stdout.on('data', onData);
  }), 15000, 'start ephemeral game server');
  base = 'http://127.0.0.1:' + ready.port;
  fixture = ready;
}

function solutions() {
  const result = spawnSync(python, ['-c',
    'import json; from alfastafl.tutorial import SOLUTIONS; print(json.dumps(SOLUTIONS))'],
  {cwd: root, env: environment, encoding: 'utf8', timeout: 10000});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const stopped = new Promise(resolve => server.once('exit', resolve));
  server.kill('SIGTERM');
  try { await within(stopped, 4000, 'stop Python server'); }
  catch (_) {
    server.kill('SIGKILL');
    await within(stopped, 2000, 'kill Python server').catch(() => {});
  }
}

async function makeContext(options = {}, {blockedWebGL = false, guest = false} = {}) {
  const context = await browser.newContext({viewport: {width: 1440, height: 1100}, ...options});
  if (blockedWebGL) {
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (name, ...args) {
        if (['webgl', 'webgl2', 'experimental-webgl'].includes(String(name))) return null;
        return original.call(this, name, ...args);
      };
    });
  }
  // A missing browser favicon is unrelated to application shaders or modules;
  // satisfy that browser-generated request without suppressing console errors.
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const local = url.origin === base;
    const proxiedGuest = guest && url.hostname === 'guest.test';
    if (!local && !proxiedGuest && !['data:', 'blob:'].includes(url.protocol)) {
      report.unexpected_requests.push(url.origin + url.pathname);
      return route.abort('blockedbyclient');
    }
    if (url.pathname === '/favicon.ico') return route.fulfill({status: 204, body: ''});
    if (proxiedGuest) {
      try {
        const response = await context.request.fetch(base + url.pathname + url.search, {
          method: request.method(), data: request.postDataBuffer() || undefined,
          headers: request.headers()['content-type'] ? {'content-type': request.headers()['content-type']} : undefined,
        });
        // Materialize bytes before fulfilling the response: the API request
        // context can disappear while a guest tab is being closed. Avoid
        // referring to a disposed APIResponse after its context closes.
        const status = response.status();
        const headers = response.headers();
        const body = await response.body();
        return await route.fulfill({status, headers, body});
      } catch (error) {
        // A route aborted by a closing guest page is not an application error.
        // For a still-live page aborting causes its awaited fetch to fail, so
        // unexpected proxy failures remain visible to the integration test.
        try { await route.abort('failed'); } catch (_) { /* Closed page. */ }
        return;
      }
    }
    return route.continue();
  });
  context.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/vendor/') ||
      ['/board3d.js', '/figurines3d.js', '/board-view.js', '/move3d.js', '/cinematic3d.js',
       '/soundscape.js'].includes(url.pathname)) {
      assetResponses.set(url.pathname, response.status());
    }
  });
  context.on('page', page => {
    page.setDefaultTimeout(12000);
    page.setDefaultNavigationTimeout(18000);
    page.on('pageerror', error => report.javascript_errors.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const text = message.text();
      const expectedBlocked = blockedWebGL && /Error creating WebGL context|WebGL(2)? is not supported|Failed to create WebGL(2)? context/i.test(text);
      // Context loss is deliberately exercised once. Shader/linking errors and
      // unrelated errors are never hidden by this expected-message allowance.
      const expectedLoss = /^THREE\.WebGLRenderer: Context Lost\.?$/i.test(text);
      if (!expectedBlocked && !expectedLoss) report.console_errors.push(text);
    });
  });
  return context;
}

async function ready3D(page, prefix = 'game', pieces = null) {
  await page.bringToFront();
  await page.waitForFunction(({prefix, pieces}) => {
    const wrapper = document.getElementById(prefix + '-board-view');
    const host = document.getElementById(prefix + '-board-3d');
    const renderer = host && host.board3d;
    if (!wrapper || wrapper.dataset.state !== 'ready' || wrapper.dataset.view !== '3d' ||
        !renderer || host.hidden) return false;
    const data = renderer.getDiagnostics();
    return data.renderer === 'webgl2' && data.active && data.renders > 0 &&
      data.resolution.width > 0 && data.resolution.height > 0 &&
      (pieces === null || data.pieceCount === pieces);
  }, {prefix, pieces});
}

async function diagnostics(page, prefix = 'game') {
  return page.evaluate(prefix => document.getElementById(prefix + '-board-3d').board3d.getDiagnostics(), prefix);
}

async function nextPaint(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function expectImmersiveGuest(page, role) {
  await page.waitForFunction(role => document.body.classList.contains('guest-board-only') &&
    document.body.dataset.guestRole === role, role);
  assert.equal(await page.locator('#host').isVisible(), false);
  assert.equal(await page.locator('#join').isVisible(), false);
  assert.equal(await page.locator('main > header').isVisible(), false);
  assert.equal(await page.locator('#moves').isVisible(), false);
  assert.equal(await page.locator('#game-board-view .board-legend').isVisible(), false);
  assert.equal(await page.locator('#guest-menu-toggle').isVisible(), true);
  assert.equal(await page.locator('#game-board-view .board-tools').isVisible(), false);
  assert.equal(await page.locator('#player-controls').isVisible(), false);
  const geometry = await page.evaluate(() => {
    const box = document.getElementById('game-board-3d').getBoundingClientRect();
    return {x: box.x, y: box.y, width: box.width, height: box.height,
      vw: document.documentElement.clientWidth, vh: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth + 1};
  });
  assert(Math.abs(geometry.x) <= 1 && Math.abs(geometry.y) <= 1 &&
    Math.abs(geometry.width - geometry.vw) <= 2 &&
    Math.abs(geometry.height - geometry.vh) <= 2, JSON.stringify(geometry));
  assert.equal(geometry.overflow, false, 'Immersive board must have no horizontal overflow');
}

async function squarePoint(page, prefix, position, height = 0.15) {
  await page.locator('#' + prefix + '-board-3d canvas').scrollIntoViewIfNeeded();
  const point = await page.evaluate(({prefix, position, height}) => {
    const result = document.getElementById(prefix + '-board-3d').board3d.projectSquare(...position, height);
    return {...result, viewportWidth: innerWidth, viewportHeight: innerHeight};
  }, {prefix, position, height});
  assert(point && point.visible, `Square ${prefix} ${position} is not in the camera view`);
  assert(point.x > 0 && point.x < point.viewportWidth && point.y > 0 && point.y < point.viewportHeight,
    `Square ${prefix} ${position} lies outside the browser viewport: ${JSON.stringify(point)}`);
  return point;
}

function responseFor(page, endpoint, method = 'GET', predicate = () => true) {
  const pending = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/' + endpoint && response.request().method() === method && predicate(url);
  });
  // If a click fails before its waiter is awaited, page cleanup should not
  // produce an unrelated unhandled-rejection error that masks the first one.
  pending.catch(() => {});
  return pending;
}

async function tutorialReady(page) {
  await page.waitForFunction(() => {
    const panel = document.getElementById('tutorial-panel');
    return panel.open && panel.getAttribute('aria-busy') === 'false' &&
      document.querySelectorAll('#tutorial-board button').length === 121;
  });
}

async function closeTutorial(page) {
  if (await page.locator('#tutorial-panel').evaluate(panel => panel.open)) {
    await page.locator('#tutorial-close').click();
    await page.waitForFunction(() => !document.getElementById('tutorial-panel').open);
  }
}

async function openTutorial(page, mode, lesson = null) {
  await closeTutorial(page);
  await page.selectOption('#mode', mode);
  const loaded = responseFor(page, 'tutorial', 'GET', url => url.searchParams.get('mode') === mode);
  await page.locator('#tutorial-open').click();
  assert.equal((await loaded).status(), 200);
  await tutorialReady(page);
  if (lesson) await chooseLesson(page, lesson);
  await ready3D(page, 'tutorial');
  await page.locator('#tutorial-camera-top').click();
  await nextPaint(page);
}

async function chooseLesson(page, id) {
  if (await page.locator('#tutorial-lessons').inputValue() === id) return tutorialReady(page);
  const loaded = responseFor(page, 'tutorial', 'GET', url => url.searchParams.get('lesson') === id);
  await page.selectOption('#tutorial-lessons', id);
  assert.equal((await loaded).status(), 200);
  await tutorialReady(page);
}

async function select3D(page, prefix, from, tap = false) {
  const endpoint = prefix === 'tutorial' ? 'tutorial/legal' : 'legal';
  const pending = responseFor(page, endpoint);
  const point = await squarePoint(page, prefix, from, 0.7);
  if (tap) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  const response = await pending;
  assert.equal(response.status(), 200);
  const legal = await response.json();
  await page.waitForFunction(({prefix, from}) => {
    const view = document.getElementById(prefix + '-board-view').boardView;
    const d = document.getElementById(prefix + '-board-3d').board3d.getDiagnostics();
    return d.selected && d.selected[0] === from[0] && d.selected[1] === from[1] && !view.state.disabled;
  }, {prefix, from});
  await nextPaint(page);
  return legal;
}

async function clickMove(page, prefix, from, to, tap = false) {
  await select3D(page, prefix, from, tap);
  const pending = responseFor(page, prefix === 'tutorial' ? 'tutorial/move' : 'move', 'POST');
  const point = await squarePoint(page, prefix, to);
  if (tap) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  const response = await pending;
  assert.equal(response.status(), 200);
  const data = await response.json();
  if (prefix === 'tutorial') {
    await tutorialReady(page);
    await page.waitForFunction(kind => document.getElementById('tutorial-feedback').dataset.kind === kind,
      data.tutorial.feedback_kind);
  } else {
    await page.waitForFunction(n => document.querySelectorAll('#moves li').length === n, data.event.n);
  }
  await nextPaint(page);
  return data;
}

async function dragMove(page, from, to) {
  const source = await squarePoint(page, 'tutorial', from, 0.7);
  const target = await squarePoint(page, 'tutorial', to);
  const legal = responseFor(page, 'tutorial/legal');
  const moved = responseFor(page, 'tutorial/move', 'POST');
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(source.x + 12, source.y + 3, {steps: 3});
  assert.equal((await legal).status(), 200);
  await page.waitForFunction(() => document.getElementById('tutorial-panel').getAttribute('aria-busy') === 'false');
  await page.mouse.move(target.x, target.y, {steps: 10});
  await page.mouse.up();
  const response = await moved;
  assert.equal(response.status(), 200);
  const data = await response.json();
  await tutorialReady(page);
  await page.waitForFunction(kind => document.getElementById('tutorial-feedback').dataset.kind === kind,
    data.tutorial.feedback_kind);
  return data.tutorial;
}

async function capture(page, filename, locator = null) {
  const destination = path.join(output, filename);
  if (locator) await page.locator(locator).screenshot({path: destination});
  else await page.screenshot({path: destination});
  report.screenshots.push(path.relative(root, destination));
}

function cameraDistance(camera) {
  return Math.hypot(...camera.position.map((value, i) => value - camera.target[i]));
}

function sameCamera(a, b) {
  return ['position', 'target'].every(key => a[key].every((value, i) => Math.abs(value - b[key][i]) < 1e-7));
}

const watchdog = setTimeout(() => {
  timedOut = true;
  console.error('3D browser tests exceeded their four-minute deadline.');
  if (browser) browser.close().catch(() => {});
  if (server) server.kill('SIGTERM');
}, 240000);

async function main() {
  const expected = solutions();
  await startServer();
  browser = await chromium.launch({headless: true, timeout: 30000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const context = await makeContext();
  const created = await context.request.post(base + '/api/create', {data: {mode: 'fetlar'}});
  assert.equal(created.status(), 200);
  const hostGame = (await created.json()).game;
  const page = await context.newPage();
  failurePage = page;
  await page.goto(base + '/?game=' + encodeURIComponent(hostGame), {waitUntil: 'domcontentloaded'});

  await scenario('A local WebGL2 board displays 24 dwarves, 12 elves and their king', async () => {
    await ready3D(page, 'game', 37);
    const d = await diagnostics(page);
    assert.equal(d.threeRevision, '187');
    assert.equal(d.boardSize, 11);
    assert.deepEqual(d.pieces, {N: 24, E: 12, R: 1});
    assert(d.graphics.triangles > 50000, 'The board must contain real 3D meshes');
    assert.equal(await page.evaluate(() => {
      const gl = document.getElementById('game-board-3d').board3d.renderer.getContext();
      return gl instanceof WebGL2RenderingContext && /^WebGL 2/.test(gl.getParameter(gl.VERSION));
    }), true);
    await capture(page, 'board-perspective.png', '#game-board-view');
    report.initial_renderer = d;
  });

  await scenario('Camera orbit, zoom, top view, reset and adaptive quality work independently', async () => {
    await page.locator('#game-board-3d canvas').scrollIntoViewIfNeeded();
    const initial = (await diagnostics(page)).camera;
    const bounds = await page.locator('#game-board-3d canvas').boundingBox();
    await page.mouse.move(bounds.x + 14, bounds.y + 25);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 114, bounds.y + 62, {steps: 8});
    await page.mouse.up();
    await nextPaint(page);
    assert(!sameCamera(initial, (await diagnostics(page)).camera), 'Dragging the background must orbit');
    const orbited = (await diagnostics(page)).camera;
    await page.locator('#game-camera-zoom-in').click();
    await nextPaint(page);
    assert(cameraDistance((await diagnostics(page)).camera) < cameraDistance(orbited));
    await page.locator('#game-camera-top').click();
    await nextPaint(page);
    const top = (await diagnostics(page)).camera;
    assert(Math.abs(top.position[0] - top.target[0]) < 0.001);
    assert(top.position[1] - top.target[1] > 15);
    assert(Math.abs(top.position[2] - top.target[2]) < 0.5);
    for (const quality of ['eco', 'high', 'standard']) {
      await page.selectOption('#game-board-quality', quality);
      await page.waitForFunction(quality => document.getElementById('game-board-3d').board3d.getDiagnostics().quality === quality, quality);
      const ratio = (await diagnostics(page)).resolution.pixelRatio;
      assert(ratio > 0 && ratio <= (quality === 'eco' ? 1 : quality === 'standard' ? 1.5 : 2));
    }
    await page.locator('#game-camera-reset').click();
    await nextPaint(page);
    assert(sameCamera(initial, (await diagnostics(page)).camera), 'Reset must restore the initial view');
    await page.locator('#game-camera-top').click();
    const beforeUpdate = (await diagnostics(page)).camera;
    const paused = await context.request.post(base + '/api/pause', {data: {game: hostGame}});
    assert.equal(paused.status(), 200);
    await page.waitForFunction(() => document.getElementById('state').textContent.includes('paused'));
    assert(sameCamera(beforeUpdate, (await diagnostics(page)).camera), 'A server state refresh must not reset the camera');
    await page.locator('#game-camera-reset').click();
  });

  await scenario('An authorized player makes a real server-validated move by clicking 3D', async () => {
    // Real guest origin, not loopback: the host must keep its management UI.
    const playerContext = await makeContext({}, {guest: true});
    try {
      const player = await playerContext.newPage();
      failurePage = player;
      await player.goto('http://guest.test/?game=' + encodeURIComponent(fixture.game) + '&session=' + encodeURIComponent(fixture.sessions.dwarf),
        {waitUntil: 'domcontentloaded'});
      await ready3D(player, 'game', 37);
      await expectImmersiveGuest(player, 'player');
      await player.locator('#guest-menu-toggle').click();
      assert.equal(await player.locator('#game-board-view .board-tools').isVisible(), true);
      assert.equal(await player.locator('#player-controls').isVisible(), true);
      await player.locator('#game-camera-top').click();
      await player.locator('#guest-menu-toggle').click();
      await nextPaint(player);
      const [from, to] = expected.fetlar.first_move;
      const answer = await clickMove(player, 'game', from, to);
      assert.deepEqual(answer.event.from, from);
      assert.deepEqual(answer.event.to, to);
      const state = await context.request.get(base + '/api/state?game=' + encodeURIComponent(fixture.game));
      const game = (await state.json()).game;
      assert.equal(game.history.length, 1);
      assert.equal(game.board[from[0]][from[1]], '.');
      assert.equal(game.board[to[0]][to[1]], 'N');
    } finally { await playerContext.close(); failurePage = page; }
  });

  await scenario('The host can create a 3D game as dwarf and play against a remote elf', async () => {
    const host = await context.newPage();
    try {
      failurePage = host;
      await host.goto(base, {waitUntil: 'domcontentloaded'});
      await host.selectOption('#mode', 'fetlar');
      await host.selectOption('#create-host-camp', 'dwarf');
      const creation = responseFor(host, 'create', 'POST');
      await host.locator('#create').click();
      const response = await creation;
      assert.equal(response.status(), 200);
      const created = await response.json();
      assert(created.game && created.host_session, 'Host needs a real server-issued player session');
      await ready3D(host, 'game', 37);
      await host.waitForFunction(id => document.getElementById('host-game-info').textContent.includes(id.slice(0, 8)),
        created.game);
      assert.equal(await host.locator('#host').isVisible(), true,
        'Host must retain LAN and administration controls');
      assert.equal(await host.locator('#join').isVisible(), true);
      assert.equal(await host.locator('#host-player-status').textContent(),
        'PC hôte : Nains');
      assert.equal(await host.locator('#player-controls').isVisible(), true);
      assert.equal(await host.locator('#host-play-elf').isDisabled(), false);
      assert.equal(await host.evaluate(() => document.body.classList.contains('guest-board-only')), false);
      const session = await host.evaluate(() => sessionStorage.getItem('alfastafl.session'));
      assert.equal(session, created.host_session);
      const state1 = await (await context.request.get(base + '/api/state?game=' + created.game +
        '&session=' + created.host_session)).json();
      assert.deepEqual(state1.you.role, 'player');
      assert.deepEqual(state1.you.camp, 'dwarf');
      assert.equal(state1.seats.dwarf.host, true);
      const request = await context.request.post(base + '/api/join', {data: {
        game: created.game, invite: created.invites.player, name: 'Elfe distant',
      }});
      assert.equal(request.status(), 200);
      const approved = await context.request.post(base + '/api/approve', {data: {
        request: (await request.json()).request, camp: 'elf',
      }});
      assert.equal(approved.status(), 200);
      const guest = await (await approved.json()).session;
      assert(guest);
      await host.locator('#game-camera-top').click();
      const [from, to] = expected.fetlar.first_move;
      const moved = await clickMove(host, 'game', from, to);
      assert.deepEqual(moved.event.from, from);
      assert.deepEqual(moved.event.to, to);
      const state2 = await (await context.request.get(base + '/api/state?game=' + created.game)).json();
      assert.equal(state2.game.history.length, 1);
      assert.equal(state2.game.turn, 'elf');
      assert.equal(state2.game.board[to[0]][to[1]], 'N');
      assert.equal(await host.locator('#host-watch').isDisabled(), true,
        'Host cannot unseat itself after making a move');
      const stranger = await context.request.post(base + '/api/host/seat', {
        data: {game: created.game, camp: 'elf'},
      });
      assert.equal(stranger.status(), 400, 'Host cannot steal a remotely occupied camp');
      await capture(host, 'host-playing-dwarves.png', '#game');
    } finally { await host.close(); failurePage = page; }
  });

  await scenario('The host may join an existing free camp and spectate again before play', async () => {
    const created = await context.request.post(base + '/api/create', {data: {mode: 'fetlar'}});
    assert.equal(created.status(), 200);
    const data = await created.json();
    const request = await context.request.post(base + '/api/join', {data: {
      game: data.game, invite: data.invites.player, name: 'Nain déjà présent',
    }});
    assert.equal(request.status(), 200);
    const approval = await context.request.post(base + '/api/approve', {
      data: {request: (await request.json()).request, camp: 'dwarf'},
    });
    assert.equal(approval.status(), 200);
    const host = await context.newPage();
    try {
      failurePage = host;
      await host.goto(base + '/?game=' + encodeURIComponent(data.game), {waitUntil: 'domcontentloaded'});
      await ready3D(host, 'game', 37);
      await host.waitForFunction(() => document.getElementById('host-player-status').textContent.includes('Nains'));
      assert.equal(await host.locator('#host-play-dwarf').isDisabled(), true,
        'Already seated guest must remain the only dwarf');
      assert.equal(await host.locator('#host-play-elf').isEnabled(), true);
      assert.equal(await host.locator('#player-controls').isVisible(), false);
      const seating = responseFor(host, 'host/seat', 'POST');
      await host.locator('#host-play-elf').click();
      assert.equal((await seating).status(), 200);
      await host.waitForFunction(() => document.getElementById('host-player-status').textContent.includes('PC hôte : Elfes'));
      assert.equal(await host.locator('#player-controls').isVisible(), true);
      const hostSession = await host.evaluate(() => sessionStorage.getItem('alfastafl.session'));
      assert(hostSession);
      await host.reload({waitUntil: 'domcontentloaded'});
      await ready3D(host, 'game', 37);
      await host.waitForFunction(() => document.getElementById('host-player-status').textContent.includes('PC hôte : Elfes'));
      assert.equal(await host.evaluate(() => sessionStorage.getItem('alfastafl.session')), hostSession);
      const withdrawing = responseFor(host, 'host/seat', 'POST');
      await host.locator('#host-watch').click();
      assert.equal((await withdrawing).status(), 200);
      await host.waitForFunction(() => document.getElementById('host-player-status').textContent.includes('PC hôte : Spectateur'));
      assert.equal(await host.locator('#player-controls').isVisible(), false);
      assert.equal(await host.evaluate(() => sessionStorage.getItem('alfastafl.session')), null);
      const state = await (await context.request.get(base + '/api/state?game=' + data.game)).json();
      assert.equal(state.seats.dwarf.host, false);
      assert.equal(state.seats.elf, undefined);
    } finally { await host.close(); failurePage = page; }
  });

  await scenario('Each rule variant is playable through actual 3D tutorial clicks', async () => {
    for (const mode of ['historical', 'fetlar', 'copenhagen']) {
      await openTutorial(page, mode, 'capture');
      assert.equal((await diagnostics(page, 'tutorial')).mode, mode);
      const answer = await clickMove(page, 'tutorial', ...expected[mode].capture);
      assert.equal(answer.tutorial.completed, true, mode);
      assert.equal(answer.tutorial.last_move.captured.length, 1, mode);
      await page.waitForFunction(() => document.getElementById('tutorial-board-3d')
        .board3d?.getDiagnostics().motion.key.startsWith('1:'));
      await page.waitForFunction(() => !document.getElementById('tutorial-board-3d')
        .board3d?.getDiagnostics().motion.active);
      assert.equal((await diagnostics(page, 'tutorial')).motion.progress, 1,
        'Even tutorial figures must move fluidly after a successful exercise');
      report.solved.push({mode, lesson: 'capture', input: 'mouse'});
    }
  });

  await scenario('Gold legal destinations and red capture destinations match the server', async () => {
    await openTutorial(page, 'fetlar', 'capture');
    const legal = await select3D(page, 'tutorial', expected.fetlar.capture[0]);
    assert(Array.isArray(legal.captures) && legal.captures.length > 0);
    assert(legal.moves.length > legal.captures.length);
    const d = await diagnostics(page, 'tutorial');
    assert.equal(d.legalCount, legal.moves.length);
    assert.equal(d.captureCount, legal.captures.length);
    await page.locator('#tutorial-camera-reset').click();
    await nextPaint(page);
    await capture(page, 'tutorial-capture.png');
    // A separate close view is an inspection of the actual game models. It
    // changes only the local camera, never the board or the rules.
    await page.evaluate(() => {
      const r = document.getElementById('tutorial-board-3d').board3d;
      r.controls.target.set(-0.45, 0.55, 0.15);
      r.camera.position.set(3.6, 5.9, 7.7);
      r.controls.update();
    });
    await nextPaint(page);
    await capture(page, 'figurines-closeup.png', '#tutorial-board-3d');
    await page.locator('#tutorial-camera-top').click();
  });

  await scenario('3D drag-and-drop validates a move and explains an illegal diagonal', async () => {
    await chooseLesson(page, 'movement');
    await nextPaint(page);
    const success = await dragMove(page, ...expected.fetlar.movement);
    assert.equal(success.completed, true);
    report.solved.push({mode: 'fetlar', lesson: 'movement', input: 'drag'});
    const reset = responseFor(page, 'tutorial');
    await page.locator('#tutorial-retry').click();
    assert.equal((await reset).status(), 200);
    await tutorialReady(page);
    const refused = await dragMove(page, [4, 2], [3, 3]);
    assert.equal(refused.completed, false);
    assert.equal(refused.feedback_kind, 'error');
    assert.match(refused.feedback, /diagonale/);
    assert.equal(refused.board[4][2], 'N');
    assert.equal(refused.board[3][3], '.');
  });

  await scenario('Dropping outside the canvas cancels even over a projected legal destination', async () => {
    const reset = responseFor(page, 'tutorial');
    await page.locator('#tutorial-retry').click();
    assert.equal((await reset).status(), 200);
    await tutorialReady(page);
    await ready3D(page, 'tutorial');
    await page.locator('#tutorial-board-3d canvas').scrollIntoViewIfNeeded();
    const [from, to] = expected.fetlar.movement;
    const initialBoard = await page.evaluate(() => document.getElementById('tutorial-board-view').boardView.state.board);
    const framing = await page.evaluate(({from, to}) => {
      const r = document.getElementById('tutorial-board-3d').board3d;
      const rect = r.canvas.getBoundingClientRect();
      const outsideX = rect.right + 18;
      // Look almost vertically down from the allowed minimum zoom distance.
      // Pan so the real, legal destination projects just beyond the canvas's
      // right edge, over the adjacent dialog content, while its source remains
      // visible. The former infinite-plane picking bug accepted exactly this.
      let low = -5;
      let high = 5;
      const centreZ = from[0] - 5;
      for (let iteration = 0; iteration < 28; iteration++) {
        const centreX = (low + high) / 2;
        r.controls.target.set(centreX, 0.12, centreZ);
        r.camera.position.set(centreX, 10.12, centreZ + 0.11);
        r.controls.update();
        const destination = r.projectSquare(...to, 0.12);
        if (destination.x > outsideX) low = centreX;
        else high = centreX;
      }
      return {
        source: r.projectSquare(...from, 0.7),
        destination: r.projectSquare(...to, 0.12),
        rect: {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom},
        viewport: {width: innerWidth, height: innerHeight},
      };
    }, {from, to});
    const {source, destination, rect, viewport} = framing;
    assert(source.visible && source.x > rect.left + 10 && source.x < rect.right - 10 &&
      source.y > rect.top + 10 && source.y < rect.bottom - 10, 'The drag must start on a visible figurine');
    assert(destination.x > rect.right + 12 && destination.x < rect.right + 24,
      'The legal destination must project outside the canvas, not onto a border');
    assert(destination.x < viewport.width - 1 && destination.y > 0 && destination.y < viewport.height - 1,
      'The release point must remain inside the browser viewport');
    await nextPaint(page);

    const moveRequests = [];
    const onRequest = request => {
      if (request.method() === 'POST' && ['/api/move', '/api/tutorial/move'].includes(new URL(request.url()).pathname)) {
        moveRequests.push(new URL(request.url()).pathname);
      }
    };
    page.on('request', onRequest);
    try {
      const legal = responseFor(page, 'tutorial/legal');
      await page.mouse.move(source.x, source.y);
      await page.mouse.down();
      await page.mouse.move(source.x + 12, source.y + 3, {steps: 3});
      const response = await legal;
      assert.equal(response.status(), 200);
      const moves = (await response.json()).moves;
      assert(moves.some(square => square[0] === to[0] && square[1] === to[1]),
        'Regression setup requires a server-approved destination outside the canvas');
      await tutorialReady(page);
      await page.mouse.move(destination.x, destination.y, {steps: 12});
      await page.mouse.up();
      // Drain input microtasks/rendering, then a local round trip. A pending
      // asynchronous onDrop cannot hide behind a same-tick request assertion.
      await nextPaint(page);
      await page.evaluate(async () => {
        const response = await fetch('/api/address');
        if (!response.ok) throw new Error('Local event-loop barrier failed');
        await response.json();
      });
      await nextPaint(page);
      assert.deepEqual(moveRequests, [], 'Releasing outside the canvas must not submit a move');
      const finalBoard = await page.evaluate(() => document.getElementById('tutorial-board-view').boardView.state.board);
      assert.deepEqual(finalBoard, initialBoard, 'An outside drop must preserve every square');
      assert.notEqual(await page.locator('#tutorial-feedback').getAttribute('data-kind'), 'success');
    } finally {
      await page.mouse.up().catch(() => {});
      page.off('request', onRequest);
      await page.locator('#tutorial-camera-reset').click();
    }
    report.outside_drop = {from, to, outside_pixels: destination.x - rect.right};
  });

  await scenario('Choosing 2D preserves the game and returning to 3D preserves its camera', async () => {
    await closeTutorial(page);
    await ready3D(page, 'game', 37);
    await page.locator('#game-camera-top').click();
    const original = (await diagnostics(page)).camera;
    await page.selectOption('#game-board-mode', '2d');
    assert.equal(await page.locator('#board').isVisible(), true);
    assert.equal(await page.locator('#board .piece').count(), 37);
    assert.equal(await page.locator('#game-board-3d').isVisible(), false);
    await page.selectOption('#game-board-mode', '3d');
    await ready3D(page, 'game', 37);
    assert(sameCamera(original, (await diagnostics(page)).camera));
  });

  await scenario('A lost WebGL context falls back to 2D and can be retried', async () => {
    const supported = await page.evaluate(() => {
      const r = document.getElementById('game-board-3d').board3d;
      const extension = r.renderer.getContext().getExtension('WEBGL_lose_context');
      if (!extension) return false;
      window.__lostBoardRenderer = r;
      extension.loseContext();
      return true;
    });
    if (!supported) {
      const reason = 'WEBGL_lose_context unavailable; automatic startup fallback is tested separately.';
      report.limitations.push(reason);
      return {skip: reason};
    }
    await page.waitForFunction(() => document.getElementById('game-board-view').dataset.state === 'fallback');
    assert.equal(await page.locator('#game-board-mode').inputValue(), '2d');
    assert.equal(await page.locator('#board').isVisible(), true);
    assert.equal(await page.locator('#board .piece').count(), 37);
    await page.selectOption('#game-board-mode', '3d');
    await ready3D(page, 'game', 37);
    assert.equal(await page.evaluate(() => document.getElementById('game-board-3d').board3d !== window.__lostBoardRenderer), true);
  });

  await scenario('A mobile touchscreen plays a tutorial move in the real 3D view', async () => {
    const mobileContext = await makeContext({viewport: {width: 390, height: 844},
      deviceScaleFactor: 1, isMobile: true, hasTouch: true});
    try {
      const mobile = await mobileContext.newPage();
      failurePage = mobile;
      await mobile.goto(base, {waitUntil: 'domcontentloaded'});
      await openTutorial(mobile, 'historical', 'movement');
      const result = await clickMove(mobile, 'tutorial', ...expected.historical.movement, true);
      assert.equal(result.tutorial.completed, true);
      report.solved.push({mode: 'historical', lesson: 'movement', input: 'touch'});
      assert.equal(await mobile.evaluate(() => {
        const panel = document.getElementById('tutorial-panel');
        return document.documentElement.scrollWidth <= innerWidth + 1 && panel.scrollWidth <= panel.clientWidth + 1;
      }), true, 'The small-screen tutorial must not overflow horizontally');
      await capture(mobile, 'board-mobile.png');
    } finally { await mobileContext.close(); failurePage = page; }
  });

  await scenario('A remote spectator sees the 3D board but cannot play or open the tutorial', async () => {
    const guestContext = await makeContext({}, {guest: true});
    const attemptedActions = [];
    guestContext.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (['/api/move', '/api/legal'].includes(pathname) || pathname.startsWith('/api/tutorial')) attemptedActions.push(pathname);
    });
    try {
      const guest = await guestContext.newPage();
      failurePage = guest;
      await guest.goto('http://guest.test/?game=' + encodeURIComponent(fixture.game) + '&session=' + encodeURIComponent(fixture.sessions.spectator),
        {waitUntil: 'domcontentloaded'});
      await ready3D(guest, 'game', 37);
      await expectImmersiveGuest(guest, 'spectator');
      assert.equal(await guest.locator('#tutorial-open').count(), 0);
      assert.equal(await guest.locator('#tutorial-panel').count(), 0);
      await guest.locator('#guest-menu-toggle').click();
      assert.equal(await guest.locator('#player-controls').isVisible(), false);
      await guest.locator('#game-camera-top').click();
      await guest.locator('#guest-menu-toggle').click();
      const from = await squarePoint(guest, 'game', [5, 4], 0.7);
      const to = await squarePoint(guest, 'game', [4, 4]);
      await guest.mouse.click(from.x, from.y);
      await guest.mouse.click(to.x, to.y);
      await guest.mouse.move(from.x, from.y);
      await guest.mouse.down();
      await guest.mouse.move(to.x, to.y, {steps: 8});
      await guest.mouse.up();
      await nextPaint(guest);
      assert.deepEqual(attemptedActions, []);
      const refused = await guestContext.request.post(base + '/api/move', {data: {
        game: fixture.game, session: fixture.sessions.spectator, from: [5, 4], to: [4, 4],
      }});
      assert.equal(refused.status(), 403);
      const state = await guestContext.request.get(base + '/api/state?game=' + encodeURIComponent(fixture.game));
      assert.equal((await state.json()).game.history.length, 1);
    } finally { await guestContext.close(); failurePage = page; }
  });

  await scenario('Approval changes a mobile or tablet guest to full-board mode, and revoked access restores joining', async () => {
    const created = await context.request.post(base + '/api/create', {data: {
      mode: 'fetlar', settings: {time_control: {mode: 'move', seconds: 60}},
    }});
    assert.equal(created.status(), 200);
    const {game: guestGame, invites} = await created.json();
    const mobileContext = await makeContext({viewport: {width: 390, height: 844},
      deviceScaleFactor: 1, isMobile: true, hasTouch: true}, {guest: true});
    try {
      const guest = await mobileContext.newPage();
      failurePage = guest;
      await guest.goto('http://guest.test/?game=' + encodeURIComponent(guestGame) +
        '&invite=' + encodeURIComponent(invites.spectator), {waitUntil: 'domcontentloaded'});
      await guest.waitForFunction(() => document.getElementById('gid').value !== '');
      assert.equal(await guest.locator('#join').isVisible(), true);
      assert.equal(await guest.locator('main > header').isVisible(), true);
      assert.equal(await guest.locator('#guest-menu-toggle').isVisible(), false);
      assert.equal(await guest.evaluate(() => document.body.classList.contains('guest-board-only')), false);
      await guest.locator('#name').fill('Spectateur mobile');
      const joining = responseFor(guest, 'join', 'POST');
      await guest.locator('#request').click();
      assert.equal((await joining).status(), 200);
      const pending = await context.request.get(base + '/api/pending');
      assert.equal(pending.status(), 200);
      const request = (await pending.json()).pending.find(x => x.game === guestGame && x.role === 'spectator');
      assert(request, 'Host must see the spectator waiting for approval');
      assert.equal(await guest.evaluate(() => document.body.classList.contains('guest-board-only')), false,
        'Sending a request must not enter game-only mode');
      const approved = await context.request.post(base + '/api/approve',
        {data: {request: request.id, camp: null}});
      assert.equal(approved.status(), 200);
      await ready3D(guest, 'game', 37);
      await expectImmersiveGuest(guest, 'spectator');
      assert.equal(await guest.locator('#clocks').isVisible(), true,
        'Timed games must keep the clocks overlaid on the board');
      await capture(guest, 'guest-approved-mobile.png');
      await guest.locator('#guest-menu-toggle').click();
      await guest.selectOption('#game-board-mode', '2d');
      assert.equal(await guest.locator('#board').isVisible(), true);
      await guest.locator('#guest-menu-toggle').click();
      assert.equal(await guest.locator('#game-board-view .board-tools').isVisible(), false);
      const flat = await guest.locator('#board').boundingBox();
      assert(flat && flat.x >= -1 && flat.y >= -1 &&
        flat.x + flat.width <= 391 && flat.y + flat.height <= 845,
        'Accessible 2D board must fit the phone display');
      await capture(guest, 'guest-approved-mobile-2d.png');
      await guest.reload({waitUntil: 'domcontentloaded'});
      await ready3D(guest, 'game', 37);
      await expectImmersiveGuest(guest, 'spectator');
      // Actual server-side revocation: host saves and closes this invitation.
      const revoked = await context.request.post(base + '/api/pause', {data: {game: guestGame}});
      assert.equal(revoked.status(), 200);
      await guest.reload({waitUntil: 'domcontentloaded'});
      await guest.waitForFunction(() => document.getElementById('join').hidden === false &&
        !document.body.classList.contains('guest-board-only') &&
        !localStorage.getItem('alfastafl.device.' + new URLSearchParams(location.search).get('game')));
      assert.equal(await guest.locator('#join').isVisible(), true);
      assert.equal(await guest.locator('#guest-menu-toggle').isVisible(), false);
      assert.equal(await guest.locator('#player-controls').isVisible(), false);
    } finally {
      await mobileContext.close(); failurePage = page;
    }
  });

  await scenario('When WebGL is unavailable the accessible 2D tutorial remains playable', async () => {
    const blockedContext = await makeContext({}, {blockedWebGL: true});
    try {
      const fallback = await blockedContext.newPage();
      failurePage = fallback;
      await fallback.goto(base + '/?game=' + encodeURIComponent(hostGame), {waitUntil: 'domcontentloaded'});
      await fallback.waitForFunction(() => document.getElementById('game-board-view').dataset.state === 'fallback' &&
        document.querySelectorAll('#board .piece').length === 37);
      assert.equal(await fallback.locator('#game-board-mode').inputValue(), '2d');
      await fallback.selectOption('#mode', 'historical');
      const loaded = responseFor(fallback, 'tutorial');
      await fallback.locator('#tutorial-open').click();
      await loaded;
      await tutorialReady(fallback);
      await fallback.waitForFunction(() => document.getElementById('tutorial-board-view').dataset.state === 'fallback');
      assert.equal(await fallback.locator('#tutorial-flat-board').isVisible(), true);
      const [from, to] = expected.historical.first_move;
      const legal = responseFor(fallback, 'tutorial/legal');
      await fallback.locator(`#tutorial-board button[data-row="${from[0]}"][data-col="${from[1]}"]`).click();
      await legal;
      await tutorialReady(fallback);
      const move = responseFor(fallback, 'tutorial/move', 'POST');
      await fallback.locator(`#tutorial-board button[data-row="${to[0]}"][data-col="${to[1]}"]`).click();
      const result = (await (await move).json()).tutorial;
      assert.equal(result.completed, true);
      await tutorialReady(fallback);
    } finally { await blockedContext.close(); failurePage = page; }
  });

  await scenario('Host can permanently delete a paused save but not an active game', async () => {
    const activeResult = await context.request.post(base + '/api/create', {data: {mode: 'fetlar'}});
    const pausedResult = await context.request.post(base + '/api/create', {data: {mode: 'historical'}});
    assert.equal(activeResult.status(), 200);
    assert.equal(pausedResult.status(), 200);
    const activeId = (await activeResult.json()).game;
    const pausedId = (await pausedResult.json()).game;
    assert.equal((await context.request.post(base + '/api/pause', {
      data: {game: pausedId},
    })).status(), 200);
    const pausedFile = path.join(temporary, 'parties', pausedId + '.alfastafl');
    assert(fs.existsSync(pausedFile), 'Paused save must exist before deletion');
    const manager = await context.newPage();
    try {
      failurePage = manager;
      await manager.goto(base + '/?game=' + encodeURIComponent(pausedId), {waitUntil: 'domcontentloaded'});
      const pausedEntry = manager.locator('#game-list .game-entry').filter({hasText: pausedId.slice(0, 8)});
      const activeEntry = manager.locator('#game-list .game-entry').filter({hasText: activeId.slice(0, 8)});
      await pausedEntry.waitFor();
      await activeEntry.waitFor();
      await manager.waitForFunction(() => document.getElementById('state').textContent.includes('paused'));
      assert.equal(await activeEntry.locator('.game-delete').isDisabled(), true,
        'The UI must refuse deleting active games');
      const denied = await context.request.post(base + '/api/delete', {data: {game: activeId}});
      assert.equal(denied.status(), 400, 'The server must refuse deleting an active game');
      assert.equal(await pausedEntry.locator('.game-delete').isEnabled(), true);
      const dialogs = [];
      manager.on('dialog', async dialog => {
        dialogs.push(dialog.message());
        if (dialogs.length === 1) await dialog.dismiss();
        else await dialog.accept();
      });
      await pausedEntry.locator('.game-delete').click();
      assert.equal(dialogs.length, 1);
      assert.match(dialogs[0], /définitivement/i);
      assert(fs.existsSync(pausedFile), 'Cancel must preserve the saved file');
      assert.equal(await pausedEntry.count(), 1);
      await pausedEntry.locator('.game-delete').click();
      await manager.waitForFunction(shortId =>
        !document.getElementById('game-list').textContent.includes(shortId) &&
        document.getElementById('state').textContent === 'Aucune partie sélectionnée',
        pausedId.slice(0, 8));
      assert.equal(dialogs.length, 2);
      assert(!fs.existsSync(pausedFile), 'Confirmed delete must remove the saved file');
      assert.equal(await manager.locator('#host-game-controls').isVisible(), false);
      assert.equal(await manager.locator('#clocks').isVisible(), false);
      assert.equal(await manager.locator('#invitations').isVisible(), false);
      assert.equal(await manager.evaluate(() => sessionStorage.getItem('alfastafl.game')), null);
      assert.equal((await context.request.get(base + '/api/state?game=' + pausedId)).status(), 404);
      const games = await (await context.request.get(base + '/api/games')).json();
      assert(!games.games.some(game => game.id === pausedId));
      assert(games.games.some(game => game.id === activeId), 'Other matches must remain intact');
      await capture(manager, 'host-saved-games-delete.png');
    } finally { await manager.close(); failurePage = page; }
  });

  await scenario('Magical-chess 3D capture shatters sculptures, pauses clock and can be skipped', async () => {
    const battle=fixture.battle;
    assert(battle.game && battle.sessions.dwarf && battle.sessions.elf && battle.sessions.spectator);
    const host=await context.newPage();
    const guestContext=await makeContext({}, {guest:true});
    let spectator;
    try {
      failurePage=host;
      await host.goto(base+'/?game='+encodeURIComponent(battle.game)+
        '&session='+encodeURIComponent(battle.sessions.dwarf),{waitUntil:'domcontentloaded'});
      await ready3D(host,'game',4);
      const originalCamera=(await diagnostics(host)).camera;
      assert.equal(await host.locator('#capture-overlay').isVisible(),false);
      const setup=await (await context.request.get(base+'/api/state?game='+battle.game+
        '&session='+encodeURIComponent(battle.sessions.elf))).json();
      assert.equal(setup.game.clock.started,true,'Both players must be present to start the clock');
      spectator=await guestContext.newPage();
      failurePage=spectator;
      await spectator.goto('http://guest.test/?game='+encodeURIComponent(battle.game)+
        '&session='+encodeURIComponent(battle.sessions.spectator),{waitUntil:'domcontentloaded'});
      await ready3D(spectator,'game',4);
      await expectImmersiveGuest(spectator,'spectator');
      const confirmed=await context.request.post(base+'/api/move',{data:{
        game:battle.game,session:battle.sessions.dwarf,
        'from':[5,1],'to':[5,3],
      }});
      assert.equal(confirmed.status(),200);
      const record=(await confirmed.json()).event;
      assert.deepEqual(record.captured,[[5,4,'E']]);
      const cut=await (await context.request.get(base+'/api/state?game='+battle.game)).json();
      assert.equal(cut.cinematic.duration,12);
      assert.equal(cut.game.clock.started,false,'Clock must be paused by server during combat');
      const refused=await context.request.post(base+'/api/move',{data:{
        game:battle.game,session:battle.sessions.elf,
        'from':[8,8],'to':[8,7],
      }});
      assert.equal(refused.status(),400,'No next move until cinematic window ends');
      await Promise.all([host,spectator].map(p=>p.waitForFunction(() =>
        document.getElementById('game-board-3d').board3d?.getDiagnostics().cinematic.active)));
      assert.equal(await host.locator('#capture-overlay').isVisible(),true);
      assert.equal(await spectator.locator('#capture-overlay').isVisible(),true);
      assert.equal(await spectator.locator('#host').isVisible(),false);
      const beforeCamera=await diagnostics(host);
      assert.equal(beforeCamera.cinematic.shardCount,12);
      // Observe actual visibility atomically in Chromium: separate Playwright
      // evaluations can straddle animation frames on slow software WebGL.
      const fragmentsHandle=await host.waitForFunction(() => {
        const animation=document.getElementById('game-board-3d').board3d?.captureCinematic;
        if(!animation?.active)return false;
        const shown=animation.actors.reduce((sum, actor)=>
          sum+actor.shards.filter(shard=>shard.visible).length,0);
        return shown>0 ? {shown,progress:animation.progress} : false;
      });
      const fragments=await fragmentsHandle.jsonValue();
      assert(fragments.shown>0,'Shattered sculpture must produce visible 3D fragments');
      assert(!sameCamera(originalCamera,(await diagnostics(host)).camera),
        'Cinematic must change the personal camera viewpoint');
      assert.equal(await host.locator('#audio-music').count(),1);
      assert.equal(await host.locator('#audio-effects').count(),1);
      assert.equal(await host.locator('#capture-skip').isVisible(),true);
      await host.locator('#capture-skip').click();
      await host.waitForFunction(() => !document.getElementById('game-board-3d').board3d
        ?.getDiagnostics().cinematic.active);
      assert.equal(await host.locator('#capture-overlay').isVisible(),false);
      assert.equal(await host.locator('#game-board-3d canvas').isVisible(),true);
      const restored=(await diagnostics(host));
      assert.equal(restored.pieceCount,3);
      assert(sameCamera(originalCamera,restored.camera),'Skipping must restore the exact camera view');
      await spectator.locator('#capture-skip').click();
      assert.equal(await spectator.locator('#capture-overlay').isVisible(),false);
    } finally {
      await guestContext.close();
      await host.close();
      failurePage=page;
    }
  });

  await scenario('An authorized host and remote spectator see the same smoothly animated move', async () => {
    const created=await context.request.post(base+'/api/create',{data:{
      mode:'fetlar',host_camp:'dwarf',settings:{time_control:{mode:'unlimited'}},
    }});
    assert.equal(created.status(),200);
    const data=await created.json();
    assert(data.host_session);
    const request=await context.request.post(base+'/api/join',{data:{
      game:data.game,invite:data.invites.spectator,name:'Public 3D',
    }});
    assert.equal(request.status(),200);
    const approved=await context.request.post(base+'/api/approve',{data:{
      request:(await request.json()).request,camp:null,
    }});
    assert.equal(approved.status(),200);
    const spectatorSession=(await approved.json()).session;
    const watcherContext=await makeContext({}, {guest:true});
    const host=await context.newPage();
    const spectator=await watcherContext.newPage();
    try{
      failurePage=host;
      await host.goto(base+'/?game='+encodeURIComponent(data.game)+
        '&session='+encodeURIComponent(data.host_session),{waitUntil:'domcontentloaded'});
      await ready3D(host,'game',37);
      await spectator.goto('http://guest.test/?game='+encodeURIComponent(data.game)+
        '&session='+encodeURIComponent(spectatorSession),{waitUntil:'domcontentloaded'});
      await ready3D(spectator,'game',37);
      await expectImmersiveGuest(spectator,'spectator');
      const initialCamera=(await diagnostics(host)).camera;
      const from=[0,3],to=[1,3];
      const move=await context.request.post(base+'/api/move',{data:{
        game:data.game,session:data.host_session,from,to,
      }});
      assert.equal(move.status(),200);
      const record=(await move.json()).event;
      assert.equal(record.n,1);
      await Promise.all([host.evaluate(()=>load()),spectator.evaluate(()=>load())]);
      await Promise.all([
        host.waitForFunction(()=>document.getElementById('game-board-3d')
          .board3d?.getDiagnostics().motion.active),
        spectator.waitForFunction(()=>document.getElementById('game-board-3d')
          .board3d?.getDiagnostics().motion.active),
      ]);
      const first=(await diagnostics(host)).motion;
      assert.deepEqual(first.from,from);
      assert.deepEqual(first.to,to);
      const position=await host.evaluate(()=>document.getElementById('game-board-3d')
        .board3d.moveAnimation.actor.position.z);
      assert(position>=-5.01&&position<-3.999,
        'A moved sculpture must travel from its original square: '+position);
      await host.waitForFunction(()=>!document.getElementById('game-board-3d')
        .board3d?.getDiagnostics().motion.active);
      await spectator.waitForFunction(()=>!document.getElementById('game-board-3d')
        .board3d?.getDiagnostics().motion.active);
      const final=await diagnostics(host);
      assert.equal(final.motion.progress,1);
      assert(sameCamera(final.camera,initialCamera),'Moving a figure must not move the camera');
      const figure=await host.evaluate(()=> {
        const board=document.getElementById('game-board-3d').board3d;
        const piece=board._visiblePieces.find(f=>f.userData.square?.[0]===1&&
          f.userData.square?.[1]===3);
        return piece&&{kind:piece.userData.piece,
          pos:[piece.position.x,piece.position.y,piece.position.z]};
      });
      assert.deepEqual(figure,{kind:'N',pos:[-2,.12,-4]});
      await host.evaluate(()=>load());
      assert.equal((await diagnostics(host)).motion.active,false,
        'Polling the same server snapshot must not replay a move');
      await host.emulateMedia({reducedMotion:'reduce'});
      const reduced=await host.evaluate(record=>document.getElementById('game-board-3d')
        .board3d.playMove(record),record);
      assert.equal(reduced,false,'Respect accessibility preferences for reduced motion');
      await host.emulateMedia({reducedMotion:'no-preference'});
      const repeated=await host.evaluate(record=>document.getElementById('game-board-3d')
        .board3d.playMove(record),record);
      assert.equal(repeated,true,'Animation remains reusable after a completed move');
      await host.selectOption('#game-board-mode','2d');
      assert.equal((await diagnostics(host)).motion.active,false,
        'Switching to accessible 2D must restore the exact final piece position');
      await host.selectOption('#game-board-mode','3d');
      await ready3D(host,'game',37);
      assert.deepEqual((await diagnostics(host)).camera,initialCamera);
      const history=(await (await context.request.get(base+'/api/state?game='+data.game)).json()).game.history;
      assert.equal(history.length,1,'The presentation must never emit a second server move');
      await capture(host,'host-fluid-movement.png','#game-board-view');
    }finally{
      await host.close();await watcherContext.close();failurePage=page;
    }
  });

  await scenario('Original offline soundtrack obeys user gestures, mute and independent sliders',async()=>{
    const listener=await context.newPage();
    try{
      failurePage=listener;
      await listener.goto(base+'/?game='+encodeURIComponent(hostGame),{waitUntil:'domcontentloaded'});
      await ready3D(listener,'game',37);
      assert.equal(await listener.locator('#audio-toggle').isVisible(),true);
      await listener.locator('#audio-toggle').click();
      await listener.waitForFunction(()=>soundscape.status().ready);
      const playing=await listener.evaluate(()=>soundscape.status());
      assert.equal(playing.available,true);
      assert.equal(playing.enabled,true);
      await listener.locator('#audio-music').evaluate(input=>{
        input.value='23';input.dispatchEvent(new Event('input',{bubbles:true}));
      });
      await listener.locator('#audio-effects').evaluate(input=>{
        input.value='67';input.dispatchEvent(new Event('input',{bubbles:true}));
      });
      const volumes=await listener.evaluate(()=>({
        music:soundscape.musicVolume,effects:soundscape.effectsVolume,
        storedMusic:localStorage.getItem('alfastafl.music-volume'),
        storedEffects:localStorage.getItem('alfastafl.effects-volume'),
      }));
      assert.equal(volumes.music,.23);
      assert.equal(volumes.effects,.67);
      assert.equal(volumes.storedMusic,'0.23');
      assert.equal(volumes.storedEffects,'0.67');
      await listener.locator('#audio-toggle').click();
      assert.equal(await listener.evaluate(()=>soundscape.enabled),false);
      assert.equal(await listener.evaluate(()=>soundscape.status().ready),true,
        'Muted audio context remains available for enabling later');
      await listener.reload({waitUntil:'domcontentloaded'});
      assert.equal(await listener.evaluate(()=>soundscape.enabled),false);
      assert.equal(await listener.locator('#audio-music').inputValue(),'23');
      assert.equal(await listener.locator('#audio-effects').inputValue(),'67');
    }finally{
      await listener.close();failurePage=page;
    }
  });

  await scenario('Modules stay local, LAN remains disabled and no JavaScript or shader errors occur', async () => {
    for (const asset of ['/board-view.js', '/board3d.js', '/figurines3d.js',
      '/move3d.js', '/cinematic3d.js', '/soundscape.js',
      '/vendor/three/three.module.js', '/vendor/three/three.core.js',
      '/vendor/three/OrbitControls.js', '/vendor/three/BufferGeometryUtils.js']) {
      assert.equal(assetResponses.get(asset), 200, asset);
    }
    assert.deepEqual(report.unexpected_requests, []);
    assert.deepEqual(report.javascript_errors, []);
    assert.deepEqual(report.console_errors, []);
    const address = await context.request.get(base + '/api/address');
    assert.equal(address.status(), 200);
    assert.equal((await address.json()).lan_enabled, false);
    const gameState = await context.request.get(base + '/api/state?game=' + encodeURIComponent(fixture.game));
    assert.equal((await gameState.json()).game.history.length, 1, 'Tutorials must not modify the multiplayer match');
    report.modules = [...assetResponses.keys()].sort();
  });
  report.status = 'passed';
}

(async () => {
  try {
    await main();
    if (timedOut) throw new Error('Global browser test deadline exceeded.');
  } catch (error) {
    report.status = 'failed';
    report.error = error.stack || String(error);
    if (serverError) report.server_stderr = serverError;
    console.error(report.error);
    process.exitCode = 1;
    if (failurePage && !failurePage.isClosed()) {
      await within(failurePage.screenshot({path: path.join(output, 'failure.png')}), 5000, 'failure screenshot').catch(() => {});
      report.page_state = await failurePage.evaluate(() => ({
        game: document.getElementById('game-board-view')?.dataset,
        tutorial: document.getElementById('tutorial-board-view')?.dataset,
        gameStatus: document.getElementById('game-board-status')?.textContent,
        tutorialStatus: document.getElementById('tutorial-board-status')?.textContent,
      })).catch(() => null);
    }
  } finally {
    if (browser) await within(browser.close(), 8000, 'close Chromium').catch(() => {});
    await stopServer();
    fs.rmSync(temporary, {recursive: true, force: true});
    clearTimeout(watchdog);
    report.finished_at = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
})();
