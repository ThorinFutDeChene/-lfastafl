"""Tournament games must play the same capture and escape scenes as host games."""
import json
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from alfastafl.core import EMPTY, DWARF, ELF, KING
from alfastafl.server import Store, run, TOURNAMENT_CINEMATIC_SECONDS
from test_time_continuity import FakeTime


class TournamentCinematicTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.time=FakeTime()
        self.store=Store(self.temp.name,self.time.monotonic,self.time.unix)
        self.http=run('127.0.0.1',0,self.store)
        self.worker=threading.Thread(target=self.http.serve_forever,daemon=True)
        self.worker.start()
        self.url='http://127.0.0.1:%d/api/'%self.http.server_address[1]

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.worker.join(timeout=5)
        self.temp.cleanup()

    def api(self,resource,data=None):
        payload=json.dumps(data).encode('utf-8') if data is not None else None
        request=Request(self.url+resource,data=payload,
                        headers={'Content-Type':'application/json'} if payload is not None else {})
        try:
            with urlopen(request,timeout=5) as response:
                return response.status,json.loads(response.read())
        except HTTPError as error:
            return error.code,json.loads(error.read())

    def new_qr(self,count=2):
        code,data=self.api('tournament/create',{'name':'Combat cinématique',
             'format':'knockout'})
        self.assertEqual(code,200,data)
        tid=data['tournament']['id']
        invitations=self.api('tournament/invites?tournament='+tid)[1]['invites']
        credentials={}
        for name in ('Alice','Bruno','Chloé','David')[:count]:
            code,requested=self.api('tournament/register',{
                'tournament':tid,'invite':invitations['player'],'name':name})
            self.assertEqual(code,200,requested)
            self.assertEqual(self.api('tournament/registration/decide',{
                'request':requested['request'],'approve':True})[0],200)
            credentials[name]=self.api('tournament/registration/status?request='+
                requested['request'])[1]['token']
        return tid,invitations,credentials

    def test_first_qr_round_plays_real_capture_and_broadcasts_to_spectators(self):
        tid,invitations,credentials=self.new_qr()
        code,start=self.api('tournament/round',{'tournament':tid})
        self.assertEqual(code,200,start)
        match=start['matches'][0]
        game=self.store.games[match['game']]
        self.assertEqual(game.settings['capture_cinematic_seconds'],
                         TOURNAMENT_CINEMATIC_SECONDS)
        game.board=[[EMPTY]*11 for _ in range(11)]
        for row,col,piece in [(5,1,DWARF),(5,4,ELF),(5,5,DWARF),(8,8,KING)]:
            game.board[row][col]=piece
        game.turn='dwarf'
        game.positions=[game.signature()]
        self.store.save(game)

        sessions={}
        for player in (match['a'],match['b']):
            reply=self.api('tournament/player/state',{
                'tournament':tid,'name':player,'device_token':credentials[player]})[1]
            self.assertEqual(reply['status'],'match')
            sessions[reply['camp']]=reply['session']
            self.store.touch(game.id,reply['session'])
        self.assertTrue(game.clock['started'])
        code,moved=self.api('move',{'game':game.id,
            'session':sessions['dwarf'],'from':[5,1],'to':[5,3]})
        self.assertEqual(code,200,moved)
        self.assertEqual(moved['event']['captured'],[[5,4,'E']])
        cue=self.store.cinematic_state(game.id)
        self.assertIsNotNone(cue)
        self.assertEqual(cue['duration'],8)
        self.assertEqual(cue['remaining'],8)
        self.assertFalse(game.clock['started'])
        host_view=self.store.broadcast(tid,admin=True)
        self.assertEqual(host_view['matches'][0]['cinematic']['duration'],8)
        self.assertEqual(host_view['matches'][0]['game'],game.id)
        code,spectator=self.api('tournament/enter',{
            'tournament':tid,'invite':invitations['spectator'],'name':'Spectateur'})
        self.assertEqual(code,200,spectator)
        user_view=self.store.broadcast(tid,sid=spectator['session'])
        self.assertEqual(user_view['matches'][0]['cinematic']['duration'],8)
        session=user_view['matches'][0]['session']
        self.assertEqual(self.store.sessions[session]['role'],'spectator')
        self.time.advance(8.1)
        self.store.tick()
        self.assertIsNone(self.store.cinematic_state(game.id))
        self.assertTrue(game.clock['started'])

    def test_legacy_tournament_first_and_next_round_have_cinematics(self):
        code,created=self.api('tournament/create',{
            'name':'Ancien format','format':'knockout',
            'players':['Alice','Bruno','Chloé','David']})
        self.assertEqual(code,200,created)
        tid=created['tournament']['id']
        first=self.api('tournament/round',{'tournament':tid})[1]['matches']
        self.assertEqual(len(first),2)
        for m in first:
            g=self.store.games[m['game']]
            self.assertEqual(g.settings['capture_cinematic_seconds'],8)
            g.status='finished';g.winner=m['camp_a']
            g.clock['started']=False
            self.store.save(g)
        code,second=self.api('tournament/round',{'tournament':tid})
        self.assertEqual(code,200,second)
        self.assertEqual(len(second['matches']),1)
        self.assertEqual(self.store.games[second['matches'][0]['game']]
                         .settings['capture_cinematic_seconds'],8)

    def test_auto_advanced_qr_final_and_bronze_have_cinematics(self):
        tid,_,proofs=self.new_qr(count=4)
        first=self.api('tournament/round',{'tournament':tid})[1]['matches']
        self.assertEqual(len(first),2)
        for match in first:
            self.assertEqual(self.store.games[match['game']]
                             .settings['capture_cinematic_seconds'],8)
            game=self.store.games[match['game']]
            game.status='finished';game.winner=match['camp_a']
            game.clock['started']=False
            self.store.save(game)
        second=[m for m in self.store.tournaments[tid]['matches']
                if m['round']==2]
        self.assertEqual({m['placement'] for m in second},{'final','bronze'})
        for match in second:
            self.assertEqual(self.store.games[match['game']]
                             .settings['capture_cinematic_seconds'],8)

    def test_restart_automatically_fixes_unfinished_old_tournament_game_only(self):
        tid,_,_=self.new_qr()
        match=self.api('tournament/round',{'tournament':tid})[1]['matches'][0]
        old=self.store.games[match['game']]
        old.settings['capture_cinematic_seconds']=0
        self.store.save(old)
        standalone=self.store.create()
        self.assertEqual(standalone.settings['capture_cinematic_seconds'],0)
        restarted=Store(self.temp.name,self.time.monotonic,self.time.unix)
        self.assertEqual(restarted.games[old.id].settings['capture_cinematic_seconds'],8)
        self.assertEqual(restarted.games[standalone.id].settings['capture_cinematic_seconds'],0)
        restarted_again=Store(self.temp.name,self.time.monotonic,self.time.unix)
        self.assertEqual(restarted_again.games[old.id]
                         .settings['capture_cinematic_seconds'],8)


if __name__ == '__main__':unittest.main()
