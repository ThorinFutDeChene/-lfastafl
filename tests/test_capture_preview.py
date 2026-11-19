"""Capturing-square hints use the authoritative rules without mutating games."""
import copy
import json
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from alfastafl.core import Game
from alfastafl.server import Store, run
from alfastafl import tutorial


def exercise_game(mode, lesson):
    state = tutorial.lesson_state(mode, lesson)
    return Game(mode=mode, board=state['board'], turn=state['camp'])


class CapturePreviewTests(unittest.TestCase):
    def test_reference_capture_and_non_capture_solutions_in_all_variants(self):
        capture_lessons = {'capture', 'hostile_square', 'king_capture', 'shieldwall'}
        for mode, lessons in tutorial.SOLUTIONS.items():
            for lesson, (start, end) in lessons.items():
                with self.subTest(mode=mode, lesson=lesson):
                    game = exercise_game(mode, lesson)
                    before = copy.deepcopy(game.as_dict())
                    captures = game.capture_destinations(start)
                    self.assertEqual(list(end) in captures, lesson in capture_lessons)
                    self.assertTrue(all(p in game.legal(start) for p in captures))
                    self.assertEqual(game.as_dict(), before)
                    details = tutorial.legal_details(mode, lesson, start)
                    self.assertEqual(details['captures'], captures)
                    self.assertEqual(details['moves'], game.legal(start))

    def test_king_capture_is_red_even_without_an_ordinary_removed_piece(self):
        for mode in tutorial.SOLUTIONS:
            game = exercise_game(mode, 'king_capture')
            start, end = tutorial.SOLUTIONS[mode]['king_capture']
            self.assertIn(list(end), game.capture_destinations(start))
            event = game.move(start, end)
            self.assertEqual(event['reason'], 'king_captured')
            self.assertEqual(event['captured'], [])

    def test_preview_preserves_history_clocks_and_forbidden_moves(self):
        game = exercise_game('historical', 'capture')
        start, end = tutorial.SOLUTIONS['historical']['capture']
        game.history = [{'n': 12, 'note': ['unchanged']}]
        game.clock = {'remaining': {'elf': 30, 'dwarf': 45}, 'started': True}
        game.players = {'elf': {'name': 'Player'}}
        game.events = [{'type': 'reconnected'}]
        game.forbidden = {'position': game.signature(), 'from': list(start), 'to': list(end)}
        before = copy.deepcopy(game.as_dict())
        self.assertNotIn(list(end), game.capture_destinations(start))
        self.assertEqual(game.as_dict(), before)
        # A caller cannot insert an illegal destination or revive a forbidden one.
        self.assertEqual(game.capture_destinations(start, [list(end), [-1, 0]]), [])
        self.assertEqual(game.as_dict(), before)

    def test_no_hint_for_wrong_camp_invalid_square_or_inactive_game(self):
        game = exercise_game('fetlar', 'capture')
        self.assertEqual(game.capture_destinations([4, 4]), [])
        self.assertEqual(game.capture_destinations([True, 2]), [])
        game.status = 'paused'
        self.assertEqual(game.capture_destinations([4, 2]), [])


class CapturePreviewHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        cls.store = Store(cls.folder.name)
        cls.server = run('127.0.0.1', 0, cls.store)
        cls.worker = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.worker.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.worker.join(timeout=5)
        cls.folder.cleanup()

    def api(self, path):
        req = Request('http://127.0.0.1:%d/api/%s' % (self.server.server_port, path))
        try:
            with urlopen(req) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())

    def player(self, game, camp=None):
        role = 'player' if camp else 'spectator'
        request = self.store.request(game.id, self.store.invites[game.id][role], role)
        return self.store.approve(request, camp)

    def test_game_legal_response_is_authorized_and_read_only(self):
        game = self.store.create('fetlar')
        state = tutorial.lesson_state('fetlar', 'capture')
        game.board = state['board']
        game.positions = [game.signature()]
        dwarf, elf = self.player(game, 'dwarf'), self.player(game, 'elf')
        spectator = self.player(game)
        self.store.save(game)
        before = copy.deepcopy(game.as_dict())
        saved = {p.name: p.read_bytes() for p in self.store.path.iterdir()}
        path = 'legal?game=%s&row=4&col=2&session=' % game.id
        code, response = self.api(path + dwarf)
        self.assertEqual(code, 200, response)
        self.assertIn([4, 3], response['captures'])
        self.assertTrue(all(p in response['moves'] for p in response['captures']))
        self.assertEqual(game.as_dict(), before)
        self.assertEqual({p.name: p.read_bytes() for p in self.store.path.iterdir()}, saved)
        code, response = self.api(path + elf)
        self.assertEqual(code, 200)
        self.assertEqual(response, {'moves': [], 'captures': []})
        for session in (spectator, 'invalid'):
            code, response = self.api(path + session)
            self.assertEqual(code, 403, response)

    def test_tutorial_legal_response_includes_red_capture_and_gold_escape(self):
        for mode in tutorial.SOLUTIONS:
            for lesson, expected in (('king_capture', True), ('escape', False)):
                start, end = tutorial.SOLUTIONS[mode][lesson]
                code, response = self.api(
                    'tutorial/legal?mode=%s&lesson=%s&row=%s&col=%s'
                    % (mode, lesson, start[0], start[1]))
                self.assertEqual(code, 200, response)
                self.assertEqual(list(end) in response['captures'], expected)


if __name__ == '__main__':
    unittest.main()
