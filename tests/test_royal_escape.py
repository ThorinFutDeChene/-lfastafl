"""A verified royal escape yields one server-owned equestrian scene."""
import tempfile
import unittest

from alfastafl.core import EMPTY
from alfastafl.server import Store


class Clock:
    def __init__(self):
        self.now=1000.
    def monotonic(self):
        return self.now
    def wall(self):
        return 2000000000.+self.now
    def advance(self,seconds):
        self.now+=seconds


class RoyalEscapeTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.clock=Clock()
        self.store=Store(self.temp.name,self.clock.monotonic,self.clock.wall)
    def tearDown(self):
        self.temp.cleanup()
    def create(self,mode='historical',duration=8):
        game=self.store.create(mode,{'time_control':{'mode':'unlimited'},
                                     'capture_cinematic_seconds':duration})
        game.board=[[EMPTY]*11 for _ in range(11)]
        if mode=='historical':
            game.board[1][2]='R'
            source,dest=[1,2],[0,2]
        else:
            game.board[2][0]='R'
            source,dest=[2,0],[0,0]
        game.board[4][5]='N'
        game.board[7][4]='E'
        game.turn='elf'
        game.positions=[game.signature()]
        self.store.save(game)
        request=self.store.request(game.id,self.store.invites[game.id]['player'],'Elf')
        session=self.store.approve(request,'elf')
        return game,session,source,dest

    def test_historical_border_escape_starts_and_expires_without_new_moves(self):
        g,s,source,dest=self.create()
        move=self.store.move(g.id,s,source,dest)
        self.assertEqual((move['piece'],move['reason'],move['winner'],move['status']),
                         ('R','escape','elf','finished'))
        self.assertEqual(move['captured'],[])
        scene=self.store.cinematic_state(g.id)
        self.assertEqual(scene['move']['to'],dest)
        self.assertEqual(scene['duration'],8)
        self.assertAlmostEqual(scene['remaining'],8.)
        self.assertEqual(len(g.history),1)
        self.assertEqual(g.board[0][2],'R')
        self.assertFalse(g.clock['started'])
        self.clock.advance(8.1)
        self.store._tick_locked()
        self.assertIsNone(self.store.cinematic_state(g.id))
        self.assertEqual(g.status,'finished')
        self.assertEqual(len(g.history),1)
        self.assertEqual(g.board[0][2],'R')

    def test_corner_escape_in_fetlar_is_animated_without_piece_capture(self):
        g,s,source,dest=self.create('fetlar')
        event=self.store.move(g.id,s,source,dest)
        self.assertEqual(event['reason'],'escape')
        self.assertEqual(self.store.cinematic_state(g.id)['move']['captured'],[])

    def test_disabled_cinematic_does_not_block_royal_victory(self):
        g,s,source,dest=self.create(duration=0)
        event=self.store.move(g.id,s,source,dest)
        self.assertEqual(event['reason'],'escape')
        self.assertIsNone(self.store.cinematic_state(g.id))
        self.assertEqual(g.status,'finished')
