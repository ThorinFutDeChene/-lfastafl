"""Host can play as elf or dwarf without granting admin rights to guests."""
import json
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from alfastafl.server import AppHandler, Store, run


class HostPlayerHttpTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory()
        self.store=Store(self.folder.name)
        self.http=run('127.0.0.1',0,self.store)
        self.worker=threading.Thread(target=self.http.serve_forever,daemon=True)
        self.worker.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.worker.join(timeout=5)
        self.folder.cleanup()

    def api(self,path,data=None):
        body=json.dumps(data).encode('utf-8') if data is not None else None
        req=Request(f'http://127.0.0.1:{self.http.server_address[1]}/api/{path}',
                    data=body,headers={'Content-Type':'application/json'} if body else {})
        try:
            with urlopen(req,timeout=5) as response:
                return response.status,json.loads(response.read())
        except HTTPError as error:
            return error.code,json.loads(error.read())

    def create(self,camp=None,mode='unlimited'):
        code,data=self.api('create',{'mode':'fetlar','host_camp':camp,
            'settings':{'time_control':{'mode':mode,'seconds':60}}})
        self.assertEqual(code,200,data)
        return data

    def guest(self,game,invite,camp):
        code,request=self.api('join',{'game':game,'invite':invite,'name':'Invité '+camp})
        self.assertEqual(code,200,request)
        return self.api('approve',{'request':request['request'],'camp':camp})

    def test_creating_host_dwarf_immediately_allows_real_moves(self):
        data=self.create('dwarf')
        gid=data['game']
        sid=data['host_session']
        self.assertTrue(sid)
        code,state=self.api('state?game='+gid+'&session='+sid)
        self.assertEqual(code,200)
        self.assertEqual(state['you']['camp'],'dwarf')
        self.assertEqual(state['you']['role'],'player')
        self.assertTrue(state['seats']['dwarf']['host'])
        self.assertEqual(state['game']['players']['dwarf'],'PC hôte')
        code,legal=self.api('legal?game='+gid+'&session='+sid+'&row=0&col=3')
        self.assertEqual(code,200)
        self.assertIn([1,3],legal['moves'])
        code,result=self.api('move',{'game':gid,'session':sid,'from':[0,3],'to':[1,3]})
        self.assertEqual(code,200,result)
        self.assertEqual(result['event']['piece'],'N')
        self.assertEqual(len(self.store.games[gid].history),1)

    def test_creating_host_elf_plays_its_own_turn_with_remote_dwarf(self):
        data=self.create('elf')
        gid=data['game']
        dwarf=self.guest(gid,data['invites']['player'],'dwarf')
        self.assertEqual(dwarf[0],200)
        self.assertIsNotNone(data['host_session'])
        code,host_state=self.api('state?game='+gid+'&session='+data['host_session'])
        self.assertEqual(code,200)
        self.assertEqual(host_state['you']['camp'],'elf')
        self.assertEqual(host_state['seats']['dwarf']['host'],False)
        status,_=self.api('move',{'game':gid,'session':data['host_session'],
                                  'from':[3,5],'to':[2,5]})
        self.assertEqual(status,403,'Elves may not move on the dwarves\' turn')
        status,_=self.api('move',{'game':gid,'session':dwarf[1]['session'],
                                  'from':[0,3],'to':[1,3]})
        self.assertEqual(status,200)
        status,legal=self.api('legal?game='+gid+'&session='+data['host_session']+
                              '&row=3&col=5')
        self.assertEqual(status,200)
        self.assertTrue(legal['moves'])
        status,move=self.api('move',{'game':gid,'session':data['host_session'],
                                    'from':[3,5],'to':legal['moves'][0]})
        self.assertEqual(status,200,move)
        self.assertEqual(len(self.store.games[gid].history),2)

    def test_local_host_can_stay_spectator_until_selecting_free_side(self):
        data=self.create()
        gid=data['game']
        self.assertIsNone(data['host_session'])
        code,state=self.api('state?game='+gid)
        self.assertEqual(code,200)
        self.assertIsNone(state['you'])
        self.assertEqual(state['seats'],{})
        code,guest=self.guest(gid,data['invites']['player'],'elf')
        self.assertEqual(code,200,guest)
        code,denied=self.api('host/seat',{'game':gid,'camp':'elf'})
        self.assertEqual(code,400)
        self.assertIn('occupé',denied['error'])
        code,assigned=self.api('host/seat',{'game':gid,'camp':'dwarf'})
        self.assertEqual(code,200,assigned)
        self.assertTrue(assigned['session'])
        status,state=self.api('state?game='+gid+'&session='+assigned['session'])
        self.assertEqual(status,200)
        self.assertEqual(state['you']['camp'],'dwarf')
        self.assertTrue(state['seats']['dwarf']['host'])

    def test_host_can_switch_or_withdraw_before_game_start(self):
        data=self.create('elf')
        gid=data['game']
        elf_session=data['host_session']
        code,changed=self.api('host/seat',{'game':gid,'camp':'dwarf'})
        self.assertEqual(code,200,changed)
        self.assertNotEqual(elf_session,changed['session'])
        self.assertNotIn('elf',self.store.games[gid].players)
        self.assertEqual(self.store.games[gid].players['dwarf'],'PC hôte')
        self.assertFalse(self.store.sessions[elf_session]['active'])
        self.assertEqual(self.api('legal?game='+gid+'&session='+elf_session+'&row=3&col=5')[0],403)
        code,withdraw=self.api('host/seat',{'game':gid,'camp':None})
        self.assertEqual(code,200)
        self.assertIsNone(withdraw['session'])
        self.assertFalse(self.store.sessions[changed['session']]['active'])
        self.assertEqual(self.store.games[gid].players,{})

    def test_host_cannot_switch_after_first_move(self):
        data=self.create('dwarf')
        gid=data['game']
        sid=data['host_session']
        code,_=self.api('move',{'game':gid,'session':sid,'from':[0,3],'to':[1,3]})
        self.assertEqual(code,200)
        code,response=self.api('host/seat',{'game':gid,'camp':'elf'})
        self.assertEqual(code,400,response)
        self.assertIn('début',response['error'])
        self.assertTrue(self.store.sessions[sid]['active'])
        self.assertEqual(self.store.games[gid].players['dwarf'],'PC hôte')

    def test_camp_taken_by_host_is_not_approvable_to_remote_player(self):
        data=self.create('dwarf')
        code,reply=self.guest(data['game'],data['invites']['player'],'dwarf')
        self.assertEqual(code,400)
        self.assertIn('occupied',reply['error'])
        code,reply=self.guest(data['game'],data['invites']['player'],'elf')
        self.assertEqual(code,200)
        self.assertIn(reply['session'],self.store.sessions)

    def test_timer_starts_only_when_host_and_guest_both_ready(self):
        data=self.create('dwarf','move')
        gid=data['game']
        sid=data['host_session']
        self.api('state?game='+gid+'&session='+sid)
        self.assertFalse(self.store.games[gid].clock['started'])
        code,joined=self.guest(gid,data['invites']['player'],'elf')
        self.assertEqual(code,200)
        self.api('state?game='+gid+'&session='+joined['session'])
        self.assertTrue(self.store.games[gid].clock['started'])
        self.assertEqual(self.api('move',{'game':gid,'session':sid,'from':[0,3],'to':[1,3]})[0],200)

    def test_resume_revokes_previous_host_seat_and_requires_new_choice(self):
        data=self.create('dwarf')
        gid=data['game']
        old=data['host_session']
        self.assertEqual(self.api('pause',{'game':gid})[0],200)
        self.assertIsNone(self.api('state?game='+gid+'&session='+old)[1]['you'])
        self.assertEqual(self.api('host/seat',{'game':gid,'camp':'dwarf'})[0],400)
        self.assertEqual(self.api('resume',{'game':gid})[0],200)
        code,res=self.api('host/seat',{'game':gid,'camp':'dwarf'})
        self.assertEqual(code,200)
        self.assertNotEqual(res['session'],old)
        self.assertFalse(self.store.sessions[old]['active'])

    def test_remote_device_cannot_claim_host_role(self):
        data=self.create()
        with patch.object(AppHandler,'admin',return_value=False):
            code,reply=self.api('host/seat',{'game':data['game'],'camp':'dwarf'})
        self.assertEqual(code,403)
        self.assertIn('Host-only',reply['error'])
        self.assertEqual(self.store._seats(data['game']),{})

    def test_invalid_camp_does_not_create_or_mutate_game(self):
        before=len(self.store.games)
        code,reply=self.api('create',{'mode':'fetlar','host_camp':'king'})
        self.assertEqual(code,400)
        self.assertEqual(len(self.store.games),before)
        data=self.create()
        code,reply=self.api('host/seat',{'game':data['game'],'camp':'king'})
        self.assertEqual(code,400)
        self.assertEqual(self.store._seats(data['game']),{})

    def test_duplicate_same_host_seat_reuses_existing_session(self):
        data=self.create('dwarf')
        code,res=self.api('host/seat',{'game':data['game'],'camp':'dwarf'})
        self.assertEqual(code,200)
        self.assertEqual(res['session'],data['host_session'])
        self.assertEqual(len([s for s in self.store.sessions.values()
                               if s.get('local_host') and s['active']]),1)


if __name__=='__main__':
    unittest.main()
