"""Tournament archives survive completed-match cleanup; deletions are durable and scoped."""
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from alfastafl.server import Store, run
from alfastafl.tournament import Tournament


class TournamentArchiveDeletionTests(unittest.TestCase):
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
        encoded=json.dumps(data).encode('utf-8') if data is not None else None
        req=Request(self.url+path,data=encoded,headers={'Content-Type':'application/json'}
                    if encoded is not None else {})
        try:
            with urlopen(req,timeout=5) as response:
                return response.status,json.loads(response.read())
        except HTTPError as error:
            return error.code,json.loads(error.read())

    def seeded(self,name,paused=True):
        t=Tournament(name,'round_robin',['Alice','Bruno'])
        [m]=t.next_round()
        game=self.store.create()
        m['game']=game.id
        self.store.tournaments[t.id]=t.as_dict()
        self.store.tournament_invitations(t.id)
        self.store.save_tournaments()
        if paused:
            game.status='paused'
            game.reason='saved_by_host'
            game.clock['started']=False
            self.store.save(game)
        return t.id,game.id

    def test_archived_results_outlive_game_saves_until_permanent_deletion(self):
        tid,gid=self.seeded('Coupe archivée')
        match=self.store.tournaments[tid]['matches'][0]
        game=self.store.games[gid]
        game.status='finished'
        game.winner=match['camp_a']
        game.clock['started']=False
        self.store.save(game)
        self.assertFalse((self.store.path/(gid+'.alfastafl')).exists())
        self.assertEqual(self.store.tournaments[tid]['matches'][0]['winner'],'Alice')
        recovered=Store(self.temp.name)
        self.assertEqual(recovered.tournaments[tid]['matches'][0]['winner'],'Alice')
        status,answer=self.api('tournament/delete',{'tournament':tid})
        self.assertEqual(status,200,answer)
        self.assertEqual(answer['deleted'],tid)
        self.assertEqual(answer['games_removed'],1)
        self.assertNotIn(tid,self.store.tournaments)
        self.assertNotIn(gid,self.store.games)
        self.assertEqual(self.api('tournament/delete',{'tournament':tid})[0],400)
        self.assertEqual(self.api('tournament/invites?tournament='+tid)[0],400)
        self.assertEqual(self.api('tournament/broadcast?tournament='+tid)[0],400)
        self.assertNotIn(tid,Store(self.temp.name).tournaments)

    def test_paused_match_checkpoint_sessions_and_pending_requests_removed(self):
        tid,gid=self.seeded('Ancien tournoi interrompu')
        other=self.store.create()
        self.store.sessions['phone']={
            'game':gid,'role':'player','camp':'elf','name':'Alice','active':True}
        self.store.sessions['unrelated']={
            'game':other.id,'role':'player','camp':'elf','name':'Autre','active':True}
        spectator=self.store.admit_tournament_lobby_spectator(tid)
        self.assertEqual(self.store.spectator_stats()['connected'],1)
        self.store.pending['pending']={
            'game':gid,'role':'player','name':'Alice','status':'waiting','session':None}
        self.store._registration_requests['signup']={
            'tournament':tid,'name':'Bruno','status':'waiting','token':None}
        self.assertTrue((self.store.path/(gid+'.alfastafl')).exists())
        self.assertTrue((self.store.path/(other.id+'.alfastafl')).exists())
        answer=self.store.delete_tournament(tid)
        self.assertEqual(answer['games_removed'],1)
        self.assertFalse((self.store.path/(gid+'.alfastafl')).exists())
        self.assertFalse(list(self.store.path.glob('.tournament-trash-*.pending')))
        self.assertTrue((self.store.path/(other.id+'.alfastafl')).exists())
        self.assertNotIn('phone',self.store.sessions)
        self.assertNotIn(spectator,self.store.sessions)
        self.assertIn('unrelated',self.store.sessions)
        self.assertEqual(self.store.spectator_stats()['connected'],0)
        self.assertEqual(self.store.pending['pending']['status'],'rejected')
        self.assertEqual(self.store._registration_requests['signup']['status'],'rejected')
        self.assertIn(other.id,Store(self.temp.name).games)
        self.assertNotIn(tid,Store(self.temp.name).tournaments)

    def test_active_match_cannot_be_deleted(self):
        tid,gid=self.seeded('Tournoi en cours',paused=False)
        result=self.api('tournament/delete',{'tournament':tid})
        self.assertEqual(result[0],400)
        self.assertIn('en cours',result[1]['error'])
        self.assertIn(tid,self.store.tournaments)
        self.assertIn(gid,self.store.games)
        self.assertTrue((self.store.path/(gid+'.alfastafl')).exists())

    def test_journal_write_failure_restores_checkpoint_and_tournament(self):
        tid,gid=self.seeded('Sécurité du disque')
        before=self.store.save_tournaments
        def fail():
            raise OSError('Disk temporarily unavailable')
        self.store.save_tournaments=fail
        try:
            with self.assertRaises(OSError):
                self.store.delete_tournament(tid)
        finally:
            self.store.save_tournaments=before
        self.assertIn(tid,self.store.tournaments)
        self.assertIn(gid,self.store.games)
        self.assertTrue((self.store.path/(gid+'.alfastafl')).exists())
        self.assertFalse(list(self.store.path.glob('.tournament-trash-*.pending')))
        self.assertIn(tid,Store(self.temp.name).tournaments)

    def test_startup_recovers_tombstones_after_interrupted_deletion(self):
        tid,gid=self.seeded('Tournoi repris')
        savefile=self.store.path/(gid+'.alfastafl')
        staged=self.store.path/('.tournament-trash-'+gid+'.pending')
        savefile.rename(staged)
        reloaded=Store(self.temp.name)
        self.assertIn(tid,reloaded.tournaments)
        self.assertIn(gid,reloaded.games)
        self.assertTrue(savefile.exists())
        self.assertFalse(staged.exists())
        savefile.rename(staged)
        self.store.tournaments.pop(tid)
        self.store.save_tournaments()
        restored=Store(self.temp.name)
        self.assertNotIn(tid,restored.tournaments)
        self.assertNotIn(gid,restored.games)
        self.assertFalse(savefile.exists())
        self.assertFalse(staged.exists())

    def test_empty_historical_event_can_be_deleted(self):
        response=self.api('tournament/create',{'name':'Essai abandonné',
            'format':'knockout','players':['Alice','Bruno']})
        self.assertEqual(response[0],200)
        tid=response[1]['tournament']['id']
        self.assertEqual(self.api('tournament/delete',{'tournament':tid})[0],200)
        self.assertFalse(any(t['id']==tid for t in self.api('tournaments')[1]['tournaments']))
        self.assertNotIn(tid,Store(self.temp.name).tournaments)


if __name__=='__main__': unittest.main()
