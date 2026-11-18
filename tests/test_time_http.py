"""End-to-end network checks of the clock/continuity API."""
import json
import tempfile
import threading
import time
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from alfastafl.server import Store, run
from test_time_continuity import FakeTime


class TimeHttpTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory()
        self.clock=FakeTime()
        self.store=Store(self.folder.name,self.clock.monotonic,self.clock.unix)
        self.http=run('127.0.0.1',0,self.store)
        self.port=self.http.server_address[1]
        self.worker=threading.Thread(target=self.http.serve_forever,daemon=True)
        self.worker.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.worker.join(timeout=4)
        self.folder.cleanup()

    def api(self,path,data=None):
        body=json.dumps(data).encode('utf-8') if data is not None else None
        request=Request(f'http://127.0.0.1:{self.port}/api/{path}',
                        data=body,headers={'Content-Type':'application/json'} if body else {})
        try:
            with urlopen(request,timeout=5) as reply:
                return reply.status,json.loads(reply.read())
        except HTTPError as exc:
            return exc.code,json.loads(exc.read())

    def create(self,mode='total',seconds=90,timeout=20):
        code,response=self.api('create',{'mode':'fetlar','settings':{
            'time_control':{'mode':mode,'seconds':seconds},
            'reconnect_timeout_seconds':timeout,
        }})
        self.assertEqual(code,200)
        return response['game'],response['invites']

    def join(self,gid,token,camp):
        code,data=self.api('join',{'game':gid,'invite':token,'name':camp})
        self.assertEqual(code,200)
        code,data=self.api('approve',{'request':data['request'],'camp':camp})
        self.assertEqual(code,200)
        return data['session']

    def state(self,gid,sid):
        return self.api('state?game='+gid+'&session='+sid)

    def test_create_options_visible_in_state(self):
        gid,invites=self.create(mode='move',seconds=42)
        code,reply=self.api('state?game='+gid)
        self.assertEqual(code,200)
        self.assertEqual(reply['game']['clock']['mode'],'move')
        self.assertEqual(reply['game']['clock']['turn_remaining'],42)
        self.assertFalse(reply['game']['clock']['started'])
        self.assertEqual(reply['game']['settings']['reconnect_timeout_seconds'],20)
        self.assertIn('spectator',invites)

    def test_invalid_seconds_rejected_without_game_creation(self):
        code,reply=self.api('create',{'mode':'fetlar','settings':{
            'time_control':{'mode':'total','seconds':False}}})
        self.assertEqual(code,400)
        self.assertEqual(len(self.store.games),0)

    def test_both_players_heartbeat_starts_time_and_updates_state(self):
        gid,invites=self.create(seconds=60)
        d=self.join(gid,invites['player'],'dwarf')
        e=self.join(gid,invites['player'],'elf')
        self.state(gid,d)
        _,state=self.state(gid,e)
        self.assertTrue(state['game']['clock']['started'])
        self.clock.advance(4.3)
        _,state=self.state(gid,d)
        self.assertAlmostEqual(state['game']['clock']['remaining']['dwarf'],55.7)
        move=self.store.games[gid].legal((0,3))[0]
        code,result=self.api('move',{'game':gid,'session':d,'from':[0,3],'to':move})
        self.assertEqual(code,200,result)
        self.assertIn('clock',result['event'])

    def test_host_save_and_restore_invalidates_sessions_and_qr_tokens(self):
        gid,invites=self.create()
        dwarf=self.join(gid,invites['player'],'dwarf')
        self.state(gid,dwarf)
        code,_=self.api('pause',{'game':gid})
        self.assertEqual(code,200)
        code,reply=self.state(gid,dwarf)
        # Local administrative browsing remains accessible, but the revoked
        # client session must not re-enable a move or be included as a player.
        self.assertEqual(code,200)
        self.assertIsNone(reply['you'])
        code,reply=self.api('join',{'game':gid,'invite':invites['player'],'name':'Another'})
        self.assertEqual(code,400)
        code,reply=self.api('resume',{'game':gid})
        self.assertEqual(code,200)
        _,state=self.api('state?game='+gid)
        self.assertNotEqual(state['invites']['player'],invites['player'])
        self.assertFalse(state['game']['clock']['started'])

    def test_forfeit_only_after_timeout_by_explicit_host_command(self):
        gid,invites=self.create(seconds=120,timeout=20)
        d=self.join(gid,invites['player'],'dwarf')
        e=self.join(gid,invites['player'],'elf')
        self.state(gid,d)
        self.state(gid,e)
        self.clock.advance(14)
        self.state(gid,e)
        self.clock.advance(2)
        self.state(gid,e)
        code,reply=self.api('disconnect/decide',{'game':gid,'action':'forfeit','camp':'dwarf'})
        self.assertEqual(code,400)
        self.clock.advance(21)
        self.store.tick()
        code,reply=self.api('disconnect/decide',{'game':gid,'action':'forfeit','camp':'dwarf'})
        self.assertEqual(code,200)
        self.assertEqual(reply['game']['winner'],'elf')
        self.assertEqual(reply['game']['reason'],'disconnect_forfeit')

    def test_idle_watchdog_pauses_without_a_request(self):
        gid,invites=self.create(seconds=120)
        d=self.join(gid,invites['player'],'dwarf')
        e=self.join(gid,invites['player'],'elf')
        self.state(gid,d)
        self.state(gid,e)
        self.clock.advance(16)
        # ThreadingHTTPServer.service_actions() must tick while idle.
        deadline=time.monotonic()+2.5
        while self.store.games[gid].status!='paused' and time.monotonic()<deadline:
            time.sleep(.05)
        self.assertEqual(self.store.games[gid].reason,'disconnected')


if __name__=='__main__':unittest.main()
