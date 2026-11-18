"""Server-authoritative clocks, disconnect grace, recovery, and access control."""
import json
import tempfile
import unittest
from pathlib import Path

from alfastafl.server import Store
from alfastafl.timecontrol import normalize_settings


class FakeTime:
    def __init__(self):
        self.monotonic_value = 1000.0
        self.unix_value = 2000000000.0

    def monotonic(self):
        return self.monotonic_value

    def unix(self):
        return self.unix_value

    def advance(self, seconds):
        self.monotonic_value += seconds
        self.unix_value += seconds


class TimedStoreTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.clock = FakeTime()
        self.store = Store(self.folder.name, self.clock.monotonic, self.clock.unix)

    def tearDown(self):
        self.folder.cleanup()

    def game(self, mode='total', seconds=60, timeout=30, grace=15):
        return self.store.create(settings={
            'time_control': {'mode': mode, 'seconds': seconds},
            'reconnect_timeout_seconds': timeout,
            'disconnect_grace_seconds': grace,
        })

    def join(self, game, camp='dwarf', role='player', name=None):
        req=self.store.request(game.id, self.store.invites[game.id][role], name or camp)
        return self.store.approve(req, camp if role=='player' else None)

    def connect(self, game):
        dwarf=self.join(game,'dwarf')
        elf=self.join(game,'elf')
        self.store.touch(game.id,dwarf)
        self.store.touch(game.id,elf)
        return dwarf,elf

    def keep_alive(self, game, *sids):
        for sid in sids:self.store.touch(game.id,sid)

    def disconnect_one(self, game, lost, here):
        # Keep one player present while the other misses the grace deadline.
        self.clock.advance(14)
        self.keep_alive(game,here)
        self.clock.advance(2)
        self.keep_alive(game,here)
        self.assertEqual(game.status,'paused')
        self.assertEqual(game.reason,'disconnected')

    def test_invalid_configuration_is_rejected_early(self):
        for config in ({'time_control': {'mode': 'total', 'seconds': 0}},
                       {'time_control': {'mode': 'move', 'seconds': True}},
                       {'time_control': {'mode': 'hacked', 'seconds': 60}},
                       {'time_control': {'mode': 'total', 'seconds': 2.5}},
                       {'reconnect_timeout_seconds': -1},
                       {'disconnect_grace_seconds': 0}):
            with self.subTest(config=config), self.assertRaises(ValueError):
                self.store.create(settings=config)
        self.assertEqual(normalize_settings(None)['reconnect_timeout_seconds'],300)
        self.assertEqual(normalize_settings(None)['time_control']['mode'],'unlimited')

    def test_clocks_do_not_start_before_both_players_are_present(self):
        game=self.game(seconds=40)
        dwarf=self.join(game)
        self.store.touch(game.id,dwarf)
        self.clock.advance(700)
        self.store.tick()
        self.assertFalse(game.clock['started'])
        self.assertEqual(game.clock['remaining']['dwarf'],40)
        elf=self.join(game,'elf')
        self.store.touch(game.id,elf)
        self.store.touch(game.id,dwarf)
        self.assertTrue(game.clock['started'])
        self.assertEqual(game.clock['remaining']['dwarf'],40)

    def test_total_clock_tracks_players_separately(self):
        game=self.game(seconds=90)
        dwarf,elf=self.connect(game)
        self.clock.advance(8)
        self.store.tick()
        self.assertAlmostEqual(game.clock['remaining']['dwarf'],82)
        self.assertAlmostEqual(game.clock['remaining']['elf'],90)
        self.keep_alive(game,dwarf,elf)
        destination=game.legal((0,3))[0]
        self.store.move(game.id,dwarf,[0,3],destination)
        self.clock.advance(11)
        self.keep_alive(game,dwarf,elf)
        self.assertEqual(game.turn,'elf')
        self.assertAlmostEqual(game.clock['remaining']['dwarf'],82)
        self.assertAlmostEqual(game.clock['remaining']['elf'],79)

    def test_move_clock_resets_after_legal_move(self):
        game=self.game(mode='move',seconds=30)
        dwarf,elf=self.connect(game)
        self.clock.advance(7)
        self.store.tick()
        self.assertAlmostEqual(game.clock['turn_remaining'],23)
        destination=game.legal((0,3))[0]
        self.store.move(game.id,dwarf,[0,3],destination)
        self.assertAlmostEqual(game.clock['turn_remaining'],30)
        self.clock.advance(6)
        self.store.tick()
        self.assertAlmostEqual(game.clock['turn_remaining'],24)

    def test_connected_player_immediately_loses_when_time_expires(self):
        game=self.game(mode='move',seconds=12)
        dwarf,elf=self.connect(game)
        self.clock.advance(5)
        self.keep_alive(game,dwarf,elf)
        self.clock.advance(7)
        self.store.tick()
        self.assertEqual((game.status,game.winner,game.reason),
                         ('finished','elf','time_expired'))
        self.assertEqual(game.events[-1]['loser'],'dwarf')
        with self.assertRaises(ValueError):self.store.move(game.id,dwarf,[0,3],[1,3])

    def test_unlimited_mode_never_loses_on_clock(self):
        game=self.game(mode='unlimited')
        dwarf,elf=self.connect(game)
        self.clock.advance(14)
        self.keep_alive(game,dwarf,elf)
        self.clock.advance(14)
        self.keep_alive(game,dwarf,elf)
        self.assertEqual(game.status,'active')
        self.assertEqual(game.clock['mode'],'unlimited')

    def test_spectator_absence_does_not_suspend_game(self):
        game=self.game(mode='total',seconds=120)
        dwarf,elf=self.connect(game)
        spectator=self.join(game,role='spectator')
        self.store.touch(game.id,spectator)
        self.clock.advance(14)
        self.keep_alive(game,dwarf,elf)
        self.clock.advance(14)
        self.keep_alive(game,dwarf,elf)
        self.assertEqual(game.status,'active')

    def test_disconnect_suspends_both_clocks_and_reconnects(self):
        game=self.game(seconds=120)
        dwarf,elf=self.connect(game)
        self.disconnect_one(game,dwarf,elf)
        frozen=game.clock['remaining']['dwarf']
        self.clock.advance(20)
        self.store.tick()
        self.assertEqual(game.status,'paused')
        self.assertEqual(game.clock['remaining']['dwarf'],frozen)
        self.keep_alive(game,elf,dwarf)
        self.assertEqual(game.status,'active')
        self.assertIsNone(game.disconnect)
        self.clock.advance(4)
        self.store.tick()
        self.assertAlmostEqual(game.clock['remaining']['dwarf'],frozen-4)

    def test_reconnect_deadline_requires_host_decision(self):
        game=self.game(seconds=120,timeout=30)
        dwarf,elf=self.connect(game)
        self.disconnect_one(game,dwarf,elf)
        self.clock.advance(30.1)
        self.store.tick()
        self.assertEqual(game.status,'paused')
        self.assertIsNone(game.winner)
        self.assertTrue(game.disconnect['action_required'])
        self.keep_alive(game,elf,dwarf)
        self.assertEqual(game.status,'paused')
        state=self.store.disconnect_decision(game.id,'forfeit','dwarf')
        self.assertEqual(state['status'],'finished')
        self.assertEqual(state['winner'],'elf')
        self.assertEqual(state['reason'],'disconnect_forfeit')

    def test_substitution_replaces_missing_player_only_after_deadline(self):
        game=self.game(seconds=120,timeout=20)
        dwarf,elf=self.connect(game)
        self.disconnect_one(game,dwarf,elf)
        with self.assertRaises(ValueError):self.store.disconnect_decision(game.id,'substitute')
        self.clock.advance(21)
        self.store.tick()
        self.store.disconnect_decision(game.id,'substitute')
        self.assertEqual(game.reason,'awaiting_substitute')
        self.assertFalse(self.store.sessions[dwarf]['active'])
        substitute=self.join(game,'dwarf',name='Remplaçant')
        self.assertEqual(game.players['dwarf'],'Remplaçant')
        self.keep_alive(game,substitute,elf)
        self.assertEqual(game.status,'active')
        self.assertEqual(game.clock['remaining']['dwarf'],105)
        with self.assertRaises(PermissionError):self.store.player(game.id,dwarf)

    def test_host_can_save_and_leave_with_new_invites_on_resume(self):
        game=self.game(seconds=100)
        dwarf,elf=self.connect(game)
        self.clock.advance(6)
        self.keep_alive(game,dwarf,elf)
        remaining=game.clock['remaining']['dwarf']
        old_invite=self.store.invites[game.id]['player']
        self.store.pause(game.id)
        self.assertEqual(game.status,'paused')
        self.assertFalse(game.clock['started'])
        self.assertNotIn(game.id,self.store.invites)
        self.clock.advance(80)
        self.store.tick()
        self.assertEqual(game.clock['remaining']['dwarf'],remaining)
        with self.assertRaises(ValueError):self.store.request(game.id,old_invite,'Old')
        self.store.resume(game.id)
        self.assertNotEqual(self.store.invites[game.id]['player'],old_invite)
        self.assertFalse(self.store.sessions[dwarf]['active'])
        self.assertFalse(game.clock['started'])
        newdwarf,newelf=self.connect(game)
        self.clock.advance(5)
        self.keep_alive(game,newdwarf,newelf)
        self.assertAlmostEqual(game.clock['remaining']['dwarf'],remaining-5)

    def test_restart_pauses_unfinished_game_without_spending_offline_time(self):
        game=self.game(seconds=100)
        dwarf,elf=self.connect(game)
        self.clock.advance(9)
        self.keep_alive(game,dwarf,elf)
        saved_left=game.clock['remaining']['dwarf']
        self.store.save(game)
        self.clock.advance(2000)
        restored=Store(self.folder.name,self.clock.monotonic,self.clock.unix)
        copy=restored.games[game.id]
        self.assertEqual(copy.status,'paused')
        self.assertEqual(copy.reason,'host_restarted')
        self.assertEqual(copy.clock['remaining']['dwarf'],saved_left)
        self.assertFalse(copy.clock['started'])
        restored.resume(copy.id)
        self.assertFalse(copy.clock['started'])

    def test_original_version_two_saves_still_load(self):
        game=self.game()
        data=game.as_dict()
        data['version']=2
        for key in ('clock','disconnect','players','events'):
            data.pop(key,None)
        Path(self.folder.name,game.id+'.alfastafl').write_text(json.dumps(data))
        restored=Store(self.folder.name,self.clock.monotonic,self.clock.unix)
        self.assertEqual(restored.games[game.id].clock['mode'],'total')

    def test_multiple_games_have_independent_clocks(self):
        one=self.game(seconds=60)
        two=self.game(seconds=30)
        seats1=self.connect(one)
        seats2=self.connect(two)
        self.clock.advance(10)
        for sid in seats1:self.store.touch(one.id,sid)
        for sid in seats2:self.store.touch(two.id,sid)
        self.assertEqual(one.clock['remaining']['dwarf'],50)
        self.assertEqual(two.clock['remaining']['dwarf'],20)
        self.store.pause(one.id)
        self.clock.advance(3)
        for sid in seats2:self.store.touch(two.id,sid)
        self.assertEqual(one.clock['remaining']['dwarf'],50)
        self.assertEqual(two.clock['remaining']['dwarf'],17)

    def test_shutdown_checkpoints_and_suspends(self):
        game=self.game(seconds=60)
        dwarf,elf=self.connect(game)
        self.clock.advance(8)
        self.store.shutdown()
        self.assertEqual(game.reason,'host_closed')
        self.assertAlmostEqual(game.clock['remaining']['dwarf'],52)
        loaded=Store(self.folder.name,self.clock.monotonic,self.clock.unix)
        self.assertEqual(loaded.games[game.id].reason,'host_closed')

    def test_saving_during_historical_arbitration_does_not_skip_it(self):
        game=self.game(mode='unlimited')
        game.mode='historical'
        game.status='paused'
        game.reason='repetition_review'
        self.store.save(game)
        self.store.pause(game.id)
        self.assertEqual(game.reason,'saved_by_host')
        self.assertEqual(game.suspended_context,{'reason':'repetition_review'})
        self.store.resume(game.id)
        self.assertEqual(game.status,'paused')
        self.assertEqual(game.reason,'repetition_review')
        self.assertIsNone(game.suspended_context)

    def test_restart_during_rule_arbitration_allows_rejoin_without_bypass(self):
        game=self.game(mode='unlimited')
        game.mode='historical'
        game.status='paused'
        game.reason='repetition_review'
        self.store.save(game)
        restored=Store(self.folder.name,self.clock.monotonic,self.clock.unix)
        copy=restored.games[game.id]
        self.assertEqual(copy.reason,'host_restarted')
        self.assertEqual(copy.suspended_context,{'reason':'repetition_review'})
        restored.resume(copy.id)
        self.assertEqual((copy.status,copy.reason),('paused','repetition_review'))
        self.assertIn(copy.id,restored.invites)

    def test_repeated_save_does_not_discard_arbitration_state(self):
        game=self.game(mode='unlimited')
        game.status='paused'
        game.reason='repetition_review'
        self.store.pause(game.id)
        self.store.pause(game.id)
        self.store.resume(game.id)
        self.assertEqual(game.reason,'repetition_review')

    def test_unknown_host_action_does_not_modify_state(self):
        game=self.game(seconds=60)
        dwarf,elf=self.connect(game)
        self.disconnect_one(game,dwarf,elf)
        self.clock.advance(40)
        self.store.tick()
        with self.assertRaises(ValueError):self.store.disconnect_decision(game.id,'mystery')
        self.assertEqual(game.status,'paused')


if __name__=='__main__':unittest.main()
