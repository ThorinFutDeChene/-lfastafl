"""Open QR tournaments: host observes, registrations precede pairings, automatic podium."""
import json
import tempfile
import threading
import unittest
from urllib.request import urlopen, Request
from urllib.error import HTTPError

from alfastafl.server import Store, run
from alfastafl.tournament import Tournament


class QRRegistrationTournamentTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.store=Store(self.temp.name)
        self.server=run('127.0.0.1',0,self.store)
        self.worker=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.worker.start()
        self.url='http://127.0.0.1:%d/api/'%self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=5)
        self.temp.cleanup()

    def api(self,path,data=None):
        payload=json.dumps(data).encode('utf-8') if data is not None else None
        req=Request(self.url+path,data=payload,headers={'Content-Type':'application/json'}
                    if payload is not None else {})
        try:
            with urlopen(req,timeout=5) as result:
                return result.status,json.loads(result.read())
        except HTTPError as error:
            return error.code,json.loads(error.read())

    def created(self,kind='knockout',count=4):
        code,result=self.api('tournament/create',{
            'name':'Tournoi en accès QR','format':kind,'rounds':2})
        self.assertEqual(code,200,result)
        tid=result['tournament']['id']
        self.assertEqual(result['tournament']['players'],[])
        self.assertTrue(result['tournament']['registration_open'])
        invite=self.api('tournament/invites?tournament='+tid)[1]['invites']['player']
        proofs={}
        for name in ('Alice','Bruno','Chloé','David')[:count]:
            code,result=self.api('tournament/register',{
                'tournament':tid,'invite':invite,'name':name})
            self.assertEqual(code,200,result)
            self.assertEqual(result['status'],'pending')
            request=result['request']
            listing=self.api('tournament/registrations?tournament='+tid)[1]
            self.assertTrue(any(x['id']==request for x in listing['pending']))
            code,answer=self.api('tournament/registration/decide',{
                'request':request,'approve':True})
            self.assertEqual(code,200,answer)
            code,poll=self.api('tournament/registration/status?request='+request)
            self.assertEqual(code,200)
            self.assertEqual(poll['status'],'approved')
            proofs[name]=poll['token']
            self.assertGreater(len(proofs[name]),50)
            code,player=self.api('tournament/player/state',{
                'tournament':tid,'name':name,'device_token':proofs[name]})
            self.assertEqual((code,player['status']),(200,'waiting'))
            self.assertEqual(len(player['board']),11)
        self.assertEqual(len(self.store.tournaments[tid]['players']),count)
        return tid,invite,proofs

    def test_empty_roster_does_not_start_and_host_cannot_play(self):
        code,response=self.api('tournament/create',{'name':'A',
            'format':'round_robin'})
        tid=response['tournament']['id']
        self.assertEqual(self.api('tournament/round',{'tournament':tid})[0],400)
        self.assertEqual(self.store.tournaments[tid]['round_no'],0)
        spectator=self.api('tournament/invites?tournament='+tid)[1]['invites']['spectator']
        code,joined=self.api('tournament/enter',{
            'tournament':tid,'invite':spectator,'name':'Spectateur'})
        self.assertEqual((code,joined['status'],joined['game']),(200,'approved',''))
        self.assertEqual(self.store.spectator_stats()['connected'],1)
        self.assertEqual(self.api('tournament/broadcast?tournament='+tid+
                         '&session='+joined['session'])[1]['matches'],[])

    def test_authentication_and_rejection(self):
        tid,invite,proofs=self.created(count=2)
        self.assertEqual(self.api('tournament/player/state',{
            'tournament':tid,'name':'Alice','device_token':'inventé'})[0],403)
        self.assertEqual(self.api('tournament/register',{
            'tournament':tid,'invite':'invalid','name':'Mallory'})[0],403)
        code,request=self.api('tournament/register',{
            'tournament':tid,'invite':invite,'name':'Éloïse'})
        self.assertEqual(code,200)
        self.assertEqual(self.api('tournament/registration/decide',{
            'request':request['request'],'approve':False})[1]['status'],'rejected')
        self.assertNotIn('Éloïse',self.store.tournaments[tid]['players'])
        self.assertEqual(self.api('tournament/registration/status?request='+
                         request['request'])[1]['status'],'rejected')
        self.assertEqual(self.api('tournament/register',{
            'tournament':tid,'invite':invite,'name':'alice'})[0],400)
        self.assertEqual(self.api('tournament/register',{
            'tournament':tid,'invite':invite,'name':'Alice',
            'device_token':proofs['Alice']})[1]['status'],'approved')

    def test_four_player_automatic_final_bronze_and_podium(self):
        tid,invite,proofs=self.created()
        code,start=self.api('tournament/round',{'tournament':tid})
        self.assertEqual(code,200,start)
        self.assertEqual(len(start['matches']),2)
        self.assertEqual(self.api('tournament/round',{'tournament':tid})[0],400)
        semifinal_losers=[]
        for match in start['matches']:
            a,b=match['a'],match['b']
            for name in (a,b):
                state=self.api('tournament/player/state',{
                    'tournament':tid,'name':name,'device_token':proofs[name]})[1]
                self.assertEqual(state['status'],'match')
                self.assertEqual(state['opponent'],b if name==a else a)
                self.assertEqual(state['camp'],match['camp_a'] if name==a else match['camp_b'])
                self.assertEqual(state['round'],1)
                self.assertEqual(self.store.sessions[state['session']]['role'],'player')
            with self.assertRaises(PermissionError):
                self.store.seat_host(match['game'],match['camp_a'])
            loser=b
            session=self.api('tournament/player/state',{
                'tournament':tid,'name':loser,'device_token':proofs[loser]})[1]['session']
            self.assertEqual(self.api('resign',{
                'game':match['game'],'session':session})[0],200)
            semifinal_losers.append(loser)
        t=self.store.tournaments[tid]
        self.assertEqual(t['round_no'],2)
        final=[m for m in t['matches'] if m.get('placement')=='final']
        bronze=[m for m in t['matches'] if m.get('placement')=='bronze']
        self.assertEqual(len(final),1)
        self.assertEqual(len(bronze),1)
        self.assertEqual(set([bronze[0]['a'],bronze[0]['b']]),set(semifinal_losers))
        # A final can finish before the bronze match; its champion is already known.
        fin=final[0]
        loser=fin['b']
        sid=self.api('tournament/player/state',{'tournament':tid,
            'name':loser,'device_token':proofs[loser]})[1]['session']
        self.assertEqual(self.api('resign',{'game':fin['game'],'session':sid})[0],200)
        winner_state=self.api('tournament/player/state',{'tournament':tid,
            'name':fin['a'],'device_token':proofs[fin['a']]})[1]
        self.assertEqual((winner_state['status'],winner_state['rank']),('placed',1))
        self.assertFalse(self.store.tournaments[tid]['completed'])
        third=bronze[0]['a']
        loser=bronze[0]['b']
        sid=self.api('tournament/player/state',{'tournament':tid,
            'name':loser,'device_token':proofs[loser]})[1]['session']
        self.assertEqual(self.api('resign',{'game':bronze[0]['game'],'session':sid})[0],200)
        t=self.store.tournaments[tid]
        self.assertTrue(t['completed'])
        self.assertEqual(t['rankings'],[fin['a'],fin['b'],third,loser])
        for index,name in enumerate(t['rankings'],1):
            status=self.api('tournament/player/state',{'tournament':tid,
                'name':name,'device_token':proofs[name]})[1]
            self.assertEqual((status['status'],status['rank']),('placed',index))
        self.assertFalse(any(self.store.path.glob('*.alfastafl')))
        restart=Store(self.temp.name)
        self.assertEqual(restart.tournaments[tid]['rankings'],t['rankings'])
        self.assertEqual(restart.tournaments[tid]['completed'],True)
        self.assertEqual(restart.tournaments[tid]['players'],['Alice','Bruno','Chloé','David'])

    def test_two_player_knockout_finishes_without_extra_round(self):
        tid,invite,proofs=self.created(count=2)
        first=self.api('tournament/round',{'tournament':tid})[1]['matches']
        self.assertEqual(len(first),1)
        self.assertEqual(first[0]['placement'],'final')
        loser=first[0]['b']
        session=self.api('tournament/player/state',{'tournament':tid,
                'name':loser,'device_token':proofs[loser]})[1]['session']
        self.assertEqual(self.api('resign',{'game':first[0]['game'],'session':session})[0],200)
        t=self.store.tournaments[tid]
        self.assertEqual(t['rankings'],[first[0]['a'],first[0]['b']])
        self.assertEqual(t['round_no'],1)
        self.assertTrue(t['completed'])

    def test_round_robin_automatically_advances_after_pair_end(self):
        tid,invite,proofs=self.created(kind='round_robin',count=2)
        initial=self.api('tournament/round',{'tournament':tid})[1]['matches']
        self.assertEqual(len(initial),1)
        match=initial[0]
        status=self.api('tournament/player/state',{'tournament':tid,
            'name':match['a'],'device_token':proofs[match['a']]})[1]
        self.assertEqual(status['opponent'],match['b'])
        quitter=self.api('tournament/player/state',{'tournament':tid,
            'name':match['b'],'device_token':proofs[match['b']]})[1]
        self.api('resign',{'game':match['game'],'session':quitter['session']})
        self.assertEqual(self.store.tournaments[tid]['rankings'][0],match['a'])
        self.assertTrue(self.store.tournaments[tid]['completed'])

if __name__=='__main__':unittest.main()
