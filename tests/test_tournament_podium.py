"""A tournament podium is announced to spectators and dismissed by the host only."""
import json
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from alfastafl.server import Store, run


class TournamentPodiumTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.store=Store(self.temp.name)
        self.server=run('127.0.0.1',0,self.store)
        self.worker=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.worker.start()
        self.base='http://127.0.0.1:%d/api/'%self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=4)
        self.temp.cleanup()

    def api(self,path,data=None):
        payload=json.dumps(data).encode('utf-8') if data is not None else None
        req=Request(self.base+path,data=payload,
                    headers={'Content-Type':'application/json'} if payload is not None else {})
        try:
            with urlopen(req,timeout=4) as response:
                return response.status,json.loads(response.read())
        except HTTPError as error:
            return error.code,json.loads(error.read())

    def new_tournament(self):
        code,created=self.api('tournament/create',{'name':'Finale','format':'knockout'})
        self.assertEqual(code,200,created)
        tid=created['tournament']['id']
        invites=self.api('tournament/invites?tournament='+tid)[1]['invites']
        for name in ('Alice','Bruno','Chloé','David'):
            code,result=self.api('tournament/register',{'tournament':tid,
                'name':name,'invite':invites['player']})
            self.assertEqual(code,200,result)
            self.assertEqual(self.api('tournament/registration/decide',
                {'request':result['request'],'approve':True})[0],200)
        code,start=self.api('tournament/round',{'tournament':tid})
        self.assertEqual(code,200,start)
        self.assertEqual(len(start['matches']),2)
        return tid,invites

    def test_podium_cinematic_remains_until_host_dismisses_and_survives_restart(self):
        tid,invites=self.new_tournament()
        code,joined=self.api('tournament/enter',{'tournament':tid,
             'invite':invites['spectator'],'name':'Public'})
        self.assertEqual(code,200,joined)
        sid=joined['session']
        self.assertEqual(joined['role'],'spectator')
        code,early=self.api('tournament/broadcast?tournament='+tid+'&session='+sid)
        self.assertEqual(code,200,early)
        self.assertFalse(early['completed'])
        self.assertEqual(early['rankings'],[])
        self.assertFalse(early['ceremony_dismissed'])
        self.assertEqual(self.api('tournament/ceremony/dismiss',{'tournament':tid})[0],400)
        for attempt in range(6):
            if self.store.tournaments[tid]['completed']:
                break
            outstanding=[m for m in list(self.store.tournaments[tid]['matches'])
                         if m.get('game') and m.get('winner') is None]
            self.assertTrue(outstanding)
            for m in outstanding:
                game=self.store.games[m['game']]
                game.status='finished'
                game.winner=m['camp_a']
                game.clock['started']=False
                self.store.save(game)
        self.assertTrue(self.store.tournaments[tid]['completed'])
        code,data=self.api('tournament/broadcast?tournament='+tid+'&session='+sid)
        self.assertEqual(code,200,data)
        self.assertTrue(data['completed'])
        self.assertEqual(len(data['rankings']),4)
        self.assertEqual(len(set(data['rankings'][:3])),3)
        self.assertFalse(data['ceremony_dismissed'])
        self.assertEqual(self.api('move',{'game':outstanding[-1]['game'],
                         'session':sid,'from':[0,0],'to':[0,1]})[0],403)
        code,result=self.api('tournament/ceremony/dismiss',{'tournament':tid})
        self.assertEqual(code,200,result)
        self.assertTrue(result['dismissed'])
        self.assertEqual(self.api('tournament/ceremony/dismiss',{'tournament':tid})[0],200)
        code,after=self.api('tournament/broadcast?tournament='+tid+'&session='+sid)
        self.assertEqual(code,200,after)
        self.assertTrue(after['ceremony_dismissed'])
        self.assertEqual(after['rankings'],data['rankings'])
        restarted=Store(self.temp.name)
        self.assertTrue(restarted.tournaments[tid]['ceremony_dismissed'])
        self.assertEqual(restarted.tournaments[tid]['rankings'],data['rankings'])

    def test_legacy_tournament_without_podium_flag_loads(self):
        from alfastafl.tournament import Tournament
        t=Tournament('Ancien','knockout',['Alice','Bruno']).as_dict()
        t.pop('ceremony_dismissed')
        restored=Tournament.from_dict(t)
        self.assertFalse(restored.ceremony_dismissed)


if __name__=='__main__':
    unittest.main()
