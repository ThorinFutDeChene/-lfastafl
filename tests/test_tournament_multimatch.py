"""Tournament host: two simultaneous games, trusted device return and TV wall."""
import json
import secrets
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from alfastafl.server import Store, run
from alfastafl.tournament import Tournament


class ConcurrentTournamentTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=Store(self.tmp.name)
        self.server=run('127.0.0.1',0,self.store)
        self.server.lan_enabled=True
        self.server.lan_address='127.0.0.1'
        self.worker=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.worker.start()
        self.base='http://127.0.0.1:'+str(self.server.server_address[1])

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=4)
        self.tmp.cleanup()

    def http(self,endpoint,data=None):
        payload=json.dumps(data).encode() if data is not None else None
        request=Request(self.base+'/api/'+endpoint,data=payload,
            headers={'Content-Type':'application/json'} if payload else {})
        try:
            with urlopen(request,timeout=5) as response:
                return response.status,json.loads(response.read())
        except HTTPError as error:
            return error.code,json.loads(error.read())

    def setup_tournament(self):
        code,t=self.http('tournament/create',{'name':'Tournoi à quatre',
            'format':'swiss','players':['Alice','Bruno','Chloé','David'],'rounds':3})
        self.assertEqual(code,200)
        tid=t['tournament']['id']
        code,round1=self.http('tournament/round',{'tournament':tid,'mode':'fetlar'})
        self.assertEqual(code,200)
        self.assertEqual(len(round1['matches']),2)
        self.assertEqual(len({m['game'] for m in round1['matches']}),2)
        self.assertEqual(len({n for m in round1['matches'] for n in (m['a'],m['b'])}),4)
        return tid,round1['matches']

    def register(self,tid,name,role='player',credential=None):
        invite=self.store.tournament_invitations(tid)[role]
        code,data=self.http('tournament/enter',{'tournament':tid,
            'invite':invite,'name':name,'device_token':credential})
        self.assertEqual(code,200,data)
        return data

    def authorize(self,tid,name,role='player'):
        pending=self.register(tid,name,role)
        self.assertEqual(pending['status'],'pending',pending)
        code,accepted=self.http('approve',{'request':pending['request']})
        self.assertEqual(code,200,accepted)
        code,result=self.http('request?id='+pending['request'])
        self.assertEqual(code,200,result)
        self.assertEqual(result['status'],'approved')
        self.assertEqual(result['role'],role)
        self.assertEqual(result['tournament'],tid)
        self.assertGreater(len(result['token']),36)
        self.assertNotIn(result['token'],json.dumps(self.store.tournaments))
        return pending,accepted,result['token']

    def test_four_players_can_play_two_independent_games_at_once(self):
        tid,matches=self.setup_tournament()
        tokens={}
        sessions={}
        for name in ['Alice','Bruno','Chloé','David']:
            pending,approved,token=self.authorize(tid,name)
            tokens[name]=token
            sessions[name]=(pending['game'],approved['session'])
        for gid,sid in sessions.values():
            code,state=self.http('state?game='+gid+'&session='+sid)
            self.assertEqual(code,200,state)
            self.assertEqual(state['you']['role'],'player')
        for m in matches:
            game=self.store.games[m['game']]
            self.assertEqual(game.status,'active')
            self.assertTrue(game.clock['started'])
            self.assertEqual(set(game.players.values()),{m['a'],m['b']})
        self.assertEqual(len(set(g for g,s in sessions.values())),2)
        self.assertEqual({m['game'] for m in matches},
                         set(self.store._anchors))
        # Repeat the QR while the same seat is active: no new admin request.
        first=self.register(tid,'Alice',credential=tokens['Alice'])
        self.assertEqual(first['status'],'approved')
        self.assertEqual(first['session'],sessions['Alice'][1])

    def test_device_token_scoped_to_participant_and_reusable_next_round(self):
        tid,matches=self.setup_tournament()
        pending,approved,alice_secret=self.authorize(tid,'Alice')
        outsider=self.register(tid,'Bruno',credential=alice_secret)
        self.assertEqual(outsider['status'],'pending')
        code,invalid=self.http('tournament/enter',{'tournament':tid,
          'invite':self.store.tournament_invitations(tid)['player'],
          'name':'Intrus','device_token':alice_secret})
        self.assertEqual(code,403,invalid)
        for m in matches:
            game=self.store.games[m['game']]
            game.status='finished';game.winner=m['camp_a']
            self.store.save(game)
        # The authoritative host creates the second round after both wins.
        code,round2=self.http('tournament/round',{'tournament':tid})
        self.assertEqual(code,200,round2)
        self.assertEqual(len(round2['matches']),2)
        self.assertEqual({m['round'] for m in round2['matches']},{2})
        next_game=next(m['game'] for m in round2['matches']
                       if 'Alice' in (m['a'],m['b']))
        returned=self.register(tid,'Alice',credential=alice_secret)
        self.assertEqual(returned['status'],'approved')
        self.assertEqual(returned['game'],next_game)
        self.assertEqual(returned['role'],'player')
        self.assertEqual(len([r for r in self.store.pending.values()
                          if r['name']=='Alice']),1,
                         'Known device must never create a fresh approval request')
        # A restart pauses live games but does not lose the registered
        # fingerprint. The fresh scanned QR restores this assigned game.
        reloaded=Store(self.tmp.name)
        self.assertIn(tid,reloaded.tournaments)
        self.assertEqual(self.store.tournaments[tid]['devices'],
                         reloaded.tournaments[tid]['devices'])
        invited=reloaded.tournament_invitations(tid)['player']
        result=reloaded.enter_tournament(tid,invited,'Alice',alice_secret)
        self.assertEqual(result['status'],'approved')
        self.assertEqual(result['game'],next_game)
        self.assertEqual(reloaded.games[next_game].status,'active')

    def test_complete_knockout_final_results_persist_and_no_extra_round(self):
        """Four authenticated players finish both semifinals and the actual final."""
        code, created = self.http('tournament/create', {
            'name': 'Finale complète', 'format': 'knockout',
            'players': ['Alice', 'Bruno', 'Chloé', 'David']})
        self.assertEqual(code, 200, created)
        tid = created['tournament']['id']
        code, opening = self.http('tournament/round', {
            'tournament': tid, 'mode': 'fetlar'})
        self.assertEqual(code, 200, opening)
        semifinals = opening['matches']
        self.assertEqual(len(semifinals), 2)
        credentials = {}
        sessions = {}
        for name in ('Alice', 'Bruno', 'Chloé', 'David'):
            pending, accepted, credential = self.authorize(tid, name)
            credentials[name] = credential
            sessions[name] = accepted['session']

        winners = []
        for match in semifinals:
            # The player who resigns is the loser; server computes the winner.
            losing_name = match['b']
            status, result = self.http('resign', {
                'game': match['game'], 'session': sessions[losing_name]})
            self.assertEqual(status, 200, result)
            self.assertEqual(result['game']['status'], 'finished')
            self.assertEqual(result['game']['winner'], match['camp_a'])
            winners.append(match['a'])

        code, round_two = self.http('tournament/round', {
            'tournament': tid, 'mode': 'fetlar'})
        self.assertEqual(code, 200, round_two)
        self.assertEqual(len(round_two['matches']), 1)
        final = round_two['matches'][0]
        self.assertEqual(final['round'], 2)
        self.assertEqual({final['a'], final['b']}, set(winners))
        self.assertNotIn(final['game'], {m['game'] for m in semifinals})

        final_sessions = {}
        for name in winners:
            pending_before = len(self.store.pending)
            restored = self.register(tid, name, credential=credentials[name])
            self.assertEqual(restored['status'], 'approved')
            self.assertEqual(restored['game'], final['game'])
            self.assertEqual(len(self.store.pending), pending_before)
            final_sessions[name] = restored['session']
        self.assertEqual(self.store.games[final['game']].status, 'active')

        # Conclude the championship through the public player endpoint.
        code, result = self.http('resign', {
            'game': final['game'], 'session': final_sessions[final['b']]})
        self.assertEqual(code, 200, result)
        self.assertEqual(result['game']['winner'], final['camp_a'])
        self.assertEqual(result['game']['status'], 'finished')
        code, finished = self.http('tournament/round', {'tournament': tid})
        self.assertEqual(code, 200, finished)
        self.assertEqual(finished['matches'], [],
                         'An ended knockout must not create a third round')

        tournament = self.store.tournaments[tid]
        self.assertEqual(tournament['round_no'], 2)
        played = [m for m in tournament['matches'] if not m.get('bye')]
        self.assertEqual(len(played), 3)
        self.assertEqual(len([m for m in played if m['winner'] is not None]), 3)
        self.assertEqual(next(m for m in played if m['id'] == final['id'])['winner'],
                         final['a'])
        self.assertEqual(sum(m['winner'] == final['a'] for m in played), 2)
        self.assertEqual(self.http('tournament/round', {'tournament': tid})[1]['matches'], [])

        reloaded = Store(self.tmp.name)
        self.assertEqual(reloaded.tournaments[tid], tournament,
                         'The final result and standings must survive host restart')
        self.assertEqual(reloaded.games[final['game']].status, 'finished')
        self.assertEqual(reloaded.games[final['game']].winner, final['camp_a'])

    def test_spectators_view_all_matches_and_several_captures_without_play_rights(self):
        tid,matches=self.setup_tournament()
        pending,approved,secret=self.authorize(tid,'Public','spectator')
        sid=approved['session']
        self.assertEqual(self.store.sessions[sid]['broadcast_tournament'],tid)
        with self.assertRaises(PermissionError):
            self.store.broadcast(tid,admin=False)
        with self.assertRaises(PermissionError):
            self.store.broadcast(tid,admin=False,sid='not-authorized')
        one,two=matches
        clock=self.store.monotonic()
        for i,m in enumerate(matches):
            self.store._cinematics[m['game']]={
                'deadline':clock+7.0,'duration':8,
                'move':{'n':i+1,'piece':'E','from':[5,1],'to':[5,3],
                        'captured':[[5,4,'N']]},
            }
        data=self.store.broadcast(tid,sid,admin=False)
        self.assertEqual(len(data['matches']),2)
        self.assertEqual(sum(bool(m['cinematic']) for m in data['matches']),2)
        self.assertEqual({m['game'] for m in data['matches']},
                         {one['game'],two['game']})
        for m in data['matches']:
            session=m['session']
            self.assertTrue(session)
            code,state=self.http('state?game='+m['game']+'&session='+session)
            self.assertEqual(code,200,state)
            self.assertEqual(state['you']['role'],'spectator')
            code,answer=self.http('legal?game='+m['game']+'&session='+session+
                                  '&row=5&col=1')
            self.assertNotEqual(code,200,
                                'A spectator broadcast token cannot play')
        again=self.store.broadcast(tid,sid,admin=False)
        self.assertEqual([m['session'] for m in data['matches']],
                         [m['session'] for m in again['matches']])
        # The spectator's own approval is a tournament-scoped device proof.
        second=self.register(tid,'Public',role='spectator',credential=secret)
        self.assertEqual(second['status'],'approved')

    def test_revoking_device_forces_approval_again_and_blocks_existing_tokens(self):
        tid,_=self.setup_tournament()
        pending,accepted,secret=self.authorize(tid,'Alice')
        active=accepted['session']
        self.assertEqual(self.store.revoke_tournament_device(tid,'Alice','player'),1)
        self.assertFalse(self.store.sessions[active]['active'])
        attempted=self.register(tid,'Alice',credential=secret)
        self.assertEqual(attempted['status'],'pending')
        self.assertNotEqual(attempted['request'],pending['request'])

    def test_host_tournament_invites_are_distinct_per_role_and_local_only(self):
        tid,_=self.setup_tournament()
        player=self.store.tournament_invitations(tid)['player']
        spectator=self.store.tournament_invitations(tid)['spectator']
        self.assertNotEqual(player,spectator)
        code,both=self.http('tournament/invites?tournament='+tid)
        self.assertEqual(code,200)
        self.assertEqual(both['invites']['player'],player)
        for role in ['player','spectator']:
            with urlopen(self.base+'/api/qr?tournament='+tid+'&role='+role,
                         timeout=5) as response:
                self.assertEqual(response.headers['Content-Type'],'image/png')
                self.assertEqual(response.read(8),b'\x89PNG\r\n\x1a\n')
        status,denied=self.http('tournament/enter',{'tournament':tid,
          'invite':spectator,'name':'Alice'})
        self.assertEqual(status,200)
        self.assertEqual(denied['role'],'spectator')


if __name__=='__main__':
    unittest.main()
