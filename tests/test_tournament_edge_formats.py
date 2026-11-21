"""Tournament edge cases: real matches, recorded byes and draw replays."""
import math
import json
import secrets
import tempfile
import threading
import unittest
from collections import Counter
from itertools import combinations
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request,urlopen

from alfastafl.server import Store,run
from alfastafl.tournament import Tournament


class PairingEdgeTests(unittest.TestCase):
    def test_round_robin_complete_even_and_odd_fields(self):
        for count in range(2,13):
            with self.subTest(players=count):
                people=['P'+str(i) for i in range(count)]
                t=Tournament('Tous', 'round_robin',people)
                pairs=[]
                byes=[]
                expected_rounds=count if count%2 else count-1
                for round_no in range(1,expected_rounds+1):
                    current=t.next_round()
                    self.assertEqual(t.round_no,round_no)
                    self.assertEqual(len(current),count//2)
                    rests=[m for m in t.matches if m.get('bye')
                           and m['round']==round_no]
                    self.assertEqual(len(rests),count%2)
                    for m in rests:
                        self.assertIsNone(m['b'])
                        self.assertIsNone(m['game'])
                        self.assertEqual(m['winner'],m['a'])
                        self.assertIsNone(m['camp_a'])
                        byes.append(m['a'])
                    self.assertEqual(set(sum(([m['a'],m['b']] for m in current),[])) |
                                     set(m['a'] for m in rests),set(people))
                    for m in current:
                        pairs.append(frozenset((m['a'],m['b'])))
                        t.result(m['id'],'draw')
                self.assertEqual(len(pairs),count*(count-1)//2)
                self.assertEqual(set(pairs),{frozenset(p) for p in combinations(people,2)})
                self.assertEqual(Counter(byes),Counter({p:1 for p in people})
                                 if count%2 else Counter())
                self.assertEqual(t.next_round(),[])
                self.assertEqual(t.standings(),{p:count-1 for p in people})
                self.assertEqual({p:len(t.history[p]) for p in people},
                                 {p:count-1 for p in people})

    def test_swiss_byes_are_visible_scored_and_rotated_fairly(self):
        for count in (3,5,7):
            with self.subTest(players=count):
                people=['P'+str(i) for i in range(count)]
                t=Tournament('Suisse','swiss',people,rounds=count)
                every_bye=[]
                for round_no in range(1,count+1):
                    current=t.next_round()
                    self.assertEqual(len(current),count//2)
                    rests=[m for m in t.matches if m.get('bye') and m['round']==round_no]
                    self.assertEqual(len(rests),1)
                    self.assertEqual(rests[0]['winner'],rests[0]['a'])
                    self.assertIsNone(rests[0]['camp_a'])
                    every_bye.append(rests[0]['a'])
                    self.assertEqual(len(set(
                        [player for m in current for player in (m['a'],m['b'])] +
                        [rests[0]['a']])),count)
                    for m in current:
                        t.result(m['id'],m['a'])
                self.assertEqual(Counter(every_bye),Counter({p:1 for p in people}))
                self.assertEqual(sum(t.standings().values()),
                                 3*(count//2+1)*count)
                self.assertEqual(t.next_round(),[])
                self.assertEqual(sum(len(v) for v in t.history.values()),
                                 count*(count-1))

    def test_knockout_any_size_exempts_to_power_of_two_then_crowns_one(self):
        for count in range(2,18):
            with self.subTest(players=count):
                people=['P'+str(i) for i in range(count)]
                t=Tournament('Coupe','knockout',people)
                with patch('alfastafl.tournament.secrets.SystemRandom') as rng:
                    # The *real* production draw uses SystemRandom.shuffle;
                    # fixing only its order makes this test reproducible.
                    rng.return_value.shuffle.side_effect=lambda values:values.reverse()
                    first=t.next_round()
                    rng.return_value.shuffle.assert_called_once()
                bracket=2**math.ceil(math.log2(count))
                first_byes=[m for m in t.matches if m.get('bye')]
                self.assertEqual(len(first_byes),bracket-count)
                self.assertEqual(len(first),(count-(bracket-count))//2)
                self.assertEqual(len(set(m['a'] for m in first_byes)),
                                 len(first_byes))
                self.assertEqual(set(m['a'] for m in first_byes)&
                                 set(p for m in first for p in (m['a'],m['b'])),set())
                self.assertEqual(len(t.matches),len(first)+len(first_byes))
                current=first
                while current:
                    for m in current:t.result(m['id'],m['a'])
                    current=t.next_round()
                    self.assertLessEqual(t.round_no,math.ceil(math.log2(count)))
                played=[m for m in t.matches if not m.get('bye')]
                self.assertEqual(len(played),count-1)
                finals=[m for m in played if m['round']==t.round_no]
                self.assertEqual(len(finals),1)
                self.assertEqual(finals[0]['winner'],finals[0]['a'])
                self.assertEqual(len(t.history[finals[0]['winner']]),
                                 t.round_no-sum(m.get('bye',False) for m in
                                  t.matches if m['a']==finals[0]['winner']))
                self.assertEqual(t.next_round(),[])

    def test_knockout_draw_generates_repeat_until_decisive_not_next_round(self):
        t=Tournament('Duel','knockout',['Alice','Bruno'])
        first=t.next_round()[0]
        t.result(first['id'],'draw')
        replay=t.next_round()
        self.assertEqual(t.round_no,1)
        self.assertEqual(len(replay),1)
        self.assertEqual(replay[0]['replay_of'],first['id'])
        self.assertEqual((replay[0]['a'],replay[0]['b']),('Alice','Bruno'))
        self.assertNotEqual((first['camp_a'],first['camp_b']),
                            (replay[0]['camp_a'],replay[0]['camp_b']))
        self.assertEqual(len(t.history['Alice']),1)
        self.assertEqual(t.standings(),{'Alice':1,'Bruno':1})
        t.result(replay[0]['id'],'draw')
        third=t.next_round()[0]
        self.assertEqual(t.round_no,1)
        self.assertEqual(third['replay_of'],replay[0]['id'])
        t.result(third['id'],'Bruno')
        self.assertEqual(t.next_round(),[])
        self.assertEqual(t.standings(),{'Alice':2,'Bruno':5})
        self.assertEqual(len([m for m in t.matches if not m.get('bye')]),3)

    def test_knockout_draw_and_byes_persist_for_later_round(self):
        t=Tournament('Coupe','knockout',['A','B','C','D','E'])
        first=t.next_round()
        self.assertEqual(len(first),1)
        byes={m['a'] for m in t.matches if m.get('bye')}
        t.result(first[0]['id'],'draw')
        rematch=t.next_round()[0]
        t.result(rematch['id'],rematch['a'])
        second=t.next_round()
        self.assertEqual(t.round_no,2)
        self.assertEqual(len(second),2)
        self.assertEqual(set(p for m in second for p in (m['a'],m['b'])),
                         byes | {rematch['a']})
        self.assertEqual(len(t.history[rematch['a']]),2)
        saved=t.as_dict()
        loaded=Tournament.from_dict(json.loads(json.dumps(saved)))
        self.assertEqual(loaded.as_dict(),saved)
        for m in second:loaded.result(m['id'],m['a'])
        final=loaded.next_round()
        self.assertEqual(len(final),1)
        self.assertEqual(final[0]['round'],3)

    def test_legacy_saved_tournaments_without_byes_remain_compatible(self):
        legacy=Tournament('Ancien','swiss',['A','B'],rounds=2)
        game=legacy.next_round()[0]
        legacy.result(game['id'],'A')
        saved=legacy.as_dict()
        reloaded=Tournament.from_dict(json.loads(json.dumps(saved)))
        self.assertEqual(reloaded.round_no,1)
        self.assertEqual(len(reloaded.next_round()),1)


class TournamentByesHTTPTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=Store(self.tmp.name)
        self.httpd=run('127.0.0.1',0,self.store)
        self.worker=threading.Thread(target=self.httpd.serve_forever,daemon=True)
        self.worker.start()
        self.base='http://127.0.0.1:'+str(self.httpd.server_port)+'/api/'

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.worker.join(timeout=5)
        self.tmp.cleanup()

    def api(self,endpoint,body=None):
        request=Request(self.base+endpoint,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Content-Type':'application/json'} if body is not None else {})
        try:
            with urlopen(request,timeout=5) as response:
                return response.status,json.loads(response.read())
        except HTTPError as error:
            return error.code,json.loads(error.read())

    def test_five_player_knockout_bye_draw_replay_and_separate_game_saves(self):
        code,created=self.api('tournament/create',{'name':'Coupe à cinq',
            'format':'knockout','players':['A','B','C','D','E']})
        self.assertEqual(code,200,created)
        tid=created['tournament']['id']
        code,round1=self.api('tournament/round',{'tournament':tid})
        self.assertEqual(code,200,round1)
        self.assertEqual(len(round1['matches']),1)
        original=round1['matches'][0]
        recorded=self.store.tournaments[tid]['matches']
        self.assertEqual(len(recorded),4)
        self.assertEqual(len([m for m in recorded if m.get('bye')]),3)
        self.assertEqual(len(self.store.games),1,'Byes must not create ghost games')
        self.assertEqual(self.api('tournament/round',{'tournament':tid})[0],400)
        # The game itself reports a draw: the host cannot forge a winner.
        game=self.store.games[original['game']]
        game.status='finished';game.winner=None
        self.store.save(game)
        code,reply=self.api('tournament/round',{'tournament':tid})
        self.assertEqual(code,200,reply)
        self.assertEqual(len(reply['matches']),1)
        replay=reply['matches'][0]
        self.assertEqual(replay['round'],1)
        self.assertEqual(replay['replay_of'],original['id'])
        self.assertNotEqual(replay['game'],original['game'])
        self.assertEqual(self.store.tournaments[tid]['round_no'],1)
        self.assertEqual(len(self.store.games),2)
        self.assertEqual(self.api('tournament/round',{'tournament':tid})[0],400)
        drawn=self.store.tournaments[tid]['matches']
        self.assertEqual(next(m for m in drawn if m['id']==original['id'])['winner'],'draw')
        game=self.store.games[replay['game']]
        game.status='finished';game.winner=replay['camp_a']
        self.store.save(game)
        code,second=self.api('tournament/round',{'tournament':tid})
        self.assertEqual(code,200,second)
        self.assertEqual(len(second['matches']),2)
        self.assertTrue(all(m['round']==2 for m in second['matches']))
        eligible=set(m['a'] for m in drawn if m.get('bye'))|{replay['a']}
        self.assertEqual({p for m in second['matches'] for p in (m['a'],m['b'])},
                         eligible)
        checkpoint=self.store.tournaments[tid]
        stored=Store(self.tmp.name)
        self.assertEqual(stored.tournaments[tid],checkpoint)
        self.assertEqual(len(stored.games),len(self.store.games))

    def test_odd_round_robin_and_swiss_do_not_launch_games_for_byes(self):
        for kind in ('round_robin','swiss'):
            with self.subTest(kind=kind):
                code,created=self.api('tournament/create',{
                    'name':'Trois joueurs','format':kind,
                    'players':[kind+' A',kind+' B',kind+' C'],'rounds':3})
                self.assertEqual(code,200)
                tid=created['tournament']['id']
                code,r1=self.api('tournament/round',{'tournament':tid})
                self.assertEqual(code,200,r1)
                self.assertEqual(len(r1['matches']),1)
                data=self.store.tournaments[tid]
                self.assertEqual(len([m for m in data['matches'] if m.get('bye')]),1)
                self.assertEqual(len(self.store.games),2 if kind=='swiss' else 1)


if __name__=='__main__':
    unittest.main()
