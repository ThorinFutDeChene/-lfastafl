"""QR spectators are direct read-only clients, outside the host/player count."""
import tempfile
import unittest

from alfastafl.server import Store


class SpectatorQuotaTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.now=1000.0
        self.store=Store(self.temp.name,clock_source=lambda:self.now)
        self.game=self.store.create()
        self.spectator_invite=self.store.invites[self.game.id]['spectator']
        self.player_invite=self.store.invites[self.game.id]['player']

    def tearDown(self):
        self.temp.cleanup()

    def watch(self,previous=None):
        return self.store.join(self.game.id,self.spectator_invite,'',previous)

    def test_ten_spectators_plus_two_players_and_host(self):
        self.store.seat_host(self.game.id,'dwarf')
        requested=self.store.join(self.game.id,self.player_invite,'Player')
        self.assertEqual(requested['status'],'pending')
        self.store.approve(requested['request'],'elf')
        spectators=[self.watch()['session'] for _ in range(10)]
        self.assertEqual(len(set(spectators)),10)
        self.assertEqual(self.store.spectator_stats(),{'connected':10,'limit':10})
        self.assertEqual(len([r for r in self.store.pending.values()
                              if r['role']=='spectator']),0)
        with self.assertRaises(PermissionError):
            self.watch()
        self.assertEqual(self.store.join(self.game.id,self.spectator_invite,'',
                                         spectators[0])['session'],spectators[0])
        for sid in spectators:
            self.assertEqual(self.store.sessions[sid]['camp'],None)
            self.assertEqual(self.store.sessions[sid]['role'],'spectator')
            with self.assertRaises(PermissionError):
                self.store.move(self.game.id,sid,[0,3],[1,3])

    def test_setting_zero_and_idle_renewal_enforces_limit(self):
        self.assertEqual(self.store.set_spectator_limit(1)['limit'],1)
        first=self.watch()['session']
        self.now+=46
        second=self.watch()['session']
        self.assertNotEqual(first,second)
        self.assertEqual(self.store.spectator_stats()['connected'],1)
        with self.assertRaises(PermissionError):
            self.watch(first)
        self.assertIsNone(self.store.touch(self.game.id,first))
        self.store.set_spectator_limit(0)
        self.assertEqual(self.store.spectator_stats()['connected'],1)
        with self.assertRaises(PermissionError):
            self.watch()
        self.assertEqual(self.store.touch(self.game.id,second)['role'],'spectator')

    def test_invalid_settings(self):
        for value in (-1,101,True,'10',None,1.5):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    self.store.set_spectator_limit(value)

    def test_player_never_uses_spectator_invite(self):
        request=self.store.join(self.game.id,self.player_invite,'Alice')
        self.assertEqual(request['role'],'player')
        self.assertEqual(request['status'],'pending')
        self.assertEqual(self.store.spectator_stats()['connected'],0)
        with self.assertRaises(PermissionError):
            self.store.request(self.game.id,self.spectator_invite,'Nobody')


if __name__=='__main__':
    unittest.main()
