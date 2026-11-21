"""LAN idle retirement policy: never break an active activity or approved viewer."""
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from urllib.request import urlopen

from alfastafl.server import Store,run


class Clock:
    def __init__(self):
        self.now=100.0

    def __call__(self):
        return self.now


class LanActivityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.clock=Clock()
        self.store=Store(self.temp.name,clock_source=self.clock)
        self.http=run('127.0.0.1',0,self.store)
        self.http.lan_enabled=True
        self.thread=threading.Thread(target=self.http.serve_forever,daemon=True)
        self.thread.start()
        self.port=self.http.server_port

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join(timeout=5)
        self.temp.cleanup()

    def post(self,path,header=None):
        conn=HTTPConnection('127.0.0.1',self.port,timeout=5)
        try:
            headers={'Content-Type':'application/json'}
            if header is not None:headers['X-Alfastafl-Host-Action']=header
            conn.request('POST',path,body='{}',headers=headers)
            response=conn.getresponse()
            return response.status,json.loads(response.read())
        finally:
            conn.close()

    def test_active_game_waiting_for_opponent_keeps_lease(self):
        self.assertFalse(self.store.lan_in_use())
        game=self.store.create()
        self.assertEqual(game.status,'active')
        self.assertFalse(game.clock['started'])
        self.assertTrue(self.store.lan_in_use())
        self.clock.now+=1000
        self.assertTrue(self.store.lan_in_use(),
                        'A still-open game awaiting its second player is active')
        self.store.pause(game.id)
        self.assertFalse(self.store.lan_in_use(),
                         'A saved, paused game does not pin the LAN open')
        self.store.resume(game.id)
        self.assertTrue(self.store.lan_in_use())
        game.status='finished'
        self.assertFalse(self.store.lan_in_use())

    def test_arbiter_disconnect_and_paused_ruling_keep_network(self):
        g=self.store.create()
        for reason in ('disconnected','awaiting_substitute',
                       'repetition_review','draw_proposal'):
            g.status='paused'
            g.reason=reason
            self.assertTrue(self.store.lan_in_use(),reason)
        for reason in ('saved_by_host','host_restarted','host_closed'):
            g.reason=reason
            self.assertFalse(self.store.lan_in_use(),reason)

    def test_live_tutorial_keeps_network_until_its_heartbeat_expires(self):
        self.store.tutorial_live={'updated':self.clock.now}
        self.assertTrue(self.store.lan_in_use())
        self.clock.now+=19.9
        self.assertTrue(self.store.lan_in_use())
        self.clock.now+=0.2
        self.assertFalse(self.store.lan_in_use())
        self.store.tutorial_live={'updated':self.clock.now}
        self.assertTrue(self.store.lan_in_use())
        self.store.tutorial_live=None
        self.assertFalse(self.store.lan_in_use())

    def test_authenticated_broadcast_extends_short_lease_between_rounds(self):
        from alfastafl.tournament import Tournament
        t=Tournament('Coupe','knockout',['Alice','Bruno'])
        self.store.tournaments[t.id]=t.as_dict()
        self.assertFalse(self.store.lan_in_use())
        data=self.store.broadcast(t.id,admin=True)
        self.assertEqual(data['matches'],[])
        self.assertTrue(self.store.lan_in_use())
        self.clock.now+=11.9
        self.assertTrue(self.store.lan_in_use())
        self.clock.now+=0.2
        self.assertFalse(self.store.lan_in_use())
        with self.assertRaises(PermissionError):
            self.store.broadcast(t.id,sid='intrus')
        self.assertFalse(self.store.lan_in_use(),
                         'A refused spectator cannot prolong the network')
        self.store.sessions['ok']={
            'active':True,'role':'spectator','broadcast_tournament':t.id,
            'name':'Public','game':'none','device_fp':'test'}
        self.store.broadcast(t.id,sid='ok')
        self.assertTrue(self.store.lan_in_use())

    def test_native_host_activity_requires_explicit_protected_header(self):
        status,_=self.post('/api/lan/activity')
        self.assertEqual(status,403)
        status,_=self.post('/api/lan/activity','wrong')
        self.assertEqual(status,403)
        self.assertFalse(self.store.lan_in_use())
        status,body=self.post('/api/lan/activity','lan-activity')
        self.assertEqual(status,200)
        self.assertTrue(body['active'])
        self.assertTrue(self.store.lan_in_use())
        self.clock.now+=12.1
        self.assertFalse(self.store.lan_in_use())

    def test_disabled_lan_activity_does_not_extend_lease(self):
        self.http.lan_enabled=False
        status,body=self.post('/api/lan/activity','lan-activity')
        self.assertEqual(status,200)
        self.assertFalse(body['active'])
        self.assertFalse(self.store.lan_in_use())

    def test_finished_game_watching_spectator_preserves_network(self):
        game=self.store.create()
        game.status='finished'
        sid='approved-spectator'
        self.store.sessions[sid]={
            'game':game.id,'role':'spectator','camp':None,
            'name':'Public','active':True,'seen':False,
            'connected':True,'last_seen':self.clock.now}
        self.assertFalse(self.store.lan_in_use())
        # The remote behavior is represented by a permitted spectator
        # heartbeat; HTTP local host checks are covered separately.
        self.store.keep_lan_active()
        self.assertTrue(self.store.lan_in_use())
        self.clock.now+=12.1
        self.assertFalse(self.store.lan_in_use())


if __name__=='__main__':
    unittest.main()
