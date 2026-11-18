"""Local-network web service. All game mutations are server-authoritative."""
import json, threading, secrets, os, tempfile, pathlib, time, socket, io
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from .core import Game, team

PORT=8766

def data_directory():
    base=os.environ.get('XDG_DATA_HOME') or os.path.expanduser('~/.local/share')
    return pathlib.Path(base)/'alfastafl'/'parties'

class Store:
    def __init__(self, root=None):
        self.path=pathlib.Path(root) if root is not None else data_directory()
        self.path.mkdir(parents=True,exist_ok=True)
        self.lock=threading.RLock()
        self.games={}
        self.invites={}
        self.pending={}
        self.sessions={}
        self.tournaments={}
        for f in self.path.glob('*.alfastafl'):
            try:
                d=json.loads(f.read_text('utf-8'))
                g=Game.from_dict(d)
                if g.status=='active':g.status='paused';g.reason='host_restarted'
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
        finally:
            if os.path.exists(tmp):os.unlink(tmp)
    def create(self,mode='fetlar',settings=None):
        g=Game(mode=mode,settings=settings or {})
        with self.lock:
            self.games[g.id]=g;self.save(g)
            self.invites[g.id]={'player':secrets.token_urlsafe(24),'spectator':secrets.token_urlsafe(24)}
        return g
    def resume(self,gid):
        with self.lock:
            g=self.games[gid];g.status='active';g.reason=None;self.save(g)
            self.invites.setdefault(gid,{'player':secrets.token_urlsafe(24),'spectator':secrets.token_urlsafe(24)})
            return g
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
                used={s['camp'] for s in self.sessions.values() if s['game']==gid and s['role']=='player' and s['active']}
                if team_name in used:raise ValueError('Camp already occupied')
            else:team_name=None
            sid=secrets.token_urlsafe(30)
            self.sessions[sid]={'game':gid,'role':req['role'],'camp':team_name,'name':req['name'],'active':True}
            req.update(status='approved',session=sid)
            return sid
    def move(self,gid,sid,start,end):
        with self.lock:
            s=self.sessions.get(sid)
            if s is None or s['game']!=gid or not s['active'] or s['role']!='player':raise PermissionError('Not a player')
            g=self.games[gid]
            if s['camp']!=g.turn:raise PermissionError('Not your turn')
            event=g.move(start,end);self.save(g);return event

class AppHandler(BaseHTTPRequestHandler):
    server_version='AlfastaflDEV/0.1'
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
        p={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css'}.get(path)
        if not p:self.send_error(404);return
        raw=(root/p).read_bytes()
        typ={'html':'text/html','css':'text/css','js':'text/javascript'}[p.rsplit('.',1)[-1]]
        self.send_response(200);self.send_header('Content-Type',typ+'; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        u=urlparse(self.path);q=parse_qs(u.query)
        if u.path=='/api/qr':
            try:
                import qrcode
                gid=q.get('game',[''])[0];role=q.get('role',[''])[0]
                if not self.admin() or role not in ('player','spectator'):return self.send({'error':'Forbidden'},403)
                st=self.server.store
                if gid not in st.invites:return self.send({'error':'Unknown game'},404)
                ip=self.server.lan_address
                url='http://'+ip+':'+str(self.server.server_address[1])+'/?game='+gid+'&invite='+st.invites[gid][role]
                img=qrcode.make(url);output=io.BytesIO();img.save(output,format='PNG');raw=output.getvalue()
                self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw);return
            except ImportError:return self.send({'error':'Install python3-qrcode'},503)
        
        try:
            with self.server.store.lock:
                st=self.server.store
                if u.path=='/api/address':
                    if not self.admin():return self.send({'error':'Forbidden'},403)
                    return self.send({'address':self.server.lan_address,'port':self.server.server_address[1]})
                if u.path=='/api/games':
                    return self.send({'games':[{'id':g.id,'mode':g.mode,'turn':g.turn,'status':g.status,'moves':len(g.history)} for g in st.games.values()] if self.admin() else []})
                if u.path=='/api/pending':
                    if not self.admin():return self.send({'error':'Forbidden'},403)
                    return self.send({'pending':[dict(id=k,**v) for k,v in st.pending.items() if v['status']=='waiting']})
                if u.path=='/api/request':
                    req=st.pending.get(q.get('id',[''])[0]);return self.send({'status':req['status'],'session':req['session']} if req else {'error':'Unknown request'},200 if req else 404)
                if u.path=='/api/state':
                    gid=q.get('game',[''])[0];g=st.games.get(gid)
                    if not g:return self.send({'error':'Unknown game'},404)
                    sid=q.get('session',[''])[0]
                    auth=st.sessions.get(sid)
                    if not self.admin() and (not auth or auth['game']!=gid or not auth['active']):return self.send({'error':'Unauthorized'},403)
                    return self.send({'game':g.as_dict(),'you':auth and {'role':auth['role'],'camp':auth['camp'],'name':auth['name']},'invites':st.invites.get(gid) if self.admin() else None})
                if u.path=='/api/tournaments':
                    if not self.admin():return self.send({'error':'Forbidden'},403)
                    return self.send({'tournaments':list(st.tournaments.values())})
            return self.static(u.path)
        except Exception as e:return self.send({'error':str(e)},400)
    def do_POST(self):
        try:
            d=self.read_json();st=self.server.store;u=urlparse(self.path)
            if u.path in ('/api/create','/api/approve','/api/reject','/api/resume','/api/pause','/api/tournament/create','/api/tournament/round') and not self.admin():raise PermissionError('Host-only action')
            if u.path=='/api/create':
                g=st.create(d.get('mode','fetlar'),d.get('settings'))
                return self.send({'game':g.id,'invites':st.invites[g.id]})
            if u.path=='/api/join':return self.send({'request':st.request(d['game'],d['invite'],d.get('name','Guest'))})
            if u.path=='/api/approve':return self.send({'session':st.approve(d['request'],d.get('camp'))})
            if u.path=='/api/reject':
                with st.lock:st.pending[d['request']]['status']='rejected'
                return self.send({'ok':True})
            if u.path=='/api/move':return self.send({'event':st.move(d['game'],d['session'],d['from'],d['to'])})
            if u.path=='/api/resume':return self.send({'game':st.resume(d['game']).id})
            if u.path=='/api/pause':
                with st.lock:
                    g=st.games[d['game']];g.status='paused';g.reason='saved_by_host';st.save(g)
                return self.send({'ok':True})
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
        except (KeyError,ValueError,PermissionError,IndexError) as e:return self.send({'error':str(e)},403 if isinstance(e,PermissionError) else 400)
    def log_message(self,*args):pass

def run(host='127.0.0.1',port=PORT,store=None):
    httpd=ThreadingHTTPServer((host,port),AppHandler)
    httpd.store=store or Store()
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
    finally:srv.server_close()
if __name__=='__main__':main()
