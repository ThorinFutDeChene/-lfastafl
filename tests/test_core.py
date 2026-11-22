import unittest, tempfile, pathlib, json
from alfastafl.core import Game,initial_board,ELF,DWARF,KING
from alfastafl.server import Store
from alfastafl.tournament import Tournament,balanced_camps

class Rules(unittest.TestCase):
 def test_37_pieces(self):
  for m in ('historical','fetlar','copenhagen'):
   b=initial_board(m);self.assertEqual(sum(x.count('N') for x in b),24);self.assertEqual(sum(x.count('E') for x in b),12);self.assertEqual(sum(x.count('R') for x in b),1)
 def test_opening_dwarf_moves(self):
  for m in ('historical','fetlar','copenhagen'):
   g=Game(mode=m);self.assertEqual(g.turn,'dwarf');self.assertTrue(g.legal((0,3)) if m!='historical' else g.legal((0,4)))
 def test_no_diagonal(self):
  g=Game();self.assertRaises(ValueError,g.move,[0,5],[1,6])
 def test_turn_change(self):
  g=Game();s=(0,3);e=g.legal(s)[0];g.move(s,e);self.assertEqual(g.turn,'elf')
 def test_non_king_cannot_enter_throne(self):
  g=Game();g.board=[['.']*11 for _ in range(11)];g.board[5][1]='N';g.turn='dwarf';self.assertNotIn([5,5],g.legal((5,1)));self.assertIn([5,6],g.legal((5,1)))
 def test_nonking_corner(self):
  for m in ('fetlar','copenhagen'):
   g=Game(mode=m);g.board=[['.']*11 for _ in range(11)];g.board[0][1]='N';g.turn='dwarf';self.assertNotIn([0,0],g.legal((0,1)))
 def test_historical_corner_is_ordinary(self):
  g=Game(mode='historical');g.board=[['.']*11 for _ in range(11)];g.board[0][1]='N';g.turn='dwarf';self.assertIn([0,0],g.legal((0,1)))
 def test_historical_escape(self):
  g=Game(mode='historical');g.board=[['.']*11 for _ in range(11)];g.board[1][4]='R';g.turn='elf';g.move([1,4],[0,4]);self.assertEqual(g.winner,'elf')
 def test_modern_escape(self):
  g=Game();g.board=[['.']*11 for _ in range(11)];g.board[0][4]='R';g.turn='elf';g.move([0,4],[0,0]);self.assertEqual(g.winner,'elf')
 def test_basic_capture(self):
  g=Game();g.board=[['.']*11 for _ in range(11)];g.board[1][1]='N';g.board[3][1]='N';g.board[2][1]='E';g.turn='dwarf';g.move([3,1],[2,2]) if False else None
  g.board[2][0]='N';g.move([1,1],[1,2]) if False else None
  g.board[2][3]='N';g.move([2,3],[2,2]);self.assertEqual(g.board[2][1],'.')
 def test_replay_roundtrip(self):
  g=Game();src=(0,3);g.move(src,g.legal(src)[0]);g2=Game.from_dict(json.loads(json.dumps(g.as_dict())));self.assertEqual(g2.as_dict(),g.as_dict())

class StorageAndAccess(unittest.TestCase):
 def test_save_load(self):
  with tempfile.TemporaryDirectory() as d:
   a=Store(d);g=a.create();a2=Store(d);self.assertIn(g.id,a2.games);self.assertEqual(a2.games[g.id].status,'paused')
 def test_spectator_cannot_move(self):
  with tempfile.TemporaryDirectory() as d:
   s=Store(d);g=s.create();sid=s.join(g.id,s.invites[g.id]['spectator'],'Observer')['session']
   with self.assertRaises(PermissionError):s.move(g.id,sid,[0,5],[2,5])
 def test_player_can_move(self):
  with tempfile.TemporaryDirectory() as d:
   s=Store(d);g=s.create();req=s.request(g.id,s.invites[g.id]['player'],'Alice');sid=s.approve(req,'dwarf')
   move=g.legal((0,3))[0];s.move(g.id,sid,[0,3],move);self.assertEqual(len(g.history),1)
 def test_wrong_camp(self):
  with tempfile.TemporaryDirectory() as d:
   s=Store(d);g=s.create();req=s.request(g.id,s.invites[g.id]['player'],'Alice');sid=s.approve(req,'elf')
   with self.assertRaises(PermissionError):s.move(g.id,sid,[0,5],[2,5])
 def test_duplicate_camp_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   s=Store(d);g=s.create();req=s.request(g.id,s.invites[g.id]['player'],'A');s.approve(req,'elf');req2=s.request(g.id,s.invites[g.id]['player'],'B')
   with self.assertRaises(ValueError):s.approve(req2,'elf')
 def test_multiple_parties(self):
  with tempfile.TemporaryDirectory() as d:
   s=Store(d);a=s.create('historical');b=s.create('fetlar');self.assertNotEqual(a.id,b.id);self.assertEqual(len(s.games),2)

class Tournaments(unittest.TestCase):
 def test_balanced(self):
  h={'A':[{'camp':'elf'},{'camp':'elf'}],'B':[{'camp':'dwarf'}]};self.assertEqual(balanced_camps('A','B',h),('dwarf','elf'))
 def test_formats(self):
  for m in ('knockout','round_robin','swiss'):
   t=Tournament('Test',m,['A','B','C','D']);rounds=t.next_round();self.assertEqual(len(rounds),2)
 def test_round_robin_complete(self):
  t=Tournament('Test','round_robin',['A','B','C','D']);pairs=set()
  for _ in range(3):
   ms=t.next_round()
   for m in ms:pairs.add(frozenset([m['a'],m['b']]));t.result(m['id'],m['a'])
  self.assertEqual(len(pairs),6)
 def test_finish_unfinished_forbidden(self):
  t=Tournament('Test','swiss',['A','B']);t.next_round()
  with self.assertRaises(ValueError):t.next_round()
if __name__=='__main__':unittest.main()
