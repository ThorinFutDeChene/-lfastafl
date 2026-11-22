"""Completed games are never restorable saves, including after host crashes.

Tournament standings and faction assignments remain durable independently
of the finished game files, and the final board stays visible in memory.
"""
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import urlopen

from alfastafl.server import Store, run
from alfastafl.tournament import Tournament


class CompletedGamePersistenceTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory()
        self.store=Store(self.folder.name)

    def tearDown(self):
        self.folder.cleanup()

    def saved(self,game):
        return Path(self.folder.name)/(game.id+'.alfastafl')

    def seat(self,game,camp):
        invitation=self.store.invites[game.id]['player']
        req=self.store.request(game.id,invitation,camp)
        return self.store.approve(req,camp)

    def assert_final_not_saved(self,game):
        self.assertEqual(game.status,'finished')
        self.assertFalse(self.saved(game).exists())
        self.assertIn(game.id,self.store.games,
                      'The final result must remain available to connected clients.')

    def test_resignation_removes_checkpoint_but_keeps_final_board_until_exit(self):
        game=self.store.create()
        self.assertTrue(self.saved(game).is_file())
        sid=self.seat(game,'dwarf')
        self.store.resign(game.id,sid)
        self.assert_final_not_saved(game)
        self.assertEqual(game.reason,'resignation')
        self.store.shutdown()
        self.assertNotIn(game.id,Store(self.folder.name).games)

    def test_accepted_draw_removes_checkpoint(self):
        game=self.store.create()
        dwarf=self.seat(game,'dwarf')
        elf=self.seat(game,'elf')
        self.store.offer_draw(game.id,dwarf)
        self.assertTrue(self.saved(game).exists())
        self.store.respond_draw(game.id,elf,True)
        self.assert_final_not_saved(game)
        self.assertEqual(game.reason,'draw_agreed')

    def test_winning_move_removes_checkpoint_without_losing_game_state(self):
        game=self.store.create('historical')
        game.board=[['.']*11 for _ in range(11)]
        game.board[1][4]='R'
        game.positions=[game.signature()]
        game.turn='elf'
        elf=self.seat(game,'elf')
        self.store.move(game.id,elf,[1,4],[0,4])
        self.assert_final_not_saved(game)
        self.assertEqual(game.winner,'elf')
        self.assertEqual(game.reason,'escape')
        self.assertEqual(len(game.history),1)

    def test_time_expiry_removes_checkpoint(self):
        now=[1000.0]
        self.store=Store(self.folder.name,clock_source=lambda:now[0],
                         wall_clock=lambda:2000000000.0+now[0])
        game=self.store.create(settings={'time_control':{'mode':'total','seconds':5}})
        dwarf=self.seat(game,'dwarf')
        elf=self.seat(game,'elf')
        self.store.touch(game.id,dwarf)
        self.store.touch(game.id,elf)
        now[0]+=6
        self.store.tick()
        self.assert_final_not_saved(game)
        self.assertEqual(game.reason,'time_expired')

    def test_disconnect_forfeit_removes_checkpoint(self):
        game=self.store.create()
        game.status='paused'
        game.reason='disconnected'
        game.disconnect={'missing':['elf'],'action_required':True,'deadline':0}
        self.store.disconnect_decision(game.id,'forfeit','elf')
        self.assert_final_not_saved(game)
        self.assertEqual(game.reason,'disconnect_forfeit')

    def test_existing_finished_saves_are_removed_on_launch(self):
        finished=self.store.create()
        pending=self.store.create()
        self.store.pause(pending.id)
        finished.status='finished'
        finished.winner='dwarf'
        finished.reason='resignation'
        self.saved(finished).write_text(json.dumps(finished.as_dict()),encoding='utf-8')
        self.assertTrue(self.saved(finished).is_file())
        restored=Store(self.folder.name)
        self.assertNotIn(finished.id,restored.games)
        self.assertFalse(self.saved(finished).exists())
        self.assertIn(pending.id,restored.games)
        self.assertTrue(self.saved(pending).exists())

    def test_completed_tournament_keeps_results_and_can_advance_after_restart(self):
        tournament=Tournament('Quatre joueurs','knockout',
                              ['Alice','Bruno','Chloe','David'])
        opening=tournament.next_round()
        self.assertEqual(len(opening),2)
        for match in opening:
            game=self.store.create()
            match['game']=game.id
        self.store.tournaments[tournament.id]=tournament.as_dict()
        self.store.save_tournaments()
        for match in opening:
            game=self.store.games[match['game']]
            game.status='finished'
            game.reason='resignation'
            game.winner=match['camp_a']
            self.store.save(game)
            self.assert_final_not_saved(game)
        after=Store(self.folder.name)
        self.assertFalse(any(after.path.glob('*.alfastafl')))
        saved_tournament=after.tournaments[tournament.id]
        for match in saved_tournament['matches']:
            self.assertEqual(match['winner'],match['a'])
        recorded=Tournament.from_dict(saved_tournament)
        self.assertEqual({p:len(recorded.history[p]) for p in recorded.players},
                         {p:1 for p in recorded.players})
        final=recorded.next_round()
        self.assertEqual(len(final),1)
        self.assertEqual(final[0]['round'],2)

    def test_legacy_tournament_result_is_archived_before_board_is_purged(self):
        tournament=Tournament('Ancien tournoi','knockout',['Alfa','Beta'])
        pair=tournament.next_round()[0]
        game=self.store.create()
        pair['game']=game.id
        self.store.tournaments[tournament.id]=tournament.as_dict()
        self.store.save_tournaments()
        game.status='finished'
        game.winner=pair['camp_b']
        game.reason='resignation'
        self.saved(game).write_text(json.dumps(game.as_dict()),encoding='utf-8')
        restored=Store(self.folder.name)
        self.assertFalse(self.saved(game).exists())
        self.assertNotIn(game.id,restored.games)
        match=restored.tournaments[tournament.id]['matches'][0]
        self.assertEqual(match['winner'],pair['b'])
        self.assertEqual(len(restored.tournaments[tournament.id]['history'][pair['a']]),1)

    def test_failed_result_checkpoint_never_discards_the_previous_game_save(self):
        tournament=Tournament('Protection','knockout',['Alfa','Beta'])
        pair=tournament.next_round()[0]
        game=self.store.create()
        pair['game']=game.id
        self.store.tournaments[tournament.id]=tournament.as_dict()
        self.store.save_tournaments()
        game.status='finished'
        game.winner=pair['camp_a']
        with patch.object(self.store,'save_tournaments',side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                self.store.save(game)
        self.assertTrue(self.saved(game).is_file(),
                        'An unfinished checkpoint must survive disk errors.')
        self.assertIsNone(self.store.tournaments[tournament.id]['matches'][0]['winner'])


class CompletedGameVisibilityTests(unittest.TestCase):
    def test_finished_board_remains_visible_but_does_not_appear_in_saves(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Store(folder)
            finished=store.create()
            pending=store.create()
            store.pause(pending.id)
            sid=store.approve(store.request(finished.id,
                              store.invites[finished.id]['player'],'Nain'),'dwarf')
            store.resign(finished.id,sid)
            server=run('127.0.0.1',0,store)
            worker=threading.Thread(target=server.serve_forever,daemon=True)
            worker.start()
            try:
                base='http://127.0.0.1:%s/api/'%server.server_port
                with urlopen(base+'games',timeout=4) as result:
                    games=json.loads(result.read())['games']
                ids={game['id'] for game in games}
                self.assertNotIn(finished.id,ids)
                self.assertIn(pending.id,ids)
                with urlopen(base+'state?game='+finished.id,timeout=4) as result:
                    payload=json.loads(result.read())
                self.assertEqual(payload['game']['status'],'finished')
                self.assertEqual(payload['game']['winner'],'elf')
            finally:
                server.shutdown()
                server.server_close()
                worker.join(timeout=5)


if __name__=='__main__':
    unittest.main()
