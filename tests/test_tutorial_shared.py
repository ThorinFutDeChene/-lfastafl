"""LAN tutor presentation: host-only writes, guest-only snapshots, QR and cleanup."""
import http.client
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.parse import quote

from alfastafl import tutorial
from alfastafl.server import Store, run


class SharedTutorialHTTPTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.now = [10.0]
        self.store = Store(self.folder.name, clock_source=lambda: self.now[0])
        self.server = run('127.0.0.1', 0, self.store)
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=5)
        self.folder.cleanup()

    def request(self, path, body=None, visitor=False, raw=False):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port,
            source_address=('127.0.0.2' if visitor else '127.0.0.1', 0), timeout=5)
        try:
            data = json.dumps(body) if body is not None else None
            conn.request('POST' if data is not None else 'GET', '/api/'+path,
                body=data, headers={'Content-Type':'application/json'})
            response = conn.getresponse()
            response_body = response.read()
            return response.status, (response_body if raw else json.loads(response_body))
        finally:
            conn.close()

    def start(self):
        self.server.lan_enabled=True
        code, response = self.request('tutorial/live/start', {'mode':'fetlar'})
        self.assertEqual(code,200,response)
        self.assertGreaterEqual(len(response['token']),48)
        return response['token']

    def test_local_tutorial_works_offline_but_presentation_requires_lan(self):
        self.assertEqual(self.request('tutorial?mode=fetlar')[0],200)
        code,reply=self.request('tutorial/live/start',{'mode':'fetlar'})
        self.assertEqual(code,403,reply)
        self.assertIsNone(self.store.tutorial_live)

    def test_qr_and_snapshot_are_read_only_and_require_a_live_secret(self):
        token=self.start()
        uri='tutorial/live/state?token='+quote(token)
        code,snapshot=self.request(uri,visitor=True)
        self.assertEqual(code,200,snapshot)
        self.assertEqual(snapshot['state']['lesson'],'first_move')
        self.assertEqual(snapshot['revision'],1)
        self.assertEqual(snapshot['selected'],None)
        self.assertEqual(self.request('tutorial/live/state?token=bogus',visitor=True)[0],403)
        self.assertEqual(self.request('tutorial?mode=fetlar',visitor=True)[0],403)
        self.assertEqual(self.request('tutorial/live/start',{'mode':'fetlar'},visitor=True)[0],403)
        self.assertEqual(self.request('tutorial/live/publish',{'token':token},visitor=True)[0],403)
        self.assertEqual(self.request('tutorial/live/stop',{'token':token},visitor=True)[0],403)
        self.server.lan_address='192.168.10.24'
        code,png=self.request('tutorial/live/qr?token='+quote(token),raw=True)
        self.assertEqual(code,200)
        self.assertTrue(png.startswith(bytes.fromhex('89504e470d0a1a0a')))
        self.assertEqual(self.request('tutorial/live/qr?token='+quote(token),
            visitor=True)[0],403)

    def test_move_highlights_and_changed_lessons_visible_to_guest(self):
        token=self.start()
        initial=tutorial.lesson_state('fetlar','first_move')
        selected=[0,3]
        legal=tutorial.legal_moves('fetlar','first_move',selected)
        code,_=self.request('tutorial/live/publish',{'token':token,'state':initial,
            'selected':selected,'legal':legal,'captures':[],
            'hint_visible':True})
        self.assertEqual(code,200)
        code,snapshot=self.request('tutorial/live/state?token='+quote(token),visitor=True)
        self.assertEqual(code,200)
        self.assertEqual(snapshot['selected'],selected)
        self.assertEqual(snapshot['legal'],legal)
        self.assertTrue(snapshot['hint_visible'])
        self.assertEqual(snapshot['revision'],2)
        start,end=tutorial.SOLUTIONS['fetlar']['first_move']
        finished=tutorial.play_move('fetlar','first_move',start,end)
        code,_=self.request('tutorial/live/publish',{'token':token,'state':finished,
            'selected':None,'legal':[],'captures':[],'hint_visible':False})
        self.assertEqual(code,200)
        _,snapshot=self.request('tutorial/live/state?token='+quote(token),visitor=True)
        self.assertEqual(snapshot['revision'],3)
        self.assertTrue(snapshot['state']['completed'])
        self.assertEqual(snapshot['event'],finished['last_move'])
        self.assertEqual(snapshot['state']['board'],finished['board'])
        next_lesson=tutorial.lesson_state('fetlar','movement')
        self.assertEqual(self.request('tutorial/live/publish',{'token':token,
            'state':next_lesson,'selected':None,'legal':[],'captures':[]})[0],200)
        _,snapshot=self.request('tutorial/live/state?token='+quote(token),visitor=True)
        self.assertEqual(snapshot['state']['lesson'],'movement')
        self.assertIsNone(snapshot['event'])
        self.assertEqual(self.store.games,{})
        self.assertEqual(list(Path(self.folder.name).iterdir()),[])

    def test_invalid_selection_and_board_are_rejected(self):
        token=self.start()
        state=tutorial.lesson_state('fetlar')
        for changes in ({'selected':[1,12]}, {'selected':[True,2]},
                        {'state':{'mode':'fetlar','lesson':'first_move','board':[]}},
                        {'legal':[[-1,0]]*122}):
            payload={'token':token,'state':state,
                'selected':None,'legal':[],'captures':[]}
            payload.update(changes)
            code,_=self.request('tutorial/live/publish',payload)
            self.assertEqual(code,400,changes)
        self.assertEqual(self.store.tutorial_live['revision'],1)

    def test_stop_reopen_lan_loss_expiration_and_shutdown_revoke(self):
        token=self.start()
        self.assertEqual(self.request('tutorial/live/stop',{'token':'bogus'})[1],
            {'stopped':False})
        self.assertEqual(self.request('tutorial/live/state?token='+quote(token),
            visitor=True)[0],200)
        self.assertEqual(self.request('tutorial/live/stop',{'token':token})[1],
            {'stopped':True})
        self.assertEqual(self.request('tutorial/live/state?token='+quote(token),
            visitor=True)[0],403)
        next_token=self.start()
        self.assertNotEqual(token,next_token)
        self.server.lan_enabled=False
        self.assertEqual(self.request('tutorial/live/state?token='+quote(next_token),
            visitor=True)[0],403)
        self.server.lan_enabled=True
        self.now[0]+=21
        self.assertEqual(self.request('tutorial/live/state?token='+quote(next_token),
            visitor=True)[0],403)
        # A new host session invalidates the old token, without saving a game.
        last_token=self.start()
        self.assertEqual(self.request('tutorial/live/state?token='+quote(last_token),
            visitor=True)[0],200)
        self.store.shutdown()
        self.assertEqual(self.request('tutorial/live/state?token='+quote(last_token),
            visitor=True)[0],403)
        self.assertEqual(list(Path(self.folder.name).iterdir()),[])


if __name__=='__main__':
    unittest.main()
