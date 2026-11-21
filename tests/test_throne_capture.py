"""Server-confirmed one-soldier captures against the hostile empty throne.

Both an arriving dwarf and an arriving elf may use the throne as the
far jaw of a capture. Neither scene creates new legal moves.
"""
import tempfile
import unittest

from alfastafl.core import EMPTY
from alfastafl.server import Store


class Clock:
    def __init__(self):
        self.value=1000.
    def monotonic(self):
        return self.value
    def wall(self):
        return 2000000000.+self.value
    def advance(self,seconds):
        self.value+=seconds


class ThroneCaptureTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.clock=Clock()
        self.store=Store(self.temp.name,self.clock.monotonic,self.clock.wall)
    def tearDown(self):
        self.temp.cleanup()

    def setup_game(self,mode,attacker,duration=8):
        victim='E' if attacker=='N' else 'N'
        camp='dwarf' if attacker=='N' else 'elf'
        game=self.store.create(mode,{'time_control':{'mode':'unlimited'},
                                     'capture_cinematic_seconds':duration})
        game.board=[[EMPTY]*11 for _ in range(11)]
        for row,col,piece in [(5,1,attacker),(5,4,victim),(8,8,'R'),
                              (1,8,'N'),(9,2,'E')]:
            game.board[row][col]=piece
        game.turn=camp
        game.positions=[game.signature()]
        self.store.save(game)
        request=self.store.request(game.id,self.store.invites[game.id]['player'],
                                   'Trône '+camp)
        session=self.store.approve(request,camp)
        return game,session,victim

    def test_both_camps_capture_against_throne_in_all_three_modes(self):
        for mode in ('historical','fetlar','copenhagen'):
            for moving in ('N','E'):
                with self.subTest(mode=mode,moving=moving):
                    game,session,victim=self.setup_game(mode,moving)
                    self.assertEqual(game.board[5][5],EMPTY)
                    event=self.store.move(game.id,session,(5,1),(5,3))
                    self.assertEqual(event['piece'],moving)
                    self.assertEqual(event['captured'],[[5,4,victim]])
                    self.assertEqual(event['to'],[5,3])
                    self.assertEqual(game.board[5][3],moving)
                    self.assertEqual(game.board[5][4],EMPTY)
                    self.assertEqual(game.board[5][5],EMPTY)
                    self.assertEqual(len(game.history),1)
                    cut=self.store.cinematic_state(game.id)
                    self.assertIsNotNone(cut)
                    self.assertEqual(cut['move']['captured'],[[5,4,victim]])
                    self.assertEqual(cut['duration'],8)
                    self.assertFalse(game.clock['started'])
                    self.clock.advance(8.5)
                    self.store._tick_locked()
                    self.assertIsNone(self.store.cinematic_state(game.id))
                    self.assertEqual(len(game.history),1)

    def test_occupied_throne_is_not_the_empty_hostile_square(self):
        # A king on the throne belongs to the elf camp. It does not help a
        # dwarf capture an elf, but it can genuinely help an elf capture a
        # dwarf as an allied piece (not an empty-throne cinematic).
        for moving in ('N','E'):
            with self.subTest(moving=moving):
                game,session,victim=self.setup_game('historical',moving)
                game.board[8][8]=EMPTY
                game.board[5][5]='R'
                game.positions=[game.signature()]
                event=self.store.move(game.id,session,(5,1),(5,3))
                self.assertEqual([5,4,victim] in event['captured'],moving=='E')

    def test_disabled_animations_do_not_change_rules(self):
        game,session,victim=self.setup_game('fetlar','E',duration=0)
        event=self.store.move(game.id,session,(5,1),(5,3))
        self.assertEqual(event['captured'],[[5,4,victim]])
        self.assertIsNone(self.store.cinematic_state(game.id))
