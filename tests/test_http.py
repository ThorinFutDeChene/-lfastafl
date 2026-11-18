import unittest, tempfile, threading, urllib.request, urllib.error, json
from alfastafl.server import Store, run

class HTTP(unittest.TestCase):
 def test_end_to_end_http(self):
  with tempfile.TemporaryDirectory() as folder:
   server=run('127.0.0.1',0,Store(folder));port=server.server_address[1]
   thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
   def call(path,payload=None):
    data=None if payload is None else json.dumps(payload).encode()
    req=urllib.request.Request('http://127.0.0.1:'+str(port)+path,data=data,headers={'Content-Type':'application/json'} if data else {})
    with urllib.request.urlopen(req) as response:return response.status,response.headers['Content-Type'],response.read()
   try:
    self.assertEqual(call('/')[0],200)
    j=json.loads(call('/api/create',{'mode':'fetlar'})[2]);gid=j['game']
    invite=j['invites']['player']
    req=json.loads(call('/api/join',{'game':gid,'invite':invite,'name':'Joueur'})[2])['request']
    self.assertEqual(json.loads(call('/api/pending')[2])['pending'][0]['status'],'waiting')
    sid=json.loads(call('/api/approve',{'request':req,'camp':'dwarf'})[2])['session']
    self.assertFalse(json.loads(call('/api/address')[2])['lan_enabled'])
    with self.assertRaises(urllib.error.HTTPError) as caught:
     call('/api/qr?game='+gid+'&role=player')
    self.assertEqual(caught.exception.code,503)
    event=json.loads(call('/api/move',{'game':gid,'session':sid,'from':[0,3],'to':[1,3]})[2])['event']
    self.assertEqual(event['n'],1)
    snap=json.loads(call('/api/state?game='+gid+'&session='+sid)[2])['game'];self.assertEqual(len(snap['history']),1)
   finally:server.shutdown();server.server_close();thread.join(timeout=3)
