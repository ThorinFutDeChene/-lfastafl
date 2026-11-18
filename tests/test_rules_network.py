"""HTTP rules authority and negotiated endings."""
import json
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from alfastafl.core import ELF, DWARF, KING
from alfastafl.server import Store, run


class RulesNetworkTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = Store(self.folder.name)
        self.srv = run('127.0.0.1', 0, self.store)
        self.port = self.srv.server_address[1]
        self.worker = threading.Thread(target=self.srv.serve_forever, daemon=True)
        self.worker.start()

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        self.worker.join(timeout=5)
        self.folder.cleanup()

    def api(self, path, data=None):
        payload = json.dumps(data).encode() if data is not None else None
        req = Request('http://127.0.0.1:%d/api/%s' % (self.port, path),
                      data=payload,
                      headers={'Content-Type': 'application/json'} if payload else {})
        try:
            with urlopen(req) as response:
                return response.status, json.loads(response.read())
        except HTTPError as exc:
            return exc.code, json.loads(exc.read())

    def joined(self, game, camp):
        invitation = self.store.invites[game.id]['player']
        _, reply = self.api('join', {'game': game.id, 'invite': invitation, 'name': camp})
        _, approved = self.api('approve', {'request': reply['request'], 'camp': camp})
        return approved['session']

    def test_legal_api_only_authorized_player(self):
        game = self.store.create()
        dwarf = self.joined(game, 'dwarf')
        elf = self.joined(game, 'elf')
        _, valid = self.api('legal?game=%s&session=%s&row=0&col=3' % (game.id, dwarf))
        self.assertIn([1, 3], valid['moves'])
        _, invalid = self.api('legal?game=%s&session=%s&row=0&col=3' % (game.id, elf))
        self.assertEqual(invalid['moves'], [])
        code, result = self.api('legal?game=%s&session=wrong&row=0&col=3' % game.id)
        self.assertEqual(code, 403)
        self.assertIn('error', result)

    def test_illegal_move_returns_error_and_preserves_game(self):
        game = self.store.create()
        dwarf = self.joined(game, 'dwarf')
        before = game.as_dict()
        code, reply = self.api('move', {'game': game.id, 'session': dwarf,
                                        'from': [0, 3], 'to': [8, 3]})
        self.assertEqual(code, 400)
        self.assertIn('error', reply)
        self.assertEqual(game.as_dict(), before)

    def test_spectator_cannot_vote_or_propose_draw(self):
        game = self.store.create()
        invite = self.store.invites[game.id]['spectator']
        _, request = self.api('join', {'game': game.id, 'invite': invite, 'name': 'Observer'})
        _, approved = self.api('approve', {'request': request['request']})
        sid = approved['session']
        for route, request in (
            ('draw/offer', {'game': game.id, 'session': sid}),
            ('resign', {'game': game.id, 'session': sid}),
            ('repetition/vote', {'game': game.id, 'session': sid, 'outcome': 'draw'}),
        ):
            status, _ = self.api(route, request)
            self.assertEqual(status, 403)

    def test_draw_requires_opponents_consent(self):
        game = self.store.create()
        elf = self.joined(game, 'elf')
        dwarf = self.joined(game, 'dwarf')
        code, _ = self.api('draw/offer', {'game': game.id, 'session': elf})
        self.assertEqual(code, 200)
        self.assertEqual(game.draw_offer, 'elf')
        code, _ = self.api('draw/respond', {'game': game.id, 'session': elf, 'accept': True})
        self.assertEqual(code, 400)
        code, _ = self.api('draw/respond', {'game': game.id, 'session': dwarf, 'accept': False})
        self.assertEqual(code, 200)
        self.assertEqual(game.status, 'active')
        self.assertIsNone(game.draw_offer)
        self.api('draw/offer', {'game': game.id, 'session': dwarf})
        code, _ = self.api('draw/respond', {'game': game.id, 'session': elf, 'accept': True})
        self.assertEqual(code, 200)
        self.assertEqual(game.status, 'finished')
        self.assertEqual(game.reason, 'draw_agreed')
        self.assertIsNone(game.winner)

    def test_resignation_is_authorized_and_saved(self):
        game = self.store.create()
        dwarf = self.joined(game, 'dwarf')
        status, _ = self.api('resign', {'game': game.id, 'session': dwarf})
        self.assertEqual(status, 200)
        self.assertEqual(game.winner, 'elf')
        clone = Store(self.folder.name).games[game.id]
        self.assertEqual(clone.reason, 'resignation')

    def test_historical_review_requires_both_votes(self):
        game = self.store.create('historical')
        elf = self.joined(game, 'elf')
        dwarf = self.joined(game, 'dwarf')
        game.status, game.reason = 'paused', 'repetition_review'
        game.history = [{'n': 1, 'from': [2, 2], 'to': [2, 3],
                         'piece': DWARF, 'captured': [], 'status': 'paused'}]
        game.positions = [game.signature(), game.signature()]
        code, reply = self.api('repetition/vote', {'game': game.id, 'session': elf, 'outcome': 'draw'})
        self.assertEqual(code, 200)
        self.assertEqual(reply['result'], 'waiting')
        self.assertEqual(game.status, 'paused')
        code, reply = self.api('repetition/vote', {'game': game.id, 'session': dwarf, 'outcome': 'draw'})
        self.assertEqual(code, 200)
        self.assertEqual(reply['result'], 'agreed')
        self.assertEqual(game.status, 'finished')
        self.assertIsNone(game.winner)

    def test_repetition_cannot_be_bypassed_by_host_resume(self):
        game = self.store.create('historical')
        game.status, game.reason = 'paused', 'repetition_review'
        code, _ = self.api('resume', {'game': game.id})
        self.assertEqual(code, 400)
        self.assertEqual(game.reason, 'repetition_review')

    def test_repeated_disagreement_undoes_and_bans_move(self):
        game = self.store.create('historical')
        dwarf = self.joined(game, 'dwarf')
        game.board = [['.'] * 11 for _ in range(11)]
        game.board[5][5] = KING
        game.board[2][2] = DWARF
        game.turn = 'dwarf'
        game.positions = [game.signature()]
        game.move([2, 2], [2, 3])
        game.status, game.reason = 'paused', 'repetition_review'
        code, result = self.api('repetition/vote', {'game': game.id, 'session': dwarf,
                                                    'outcome': 'disagree'})
        self.assertEqual(code, 200)
        self.assertEqual(result['result'], 'undo')
        self.assertEqual(game.status, 'active')
        self.assertNotIn([2, 3], game.legal((2, 2)))


if __name__ == '__main__':
    unittest.main()
