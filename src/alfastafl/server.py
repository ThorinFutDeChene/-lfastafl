"""Local-network web service. All game mutations are server-authoritative."""
import json, threading, secrets, os, tempfile, pathlib, time, socket, io, uuid
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
        self.path=pathlib.Path(root) if root is not None else data_directory()
        self.path.mkdir(parents=True,exist_ok=True)
        self.lock=threading.RLock()
        self.games={}
        self.invites={}
        self.pending={}
        self.sessions={}
        self.tournaments={}
        self.repetition_votes={}
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
    def create(self,mode='fetlar',settings=None):
        config=normalize_settings(settings)
        g=Game(mode=mode,settings=config,clock=new_clock(config))
        with self.lock:
            self.games[g.id]=g;self.save(g)
            self.invites[g.id]={'player':secrets.token_urlsafe(24),'spectator':secrets.token_urlsafe(24)}
        return g
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
            self._tick_locked()
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
            request_id=secrets.token_urlsafe(18)
            self.pending[request_id]={'game':gid,'role':role,'name':name.strip(),'status':'waiting','session':None}
            return request_id
    def approve(self,request_id,team_name=None):
        with self.lock:
            req=self.pending[request_id]
            if req['status']!='waiting':raise ValueError('Already processed')
            gid=req['game']
            if req['role']=='player':
                if team_name not in ('elf','dwarf'):raise ValueError('Select a camp')
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
        assets=('index.html','app.js','tutorial.js','style.css',
                'board-view.js','board3d.js','figurines3d.js',
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
                gid=q.get('game',[''])[0];role=q.get('role',[''])[0]
                if not self.admin() or role not in ('player','spectator'):return self.send({'error':'Forbidden'},403)
                if not self.server.lan_enabled:return self.send({'error':'Le réseau local est désactivé'},503)
                st=self.server.store
                if gid not in st.invites:return self.send({'error':'Unknown game'},404)
                ip=self.server.lan_address
                url='http://'+ip+':'+str(self.server.server_address[1])+'/?game='+gid+'&invite='+st.invites[gid][role]
                img=qrcode.make(url);output=io.BytesIO();img.save(output,format='PNG');raw=output.getvalue()
                self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw);return
            except ImportError:return self.send({'error':'Install python3-qrcode'},503)
        
        try:
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
                    return self.send({'pending':[dict(id=k,**v) for k,v in st.pending.items() if v['status']=='waiting']})
                if u.path=='/api/request':
                    req=st.pending.get(q.get('id',[''])[0]);return self.send({'status':req['status'],'session':req['session']} if req else {'error':'Unknown request'},200 if req else 404)
                if u.path=='/api/state':
                    gid=q.get('game',[''])[0];g=st.games.get(gid)
                    if not g:return self.send({'error':'Unknown game'},404)
                    sid=q.get('session',[''])[0]
                    auth=st.touch(gid,sid)
                    g=st.games[gid]
                    if not self.admin() and (not auth or auth['game']!=gid or not auth['active']):return self.send({'error':'Unauthorized'},403)
                    return self.send({'game':g.as_dict(),'you':auth and {'role':auth['role'],'camp':auth['camp'],'name':auth['name']},'invites':st.invites.get(gid) if self.admin() else None,
                                      'review_votes':st.repetition_votes.get(gid,{}),
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
            if u.path=='/api/tutorial/move':
                if not isinstance(d,dict):raise ValueError('Requête du tutoriel invalide.')
                return self.send({'tutorial':tutorial.play_move(
                    d.get('mode','fetlar'),d.get('lesson'),d.get('from'),d.get('to'))})
            if u.path in ('/api/create','/api/approve','/api/reject','/api/resume','/api/pause','/api/delete','/api/disconnect/decide','/api/tournament/create','/api/tournament/round') and not self.admin():raise PermissionError('Host-only action')
            if u.path=='/api/create':
                g=st.create(d.get('mode','fetlar'),d.get('settings'))
                return self.send({'game':g.id,'invites':st.invites[g.id]})
            if u.path=='/api/join':return self.send({'request':st.request(d['game'],d['invite'],d.get('name','Guest'))})
            if u.path=='/api/approve':return self.send({'session':st.approve(d['request'],d.get('camp'))})
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
                st.tournaments[t.id]=t.as_dict()
                return self.send({'tournament':st.tournaments[t.id]})
            if u.path=='/api/tournament/round':
                from .tournament import Tournament
                with st.lock:
                    t=Tournament.from_dict(st.tournaments[d['tournament']])
                    matches=t.next_round()
                    for m in matches:
                        g=st.create(d.get('mode','fetlar'))
                        m['game']=g.id
                    st.tournaments[t.id]=t.as_dict()
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
