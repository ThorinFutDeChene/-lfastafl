#!/usr/bin/env node
'use strict';

/* Run with Playwright and its Chromium installed. No real games or UFW changes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results', 'tutorial-ui');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'alfastafl-tutorial-ui-'));
const dataFolder = path.join(temporary, 'parties');
const python = process.env.TUTORIAL_TEST_PYTHON || 'python3';
const environment = {
  ...process.env,
  PYTHONPATH: [path.join(root, 'src'), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
};
fs.mkdirSync(output, {recursive: true});

const report = {started_at: new Date().toISOString(), scenarios: [], solved: [], screenshots: []};
let server;
let serverError = '';
let browser;
let page;
let timedOut = false;

function within(promise, milliseconds, description) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timeout: ' + description)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

async function scenario(name, action) {
  const started = Date.now();
  try {
    await action();
    report.scenarios.push({name, status: 'passed', milliseconds: Date.now() - started});
    console.log('PASS ' + name);
  } catch (error) {
    report.scenarios.push({name, status: 'failed', milliseconds: Date.now() - started, error: error.message});
    throw error;
  }
}

function startServer() {
  const code = `
import json, signal, sys
from alfastafl.server import Store, run
store = Store(sys.argv[1])
server = run('127.0.0.1', 0, store)
def interrupt(*_):
    raise KeyboardInterrupt
signal.signal(signal.SIGTERM, interrupt)
print(json.dumps({'port': server.server_address[1]}), flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    store.shutdown()
    server.server_close()
`;
  server = spawn(python, ['-u', '-c', code, dataFolder], {
    cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', chunk => { serverError = (serverError + chunk.toString()).slice(-8000); });
  return within(new Promise((resolve, reject) => {
    let text = '';
    const onError = error => reject(error);
    const onExit = code => reject(new Error(`Python server exited (${code}): ${serverError}`));
    const onData = chunk => {
      text += chunk.toString();
      if (!text.includes('\n')) return;
      try {
        const ready = JSON.parse(text.slice(0, text.indexOf('\n')));
        assert(Number.isInteger(ready.port) && ready.port > 0, 'Invalid server port');
        server.stdout.off('data', onData);
        server.off('error', onError);
        server.off('exit', onExit);
        resolve('http://127.0.0.1:' + ready.port);
      } catch (error) { reject(error); }
    };
    server.once('error', onError);
    server.once('exit', onExit);
    server.stdout.on('data', onData);
  }), 15000, 'start ephemeral Python server');
}

function readSolutions() {
  const result = spawnSync(python, ['-c',
    'import json; from alfastafl.tutorial import SOLUTIONS; print(json.dumps(SOLUTIONS))'],
  {cwd: root, env: environment, encoding: 'utf8', timeout: 10000});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  const solutions = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(solutions).sort(), ['copenhagen', 'fetlar', 'historical']);
  assert.equal(Object.values(solutions).reduce((sum, lessons) => sum + Object.keys(lessons).length, 0), 28);
  return solutions;
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise(resolve => server.once('exit', resolve));
  server.kill('SIGTERM');
  try { await within(exited, 4000, 'stop Python server'); }
  catch (_) {
    server.kill('SIGKILL');
    await within(exited, 2000, 'kill Python server').catch(() => {});
  }
}

const watchdog = setTimeout(() => {
  timedOut = true;
  console.error('Tutorial browser tests exceeded their four-minute deadline.');
  if (browser) browser.close().catch(() => {});
  if (server) server.kill('SIGTERM');
}, 240000);

async function main() {
  const solutions = readSolutions();
  const base = await startServer();
  browser = await chromium.launch({headless: true, timeout: 30000});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  await context.addInitScript(() => {
    window.__tutorialStorageWrites = [];
    for (const name of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[name];
      Storage.prototype[name] = function (...args) {
        window.__tutorialStorageWrites.push({method: name, key: args[0] || null});
        return original.apply(this, args);
      };
    }
  });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(15000);
  const pageErrors = [];
  const createCalls = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  context.on('request', request => {
    if (new URL(request.url()).pathname === '/api/create') createCalls.push(request.url());
  });
  await page.goto(base, {waitUntil: 'domcontentloaded'});
  await page.locator('#tutorial-open').waitFor({state: 'visible'});
  await page.selectOption('#game-board-mode', '2d');

  const square = position => page.locator(`#tutorial-board button[data-row="${position[0]}"][data-col="${position[1]}"]`);
  const responseFor = (endpoint, method = 'GET', predicate = () => true) =>
    page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/' + endpoint && response.request().method() === method && predicate(url);
    });
  const ready = () => page.waitForFunction(() => {
    const panel = document.getElementById('tutorial-panel');
    return panel.open && panel.getAttribute('aria-busy') === 'false' &&
      document.querySelectorAll('#tutorial-board button').length === 121;
  });
  const boardPosition = () => page.locator('#tutorial-board button').evaluateAll(squares => {
    const position = Array.from({length: 11}, () => Array(11).fill('.'));
    for (const button of squares) {
      const piece = button.querySelector('.piece');
      position[Number(button.dataset.row)][Number(button.dataset.col)] = piece
        ? ['N', 'E', 'R'].find(name => piece.classList.contains(name)) : '.';
    }
    return position;
  });
  async function close() {
    if (await page.locator('#tutorial-panel').evaluate(dialog => dialog.open)) {
      await page.locator('#tutorial-close').click();
      await page.waitForFunction(() => !document.getElementById('tutorial-panel').open);
    }
  }
  async function open(mode) {
    await close();
    await page.selectOption('#mode', mode);
    const loading = responseFor('tutorial', 'GET', url => url.searchParams.get('mode') === mode);
    await page.locator('#tutorial-open').click();
    const response = await loading;
    assert.equal(response.status(), 200);
    const state = (await response.json()).tutorial;
    await ready();
    await page.selectOption('#tutorial-board-mode', '2d');
    assert.equal(state.mode, mode);
    assert.equal(await page.locator('#tutorial-mode-label').textContent(), state.mode_label);
    return state;
  }
  async function lesson(id) {
    if (await page.locator('#tutorial-lessons').inputValue() === id) {
      await ready();
      return;
    }
    const loading = responseFor('tutorial', 'GET', url => url.searchParams.get('lesson') === id);
    await page.selectOption('#tutorial-lessons', id);
    assert.equal((await loading).status(), 200);
    await ready();
    assert.equal(await page.locator('#tutorial-lessons').inputValue(), id);
  }
  async function move(from, to) {
    const selecting = responseFor('tutorial/legal');
    await square(from).click();
    const legalResponse = await selecting;
    assert.equal(legalResponse.status(), 200);
    await page.waitForFunction(position => {
      const square = document.querySelector(`#tutorial-board button[data-row="${position[0]}"][data-col="${position[1]}"]`);
      return square && square.getAttribute('aria-pressed') === 'true' && !square.disabled;
    }, from);
    const moving = responseFor('tutorial/move', 'POST');
    await square(to).click();
    const response = await moving;
    assert.equal(response.status(), 200);
    const state = (await response.json()).tutorial;
    await ready();
    await page.waitForFunction(kind => document.getElementById('tutorial-feedback').dataset.kind === kind,
      state.feedback_kind);
    assert.deepEqual(await boardPosition(), state.board);
    return state;
  }

  await scenario('Host entry, selected variant and 121 accessible squares', async () => {
    assert.equal(await page.locator('#create').evaluate(button => button.nextElementSibling.id), 'tutorial-open');
    const state = await open('historical');
    assert.equal(await page.locator('#tutorial-board button').count(), 121);
    assert.equal(await page.locator('#tutorial-progress').textContent(), `Exercice 1 / ${state.lesson_count}`);
    assert.match(await square([0, 0]).getAttribute('aria-label'), /A11/);
  });

  await scenario('Every lesson solution in all three variants', async () => {
    for (const [mode, lessons] of Object.entries(solutions)) {
      await open(mode);
      for (const [id, [from, to]] of Object.entries(lessons)) {
        await lesson(id);
        const result = await move(from, to);
        assert.equal(result.completed, true, mode + '/' + id);
        assert.equal(result.feedback_kind, 'success', mode + '/' + id);
        assert.equal(await page.locator('#tutorial-board button:enabled').count(), 0);
        report.solved.push({mode, lesson: id});
      }
    }
    assert.equal(report.solved.length, 28);
  });

  await scenario('Illegal diagonal and legal off-target moves preserve the position', async () => {
    await open('historical');
    await lesson('movement');
    const initial = await boardPosition();
    const diagonal = await move([4, 2], [3, 3]);
    assert.equal(diagonal.completed, false);
    assert.equal(diagonal.feedback_kind, 'error');
    assert.match(diagonal.feedback, /diagonale/);
    assert.deepEqual(await boardPosition(), initial);
    const offTarget = await move([4, 2], [4, 3]);
    assert.equal(offTarget.completed, false);
    assert.equal(offTarget.feedback_kind, 'info');
    assert.match(offTarget.feedback, /légal/);
    assert.deepEqual(await boardPosition(), initial);
  });

  await scenario('Hint, restart, previous and next controls', async () => {
    await page.locator('#tutorial-hint').click();
    assert.equal(await page.locator('#tutorial-hint').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#tutorial-hint-text').isVisible(), true);
    assert((await page.locator('#tutorial-hint-text').textContent()).length > 10);
    await move(...solutions.historical.movement);
    const reset = responseFor('tutorial');
    await page.locator('#tutorial-retry').click();
    assert.equal((await reset).status(), 200);
    await ready();
    assert.equal(await page.locator('#tutorial-feedback').getAttribute('data-kind'), 'info');
    assert.equal(await page.locator('#tutorial-hint-text').isVisible(), false);
    assert.equal(await page.locator('#tutorial-board button:enabled').count(), 121);
    const previous = responseFor('tutorial');
    await page.locator('#tutorial-prev').click();
    await previous;
    await ready();
    assert.equal(await page.locator('#tutorial-lessons').inputValue(), 'first_move');
    const next = responseFor('tutorial');
    await page.locator('#tutorial-next').click();
    await next;
    await ready();
    assert.equal(await page.locator('#tutorial-lessons').inputValue(), 'movement');
  });

  await scenario('Desktop and smaller-window screenshots without horizontal overflow', async () => {
    await lesson('capture');
    const selecting = responseFor('tutorial/legal');
    await square(solutions.historical.capture[0]).click();
    await selecting;
    await ready();
    await page.waitForFunction(() => document.querySelectorAll('#tutorial-board .legal').length > 0);
    await page.locator('#tutorial-panel').evaluate(dialog => { dialog.scrollTop = 0; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    const desktopScreenshot = path.join(output, 'tutorial-desktop.png');
    await page.screenshot({path: desktopScreenshot});
    report.screenshots.push(path.relative(root, desktopScreenshot));
    await page.setViewportSize({width: 1024, height: 768});
    await page.locator('#tutorial-panel').evaluate(dialog => { dialog.scrollTop = 0; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.equal(await page.evaluate(() => {
      const dialog = document.getElementById('tutorial-panel');
      return document.documentElement.scrollWidth <= innerWidth + 1 && dialog.scrollWidth <= dialog.clientWidth + 1;
    }), true, 'The tutorial must not overflow horizontally.');
    const smallScreenshot = path.join(output, 'tutorial-small-window.png');
    await page.screenshot({path: smallScreenshot});
    report.screenshots.push(path.relative(root, smallScreenshot));
    await page.setViewportSize({width: 1440, height: 1000});
  });

  await scenario('Escape closes the panel and reopening starts a fresh exercise', async () => {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('tutorial-panel').open);
    assert.equal(await page.locator('#tutorial-open').evaluate(button => document.activeElement === button), true);
    await open('fetlar');
    assert.equal(await page.locator('#tutorial-lessons').inputValue(), 'first_move');
    assert.equal(await page.locator('#tutorial-board button:enabled').count(), 121);
  });

  await scenario('Synchronous close and reopen survives the previous close event', async () => {
    const reloaded = responseFor('tutorial', 'GET', url => url.searchParams.get('mode') === 'fetlar');
    await page.evaluate(() => {
      document.getElementById('tutorial-close').click();
      document.getElementById('tutorial-open').click();
    });
    assert.equal((await reloaded).status(), 200);
    await ready();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.equal(await page.locator('#tutorial-board button:enabled').count(), 121);
    const result = await move(...solutions.fetlar.first_move);
    assert.equal(result.completed, true);
  });

  await scenario('An initial API failure can be retried', async () => {
    await close();
    let aborted = false;
    const matcher = '**/api/tutorial?*';
    const handler = async route => {
      if (!aborted) { aborted = true; await route.abort('failed'); }
      else await route.continue();
    };
    await page.route(matcher, handler);
    try {
      await page.locator('#tutorial-open').click();
      await page.waitForFunction(() => document.getElementById('tutorial-feedback').dataset.kind === 'error' &&
        !document.getElementById('tutorial-retry').disabled);
      assert.equal(await page.locator('#tutorial-board button').count(), 0);
      const retried = responseFor('tutorial');
      await page.locator('#tutorial-retry').click();
      assert.equal((await retried).status(), 200);
      await ready();
      assert.equal(await page.locator('#tutorial-board button').count(), 121);
    } finally { await page.unroute(matcher, handler); }
  });

  await scenario('A late response cannot replace a reopened tutorial', async () => {
    await close();
    await page.selectOption('#mode', 'historical');
    const entered = deferred();
    const release = deferred();
    const delivered = deferred();
    const matcher = '**/api/tutorial?*';
    let held = false;
    const handler = async route => {
      if (!held && new URL(route.request().url()).searchParams.get('mode') === 'historical') {
        held = true;
        entered.resolve();
        try {
          await within(release.promise, 15000, 'release delayed tutorial response');
          const response = await context.request.get(route.request().url());
          await route.fulfill({response});
        } finally { delivered.resolve(); }
      } else await route.continue();
    };
    await page.route(matcher, handler);
    try {
      await page.locator('#tutorial-open').click();
      await within(entered.promise, 10000, 'capture delayed tutorial request');
      await close();
      const currentState = await open('copenhagen');
      const oldResponse = responseFor('tutorial', 'GET', url => url.searchParams.get('mode') === 'historical');
      release.resolve();
      await within(delivered.promise, 10000, 'deliver delayed tutorial request');
      const response = await oldResponse;
      await response.finished();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator('#tutorial-mode-label').textContent(), currentState.mode_label);
      assert.equal(await page.locator('#tutorial-lessons option').count(), 10);
      assert.equal(await page.locator('#tutorial-progress').textContent(), 'Exercice 1 / 10');
      assert.equal(await page.locator('#tutorial-board button:enabled').count(), 121);
    } finally {
      release.resolve();
      await page.unroute(matcher, handler);
    }
  });

  await scenario('Guests have no tutorial controls', async () => {
    const guestContext = await browser.newContext({viewport: {width: 1280, height: 800}});
    const guestTutorialCalls = [];
    try {
      // Proxy an artificial origin to the loopback server, without opening any
      // public listener. This checks the guest UI; Python tests check real auth.
      await guestContext.route('**/*', async route => {
        const requested = new URL(route.request().url());
        if (requested.hostname !== 'guest.test') return route.abort();
        if (requested.pathname.startsWith('/api/tutorial')) guestTutorialCalls.push(requested.pathname);
        const response = await guestContext.request.get(base + requested.pathname + requested.search);
        await route.fulfill({response});
      });
      const guest = await guestContext.newPage();
      guest.setDefaultTimeout(10000);
      await guest.goto('http://guest.test/', {waitUntil: 'load', timeout: 15000});
      await guest.waitForFunction(() => !document.getElementById('tutorial-open') && !document.getElementById('tutorial-panel'));
      assert.equal(await guest.locator('#host').isVisible(), false);
      assert.equal(await guest.locator('#tutorial-open').count(), 0);
      assert.equal(await guest.locator('#tutorial-panel').count(), 0);
      assert.deepEqual(guestTutorialCalls, []);
    } finally {
      // Wait for in-flight route callbacks before disposing the separate
      // guest API context. Otherwise Chromium can abort a late static-module
      // proxy request (e.g. escape-motion.js) during cleanup and make an
      // otherwise successful tutorial run intermittently fail.
      await guestContext.unrouteAll({behavior: 'wait'});
      await guestContext.close();
    }
  });

  await scenario('Tutorial leaves games, LAN access and browser storage unchanged', async () => {
    assert.deepEqual(createCalls, []);
    assert.deepEqual(await page.evaluate(() => window.__tutorialStorageWrites), []);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    const games = await context.request.get(base + '/api/games');
    assert.equal(games.status(), 200);
    assert.deepEqual((await games.json()).games, []);
    const address = await context.request.get(base + '/api/address');
    assert.equal(address.status(), 200);
    assert.equal((await address.json()).lan_enabled, false);
    assert.deepEqual(fs.readdirSync(dataFolder), []);
    assert.deepEqual(pageErrors, []);
  });
  report.status = 'passed';
  report.total_solutions = report.solved.length;
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
    if (page && !page.isClosed()) {
      await within(page.screenshot({path: path.join(output, 'failure.png')}), 5000, 'failure screenshot').catch(() => {});
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
