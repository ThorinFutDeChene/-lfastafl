"""Four-player tournament concurrency, persistent approvals and spectator security."""
import hashlib
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from alfastafl.server import AppHandler, Store, run


class MultiMatchTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.store=Store(self.temp.name)
        self.server=run('127.0.0.1',0,self.store)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.base='http://127.0.0.1:%d/api/' % self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=4)
        self.temp.cleanup()

    def api(self,endpoint,payload=None):
        data=json.dumps(payload).encode('utf-8') if payload is not None else None
        request=Request(self.base+endpoint,data=data,
            headers={'Content-Type':'application/json'} if data is not None else {})
        try:
            with urlopen(request,timeout=6) as response:
                return response.status,json.loads(response.read())
        except HTTPError as exc:
            return exc.code,json.loads(exc.read())

    def tournament(self,format='knockout'):
        code,t=self.api('tournament/create',{'name':'Coupe du Bugey',
            'format':format,'players':['Alice','Bruno','Chloé','David'],'rounds':2})
        self.assertEqual(code,200,t)
        tid=t['tournament']['id']
        code,first=self.api('tournament/round',{'tournament':tid})
        self.assertEqual(code,200,first)
        self.assertEqual(len(first['matches']),2)
        self.assertEqual(len({m['game'] for m in first['matches']}),2)
        return tid,first['matches']

    def approve(self,match,name,role='player'):
        gid=match['game']
        invite=self.store.invites[gid][role]
        code,pending=self.api('join',{'game':gid,'invite':invite,'name':name})
        self.assertEqual(code,200,pending)
        code,approved=self.api('approve',{'request':pending['request']})
        self.assertEqual(code,200,approved)
        sid=approved['session']
        code,state=self.api('state?'+urlencode({'game':gid,'session':sid}))
        self.assertEqual(code,200,state)
        access=state.get('tournament_access')
        self.assertIsNotNone(access)
        self.assertEqual(access['tournament'],self.store.tournament_for_game(gid)[0]['id'])
        return sid,access['credential']

    def test_parallel_first_round_each_player_gets_only_own_camp(self):
        tid,matches=self.tournament()
        for match in matches:
            a,cred_a=self.approve(match,match['a'])
            b,cred_b=self.approve(match,match['b'])
            seats=self.store._seats(match['game'])
            self.assertEqual(set(seats),{'elf','dwarf'})
            self.assertNotEqual(seats['elf']['name'],seats['dwarf']['name'])
            self.assertNotEqual(cred_a,cred_b)
            for player,sid in [(match['a'],a),(match['b'],b)]:
                code,mine=self.api('tournament/mine',{'credential':(
                    cred_a if player==match['a'] else cred_b)})
                self.assertEqual(code,200,mine)
                self.assertEqual(mine['player'],player)
                self.assertEqual([row['game'] for row in mine['matches']],[match['game']])
            other=next(m for m in matches if m['game']!=match['game'])
            self.assertEqual(self.api('tournament/enter',{'game':other['game'],
                'credential':cred_a})[0],403)
        code,live=self.api('tournament/live?'+urlencode({'tournament':tid}))
        self.assertEqual(code,200)
        self.assertEqual(len(live['matches']),2)
        self.assertTrue(all(m['players_seated']==2 for m in live['matches']))

    def test_enter_again_without_approval_and_recover_after_host_restart(self):
        tid,matches=self.tournament()
        match=matches[0]
        sid,credential=self.approve(match,'Alice')
        self.assertNotIn(credential,Path(self.temp.name,'.tournament-devices.json').read_text('utf8'))
        digest=hashlib.sha256(credential.encode('utf8')).hexdigest()
        self.assertIn(digest,Path(self.temp.name,'.tournament-devices.json').read_text('utf8'))
        code,again=self.api('tournament/enter',{'credential':credential,'game':match['game']})
        self.assertEqual(code,200,again)
        self.assertNotEqual(sid,again['session'])
        self.assertFalse(self.store.sessions[sid]['active'])
        self.assertEqual(again['camp'],match['camp_a'])
        self.store.shutdown()
        self.store=Store(self.temp.name)
        self.server.store=self.store
        self.assertEqual(self.store.games[match['game']].status,'paused')
        code,reconnected=self.api('tournament/enter',{'credential':credential,
            'game':match['game']})
        self.assertEqual(code,200,reconnected)
        self.assertEqual(reconnected['camp'],match['camp_a'])
        self.assertEqual(self.store.games[match['game']].status,'active')
        self.assertFalse(any(x['status']=='waiting' for x in self.store.pending.values()))

    def test_spectator_one_approval_all_parallel_matches_without_move_rights(self):
        tid,matches=self.tournament()
        home=matches[0]['game']; other=matches[1]['game']
        sid,credential=self.approve(matches[0],'Observateur','spectator')
        with patch.object(AppHandler,'admin',return_value=False):
            code,state=self.api('state?'+urlencode({'game':other,'session':sid}))
            self.assertEqual(code,200,state)
            self.assertEqual(state['you']['role'],'spectator')
            code,live=self.api('tournament/live?'+urlencode({'session':sid,'tournament':tid}))
            self.assertEqual(code,200,live)
            self.assertEqual(len(live['matches']),2)
            self.assertEqual(self.api('tournament/live?'+urlencode({
                'tournament':tid}))[0],403)
        self.assertEqual(self.api('move',{'game':other,'session':sid,
            'from':[0,0],'to':[1,0]})[0],403)
        self.store.games[home].status='finished'
        self.store.games[home].winner='elf'
        self.store.save(self.store.games[home])
        code,returned=self.api('tournament/enter',{'game':home,'credential':credential})
        self.assertEqual(code,200,returned)
        with patch.object(AppHandler,'admin',return_value=False):
            self.assertEqual(self.api('state?'+urlencode({'game':other,
                'session':returned['session']}))[0],200)
        self.assertEqual(self.store.games[home].status,'finished')

    def test_active_captures_from_both_matches_multiplex_without_changing_games(self):
        tid,matches=self.tournament()
        for idx,m in enumerate(matches):
            self.store._cinematics[m['game']]={
                'move':{'n':idx+1,'piece':'N','from':[0,idx],'to':[1,idx],
                        'captured':[[2,idx]]},'duration':8,
                'deadline':self.store.monotonic()+8}
        code,live=self.api('tournament/live?'+urlencode({'tournament':tid}))
        self.assertEqual(code,200,live)
        self.assertEqual(len([m for m in live['matches'] if m['cinematic']]),2)
        self.assertEqual({m['game'] for m in live['matches']},
                         {m['game'] for m in matches})
        self.assertEqual({m['cinematic']['move']['n'] for m in live['matches']},{1,2})

    def test_shared_tournament_qr_routes_each_player_to_their_own_match(self):
        self.server.lan_enabled=True
        tid,matches=self.tournament()
        token=self.store.tournament_invitation(tid,'player')
        path='tournament/qr?'+urlencode({'tournament':tid,'role':'player'})
        with urlopen(self.base+path,timeout=5) as response:
            self.assertEqual(response.headers.get_content_type(),'image/png')
            self.assertTrue(response.read().startswith(b'\x89PNG\r\n\x1a\n'))
        self.assertEqual(self.api('tournament/join',{'tournament':tid,
            'role':'player','name':'Chloé','invite':'invalid'})[0],403)
        self.assertEqual(self.api('tournament/join',{'tournament':tid,
            'role':'player','name':'Intrus','invite':token})[0],403)
        code,routed=self.api('tournament/join',{'tournament':tid,
            'role':'player','name':'Chloé','invite':token})
        self.assertEqual(code,200,routed)
        self.assertEqual(routed['game'],matches[1]['game'])
        self.assertEqual(self.store.pending[routed['request']]['status'],'waiting')
        code,assigned=self.api('approve',{'request':routed['request']})
        self.assertEqual(code,200,assigned)
        self.assertEqual(assigned['camp'],matches[1]['camp_a'])
        self.assertEqual(self.store.sessions[assigned['session']]['name'],'Chloé')
        spectoken=self.store.tournament_invitation(tid,'spectator')
        code,spec=self.api('tournament/join',{'tournament':tid,
            'role':'spectator','name':'Public','invite':spectoken})
        self.assertEqual(code,200,spec)
        self.assertIn(spec['game'],[m['game'] for m in matches])
        self.assertEqual(self.store.pending[spec['request']]['status'],'waiting')
        self.server.lan_enabled=False
        self.assertEqual(self.api('tournament/join',{'tournament':tid,
            'role':'player','name':'Alice','invite':token})[0],403)

    def test_revocation_immediately_blocks_reentry_and_does_not_affect_others(self):
        tid,matches=self.tournament()
        sid,credential=self.approve(matches[0],'Alice')
        other_sid,other_credential=self.approve(matches[0],'Bruno')
        code,listed=self.api('tournament/devices?'+urlencode({'tournament':tid}))
        self.assertEqual(code,200)
        self.assertEqual({x['name'] for x in listed['devices']},{'Alice','Bruno'})
        self.assertNotIn(credential,json.dumps(listed))
        code,revoked=self.api('tournament/revoke',{'tournament':tid,'name':'Alice'})
        self.assertEqual(code,200)
        self.assertEqual(revoked['revoked'],1)
        self.assertFalse(self.store.sessions[sid]['active'])
        self.assertEqual(self.api('tournament/mine',{'credential':credential})[0],403)
        self.assertEqual(self.api('tournament/enter',{
            'credential':credential,'game':matches[0]['game']})[0],403)
        self.assertTrue(self.store.sessions[other_sid]['active'])
        self.assertEqual(self.api('tournament/mine',{'credential':other_credential})[0],200)

    def test_second_round_winner_can_join_with_same_credential(self):
        tid,matches=self.tournament()
        sid,credential=self.approve(matches[0],'Alice')
        for match in matches:
            g=self.store.games[match['game']]
            g.status='finished';g.winner=match['camp_a']
            self.store.save(g)
        code,next_round=self.api('tournament/round',{'tournament':tid})
        self.assertEqual(code,200,next_round)
        self.assertEqual(len(next_round['matches']),1)
        final=next_round['matches'][0]
        self.assertEqual(self.api('tournament/enter',{
            'credential':credential,'game':matches[0]['game']})[0],400)
        code,joined=self.api('tournament/enter',{
            'credential':credential,'game':final['game']})
        self.assertEqual(code,200,joined)
        self.assertEqual(joined['role'],'player')
        self.assertEqual(self.store.sessions[joined['session']]['name'],'Alice')
        self.assertEqual(joined['camp'],final['camp_a'] if final['a']=='Alice' else final['camp_b'])

if __name__=='__main__':
    unittest.main()
