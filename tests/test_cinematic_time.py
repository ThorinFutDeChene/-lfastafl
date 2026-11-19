"""Capture cinematics: authoritative clock pauses, event sync and backward compatibility."""
import tempfile
import unittest

from alfastafl.server import Store
from alfastafl.core import EMPTY, DWARF, ELF, KING
from test_time_continuity import FakeTime


class CinematicTimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.time=FakeTime()
        self.store=Store(self.tmp.name,self.time.monotonic,self.time.unix)

    def tearDown(self):
        self.store.shutdown()
        self.tmp.cleanup()

    def make_capture(self,seconds=8):
        game=self.store.create('fetlar',{
            'time_control':{'mode':'move','seconds':40},
            'capture_cinematic_seconds':seconds,
        })
        game.board=[[EMPTY]*11 for _ in range(11)]
        for row,col,piece in [(5,1,DWARF),(5,4,ELF),(5,5,DWARF),(8,8,KING)]:
            game.board[row][col]=piece
        game.positions=[game.signature()]
        self.store.save(game)
        invited=self.store.invites[game.id]['player']
        sessions={}
        for camp in ('dwarf','elf'):
            req=self.store.request(game.id,invited,camp)
            sessions[camp]=self.store.approve(req,camp)
        self.store.touch(game.id,sessions['dwarf'])
        self.store.touch(game.id,sessions['elf'])
        return game,sessions

    def test_capture_pauses_clock_and_blocks_next_turn_for_eight_seconds(self):
        game,s=self.make_capture()
        self.assertTrue(game.clock['started'])
        event=self.store.move(game.id,s['dwarf'],[5,1],[5,3])
        self.assertEqual(event['captured'],[[5,4,'E']])
        self.assertFalse(game.clock['started'])
        first_remaining=game.clock['turn_remaining']
        cue=self.store.cinematic_state(game.id)
        self.assertEqual(cue['move']['n'],1)
        self.assertEqual(cue['duration'],8)
        self.assertAlmostEqual(cue['remaining'],8)
        self.time.advance(4)
        self.store.touch(game.id,s['dwarf'])
        self.store.touch(game.id,s['elf'])
        self.assertFalse(game.clock['started'])
        self.assertEqual(game.clock['turn_remaining'],first_remaining)
        with self.assertRaisesRegex(ValueError,'cinématique'):
            self.store.move(game.id,s['elf'],[8,8],[8,7])
        self.time.advance(4.1)
        self.store.tick()
        self.assertIsNone(self.store.cinematic_state(game.id))
        self.assertTrue(game.clock['started'])
        self.assertEqual(game.clock['turn_remaining'],first_remaining)
        self.assertEqual(game.status,'active')

    def test_pause_revokes_live_cinematic_and_prevents_time_loss(self):
        game,s=self.make_capture()
        self.store.move(game.id,s['dwarf'],[5,1],[5,3])
        self.assertIsNotNone(self.store.cinematic_state(game.id))
        self.store.pause(game.id)
        self.assertIsNone(self.store.cinematic_state(game.id))
        self.assertFalse(game.clock['started'])
        self.time.advance(30)
        self.store.tick()
        self.assertEqual(game.status,'paused')

    def test_backward_compatible_default_does_not_delay_captures(self):
        game,s=self.make_capture(0)
        self.assertTrue(self.store.move(game.id,s['dwarf'],[5,1],[5,3])['captured'])
        self.assertIsNone(self.store.cinematic_state(game.id))
        self.assertTrue(game.clock['started'])

    def test_invalid_durations_are_rejected(self):
        for value in (False,-1,5,16,'8',None,8.0):
            with self.subTest(value=value),self.assertRaises(ValueError):
                self.store.create(settings={'capture_cinematic_seconds':value})

    def test_finished_game_cinematic_cannot_restart_chess_clock(self):
        game,s=self.make_capture()
        self.store.move(game.id,s['dwarf'],[5,1],[5,3])
        game.status='finished'
        self.time.advance(9)
        self.store.tick()
        self.assertIsNone(self.store.cinematic_state(game.id))
        self.assertFalse(game.clock['started'])


if __name__ == '__main__':
    unittest.main()
