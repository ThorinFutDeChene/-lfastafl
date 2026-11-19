"""Deletion of saved games: persistence, session cleanup and host-only HTTP."""
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from alfastafl.server import AppHandler, Store, run


class SavedGameDeletionTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = Store(self.folder.name)

    def tearDown(self):
        self.folder.cleanup()

    def save_path(self, game):
        return Path(self.folder.name) / (game.id + '.alfastafl')

    def test_deleting_paused_save_removes_disk_state_and_all_access(self):
        game = self.store.create()
        invite = self.store.invites[game.id]['player']
        pending_id = self.store.request(game.id, invite, 'Invité')
        session = self.store.approve(pending_id, 'dwarf')
        other_request = self.store.request(game.id, invite, 'Deuxième')
        self.store.pause(game.id)
        self.assertTrue(self.save_path(game).exists())
        self.assertTrue(self.store.delete_game(game.id))
        self.assertFalse(self.save_path(game).exists())
        self.assertNotIn(game.id, self.store.games)
        self.assertNotIn(game.id, self.store.invites)
        self.assertNotIn(session, self.store.sessions)
        self.assertEqual(self.store.pending[pending_id]['status'], 'rejected')
        self.assertEqual(self.store.pending[other_request]['status'], 'rejected')
        self.assertIsNone(self.store.pending[pending_id]['session'])
        self.assertIsNone(self.store.pending[other_request]['session'])
        self.store.shutdown()
        self.assertNotIn(game.id, Store(self.folder.name).games)

    def test_unauthorized_active_deletion_is_blocked_even_if_ui_is_bypassed(self):
        game = self.store.create()
        before = self.save_path(game).read_bytes()
        with self.assertRaisesRegex(ValueError, 'Partie en cours'):
            self.store.delete_game(game.id)
        self.assertIn(game.id, self.store.games)
        self.assertEqual(before, self.save_path(game).read_bytes())
        self.assertIn(game.id, self.store.invites)

    def test_finished_game_may_be_deleted(self):
        game = self.store.create()
        game.status = 'finished'
        game.reason = 'test_finished'
        self.store.save(game)
        self.assertTrue(self.store.delete_game(game.id))
        self.assertFalse(self.save_path(game).exists())

    def test_missing_save_on_disk_still_clears_memory(self):
        game = self.store.create()
        self.store.pause(game.id)
        self.save_path(game).unlink()
        self.assertTrue(self.store.delete_game(game.id))
        self.assertNotIn(game.id, self.store.games)

    def test_io_error_keeps_game_and_session(self):
        game = self.store.create()
        invitation = self.store.invites[game.id]['spectator']
        request = self.store.request(game.id, invitation, 'Observer')
        session = self.store.approve(request)
        self.store.pause(game.id)
        with patch.object(Path, 'unlink', side_effect=PermissionError('read-only')):
            with self.assertRaises(PermissionError):
                self.store.delete_game(game.id)
        self.assertIn(game.id, self.store.games)
        self.assertTrue(self.save_path(game).exists())
        self.assertIn(session, self.store.sessions)

    def test_missing_game_does_not_affect_others(self):
        first = self.store.create()
        second = self.store.create()
        self.store.pause(first.id)
        self.store.pause(second.id)
        with self.assertRaises(KeyError):
            self.store.delete_game('00000000-0000-0000-0000-000000000000')
        self.assertTrue(self.store.delete_game(first.id))
        self.assertIn(second.id, self.store.games)
        self.assertTrue(self.save_path(second).exists())

    def test_tournament_match_cannot_be_deleted_from_history(self):
        game = self.store.create()
        self.store.pause(game.id)
        self.store.tournaments['test'] = {'matches': [{'game': game.id}]}
        with self.assertRaisesRegex(ValueError, 'tournoi'):
            self.store.delete_game(game.id)
        self.assertTrue(self.save_path(game).exists())


class SavedGameHttpTests(unittest.TestCase):
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

    def api(self, path, payload=None):
        body = None if payload is None else json.dumps(payload).encode('utf-8')
        request = Request(
            'http://127.0.0.1:%d/api/%s' % (self.server.server_address[1], path),
            data=body, headers={'Content-Type': 'application/json'} if body else {})
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, json.loads(response.read())
        except HTTPError as exc:
            return exc.code, json.loads(exc.read())

    def test_host_deletes_paused_game_from_ui_backend(self):
        game = self.store.create()
        self.store.pause(game.id)
        status, result = self.api('delete', {'game': game.id})
        self.assertEqual((status, result), (200, {'deleted': True}))
        self.assertEqual(self.api('state?game=' + game.id)[0], 404)
        self.assertEqual(self.api('games')[1]['games'], [])
        self.assertFalse((Path(self.folder.name) / (game.id + '.alfastafl')).exists())

    def test_active_game_is_refused_via_http(self):
        game = self.store.create()
        status, result = self.api('delete', {'game': game.id})
        self.assertEqual(status, 400)
        self.assertIn('Partie en cours', result['error'])
        self.assertIn(game.id, self.store.games)

    def test_remote_client_cannot_delete_even_with_game_id(self):
        game = self.store.create()
        self.store.pause(game.id)
        with patch.object(AppHandler, 'admin', return_value=False):
            status, result = self.api('delete', {'game': game.id})
        self.assertEqual(status, 403)
        self.assertIn('Host-only', result['error'])
        self.assertIn(game.id, self.store.games)

    def test_disk_error_returns_readable_failure_without_losing_game(self):
        game = self.store.create()
        self.store.pause(game.id)
        with patch.object(Path, 'unlink', side_effect=OSError('disk failure')):
            status, result = self.api('delete', {'game': game.id})
        self.assertEqual(status, 500)
        self.assertIn('disque', result['error'])
        self.assertIn(game.id, self.store.games)
        self.assertTrue((Path(self.folder.name) / (game.id + '.alfastafl')).exists())

    def test_pending_remote_request_gets_rejection_after_deletion(self):
        game = self.store.create()
        token = self.store.invites[game.id]['spectator']
        code, created = self.api('join', {'game': game.id, 'invite': token, 'name': 'Guest'})
        self.assertEqual(code, 200)
        self.store.pause(game.id)
        self.assertEqual(self.api('delete', {'game': game.id})[0], 200)
        code, result = self.api('request?id=' + created['request'])
        self.assertEqual(code, 200)
        self.assertEqual(result['status'], 'rejected')


if __name__ == '__main__':
    unittest.main()
