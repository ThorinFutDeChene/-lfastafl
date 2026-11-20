"""Actual king capture rules trigger exactly one authoritative siege cinematic.

No extra board move is emitted by the cinema; counts derive from real pieces.
Historical Tawlbwrdd uses two axes away from the throne, four on the
throne, or three against the throne. Fetlar uses four; Copenhagen uses four,
or three and an empty throne directly adjacent.
"""
import tempfile
import unittest
from alfastafl.core import EMPTY
from alfastafl.server import Store


class Clock:
    def __init__(self):
        self.value=1000.
    def monotonic(self):return self.value
    def wall(self):return 2000000000.+self.value
    def advance(self,seconds):self.value+=seconds


class KingSiegeTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.clock=Clock()
        self.store=Store(self.temp.name,self.clock.monotonic,self.clock.wall)
    def tearDown(self):
        self.temp.cleanup()

    def setup_capture(self,mode,king,from_square,to,support,duration=12):
        game=self.store.create(mode,{'time_control':{'mode':'unlimited'},
                                     'capture_cinematic_seconds':duration})
        game.board=[[EMPTY]*11 for _ in range(11)]
        game.board[king[0]][king[1]]='R'
        for row,col in support:
            game.board[row][col]='N'
        game.board[from_square[0]][from_square[1]]='N'
        game.board[0][8]='E'
        game.turn='dwarf'
        game.positions=[game.signature()]
        self.store.save(game)
        req=self.store.request(game.id,self.store.invites[game.id]['player'],'Dwarf')
        session=self.store.approve(req,'dwarf')
        return game,session,from_square,to

    def verify(self,mode,king,origin,destination,support,expected):
        game,session,source,end=self.setup_capture(mode,king,origin,destination,support)
        self.assertFalse(game.king_captured(end))
        event=self.store.move(game.id,session,source,end)
        self.assertEqual(event['reason'],'king_captured')
        self.assertEqual(event['winner'],'dwarf')
        self.assertEqual(event['status'],'finished')
        self.assertEqual(event['piece'],'N')
        self.assertEqual(event['captured'],[])
        cue=self.store.cinematic_state(game.id)
        self.assertEqual(cue['duration'],12)
        self.assertEqual(cue['move']['n'],1)
        self.assertEqual(cue['move']['reason'],'king_captured')
        self.assertEqual(game.board[king[0]][king[1]],'R')
        dwarves=[(r,c) for r in range(11) for c in range(11)
                 if game.board[r][c]=='N' and abs(r-king[0])+abs(c-king[1])==1]
        self.assertEqual(len(dwarves),expected)
        self.assertEqual(len(game.history),1)
        self.assertFalse(game.clock['started'])
        self.clock.advance(12.5)
        self.store._tick_locked()
        self.assertIsNone(self.store.cinematic_state(game.id))
        self.assertEqual(len(game.history),1)
        self.assertEqual(game.status,'finished')
        self.assertEqual(game.board[king[0]][king[1]],'R')

    def test_historical_two_dwarves_on_opposite_sides(self):
        self.verify('historical',(4,4),(4,7),(4,5),[(4,3)],2)

    def test_historical_three_against_throne(self):
        self.verify('historical',(5,4),(5,1),(5,3),[(4,4),(6,4)],3)

    def test_historical_four_when_king_on_throne(self):
        self.verify('historical',(5,5),(5,8),(5,6),[(4,5),(6,5),(5,4)],4)

    def test_fetlar_four_dwarves(self):
        self.verify('fetlar',(4,4),(4,7),(4,5),[(4,3),(3,4),(5,4)],4)

    def test_copenhagen_four_dwarves(self):
        self.verify('copenhagen',(4,4),(4,7),(4,5),[(4,3),(3,4),(5,4)],4)

    def test_copenhagen_three_against_empty_throne(self):
        self.verify('copenhagen',(5,4),(5,1),(5,3),[(4,4),(6,4)],3)

    def test_king_requires_more_than_one_dwarf_in_fetlar(self):
        game,session,source,end=self.setup_capture('fetlar',(4,4),(4,7),(4,5),[(4,3)])
        event=self.store.move(game.id,session,source,end)
        self.assertNotEqual(event['reason'],'king_captured')
        self.assertIsNone(self.store.cinematic_state(game.id))

    def test_cinematic_disabled_never_blocks_a_king_capture(self):
        game,session,source,end=self.setup_capture('historical',(4,4),(4,7),
                                                   (4,5),[(4,3)],duration=0)
        event=self.store.move(game.id,session,source,end)
        self.assertEqual(event['reason'],'king_captured')
        self.assertIsNone(self.store.cinematic_state(game.id))
        self.assertEqual(game.status,'finished')
