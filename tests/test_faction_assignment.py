"""Camp allocation: one remaining side is automatic, tournament sides fixed."""
import json
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from alfastafl.server import Store, run, AppHandler
from alfastafl.tournament import balanced_camps, Tournament


def played(*rounds):
    return [{'camp': camp, 'round': number} for number, camp in rounds]


class BalancedTournamentTests(unittest.TestCase):
    def test_first_game_is_an_actual_fifty_fifty_lottery(self):
        with patch('alfastafl.tournament.secrets.randbelow', return_value=0) as lottery:
            self.assertEqual(balanced_camps('A','B',{'A':[],'B':[]}),
                             ('elf','dwarf'))
            lottery.assert_called_once_with(2)
        with patch('alfastafl.tournament.secrets.randbelow', return_value=1):
            self.assertEqual(balanced_camps('A','B',{'A':[],'B':[]}),
                             ('dwarf','elf'))

    def test_first_game_for_one_new_player_honors_existing_players_history(self):
        history={'A':played((1,'elf'),(2,'elf')),'B':[]}
        with patch('alfastafl.tournament.secrets.randbelow',
                   side_effect=AssertionError('No draw needed')):
            self.assertEqual(balanced_camps('A','B',history),
                             ('dwarf','elf'))

    def test_in_subsequent_round_players_receive_the_less_played_camp(self):
        history={'A':played((1,'elf'),(2,'elf'),(3,'dwarf'),(4,'elf')),
                 'B':played((1,'dwarf'),(2,'dwarf'),(3,'elf'))}
        with patch('alfastafl.tournament.secrets.randbelow',
                   side_effect=AssertionError('No draw needed')):
            self.assertEqual(balanced_camps('A','B',history),
                             ('dwarf','elf'))

    def test_most_underbalanced_player_gets_contested_side(self):
        history={'A':played((1,'elf'),(2,'elf'),(3,'elf'),(4,'elf')),
                 'B':played((1,'elf'))}
        self.assertEqual(balanced_camps('A','B',history),('dwarf','elf'))

    def test_if_both_want_same_camp_recent_player_gets_other(self):
        # Both have two elf games and one dwarf game. A's last dwarf
        # was round 2, B's round 1: A had it most recently, gets ELVES.
        history={'A':played((1,'elf'),(2,'dwarf'),(3,'elf')),
                 'B':played((1,'dwarf'),(2,'elf'),(3,'elf'))}
        with patch('alfastafl.tournament.secrets.randbelow',
                   side_effect=AssertionError('Recency resolves the tie')):
            self.assertEqual(balanced_camps('A','B',history),
                             ('elf','dwarf'))

    def test_if_both_have_equal_counts_prefer_opposite_of_last_side(self):
        history={'A':played((1,'elf'),(3,'dwarf')),
                 'B':played((1,'dwarf'),(2,'elf'))}
        self.assertEqual(balanced_camps('A','B',history),('elf','dwarf'))

    def test_recency_uses_round_numbers_and_handles_byes(self):
        # Both prefer DWARVES, but B played dwarves more recently
        # (round 4 vs A round 2), so B must play ELVES.
        history={'A':played((2,'dwarf'),(5,'elf')),
                 'B':played((4,'dwarf'),(5,'elf'))}
        with patch('alfastafl.tournament.secrets.randbelow',
                   side_effect=AssertionError('Rounds must resolve this')):
            self.assertEqual(balanced_camps('A','B',history),
                             ('dwarf','elf'))

    def test_final_equal_recency_is_genuinely_random(self):
        history={'A':played((1,'elf'),(2,'dwarf')),
                 'B':played((1,'elf'),(2,'dwarf'))}
        with patch('alfastafl.tournament.secrets.randbelow',return_value=0) as r:
            self.assertEqual(balanced_camps('A','B',history),('elf','dwarf'))
            r.assert_called_once_with(2)
        with patch('alfastafl.tournament.secrets.randbelow',return_value=1):
            self.assertEqual(balanced_camps('A','B',history),('dwarf','elf'))

    def test_old_history_without_round_remains_compatible(self):
        legacy={'A':[{'camp':'dwarf'},{'camp':'elf'}],
                'B':[{'camp':'elf'},{'camp':'dwarf'}]}
        self.assertEqual(balanced_camps('A','B',legacy),('dwarf','elf'))

    def test_confirmed_results_record_round_and_side_for_next_game(self):
        t=Tournament('Coupe','swiss',['Alice','Bruno'],rounds=3)
        with patch('alfastafl.tournament.secrets.randbelow',return_value=0):
            first=t.next_round()[0]
        self.assertEqual((first['camp_a'],first['camp_b']),('elf','dwarf'))
        t.result(first['id'],'Alice')
        self.assertEqual(t.history['Alice'],[{'camp':'elf','round':1}])
        self.assertEqual(t.history['Bruno'],[{'camp':'dwarf','round':1}])
        second=t.next_round()[0]
        self.assertEqual((second['camp_a'],second['camp_b']),('dwarf','elf'))
        t.result(second['id'],'Bruno')
        third=t.next_round()[0]
        self.assertEqual((third['camp_a'],third['camp_b']),('elf','dwarf'))


class HostInvitationAllocationTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory()
        self.store=Store(self.folder.name)
        self.srv=run('127.0.0.1',0,self.store)
        self.worker=threading.Thread(target=self.srv.serve_forever,daemon=True)
        self.worker.start()
        self.base=f'http://127.0.0.1:{self.srv.server_address[1]}/api/'

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        self.worker.join(timeout=5)
        self.folder.cleanup()

    def api(self,endpoint,params=None):
        payload=json.dumps(params).encode('utf8') if params is not None else None
        req=Request(self.base+endpoint,data=payload,
                    headers={'Content-Type':'application/json'} if payload else {})
        try:
            with urlopen(req,timeout=4) as r:
                return r.status,json.loads(r.read())
        except HTTPError as error:
            return error.code,json.loads(error.read())

    def create(self,host_camp=None):
        status,created=self.api('create',{'mode':'fetlar','host_camp':host_camp})
        self.assertEqual(status,200)
        return created

    def ask(self,created,name,role='player'):
        status,result=self.api('join',{'game':created['game'],
                                'invite':created['invites'][role],'name':name})
        self.assertEqual(status,200,result)
        return result['request']

    def pending_for(self,request_id):
        status,result=self.api('pending')
        self.assertEqual(status,200)
        return next(x for x in result['pending'] if x['id']==request_id)

    def test_host_dwarf_player_automatically_forces_remote_elf(self):
        game=self.create('dwarf')
        req=self.ask(game,'Téléphone 1')
        self.assertEqual(self.pending_for(req)['available_camps'],['elf'])
        self.assertEqual(self.api('approve',{'request':req,'camp':'dwarf'})[0],400)
        status,reply=self.api('approve',{'request':req})
        self.assertEqual(status,200,reply)
        self.assertEqual(reply['camp'],'elf')
        self.assertEqual(self.store.sessions[reply['session']]['name'],'Téléphone 1')
        status,state=self.api('state?game='+game['game'])
        self.assertEqual(status,200)
        self.assertEqual(state['seats']['dwarf']['host'],True)
        self.assertEqual(state['seats']['elf']['name'],'Téléphone 1')
        self.assertEqual(self.api('join',{'game':game['game'],
                'invite':game['invites']['player'],'name':'Téléphone 2'})[0],400)

    def test_host_elf_player_automatically_forces_remote_dwarf(self):
        game=self.create('elf')
        req=self.ask(game,'Téléphone 1')
        self.assertEqual(self.pending_for(req)['available_camps'],['dwarf'])
        code,approved=self.api('approve',{'request':req})
        self.assertEqual(code,200,approved)
        self.assertEqual(approved['camp'],'dwarf')

    def test_two_phones_first_chooses_and_second_is_forced(self):
        game=self.create()
        first=self.ask(game,'Téléphone A')
        second=self.ask(game,'Téléphone B')
        self.assertEqual(self.pending_for(first)['available_camps'],['elf','dwarf'])
        self.assertEqual(self.pending_for(second)['available_camps'],['elf','dwarf'])
        self.assertEqual(self.api('approve',{'request':first})[0],400,
                         'First of two phones must choose when both camps are vacant.')
        status,first_reply=self.api('approve',{'request':first,'camp':'elf'})
        self.assertEqual(status,200)
        self.assertEqual(first_reply['camp'],'elf')
        self.assertEqual(self.pending_for(second)['available_camps'],['dwarf'])
        self.assertEqual(self.api('approve',{'request':second,'camp':'elf'})[0],400)
        code,second_reply=self.api('approve',{'request':second})
        self.assertEqual(code,200,second_reply)
        self.assertEqual(second_reply['camp'],'dwarf')
        self.assertEqual(set(self.store._seats(game['game'])),{'elf','dwarf'})

    def test_tournament_assignments_are_immutable_and_do_not_offer_choices(self):
        status,created=self.api('tournament/create',{
            'name':'Coupe du Bugey','format':'swiss','players':['Alice','Bruno'],
            'rounds':3,
        })
        self.assertEqual(status,200)
        tournament=created['tournament']
        with patch('alfastafl.tournament.secrets.randbelow',return_value=0):
            status,round1=self.api('tournament/round',{'tournament':tournament['id']})
        self.assertEqual(status,200,round1)
        match=round1['matches'][0]
        self.assertEqual((match['camp_a'],match['camp_b']),('elf','dwarf'))
        gameid=match['game']
        invite=self.store.invites[gameid]['player']
        code,refused=self.api('join',{'game':gameid,'invite':invite,'name':'Inconnu'})
        self.assertEqual(code,400,refused)
        alice=self.api('join',{'game':gameid,'invite':invite,'name':'Alice'})[1]['request']
        bruno=self.api('join',{'game':gameid,'invite':invite,'name':'Bruno'})[1]['request']
        self.assertEqual(self.pending_for(alice)['available_camps'],['elf'])
        self.assertEqual(self.pending_for(bruno)['available_camps'],['dwarf'])
        self.assertEqual(self.api('approve',{'request':alice,'camp':'dwarf'})[0],400)
        self.assertEqual(self.api('approve',{'request':alice})[1]['camp'],'elf')
        self.assertEqual(self.api('approve',{'request':bruno})[1]['camp'],'dwarf')
        self.assertEqual(self.api('host/seat',{'game':gameid,'camp':'elf'})[0],400)

        # The game itself is authoritative: the round endpoint derives the
        # winner and therefore the faction history, never accepting a winner
        # name arbitrarily supplied by a remote device.
        self.store.games[gameid].status='finished'
        self.store.games[gameid].winner='dwarf'
        self.store.save(self.store.games[gameid])
        code,round2=self.api('tournament/round',{'tournament':tournament['id']})
        self.assertEqual(code,200,round2)
        second=round2['matches'][0]
        self.assertEqual(second['round'],2)
        assigned={second['a']:second['camp_a'],second['b']:second['camp_b']}
        self.assertEqual(assigned,{'Alice':'dwarf','Bruno':'elf'})
        memory=self.store.tournaments[tournament['id']]
        self.assertEqual(memory['history']['Alice'],[{'camp':'elf','round':1}])
        self.assertEqual(memory['history']['Bruno'],[{'camp':'dwarf','round':1}])
        self.assertEqual(memory['matches'][0]['winner'],'Bruno')

        # Reboot should preserve the tournament history and match game IDs.
        reloaded=Store(self.folder.name)
        self.assertEqual(reloaded.tournaments[tournament['id']],memory)
        self.assertEqual(len(reloaded.tournaments[tournament['id']]['matches']),2)

    def test_tournament_does_not_start_a_second_round_before_last_game_finishes(self):
        code,created=self.api('tournament/create',{
            'name':'Tournoi','format':'swiss','players':['A','B'],'rounds':2})
        self.assertEqual(code,200)
        ident=created['tournament']['id']
        self.assertEqual(self.api('tournament/round',{'tournament':ident})[0],200)
        self.assertEqual(self.api('tournament/round',{'tournament':ident})[0],400)
        self.assertEqual(len(self.store.tournaments[ident]['matches']),1)

    def test_spectator_still_never_selects_a_camp(self):
        g=self.create('elf')
        code,res=self.api('join',{'game':g['game'],
                         'invite':g['invites']['spectator'],'name':'Observatrice'})
        self.assertEqual(code,200)
        self.assertEqual(res['status'],'approved')
        self.assertEqual(self.api('pending')[1]['pending'],[])
        self.assertIsNone(self.store.sessions[res['session']]['camp'])
        self.assertEqual(self.store.sessions[res['session']]['role'],'spectator')


if __name__=='__main__':
    unittest.main()
