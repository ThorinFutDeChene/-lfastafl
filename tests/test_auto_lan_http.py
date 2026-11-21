"""The automatic UFW activation endpoint is strictly local and CSRF-resistant."""
import http.client
import json
import tempfile
import threading
import unittest

from alfastafl.server import Store, run


class AutomaticLanEndpointTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory()
        self.store=Store(self.folder.name)
        self.server=run('127.0.0.1',0,self.store)
        self.calls=[]
        self.server.lan_activation_requested=lambda: self.calls.append('start')
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.folder.cleanup()

    def request(self,visitor=False,header=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port,
              timeout=5,source_address=('127.0.0.2' if visitor else '127.0.0.1',0))
        headers={'Content-Type':'application/json'}
        if header is not None:
            headers['X-Alfastafl-Host-Action']=header
        try:
            conn.request('POST','/api/lan/activate',body='{}',headers=headers)
            response=conn.getresponse()
            return response.status,json.loads(response.read())
        finally:
            conn.close()

    def test_host_action_requests_automatic_lan_only_after_activity(self):
        self.assertFalse(self.server.lan_enabled)
        self.assertEqual(self.calls,[])
        code,answer=self.request(header='lan-activate')
        self.assertEqual(code,202,answer)
        self.assertEqual(answer,{'active':False,'pending':True})
        self.assertEqual(self.calls,['start'])
        # Retries can happen while a single polkit request is pending:
        # the native controller protects its actual worker with a lock.
        code,_=self.request(header='lan-activate')
        self.assertEqual(code,202)
        self.server.lan_enabled=True
        self.assertEqual(self.request(header='lan-activate'),
            (200,{'active':True,'pending':False}))
        self.assertEqual(self.calls,['start','start'])

    def test_remote_browser_cannot_invoke_privileged_firewall_helper(self):
        for visitor,header in ((True,'lan-activate'),(True,None),
                               (False,None),(False,'wrong')):
            with self.subTest(visitor=visitor,header=header):
                code,reply=self.request(visitor=visitor,header=header)
                self.assertEqual(code,403,reply)
        self.assertEqual(self.calls,[])
        self.assertFalse(self.server.lan_enabled)

    def test_host_rejected_if_no_native_controller_available(self):
        delattr(self.server,'lan_activation_requested')
        code,reply=self.request(header='lan-activate')
        self.assertEqual(code,503,reply)
        self.assertIn('indisponible',reply['error'])
        self.assertEqual(self.calls,[])


if __name__=='__main__':
    unittest.main()
