"""Exercise the local tutorial API and reject requests from non-host peers."""
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest

from alfastafl import tutorial
from alfastafl.server import Store, run


class TutorialHTTPTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = Store(self.folder.name)
        self.server = run('127.0.0.1', 0, self.store)
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=5)
        self.folder.cleanup()

    def request(self, path, data=None, visitor=False, raw=None):
        # 127.0.0.2 is a real TCP peer address rejected by AppHandler.admin().
        # Spoofing the HTTP Host / forwarded headers must not grant host access.
        client = http.client.HTTPConnection(
            '127.0.0.1', self.server.server_port, timeout=5,
            source_address=('127.0.0.2' if visitor else '127.0.0.1', 0))
        body = raw if raw is not None else (json.dumps(data) if data is not None else None)
        try:
            client.request('POST' if body is not None else 'GET', '/api/' + path,
                           body=body, headers={'Content-Type': 'application/json',
                                              'Host': '127.0.0.1',
                                              'X-Forwarded-For': '127.0.0.1'})
            response = client.getresponse()
            return response.status, json.loads(response.read())
        finally:
            client.close()

    def test_host_can_practise_all_variants_without_lan_or_saved_games(self):
        self.assertFalse(self.server.lan_enabled)
        for mode in ('historical', 'fetlar', 'copenhagen'):
            with self.subTest(mode=mode):
                code, result = self.request('tutorial?mode=' + mode)
                self.assertEqual(code, 200, result)
                state = result['tutorial']
                self.assertEqual(state['mode'], mode)
                self.assertFalse(state['completed'])
                self.assertGreaterEqual(state['lesson_count'], 7)
                lesson = state['lesson']
                start, end = tutorial.SOLUTIONS[mode][lesson]
                code, legal = self.request(
                    f'tutorial/legal?mode={mode}&lesson={lesson}&row={start[0]}&col={start[1]}')
                self.assertEqual(code, 200, legal)
                self.assertIn(list(end), legal['moves'])
                code, reply = self.request('tutorial/move', {
                    'mode': mode, 'lesson': lesson, 'from': start, 'to': end})
                self.assertEqual(code, 200, reply)
                self.assertTrue(reply['tutorial']['completed'])
                _, reset = self.request(f'tutorial?mode={mode}&lesson={lesson}')
                self.assertEqual(reset['tutorial']['board'], state['board'])
                self.assertFalse(reset['tutorial']['completed'])
        self.assertEqual(self.store.games, {})
        self.assertEqual(self.store.invites, {})
        self.assertEqual(self.store.sessions, {})
        self.assertEqual(self.store.pending, {})
        self.assertEqual(list(Path(self.folder.name).iterdir()), [])
        self.assertFalse(self.server.lan_enabled)

    def test_visitors_cannot_read_or_play_tutorial_despite_spoofed_headers(self):
        for path, data in (
            ('tutorial?mode=fetlar', None),
            ('tutorial/legal?mode=fetlar&lesson=movement&row=4&col=4', None),
            ('tutorial/move', {'mode': 'fetlar', 'lesson': 'movement',
                               'from': [4, 4], 'to': [4, 3]}),
        ):
            with self.subTest(path=path):
                code, reply = self.request(path, data, visitor=True)
                self.assertEqual(code, 403, reply)
                self.assertIn('hôte', reply['error'])
                self.assertNotIn('tutorial', reply)

    def test_guest_authorization_checked_before_parsing_tutorial_payload(self):
        code, reply = self.request('tutorial/move', visitor=True, raw='not-json')
        self.assertEqual(code, 403, reply)

    def test_invalid_parameters_return_400_without_changing_real_games(self):
        game = self.store.create('fetlar')
        game.status = 'paused'
        self.store.save(game)
        before = game.as_dict()
        saved = {path.name: path.read_bytes() for path in Path(self.folder.name).iterdir()}
        for path, data in (
            ('tutorial?mode=invalid', None),
            ('tutorial?mode=fetlar&lesson=does-not-exist', None),
            ('tutorial/legal?row=eleven&col=0', None),
            ('tutorial/legal?row=11&col=0', None),
            ('tutorial/move', []),
            ('tutorial/move', {'mode': 'fetlar', 'lesson': 'movement',
                               'from': [True, 2], 'to': [2, 2]}),
            ('tutorial/move', {'mode': 'fetlar', 'lesson': 'movement',
                               'from': [-1, 2], 'to': [2, 2]}),
        ):
            with self.subTest(path=path, data=data):
                code, reply = self.request(path, data)
                self.assertEqual(code, 400, reply)
                self.assertIn('error', reply)
        self.assertEqual(game.as_dict(), before)
        self.assertEqual({path.name: path.read_bytes() for path in Path(self.folder.name).iterdir()}, saved)

    def test_successful_exercise_does_not_touch_existing_games(self):
        game = self.store.create('copenhagen')
        game.status = 'paused'
        self.store.save(game)
        before = json.dumps(game.as_dict(), sort_keys=True)
        invitation = dict(self.store.invites[game.id])
        path = Path(self.folder.name) / (game.id + '.alfastafl')
        saved = path.read_bytes()
        start, end = tutorial.SOLUTIONS['fetlar']['capture']
        code, reply = self.request('tutorial/move', {
            'mode': 'fetlar', 'lesson': 'capture', 'from': start, 'to': end})
        self.assertEqual(code, 200, reply)
        self.assertTrue(reply['tutorial']['completed'])
        self.assertEqual(json.dumps(game.as_dict(), sort_keys=True), before)
        self.assertEqual(self.store.invites[game.id], invitation)
        self.assertEqual(path.read_bytes(), saved)


if __name__ == '__main__':
    unittest.main()
