"""Local-network web service. All game mutations are server-authoritative."""
import json, threading, secrets, os, tempfile, pathlib, time, socket, io, uuid, hashlib, hmac
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from .core import Game, team, other
from .timecontrol import normalize_settings, new_clock, charge, switch_turn
from . import tutorial

PORT=8766

def data_directory():
    base=os.environ.get('XDG_DATA_HOME') or os.path.expanduser('~/.local/share')
    return pathlib.Path(base)/'alfastafl'/'parties'

class Store:
    def __init__(self, root=None, clock_source=None, wall_clock=None):
        self.monotonic = clock_source or time.monotonic
        self.wall_clock = wall_clock or time.time
        self._anchors = {}
        self._checkpoints = {}
        self._cinematics = {}
        self.path=pathlib.Path(root) if root is not None else data_directory()
        self.path.mkdir(parents=True,exist_ok=True)
        self.lock=threading.RLock()
        self.games={}
        self.invites={}
        self.pending={}
        self.sessions={}
        self.tournaments={}
        self._tournament_invites={}
        self._pending_secrets={}
        self._broadcast_sessions={}
        self.repetition_votes={}
        # A presentation is ephemeral and independent of saved game/tournament data.
        self.tutorial_live=None
        # Tournament faction history must survive app restarts, unlike
        # authorization sessions, which are deliberately ephemeral.
        self._tournament_file=self.path/'.tournaments.json'
        if self._tournament_file.is_file():
            try:
                saved=json.loads(self._tournament_file.read_text('utf-8'))
                if isinstance(saved,dict):
                    from .tournament import Tournament
                    for identifier,data in saved.items():
                        tournament=Tournament.from_dict(data)
                        if tournament.id==identifier:
                            self.tournaments[identifier]=tournament.as_dict()
            except (OSError,ValueError,TypeError,KeyError):
                pass
        for ident in self.tournaments:
            self._tournament_invites[ident]={'player':secrets.token_urlsafe(30),
                                               'spectator':secrets.token_urlsafe(30)}
        for f in self.path.glob('*.alfastafl'):
            try:
                d=json.loads(f.read_text('utf-8'))
                g=Game.from_dict(d)
                g.settings=normalize_settings(g.settings)
                if g.clock is None:
                    g.clock=new_clock(g.settings)
                if g.status=='active':
                    g.status='paused'
                    g.reason='host_restarted'
                    g.clock['started']=False
                elif g.status=='paused' and g.reason in ('repetition_review','draw_proposal'):
                    g.suspended_context={'reason':g.reason}
                    g.reason='host_restarted'
                    g.clock['started']=False
                if g.reason in ('disconnected', 'awaiting_substitute'):
                    g.reason='host_restarted'
                    g.clock['started']=False
                g.disconnect=None
                self.games[g.id]=g
            except (ValueError,TypeError,KeyError):continue
    def save(self,g):
        self.path.mkdir(parents=True,exist_ok=True)
        payload=json.dumps(g.as_dict(),ensure_ascii=False,indent=2)
        fd,tmp=tempfile.mkstemp(prefix='.alfastafl-',dir=self.path)
        try:
            with os.fdopen(fd,'w',encoding='utf-8') as f:
                f.write(payload);f.flush();os.fsync(f.fileno())
            os.replace(tmp,self.path/(g.id+'.alfastafl'))
            # Make the directory entry durable as well as the serialized content.
            try:
                directory_fd=os.open(self.path,os.O_DIRECTORY|os.O_RDONLY)
                try:os.fsync(directory_fd)
                finally:os.close(directory_fd)
            except (OSError,AttributeError):pass
        finally:
            if os.path.exists(tmp):os.unlink(tmp)
    def save_tournaments(self):
        """Durably checkpoint standings and faction histories, atomically."""
        payload=json.dumps(self.tournaments,ensure_ascii=False,indent=2)
        fd,tmp=tempfile.mkstemp(prefix='.alfastafl-tournaments-',dir=self.path)
        try:
            with os.fdopen(fd,'w',encoding='utf-8') as file:
                file.write(payload);file.flush();os.fsync(file.fileno())
            os.replace(tmp,self._tournament_file)
            try:
                directory_fd=os.open(self.path,os.O_DIRECTORY|os.O_RDONLY)
                try:os.fsync(directory_fd)
                finally:os.close(directory_fd)
            except (OSError,AttributeError):pass
        finally:
            if os.path.exists(tmp):os.unlink(tmp)

    def start_tutorial_live(self,mode,lesson=None):
        """The Ubuntu host publishes one temporary, read-only teaching session."""
        with self.lock:
            state=tutorial.lesson_state(mode,lesson)
            token=secrets.token_urlsafe(42)
            self.tutorial_live={'token':token,'revision':1,'state':state,
                'selected':None,'legal':[],'captures':[],'hint_visible':False,
                'updated':self.monotonic(),'event':None}
            return {'token':token,'revision':1}

    def update_tutorial_live(self,token,state,selected=None,legal=None,
                             captures=None,hint_visible=False):
        """Accept ONLY snapshots from the local host, never the LAN viewer."""
        with self.lock:
            live=self.tutorial_live
            if not live or not isinstance(token,str) or not hmac.compare_digest(
                    token,live['token']):
                raise ValueError('Présentation du tutoriel expirée.')
            if not isinstance(state,dict) or not isinstance(state.get('mode'),str) or \
                    not isinstance(state.get('lesson'),str):
                raise ValueError('État de démonstration invalide.')
            # Reject malformed positions before exposing them to spectators.
            tutorial.lesson_state(state['mode'],state['lesson'])
            board=state.get('board')
            if not isinstance(board,list) or len(board)!=11 or any(
                    not isinstance(row,list) or len(row)!=11 for row in board):
                raise ValueError('Plateau de démonstration invalide.')
            for points in (legal,captures):
                if not isinstance(points,list) or len(points)>121:
                    raise ValueError('Cases de démonstration invalides.')
            if selected is not None and (not isinstance(selected,list) or
                    len(selected)!=2 or any(type(v)!=int or v<0 or v>10 for v in selected)):
                raise ValueError('Sélection de démonstration invalide.')
            snapshot={'state':state,'selected':selected,'legal':legal,
                      'captures':captures,'hint_visible':bool(hint_visible)}
            if any(live[k]!=v for k,v in snapshot.items()):
                live.update(snapshot)
                live['revision']+=1
                # A move event must have a revision to prevent repeat animations.
                live['event']=state.get('last_move') if state.get('completed') else None
            live['updated']=self.monotonic()
            return {'revision':live['revision']}

    def tutorial_live_state(self,token,lan_enabled):
        with self.lock:
            live=self.tutorial_live
            if not lan_enabled or not live or not isinstance(token,str) or \
                    len(token)>200 or not hmac.compare_digest(token,live['token']) or \
                    self.monotonic()-live['updated']>20:
                raise PermissionError('Présentation indisponible ou terminée.')
            return {key:live[key] for key in ('revision','state','selected',
                       'legal','captures','hint_visible','event')}

    def stop_tutorial_live(self,token):
        with self.lock:
            live=self.tutorial_live
            if live and isinstance(token,str) and hmac.compare_digest(
                    token,live['token']):
                self.tutorial_live=None
                return True
            return False

    def tournament_match(self,gid):
        """The scheduled identities and immutable camps for a tournament game."""
        for t in self.tournaments.values():
            for match in t.get('matches',[]):
                if match.get('game')==gid:
                    return match
        return None

    def tournament_for_game(self, gid):
        for ident, t in self.tournaments.items():
            for match in t.get('matches', []):
                if match.get('game') == gid:
                    return ident, match
        return None, None

    def tournament_invitations(self, tid):
        if tid not in self.tournaments:
            raise ValueError('Tournoi inconnu.')
        if tid not in self._tournament_invites:
            self._tournament_invites[tid] = {
                'player': secrets.token_urlsafe(30),
                'spectator': secrets.token_urlsafe(30),
            }
        return self._tournament_invites[tid]

    def _trusted_device(self, tid, role, name, secret):
        """A bearer proof, scoped to ONE registered player or spectator.

        The network/browser does not reveal MAC addresses. Only the SHA256
        fingerprint is persisted. Compare in constant time and never treat
        the public QR invitation itself as a trusted device.
        """
        if not isinstance(secret, str) or not 36 <= len(secret) <= 160:
            return None
        if tid not in self.tournaments or role not in ('player', 'spectator'):
            return None
        field = 'devices' if role == 'player' else 'spectator_devices'
        fingerprints = self.tournaments[tid].get(field, {}).get(name, [])
        digest = hashlib.sha256(secret.encode('utf-8')).hexdigest()
        return digest if any(hmac.compare_digest(digest, x)
                             for x in fingerprints) else None

    def _scheduled_match(self, tid, name=None, role='player'):
        tournament = self.tournaments[tid]
        matches = [m for m in tournament['matches']
                   if m.get('game') in self.games
                   and m.get('winner') is None
                   and self.games[m['game']].status != 'finished'
                   and (role == 'spectator' or name in (m['a'], m['b']))]
        # Each participant has no more than one encounter in a round. A
        # tournament with four participants has TWO independent active games.
        return max(matches, key=lambda m: m['round'], default=None)

    def _resume_tournament_game(self, gid):
        g = self.games[gid]
        if g.status == 'paused' and g.reason in ('host_restarted', 'saved_by_host'):
            self.resume(gid)
        elif g.status == 'paused' and g.reason in ('disconnected', 'awaiting_substitute'):
            if not g.disconnect or g.disconnect.get('action_required'):
                raise ValueError('Arbitrage requis : délai de reconnexion dépassé.')
        elif g.status != 'active':
            raise ValueError('Partie indisponible.')

    def _trusted_tournament_session(self, tid, game_id, name, role, fingerprint):
        g = self.games[game_id]
        self._resume_tournament_game(game_id)
        camp = None
        if role == 'player':
            _, match = self.tournament_for_game(game_id)
            camp = match['camp_a'] if match['a'] == name else match['camp_b']
            old = [(key, x) for key, x in self.sessions.items()
                   if x['game'] == game_id and x['active'] and
                   x['role'] == 'player' and x['camp'] == camp]
            # Same browser may refresh/scan again without stealing its own
            # seat; an unrelated device cannot evict the approved player.
            if old:
                if old[0][1].get('device_fp') != fingerprint:
                    raise PermissionError('La place est déjà attribuée à un autre appareil.')
                return old[0][0]
        else:
            old = [(key, x) for key, x in self.sessions.items()
                   if x['game'] == game_id and x['active'] and
                   x['role'] == 'spectator' and x.get('broadcast_tournament') == tid
                   and x.get('device_fp') == fingerprint]
            if old:
                return old[0][0]
        now = self.monotonic()
        sid = secrets.token_urlsafe(30)
        self.sessions[sid] = {
            'game': game_id, 'role': role, 'camp': camp, 'name': name,
            'active': True, 'seen': False, 'connected': True,
            'last_seen': now, 'device_fp': fingerprint,
            'broadcast_tournament': tid if role == 'spectator' else None,
        }
        if camp:
            g.players[camp] = name
            self.save(g)
        return sid

    def enter_tournament(self, tid, invite, name, device_token=None):
        """Enter the participant's next outstanding match with ONE tournament QR.

        First-time devices request host approval. Once approved, the browser
        presents a per-tournament secret to resume a seat without a new
        approval, even after the game host process restarts.
        """
        with self.lock:
            t = self.tournaments.get(tid)
            if t is None:
                raise ValueError('Tournoi inconnu.')
            invites = self.tournament_invitations(tid)
            role = next((r for r, secret in invites.items()
                         if hmac.compare_digest(invite, secret)), None)
            if role is None:
                raise PermissionError('Invitation de tournoi invalide.')
            name = name.strip() if isinstance(name, str) else ''
            if not 1 <= len(name) <= 60:
                raise ValueError('Nom invalide.')
            if role == 'player' and name not in t['players']:
                raise PermissionError('Ce nom ne figure pas parmi les inscrits.')
            match = self._scheduled_match(tid, name, role)
            if match is None:
                return {'status': 'waiting_match', 'tournament': tid,
                        'message': 'Aucune rencontre en attente pour ce participant.'}
            gid = match['game']
            proof = self._trusted_device(tid, role, name, device_token)
            if proof is not None:
                sid = self._trusted_tournament_session(tid, gid, name, role, proof)
                return {'status': 'approved', 'game': gid, 'session': sid,
                        'role': role, 'camp': self.sessions[sid]['camp'],
                        'tournament': tid, 'name': name}
            g = self.games[gid]
            if g.status == 'paused' and g.reason in ('host_restarted', 'saved_by_host'):
                return {'status': 'awaiting_host',
                        'message': 'Un appareil inconnu nécessite une nouvelle autorisation de l’hôte.'}
            req = self.request(gid, self.invites[gid][role], name)
            self.pending[req]['broadcast_tournament'] = tid if role == 'spectator' else None
            return {'status': 'pending', 'game': gid, 'request': req,
                    'tournament': tid, 'role': role, 'name': name}

    def broadcast(self, tid, sid=None, admin=False):
        """Authorized spectators and host receive safe live match switching.

        Frame credentials are read-only, individually scoped to one match.
        There is no stream from the organizer's desktop or user camera.
        """
        with self.lock:
            tournament = self.tournaments.get(tid)
            if tournament is None:
                raise ValueError('Tournoi inconnu.')
            owner = self.sessions.get(sid) if sid else None
            if not admin and not (owner and owner['active'] and
                                  owner['role'] == 'spectator' and
                                  owner.get('broadcast_tournament') == tid):
                raise PermissionError('Diffusion du tournoi non autorisée.')
            matches = []
            for m in tournament['matches']:
                gid = m.get('game')
                if gid not in self.games or m['round'] != tournament['round_no']:
                    continue
                g = self.games[gid]
                if not admin:
                    link = self._broadcast_sessions.get((sid, gid))
                    if not link or not self.sessions.get(link, {}).get('active'):
                        link = secrets.token_urlsafe(30)
                        self.sessions[link] = {
                            'game': gid, 'role': 'spectator', 'camp': None,
                            'name': owner['name'], 'active': True,
                            'seen': False, 'connected': True,
                            'last_seen': self.monotonic(),
                            'device_fp': owner.get('device_fp'),
                            'broadcast_tournament': tid,
                        }
                        self._broadcast_sessions[(sid, gid)] = link
                else:
                    link = None
                matches.append({
                    'id': m['id'], 'game': gid, 'round': m['round'],
                    'a': m['a'], 'b': m['b'], 'camp_a': m['camp_a'],
                    'camp_b': m['camp_b'],
                    'status': g.status, 'turn': g.turn, 'moves': len(g.history),
                    'winner': m.get('winner') or (
                        m['a'] if g.winner == m['camp_a'] else
                        m['b'] if g.winner == m['camp_b'] else None),
                    'cinematic': self.cinematic_state(gid),
                    'session': link,
                })
            return {'id': tid, 'name': tournament['name'],
                    'round': tournament['round_no'], 'matches': matches}

    def revoke_tournament_device(self, tid, name, role):
        with self.lock:
            t = self.tournaments[tid]
            key = 'devices' if role == 'player' else 'spectator_devices'
            removed = t.get(key, {}).pop(name, [])
            for entry in self.sessions.values():
                if entry.get('device_fp') in removed:
                    entry['active'] = False
            self.save_tournaments()
            return len(removed)

    def available_camps(self,gid,name=None):
        """Server-authoritative choices for the host's approval dialog.

        A single free camp is automatically assigned. Tournament players
        never choose a camp: it comes from the precomputed round draw.
        """
        g=self.games.get(gid)
        if g is None:
            return []
        substitutes=g.status=='paused' and g.reason=='awaiting_substitute'
        if g.status!='active' and not substitutes:
            return []
        occupied=self._seats(gid)
        replacements=(g.disconnect or {}).get('replacement_camps',[]) if substitutes else []
        available=[camp for camp in ('elf','dwarf')
                   if camp not in occupied or camp in replacements]
        match=self.tournament_match(gid)
        if match is not None:
            assigned=next((match['camp_'+role] for role in ('a','b')
                           if match[role]==name),None)
            return [assigned] if assigned in available else []
        return available

    def create(self,mode='fetlar',settings=None):
        config=normalize_settings(settings)
        g=Game(mode=mode,settings=config,clock=new_clock(config))
        with self.lock:
            self.games[g.id]=g;self.save(g)
            self.invites[g.id]={'player':secrets.token_urlsafe(24),'spectator':secrets.token_urlsafe(24)}
        return g
    def seat_host(self, gid, camp):
        """Assign a local host player through the same session/clock rules as guests.

        Called only by host-only HTTP endpoints; regular move endpoints still
        require a valid player session, including on 127.0.0.1.
        """
        with self.lock:
            game=self.games.get(gid)
            if game is None:
                raise ValueError('Partie inconnue.')
            if camp not in (None,'elf','dwarf'):
                raise ValueError('Choisissez Elfes, Nains ou Hôte spectateur.')
            if game.status!='active':
                raise ValueError('Reprenez la partie avant de choisir un camp.')
            previous=[(sid,s) for sid,s in self.sessions.items()
                      if s['game']==gid and s['role']=='player' and
                      s.get('local_host') and s['active']]
            if previous and previous[0][1]['camp']==camp:
                return previous[0][0]
            # A local player must not silently change identity after playing or
            # while clocks are already running with both participants.
            if previous and (game.history or game.clock['started']):
                raise ValueError('Impossible de changer de camp après le début de la partie.')
            if camp is not None:
                match=self.tournament_match(gid)
                if match is not None:
                    scheduled=next((match['camp_'+role] for role in ('a','b')
                                    if match[role]=='PC hôte'),None)
                    if scheduled!=camp:
                        raise ValueError('En tournoi, seul le camp attribué au PC hôte est autorisé.')
                occupied=self._seats(gid).get(camp)
                if occupied is not None and not occupied.get('local_host'):
                    raise ValueError('Ce camp est déjà occupé par un joueur distant.')
            for sid,old in previous:
                old['active']=False
                if game.players.get(old['camp'])==old['name']:
                    game.players.pop(old['camp'],None)
            if camp is None:
                if previous:self.save(game)
                return None
            sid=secrets.token_urlsafe(30)
            now=self.monotonic()
            self.sessions[sid]={'game':gid,'role':'player','camp':camp,'name':'PC hôte',
                                'local_host':True,'active':True,'seen':False,
                                'connected':True,'last_seen':now}
            game.players[camp]='PC hôte'
            self.save(game)
            return sid

    def _seats(self, gid):
        return {s['camp']:s for s in self.sessions.values()
                if s['game']==gid and s['role']=='player' and s['active']}

    def _ready(self, gid, now):
        seats=self._seats(gid)
        grace=self.games[gid].settings['disconnect_grace_seconds']
        return all(camp in seats and seats[camp].get('seen') and
                   now-seats[camp]['last_seen'] <= grace and
                   seats[camp].get('connected',True)
                   for camp in ('elf','dwarf'))

    def _start_if_ready(self, g, now):
        if g.id in self._cinematics:return
        if g.status=='active' and not g.clock['started'] and self._ready(g.id,now):
            g.clock['started']=True
            self._anchors[g.id]=now
            self._checkpoints[g.id]=now
            self.save(g)

    def _advance(self,g, now):
        if g.status!='active' or not g.clock['started']:
            self._anchors.pop(g.id,None)
            return
        last=self._anchors.get(g.id)
        self._anchors[g.id]=now
        if last is None:
            return
        if charge(g.clock,g.turn,max(0.0,now-last)):
            loser=g.turn
            g.status,g.winner,g.reason='finished',other(loser),'time_expired'
            g.draw_offer=None
            g.events.append({'type':'time_expired','loser':loser,'winner':g.winner,
                             'at':self.wall_clock()})
            self._anchors.pop(g.id,None)
            self.save(g)
        elif now-self._checkpoints.get(g.id,now)>=5.0:
            # Bounded data loss on an unexpected host crash.
            self.save(g)
            self._checkpoints[g.id]=now

    def _tick_locked(self, now=None):
        now=self.monotonic() if now is None else now
        for g in list(self.games.values()):
            cutscene=self._cinematics.get(g.id)
            if cutscene:
                if now < cutscene['deadline']:
                    continue  # No chess clock advances or disconnects during combat.
                del self._cinematics[g.id]
                self._anchors.pop(g.id,None)
                self._checkpoints.pop(g.id,None)
                if g.status=='active':
                    self._start_if_ready(g,now)
            if g.status=='active':
                if not g.clock['started']:
                    self._start_if_ready(g,now)
                if not g.clock['started']:
                    continue
                seats=self._seats(g.id)
                grace=g.settings['disconnect_grace_seconds']
                missing=[camp for camp in ('elf','dwarf')
                         if camp not in seats or not seats[camp].get('seen') or
                         now-seats[camp]['last_seen'] > grace]
                if missing:
                    cutoffs=[seats[c]['last_seen']+grace for c in missing
                             if c in seats and seats[c].get('seen')]
                    cutoff=min(cutoffs) if cutoffs else now
                    # A delayed watchdog cannot consume time *after* the grace deadline.
                    self._advance(g,min(now,cutoff))
                    if g.status=='active':
                        for camp in missing:
                            if camp in seats:seats[camp]['connected']=False
                        g.status,g.reason='paused','disconnected'
                        g.events.append({'type':'disconnected','missing':list(missing),
                                         'at':self.wall_clock()})
                        g.disconnect={'missing':missing,'since':self.wall_clock(),
                                      'deadline':self.wall_clock()+g.settings['reconnect_timeout_seconds'],
                                      'action_required':False}
                        self._anchors.pop(g.id,None)
                        self.save(g)
                else:
                    self._advance(g,now)
            elif g.status=='paused' and g.reason=='disconnected' and g.disconnect:
                if (not g.disconnect.get('action_required') and
                    self.wall_clock()>=g.disconnect['deadline']):
                    g.disconnect['action_required']=True
                    self.save(g)

    def tick(self):
        with self.lock:
            self._tick_locked()

    def touch(self,gid,sid):
        """Heartbeat from an authenticated player; spectator polling never blocks a game."""
        with self.lock:
            now=self.monotonic()
            self._tick_locked(now)
            s=self.sessions.get(sid)
            if not s or s['game']!=gid or not s['active']:
                return None
            if s['role']=='player':
                s['seen']=True
                s['last_seen']=now
                s['connected']=True
                g=self.games[gid]
                if (g.status=='paused' and g.reason in ('disconnected','awaiting_substitute')
                    and g.disconnect and not g.disconnect.get('action_required')
                    and self._ready(gid,now)):
                    g.status,g.reason='active',None
                    g.events.append({'type':'reconnected','at':self.wall_clock()})
                    g.disconnect=None
                    g.clock['started']=True
                    self._anchors[gid]=now
                    self._checkpoints[gid]=now
                    self.save(g)
                else:
                    self._start_if_ready(g,now)
            return s

    def cinematic_state(self, gid):
        """Time remaining and capture event for every authenticated viewer."""
        scene=self._cinematics.get(gid)
        if not scene:return None
        remaining=max(0.0,scene['deadline']-self.monotonic())
        if remaining<=0:return None
        return {'move':scene['move'],'duration':scene['duration'],'remaining':remaining}

    def delete_game(self, gid):
        """Permanently delete a paused/finished match, never a live match.

        The host confirmation is handled by the UI; the status and filesystem
        checks are enforced here regardless of how the endpoint is called.
        """
        with self.lock:
            game = self.games.get(gid)
            if game is None:
                raise KeyError('Partie inconnue ou déjà supprimée.')
            if game.status not in ('paused', 'finished'):
                raise ValueError('Partie en cours : sauvegardez et quittez avant de la supprimer.')
            if any(match.get('game') == gid
                   for tournament in self.tournaments.values()
                   for match in tournament.get('matches', [])):
                raise ValueError('Cette partie appartient à un tournoi et ne peut pas être supprimée.')
            # No user-supplied path: only a known game with a canonical UUID.
            try:
                valid_id = str(uuid.UUID(game.id)) == game.id
            except (ValueError, AttributeError, TypeError):
                valid_id = False
            if not valid_id:
                raise ValueError('Identifiant de partie invalide.')
            saved_file = self.path / (game.id + '.alfastafl')
            try:
                saved_file.unlink()
            except FileNotFoundError:
                pass  # The in-memory entry may outlive an externally removed save.
            # Deleting the checkpoint first means an I/O error cannot silently
            # remove the match from the UI while leaving the save on disk.
            try:
                directory_fd = os.open(self.path, os.O_DIRECTORY | os.O_RDONLY)
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
            except (OSError, AttributeError):
                pass
            self.games.pop(gid)
            self.invites.pop(gid, None)
            self._anchors.pop(gid, None)
            self._checkpoints.pop(gid, None)
            self._cinematics.pop(gid, None)
            self.repetition_votes.pop(gid, None)
            for sid in [key for key, item in self.sessions.items() if item['game'] == gid]:
                del self.sessions[sid]
            for request in self.pending.values():
                if request['game'] == gid:
                    request['status'] = 'rejected'
                    request['session'] = None
            return True

    def pause(self,gid):
        """Host saves and leaves. Old authorizations and invite URLs are revoked."""
        with self.lock:
            self._tick_locked()
            g=self.games[gid]
            if g.status=='finished':raise ValueError('Finished game cannot be suspended')
            if g.status=='paused' and g.reason=='saved_by_host':return g
            g.suspended_context=({'reason':g.reason} if g.status=='paused'
                                  and g.reason in ('repetition_review','draw_proposal')
                                  else None)
            g.status,g.reason='paused','saved_by_host'
            g.disconnect=None
            g.clock['started']=False
            self._anchors.pop(gid,None)
            self._cinematics.pop(gid,None)
            for session in self.sessions.values():
                if session['game']==gid:session['active']=False
            for pending in self.pending.values():
                if pending['game']==gid and pending['status']=='waiting':
                    pending['status']='rejected'
            self.invites.pop(gid,None)
            self.save(g)
            return g

    def resume(self,gid):
        """Host explicitly restores an unfinished game, with fresh QR invitations."""
        with self.lock:
            g=self.games[gid]
            if g.status!='paused' or g.reason in ('repetition_review','draw_proposal',
                                                  'disconnected','awaiting_substitute'):
                raise ValueError('Game cannot be resumed without adjudication')
            if g.reason=='disconnected' and g.disconnect and not g.disconnect.get('action_required'):
                raise ValueError('Wait for the players to reconnect')
            g.status='paused' if g.suspended_context else 'active'
            g.reason=g.suspended_context['reason'] if g.suspended_context else None
            g.suspended_context=None
            g.disconnect=None
            g.clock['started']=False
            self._anchors.pop(gid,None)
            self._cinematics.pop(gid,None)
            for session in self.sessions.values():
                if session['game']==gid:session['active']=False
            for pending in self.pending.values():
                if pending['game']==gid and pending['status']=='waiting':
                    pending['status']='rejected'
            self.invites[gid]={'player':secrets.token_urlsafe(24),
                               'spectator':secrets.token_urlsafe(24)}
            self.save(g)
            return g

    def disconnect_decision(self,gid,action,camp=None):
        """After the reconnect deadline, only the host can decide a player's fate."""
        with self.lock:
            self._tick_locked()
            g=self.games[gid]
            if action=='save':return self.pause(gid).as_dict()
            if (g.status!='paused' or g.reason!='disconnected' or
                not g.disconnect or not g.disconnect.get('action_required')):
                raise ValueError('No expired disconnection requiring arbitration')
            missing=g.disconnect['missing']
            if action=='forfeit':
                if camp is None and len(missing)==1:camp=missing[0]
                if camp not in missing:raise ValueError('Choose a disconnected player')
                g.status,g.winner,g.reason='finished',other(camp),'disconnect_forfeit'
                g.events.append({'type':'disconnect_forfeit','loser':camp,
                                 'winner':g.winner,'at':self.wall_clock()})
                g.disconnect=None
            elif action=='substitute':
                g.status,g.reason='paused','awaiting_substitute'
                g.disconnect['action_required']=False
                g.disconnect['replacement_camps']=list(missing)
                for old in self.sessions.values():
                    if old['game']==gid and old['role']=='player' and old['camp'] in missing:
                        old['active']=False
                # Substitute requests still require explicit host approval.
            else:
                raise ValueError('Unknown host decision')
            self.save(g)
            return g.as_dict()

    def shutdown(self):
        """Persist the current clocks; host closure cannot silently burn time."""
        with self.lock:
            self.tutorial_live=None
            self._tick_locked()
            self._cinematics.clear()
            for g in self.games.values():
                if g.status=='active' or (g.status=='paused' and
                     g.reason in ('repetition_review','draw_proposal')):
                    if g.status=='paused':
                        g.suspended_context={'reason':g.reason}
                    g.status,g.reason='paused','host_closed'
                    g.clock['started']=False
                    self._anchors.pop(g.id,None)
                    self.save(g)

    def request(self,gid,token,name):
        with self.lock:
            invites=self.invites.get(gid,{})
            role=next((k for k,v in invites.items() if v==token),None)
            if role is None:raise ValueError('Invalid invitation')
            if not 1<=len(name.strip())<=60:raise ValueError('Invalid name')
            if role=='player' and not self.available_camps(gid,name.strip()):
                raise ValueError('Aucune faction disponible pour ce joueur sur cette partie.')
            request_id=secrets.token_urlsafe(18)
            self.pending[request_id]={'game':gid,'role':role,'name':name.strip(),'status':'waiting','session':None}
            return request_id
    def approve(self,request_id,team_name=None):
        with self.lock:
            req=self.pending[request_id]
            if req['status']!='waiting':raise ValueError('Already processed')
            gid=req['game']
            if req['role']=='player':
                choices=self.available_camps(gid,req['name'])
                if not choices:
                    raise ValueError('Aucune faction disponible pour cette demande.')
                if team_name is None:
                    if len(choices)!=1:
                        raise ValueError('Le premier joueur doit choisir une faction.')
                    team_name=choices[0]
                if team_name not in choices:
                    raise ValueError('Cette faction est occupée ou réservée à un autre joueur.')
                existing=[s for s in self.sessions.values() if s['game']==gid and
                          s['role']=='player' and s['camp']==team_name and s['active']]
                g=self.games[gid]
                replacements=(g.disconnect or {}).get('replacement_camps',[])
                if existing and not (g.reason=='awaiting_substitute' and team_name in replacements):
                    raise ValueError('Camp already occupied')
                if g.reason=='awaiting_substitute' and team_name in replacements:
                    for s in existing:s['active']=False
                    g.disconnect['replacement_camps'].remove(team_name)
                g.players[team_name]=req['name']
                self.save(g)
            else:team_name=None
            sid=secrets.token_urlsafe(30)
            self.sessions[sid]={'game':gid,'role':req['role'],'camp':team_name,'name':req['name'],
                                'active':True,'seen':False,'connected':True,
                                'last_seen':self.monotonic()}
            req.update(status='approved',session=sid)
            tid,match=self.tournament_for_game(gid)
            if tid is not None:
                # Host-approved identity is enrolled on this browser ONLY;
                # future tournament rounds can rejoin by secret proof.
                raw=secrets.token_urlsafe(36)
                fingerprint=hashlib.sha256(raw.encode('utf-8')).hexdigest()
                field='devices' if req['role']=='player' else 'spectator_devices'
                self.tournaments[tid].setdefault(field,{}).setdefault(req['name'],[]).append(fingerprint)
                self._pending_secrets[request_id]={'token':raw,'tournament':tid,
                                                    'name':req['name'],'role':req['role']}
                self.sessions[sid]['device_fp']=fingerprint
                if req['role']=='spectator':
                    self.sessions[sid]['broadcast_tournament']=tid
                self.save_tournaments()
            return sid
    def player(self, gid, sid):
        session = self.sessions.get(sid)
        if not session or session['game'] != gid or not session['active'] or session['role'] != 'player':
            raise PermissionError('Only an authorized player may act')
        return session['camp']

    def legal_for(self, gid, sid, square):
        with self.lock:
            side = self.player(gid, sid)
            self._tick_locked()
            game = self.games[gid]
            if game.clock['mode']!='unlimited' and not game.clock['started']:
                return []
            return game.legal(square) if game.turn == side else []

    def legal_details_for(self, gid, sid, square):
        with self.lock:
            moves = self.legal_for(gid, sid, square)
            return {'moves': moves,
                    'captures': self.games[gid].capture_destinations(square, moves)}

    def offer_draw(self, gid, sid):
        with self.lock:
            side = self.player(gid, sid)
            self._tick_locked()
            game = self.games[gid]
            if game.status != 'active':
                raise ValueError('No active game')
            game.draw_offer = side
            self.save(game)
            return side

    def respond_draw(self, gid, sid, accept):
        with self.lock:
            side = self.player(gid, sid)
            self._tick_locked()
            game = self.games[gid]
            if game.status != 'active' or game.draw_offer != other(side):
                raise ValueError('No opposing draw offer')
            if type(accept) is not bool:
                raise ValueError('Invalid draw response')
            game.draw_offer = None
            if accept:
                game.status, game.winner, game.reason = 'finished', None, 'draw_agreed'
            self.save(game)
            return game.as_dict()

    def resign(self, gid, sid):
        with self.lock:
            side = self.player(gid, sid)
            self._tick_locked()
            game = self.games[gid]
            if game.status != 'active':
                raise ValueError('No active game')
            game.status, game.winner, game.reason = 'finished', other(side), 'resignation'
            game.draw_offer = None
            self.save(game)
            return game.as_dict()

    def repetition_vote(self, gid, sid, outcome):
        with self.lock:
            side = self.player(gid, sid)
            self._tick_locked()
            game = self.games[gid]
            if game.status != 'paused' or game.reason not in ('repetition_review', 'draw_proposal'):
                raise ValueError('No review in progress')
            valid = ('draw',) if game.reason == 'draw_proposal' else ('elf', 'dwarf', 'draw', 'disagree')
            if outcome not in valid:
                raise ValueError('Invalid review decision')
            votes = self.repetition_votes.setdefault(gid, {})
            votes[side] = outcome
            if outcome == 'disagree':
                game.undo_repetition()
                self.repetition_votes.pop(gid, None)
                if game.status=='active':
                    switch_turn(game.clock)
                    self._start_if_ready(game,self.monotonic())
                    if game.clock['started']:
                        self._anchors[gid]=self.monotonic()
                self.save(game)
                return {'result': 'undo', 'votes': {}}
            if len(votes) == 2:
                if votes.get('elf') == votes.get('dwarf'):
                    game.resolve_repetition(outcome) if game.reason == 'repetition_review' else None
                    if game.reason == 'draw_proposal':
                        game.status, game.winner, game.reason = 'finished', None, 'draw_agreed'
                    self.repetition_votes.pop(gid, None)
                    self.save(game)
                    return {'result': 'agreed', 'votes': {}}
                game.undo_repetition()
                self.repetition_votes.pop(gid, None)
                if game.status=='active':
                    switch_turn(game.clock)
                    self._start_if_ready(game,self.monotonic())
                    if game.clock['started']:
                        self._anchors[gid]=self.monotonic()
                self.save(game)
                return {'result': 'undo', 'votes': {}}
            return {'result': 'waiting', 'votes': dict(votes)}

    def move(self,gid,sid,start,end):
        with self.lock:
            camp=self.player(gid,sid)
            self._tick_locked()
            g=self.games[gid]
            if gid in self._cinematics:
                raise ValueError('La cinématique de capture est en cours.')
            if camp!=g.turn:raise PermissionError('Not your turn')
            if g.clock['mode']!='unlimited' and not g.clock['started']:
                raise ValueError('Waiting for both players before starting the clock')
            event=g.move(start,end)
            switch_turn(g.clock)
            event['clock']={'remaining':dict(g.clock['remaining']),
                            'turn_remaining':g.clock['turn_remaining']}
            if g.status=='active':
                self._anchors[gid]=self.monotonic()
            else:
                self._anchors.pop(gid,None)
            duration=g.settings.get('capture_cinematic_seconds',0)
            if duration and (event['captured'] or event.get('reason') in ('king_captured', 'escape')):
                now=self.monotonic()
                self._cinematics[gid]={'deadline':now+duration,'duration':duration,'move':event}
                g.clock['started']=False
                self._anchors.pop(gid,None)
            self.save(g)
            return event

class AppHandler(BaseHTTPRequestHandler):
    server_version='AlfastaflDEV/0.3'
    def send(self,body,status=200):
        raw=json.dumps(body,ensure_ascii=False).encode('utf-8')
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw)
    def admin(self):return self.client_address[0] in ('127.0.0.1','::1')
    def read_json(self):
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n<0 or n>65536:raise ValueError('Invalid request length')
            return json.loads(self.rfile.read(n)) if n else {}
        except (json.JSONDecodeError,UnicodeDecodeError):raise ValueError('Invalid JSON')
    def static(self,path):
        root=pathlib.Path(__file__).resolve().parents[2]/'web'
        assets=('index.html','app.js','tutorial.js','tutorial-view.html','tutorial-view.js','host-shell.js','tournament-ui.js',
                'tournament-client.js','tournament-broadcast.js','style.css',
                'board-view.js','board3d.js','figurines3d.js','move3d.js','cinematic3d.js','combat-motion.js','flank-capture.js',
                'flank-cinematic3d.js','archery3d.js','throne-capture.js',
                'throne-cinematic3d.js','escape-motion.js','king-escape3d.js','king-siege-motion.js',
                'king-siege3d.js','soundscape.js',
                'vendor/three/three.module.js','vendor/three/three.core.js',
                'vendor/three/OrbitControls.js','vendor/three/BufferGeometryUtils.js',
                'vendor/three/LICENSE.txt')
        p='index.html' if path=='/' else {('/'+name):name for name in assets}.get(path)
        if not p:self.send_error(404);return
        raw=(root/p).read_bytes()
        typ={'html':'text/html','css':'text/css','js':'text/javascript','txt':'text/plain'}[p.rsplit('.',1)[-1]]
        self.send_response(200);self.send_header('Content-Type',typ+'; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-cache');self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        u=urlparse(self.path);q=parse_qs(u.query)
        if u.path=='/api/qr':
            try:
                import qrcode
                gid=q.get('game',[''])[0];tid=q.get('tournament',[''])[0]
                role=q.get('role',[''])[0]
                if not self.admin() or role not in ('player','spectator'):return self.send({'error':'Forbidden'},403)
                if not self.server.lan_enabled:return self.send({'error':'Le réseau local est désactivé'},503)
                st=self.server.store
                ip=self.server.lan_address
                origin='http://'+ip+':'+str(self.server.server_address[1])
                if tid:
                    with st.lock:
                        invites=st.tournament_invitations(tid)
                        url=origin+'/?tournament='+tid+'&invite='+invites[role]
                else:
                    if gid not in st.invites:return self.send({'error':'Unknown game'},404)
                    url=origin+'/?game='+gid+'&invite='+st.invites[gid][role]
                img=qrcode.make(url);output=io.BytesIO();img.save(output,format='PNG');raw=output.getvalue()
                self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw);return
            except ImportError:return self.send({'error':'Install python3-qrcode'},503)
        
        try:
            if u.path=='/api/tutorial/live/state':
                return self.send(self.server.store.tutorial_live_state(
                    q.get('token',[''])[0],self.server.lan_enabled))
            if u.path=='/api/tutorial/live/qr':
                if not self.admin():return self.send({'error':'QR réservé au PC hôte.'},403)
                if not self.server.lan_enabled:
                    return self.send({'error':'Activez le réseau LAN pour partager.'},503)
                token=q.get('token',[''])[0]
                self.server.store.tutorial_live_state(token,True)
                try:
                    import qrcode
                except ImportError:
                    return self.send({'error':'Module QR indisponible'},503)
                url=('http://'+self.server.lan_address+':'+
                     str(self.server.server_address[1])+'/?tutorial_view='+token)
                output=io.BytesIO()
                qrcode.make(url).save(output,format='PNG')
                raw=output.getvalue()
                self.send_response(200)
                self.send_header('Content-Type','image/png')
                self.send_header('Content-Length',str(len(raw)))
                self.send_header('Cache-Control','no-store')
                self.end_headers()
                self.wfile.write(raw)
                return
            if u.path.startswith('/api/tutorial'):
                if not self.admin():return self.send({'error':'Tutoriel réservé au PC hôte.'},403)
                mode=q.get('mode',['fetlar'])[0]
                lesson=q.get('lesson',[None])[0]
                if u.path=='/api/tutorial':
                    return self.send({'tutorial':tutorial.lesson_state(mode,lesson)})
                if u.path=='/api/tutorial/legal':
                    try:
                        start=[int(q.get('row',['-1'])[0]),int(q.get('col',['-1'])[0])]
                    except (ValueError,TypeError):raise ValueError('Coordonnées du tutoriel invalides.')
                    return self.send(tutorial.legal_details(mode,lesson,start))
                return self.send({'error':'Unknown endpoint'},404)
            with self.server.store.lock:
                st=self.server.store
                if u.path=='/api/address':
                    if not self.admin():return self.send({'error':'Forbidden'},403)
                    return self.send({'address':self.server.lan_address,'port':self.server.server_address[1],
                                      'lan_enabled':self.server.lan_enabled})
                if u.path=='/api/games':
                    st._tick_locked()
                    return self.send({'games':[{'id':g.id,'mode':g.mode,'turn':g.turn,
                           'status':g.status,'reason':g.reason,'moves':len(g.history),
                           'players':g.players,'clock':g.clock} for g in st.games.values()]
                           if self.admin() else []})
                if u.path=='/api/pending':
                    if not self.admin():return self.send({'error':'Forbidden'},403)
                    return self.send({'pending':[dict(id=k,**v,
                                  available_camps=st.available_camps(v['game'],v['name'])
                                   if v['role']=='player' else [])
                                  for k,v in st.pending.items() if v['status']=='waiting']})
                if u.path=='/api/request':
                    request_id=q.get('id',[''])[0]
                    req=st.pending.get(request_id)
                    if req is None:return self.send({'error':'Unknown request'},404)
                    answer={'status':req['status'],'session':req['session']}
                    if req['status']=='approved' and request_id in st._pending_secrets:
                        answer.update(st._pending_secrets[request_id])
                    return self.send(answer)
                if u.path=='/api/state':
                    gid=q.get('game',[''])[0];g=st.games.get(gid)
                    if not g:return self.send({'error':'Unknown game'},404)
                    sid=q.get('session',[''])[0]
                    auth=st.touch(gid,sid)
                    g=st.games[gid]
                    if not self.admin() and (not auth or auth['game']!=gid or not auth['active']):return self.send({'error':'Unauthorized'},403)
                    return self.send({'game':g.as_dict(),'you':auth and {'role':auth['role'],'camp':auth['camp'],'name':auth['name']},'invites':st.invites.get(gid) if self.admin() else None,
                                      'seats':{camp:{'name':seat['name'],'host':bool(seat.get('local_host'))}
                                               for camp,seat in st._seats(gid).items()}
                                               if self.admin() else None,
                                      'review_votes':st.repetition_votes.get(gid,{}),
                                      'cinematic':st.cinematic_state(gid),
                                      'tournament':(
                                       {'id':tid,'name':st.tournaments[tid]['name'],
                                        'round':match['round'],'a':match['a'],'b':match['b']}
                                       if (tid:=st.tournament_for_game(gid)[0]) and
                                       (match:=st.tournament_for_game(gid)[1]) else None),
                                      'server_now':st.wall_clock()})
                if u.path=='/api/legal':
                    gid=q.get('game',[''])[0];sid=q.get('session',[''])[0]
                    try:
                        r=int(q.get('row',['-1'])[0]);c=int(q.get('col',['-1'])[0])
                    except (ValueError,TypeError):raise ValueError('Invalid square')
                    return self.send(st.legal_details_for(gid,sid,[r,c]))
                if u.path=='/api/tournaments':
                    if not self.admin():return self.send({'error':'Forbidden'},403)
                    return self.send({'tournaments':list(st.tournaments.values())})
                if u.path=='/api/tournament/invites':
                    if not self.admin():raise PermissionError('Host-only action')
                    tid=q.get('tournament',[''])[0]
                    return self.send({'invites':st.tournament_invitations(tid)})
                if u.path=='/api/tournament/broadcast':
                    tid=q.get('tournament',[''])[0]
                    sid=q.get('session',[''])[0]
                    st._tick_locked()
                    return self.send(st.broadcast(tid,sid,admin=self.admin()))
            return self.static(u.path)
        except PermissionError as e:return self.send({'error':str(e)},403)
        except (ValueError,TypeError,KeyError,IndexError) as e:return self.send({'error':str(e)},400)
        except Exception:return self.send({'error':'Internal server error'},500)
    def do_POST(self):
        try:
            u=urlparse(self.path)
            if u.path.startswith('/api/tutorial') and not self.admin():
                raise PermissionError('Tutoriel réservé au PC hôte.')
            d=self.read_json();st=self.server.store
            if u.path=='/api/tutorial/live/start':
                if not self.server.lan_enabled:
                    raise PermissionError('Activez le LAN depuis le menu Réseau avant le partage.')
                return self.send(st.start_tutorial_live(d.get('mode','fetlar'),
                                                      d.get('lesson')))
            if u.path=='/api/tutorial/live/publish':
                return self.send(st.update_tutorial_live(
                    d.get('token'),d.get('state'),d.get('selected'),d.get('legal',[]),
                    d.get('captures',[]),d.get('hint_visible',False)))
            if u.path=='/api/tutorial/live/stop':
                return self.send({'stopped':st.stop_tutorial_live(d.get('token'))})
            if u.path=='/api/tutorial/move':
                if not isinstance(d,dict):raise ValueError('Requête du tutoriel invalide.')
                return self.send({'tutorial':tutorial.play_move(
                    d.get('mode','fetlar'),d.get('lesson'),d.get('from'),d.get('to'))})
            if u.path in ('/api/create','/api/approve','/api/reject','/api/resume','/api/pause','/api/delete','/api/host/seat','/api/disconnect/decide','/api/tournament/create','/api/tournament/round',
                           '/api/tournament/revoke') and not self.admin():raise PermissionError('Host-only action')
            if u.path=='/api/create':
                host_camp=d.get('host_camp')
                if host_camp not in (None,'elf','dwarf'):
                    raise ValueError('Camp du PC hôte invalide.')
                g=st.create(d.get('mode','fetlar'),d.get('settings'))
                host_session=st.seat_host(g.id,host_camp) if host_camp else None
                return self.send({'game':g.id,'invites':st.invites[g.id],
                                  'host_session':host_session})
            if u.path=='/api/host/seat':
                return self.send({'session':st.seat_host(d['game'],d.get('camp')),'camp':d.get('camp')})
            if u.path=='/api/join':return self.send({'request':st.request(d['game'],d['invite'],d.get('name','Guest'))})
            if u.path=='/api/tournament/enter':
                return self.send(st.enter_tournament(
                    d['tournament'],d['invite'],d.get('name',''),
                    d.get('device_token')))
            if u.path=='/api/approve':
                sid=st.approve(d['request'],d.get('camp'))
                return self.send({'session':sid,'camp':st.sessions[sid]['camp']})
            if u.path=='/api/reject':
                with st.lock:st.pending[d['request']]['status']='rejected'
                return self.send({'ok':True})
            if u.path=='/api/move':return self.send({'event':st.move(d['game'],d['session'],d['from'],d['to'])})
            if u.path=='/api/draw/offer':return self.send({'offered_by':st.offer_draw(d['game'],d['session'])})
            if u.path=='/api/draw/respond':return self.send({'game':st.respond_draw(d['game'],d['session'],d['accept'])})
            if u.path=='/api/resign':return self.send({'game':st.resign(d['game'],d['session'])})
            if u.path=='/api/repetition/vote':return self.send(st.repetition_vote(d['game'],d['session'],d['outcome']))
            if u.path=='/api/resume':return self.send({'game':st.resume(d['game']).id})
            if u.path=='/api/pause':return self.send({'game':st.pause(d['game']).as_dict()})
            if u.path=='/api/delete':return self.send({'deleted':st.delete_game(d['game'])})
            if u.path=='/api/disconnect/decide':
                return self.send({'game':st.disconnect_decision(d['game'],d['action'],d.get('camp'))})
            if u.path=='/api/tournament/create':
                from .tournament import Tournament
                t=Tournament(d['name'],d['format'],d['players'],int(d.get('rounds',3)))
                with st.lock:
                    st.tournaments[t.id]=t.as_dict()
                    st.tournament_invitations(t.id)
                    st.save_tournaments()
                return self.send({'tournament':st.tournaments[t.id]})
            if u.path=='/api/tournament/revoke':
                return self.send({'revoked':st.revoke_tournament_device(
                    d['tournament'],d['name'],d.get('role','player'))})
            if u.path=='/api/tournament/round':
                from .tournament import Tournament
                with st.lock:
                    t=Tournament.from_dict(st.tournaments[d['tournament']])
                    # Results are taken ONLY from finished, server-authoritative
                    # games; a client cannot forge a tournament winner.
                    for m in t.matches:
                        if m.get('winner') is not None:
                            continue
                        game=st.games.get(m.get('game'))
                        if game is None or game.status!='finished':
                            continue
                        result=('draw' if game.winner is None else
                                m['a'] if game.winner==m['camp_a'] else
                                m['b'] if game.winner==m['camp_b'] else None)
                        if result is None:
                            raise ValueError('Résultat du tournoi invalide.')
                        t.result(m['id'],result)
                    st.tournaments[t.id]=t.as_dict()
                    st.save_tournaments()
                    matches=t.next_round()
                    for m in matches:
                        g=st.create(d.get('mode','fetlar'))
                        m['game']=g.id
                    st.tournaments[t.id]=t.as_dict()
                    st.save_tournaments()
                return self.send({'matches':matches})
            return self.send({'error':'Unknown endpoint'},404)
        except (KeyError,ValueError,PermissionError,IndexError,TypeError) as e:return self.send({'error':str(e)},403 if isinstance(e,PermissionError) else 400)
        except OSError:return self.send({'error':'La suppression a échoué sur le disque ; la partie est conservée.'},500)
    def log_message(self,*args):pass

class GameServer(ThreadingHTTPServer):
    def service_actions(self):
        super().service_actions()
        self.store.tick()


def run(host='127.0.0.1',port=PORT,store=None):
    httpd=GameServer((host,port),AppHandler)
    httpd.store=store or Store()
    httpd.lan_enabled=host not in ('127.0.0.1', 'localhost', '::1')
    httpd.lan_address='127.0.0.1'
    try:
        sock=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
        sock.connect(('10.255.255.255',1));httpd.lan_address=sock.getsockname()[0];sock.close()
    except OSError:pass
    return httpd

def main():
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--host',default='127.0.0.1');p.add_argument('--port',type=int,default=PORT)
    args=p.parse_args();srv=run(args.host,args.port)
    print(f'Álfastafl DEV: http://127.0.0.1:{srv.server_address[1]}',flush=True)
    try:srv.serve_forever()
    except KeyboardInterrupt:pass
    finally:srv.store.shutdown();srv.server_close()
if __name__=='__main__':main()
