#!/usr/bin/env python3
import hashlib,hmac,json,logging,os,re,secrets,sqlite3,ssl,sys,time,uuid
from collections import defaultdict,deque
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit,parse_qsl
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError

REQUIRED=('api-version','sp','sv','sig')
ALIAS=re.compile(r'^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$')
META=re.compile(r'^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$')

def now(): return __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(timespec='seconds')
def digest(s): return hashlib.sha256(s.encode()).hexdigest()
def mask(u):
    try:
        p=urlsplit(u); q=[]
        for k,v in parse_qsl(p.query,keep_blank_values=True): q.append(k+'='+('***' if k.lower() in ('sig','sp') else v))
        parts=p.path.split('/');
        if 'workflows' in parts:
            i=parts.index('workflows'); parts[i+1]='***'
        return f'{p.scheme}://{p.netloc}{"/".join(parts)}?{"&".join(q)}'
    except: return '[REDACTED_URL]'

def inspect(original,suffixes):
    issues=[]
    if not isinstance(original,str) or not original: return {'valid':False,'issues':['URL is empty.']}
    if original!=original.strip(): issues.append('Leading or trailing whitespace is forbidden.')
    if any(c in original for c in '\r\n\t'): issues.append('Control whitespace is forbidden.')
    if '#' in original: issues.append('Fragments are forbidden.')
    try: p=urlsplit(original)
    except: return {'valid':False,'issues':['Invalid absolute URL.']}
    if p.scheme!='https': issues.append('HTTPS is required.')
    host=(p.hostname or '').lower()
    if not host: issues.append('Hostname is required.')
    if host and not any(host.endswith(x) for x in suffixes): issues.append('Power Automate hostname is not allowed.')
    if p.username or p.password or p.port not in (None,443): issues.append('User info and nonstandard ports are forbidden.')
    if not p.path.endswith('/triggers/manual/paths/invoke'): issues.append('Invocation path is invalid.')
    q=defaultdict(list)
    for k,v in parse_qsl(p.query,keep_blank_values=True): q[k.lower()].append(v)
    for k in REQUIRED:
        if not q[k] or not q[k][0]: issues.append('Missing or empty query parameter: '+k)
        if len(q[k])>1: issues.append('Duplicate query parameter: '+k)
    return {'valid':not issues,'issues':issues,'fingerprint':digest(original),'maskedUrl':mask(original)}

class Error(Exception):
    def __init__(self,code,msg,status=400,details=None): self.code,self.msg,self.status,self.details=code,msg,status,details

class Config:
    def __init__(self):
        d=Path(os.getenv('FLOWCAP_DATA_DIR','./data')).resolve(); d.mkdir(parents=True,exist_ok=True,mode=0o700); os.chmod(d,0o700)
        self.db=str(d/'registry.db'); self.creds=str(d/'bootstrap-credentials.json'); self.host=os.getenv('FLOWCAP_HOST','127.0.0.1'); self.port=int(os.getenv('FLOWCAP_PORT','8787'))
        self.max=int(os.getenv('FLOWCAP_MAX_BODY_BYTES','1048576')); self.verify_timeout=int(os.getenv('FLOWCAP_VERIFY_TIMEOUT_SECONDS','20')); self.invoke_timeout=int(os.getenv('FLOWCAP_INVOKE_TIMEOUT_SECONDS','60')); self.rate=int(os.getenv('FLOWCAP_RATE_LIMIT_PER_MINUTE','120')); self.keep=int(os.getenv('FLOWCAP_VERSION_RETENTION','5'))
        self.suffixes=tuple(x.strip().lower() for x in os.getenv('FLOWCAP_ALLOWED_HOST_SUFFIXES','.api.powerplatform.com,.logic.azure.com').split(',') if x.strip())
        self.cert=os.getenv('FLOWCAP_TLS_CERT'); self.key=os.getenv('FLOWCAP_TLS_KEY')

class Store:
    def __init__(self,c): self.c=c; self.init()
    def con(self):
        x=sqlite3.connect(self.c.db,timeout=30,isolation_level=None); x.row_factory=sqlite3.Row; x.execute('PRAGMA foreign_keys=ON'); x.execute('PRAGMA journal_mode=WAL'); x.execute('PRAGMA synchronous=FULL'); return x
    @contextmanager
    def tx(self):
        c=self.con(); c.execute('BEGIN IMMEDIATE')
        try: yield c; c.execute('COMMIT')
        except: c.execute('ROLLBACK'); raise
        finally: c.close()
    def init(self):
        c=self.con(); c.executescript("""
        CREATE TABLE IF NOT EXISTS flows(alias TEXT PRIMARY KEY,enabled INTEGER NOT NULL,active_version INTEGER,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS capsules(alias TEXT NOT NULL,version INTEGER NOT NULL,original_url TEXT NOT NULL,fingerprint TEXT NOT NULL,flow_identity TEXT NOT NULL,environment TEXT NOT NULL,contract_version TEXT NOT NULL,verified_at TEXT NOT NULL,verification_json TEXT NOT NULL,created_by TEXT NOT NULL,PRIMARY KEY(alias,version),FOREIGN KEY(alias) REFERENCES flows(alias));
        CREATE TABLE IF NOT EXISTS tokens(name TEXT PRIMARY KEY,role TEXT NOT NULL,salt BLOB NOT NULL,digest TEXT NOT NULL,enabled INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT,actor TEXT,event TEXT,alias TEXT,version INTEGER,outcome TEXT,details TEXT);
        """)
        if c.execute('SELECT COUNT(*) FROM tokens').fetchone()[0]==0:
            out={}
            for role in ('admin','invoke'):
                token='fc_'+secrets.token_urlsafe(32); salt=secrets.token_bytes(16); out[role+'Token']=token
                c.execute('INSERT INTO tokens VALUES(?,?,?,?,1)',('bootstrap-'+role,role,salt,self.th(token,salt)))
            Path(self.c.creds).write_text(json.dumps(out,indent=2)); os.chmod(self.c.creds,0o600)
        c.close(); os.chmod(self.c.db,0o600)
    def th(self,t,s): return hashlib.pbkdf2_hmac('sha256',t.encode(),s,310000).hex()
    def auth(self,t,need):
        if not t: raise Error('UNAUTHORIZED','Bearer token required.',401)
        c=self.con()
        try:
            for r in c.execute('SELECT * FROM tokens WHERE enabled=1'):
                if hmac.compare_digest(self.th(t,r['salt']),r['digest']):
                    if need=='admin' and r['role']!='admin': raise Error('FORBIDDEN','Administrator role required.',403)
                    return r['name']
        finally: c.close()
        raise Error('UNAUTHORIZED','Invalid bearer token.',401)
    def audit(self,c,actor,event,alias,version,outcome,details): c.execute('INSERT INTO audit(at,actor,event,alias,version,outcome,details) VALUES(?,?,?,?,?,?,?)',(now(),actor,event,alias,version,outcome,json.dumps(details,separators=(',',':'))))
    def active(self,a):
        c=self.con(); r=c.execute('SELECT f.enabled,c.* FROM flows f JOIN capsules c ON c.alias=f.alias AND c.version=f.active_version WHERE f.alias=?',(a,)).fetchone(); c.close()
        if not r: raise Error('FLOW_NOT_FOUND','Flow alias not found.',404)
        return dict(r)
    def list(self):
        c=self.con(); r=[dict(x) for x in c.execute('SELECT f.alias,f.enabled,f.active_version,f.updated_at,c.fingerprint,c.flow_identity,c.environment,c.contract_version,c.verified_at FROM flows f LEFT JOIN capsules c ON c.alias=f.alias AND c.version=f.active_version ORDER BY f.alias')]; c.close(); return r
    def versions(self,a):
        c=self.con(); r=[dict(x) for x in c.execute('SELECT version,fingerprint,flow_identity,environment,contract_version,verified_at,created_by FROM capsules WHERE alias=? ORDER BY version DESC',(a,))]; c.close(); return r
    def activate(self,actor,a,u,i,e,v,verification):
        with self.tx() as c:
            n=c.execute('SELECT COALESCE(MAX(version),0)+1 FROM capsules WHERE alias=?',(a,)).fetchone()[0]; ts=now()
            c.execute('INSERT INTO flows VALUES(?,1,NULL,?,?) ON CONFLICT(alias) DO NOTHING',(a,ts,ts))
            c.execute('INSERT INTO capsules VALUES(?,?,?,?,?,?,?,?,?,?)',(a,n,u,digest(u),i,e,v,ts,json.dumps(verification,separators=(',',':')),actor))
            c.execute('UPDATE flows SET active_version=?,enabled=1,updated_at=? WHERE alias=?',(n,ts,a)); self.audit(c,actor,'activate',a,n,'success',{'fingerprint':digest(u)})
            old=[x[0] for x in c.execute('SELECT version FROM capsules WHERE alias=? ORDER BY version DESC LIMIT -1 OFFSET ?',(a,self.c.keep))]
            for x in old: c.execute('DELETE FROM capsules WHERE alias=? AND version=?',(a,x))
        return n
    def set_enabled(self,actor,a,val):
        with self.tx() as c:
            if c.execute('UPDATE flows SET enabled=?,updated_at=? WHERE alias=?',(val,now(),a)).rowcount!=1: raise Error('FLOW_NOT_FOUND','Flow alias not found.',404)
            self.audit(c,actor,'enable' if val else 'disable',a,None,'success',{})
    def rollback(self,actor,a,n,verification):
        with self.tx() as c:
            if not c.execute('SELECT 1 FROM capsules WHERE alias=? AND version=?',(a,n)).fetchone(): raise Error('VERSION_NOT_FOUND','Version not found.',404)
            c.execute('UPDATE capsules SET verified_at=?,verification_json=? WHERE alias=? AND version=?',(now(),json.dumps(verification),a,n)); c.execute('UPDATE flows SET active_version=?,enabled=1,updated_at=? WHERE alias=?',(n,now(),a)); self.audit(c,actor,'rollback',a,n,'success',{})

def call(url,payload,timeout,limit):
    raw=json.dumps(payload,separators=(',',':')).encode(); req=Request(url,data=raw,headers={'Content-Type':'application/json','Accept':'application/json','User-Agent':'FlowCapsule/1.0'},method='POST')
    try:
        with urlopen(req,timeout=timeout,context=ssl.create_default_context()) as r: data=r.read(limit+1); status=r.status; typ=r.headers.get('Content-Type','application/json')
    except HTTPError as e: data=e.read(limit+1); status=e.code; typ=e.headers.get('Content-Type','application/json')
    except (URLError,TimeoutError): raise Error('FLOW_UNAVAILABLE','Flow endpoint unavailable.',503)
    if len(data)>limit: raise Error('FLOW_RESPONSE_TOO_LARGE','Flow response too large.',502)
    return status,data,typ

def verify(c,url,identity,environment,version):
    corr=str(uuid.uuid4()); status,raw,_=call(url,{'_platform':{'operation':'verify','correlationId':corr}},c.verify_timeout,c.max)
    if not 200<=status<300: raise Error('CONNECTIVITY_FAILED','Flow rejected verification.',400,{'status':status})
    try: data=json.loads(raw)
    except: raise Error('IDENTITY_FAILED','Verification response is not JSON.')
    expected={'verified':True,'flowIdentity':identity,'environment':environment,'contractVersion':version,'correlationId':corr}; diff={k:{'expected':v,'actual':data.get(k)} for k,v in expected.items() if data.get(k)!=v}
    if diff: raise Error('IDENTITY_FAILED','Verification identity mismatch.',400,diff)
    return {'status':status,'identity':expected}

class App:
    def __init__(self,c): self.c=c; self.s=Store(c); self.calls=defaultdict(deque)
    def reg(self,actor,b):
        for k in ('alias','url','flowIdentity','environment','contractVersion'):
            if not isinstance(b.get(k),str) or not b[k]: raise Error('INVALID_REGISTRATION','Missing registration field.',400,{'field':k})
        if not ALIAS.fullmatch(b['alias']) or any(not META.fullmatch(b[k]) for k in ('flowIdentity','environment','contractVersion')): raise Error('INVALID_REGISTRATION','Alias or metadata format invalid.')
        x=inspect(b['url'],self.c.suffixes)
        if not x['valid']: raise Error('FORMATION_FAILED','URL formation failed.',400,x['issues'])
        v=verify(self.c,b['url'],b['flowIdentity'],b['environment'],b['contractVersion']); n=self.s.activate(actor,b['alias'],b['url'],b['flowIdentity'],b['environment'],b['contractVersion'],v)
        return {'alias':b['alias'],'activeVersion':n,'fingerprint':x['fingerprint'],'maskedUrl':x['maskedUrl'],'verified':True}
    def check(self,cap):
        if not cap['enabled']: raise Error('FLOW_DISABLED','Flow is disabled.',409)
        if not hmac.compare_digest(digest(cap['original_url']),cap['fingerprint']): raise Error('INTEGRITY_FAILED','Stored URL integrity failed.',409)
    def verify_active(self,actor,a):
        cap=self.s.active(a); self.check(cap); v=verify(self.c,cap['original_url'],cap['flow_identity'],cap['environment'],cap['contract_version']); return {'alias':a,'version':cap['version'],'verified':True,'verification':v}
    def rollback(self,actor,a,n):
        c=self.s.con(); r=c.execute('SELECT * FROM capsules WHERE alias=? AND version=?',(a,n)).fetchone(); c.close()
        if not r: raise Error('VERSION_NOT_FOUND','Version not found.',404)
        cap=dict(r); self.check({**cap,'enabled':1}); v=verify(self.c,cap['original_url'],cap['flow_identity'],cap['environment'],cap['contract_version']); self.s.rollback(actor,a,n,v); return {'alias':a,'activeVersion':n,'verified':True}
    def invoke(self,actor,a,payload):
        q=self.calls[actor+':'+a]; t=time.monotonic()
        while q and q[0]<t-60:q.popleft()
        if len(q)>=self.c.rate: raise Error('RATE_LIMITED','Rate limit exceeded.',429)
        q.append(t); cap=self.s.active(a); self.check(cap); return call(cap['original_url'],payload,self.c.invoke_timeout,self.c.max)

class H(BaseHTTPRequestHandler):
    server_version='FlowCapsule/1.0'; sys_version=''
    def log_message(self,fmt,*args): logging.info('client=%s status_log='+fmt,self.client_address[0],*args)
    def reply(self,n,o):
        x=json.dumps(o,separators=(',',':')).encode(); self.send_response(n); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(x))); self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff'); self.end_headers(); self.wfile.write(x)
    def body(self):
        try:n=int(self.headers.get('Content-Length','0'))
        except: raise Error('INVALID_LENGTH','Invalid content length.')
        if n<=0 or n>self.server.app.c.max: raise Error('INVALID_BODY_SIZE','Invalid body size.',413)
        try:return json.loads(self.rfile.read(n))
        except: raise Error('INVALID_JSON','Body must be JSON.')
    def actor(self,role):
        a=self.headers.get('Authorization',''); return self.server.app.s.auth(a[7:] if a.startswith('Bearer ') else '',role)
    def do_GET(self): self.dispatch()
    def do_POST(self): self.dispatch()
    def dispatch(self):
        try:
            p=self.path.split('?',1)[0]; a=self.server.app
            if self.command=='GET' and p=='/health': return self.reply(200,{'status':'healthy','version':'1.0.0'})
            if self.command=='GET' and p=='/admin/flows': self.actor('admin'); return self.reply(200,{'flows':a.s.list()})
            m=re.fullmatch(r'/admin/flows/([^/]+)/versions',p)
            if self.command=='GET' and m: self.actor('admin'); return self.reply(200,{'alias':m[1],'versions':a.s.versions(m[1])})
            if self.command=='POST' and p=='/admin/flows': return self.reply(201,a.reg(self.actor('admin'),self.body()))
            m=re.fullmatch(r'/admin/flows/([^/]+)/verify',p)
            if self.command=='POST' and m: return self.reply(200,a.verify_active(self.actor('admin'),m[1]))
            m=re.fullmatch(r'/admin/flows/([^/]+)/rollback/(\d+)',p)
            if self.command=='POST' and m: return self.reply(200,a.rollback(self.actor('admin'),m[1],int(m[2])))
            m=re.fullmatch(r'/admin/flows/([^/]+)/(enable|disable)',p)
            if self.command=='POST' and m:
                actor=self.actor('admin'); a.s.set_enabled(actor,m[1],1 if m[2]=='enable' else 0); return self.reply(200,{'alias':m[1],'enabled':m[2]=='enable'})
            m=re.fullmatch(r'/invoke/([^/]+)',p)
            if self.command=='POST' and m:
                status,raw,typ=a.invoke(self.actor('invoke'),m[1],self.body()); self.send_response(status); self.send_header('Content-Type',typ); self.send_header('Content-Length',str(len(raw))); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(raw); return
            raise Error('NOT_FOUND','Route not found.',404)
        except Error as e: self.reply(e.status,{'success':False,'code':e.code,'message':e.msg,'details':e.details,'correlationId':str(uuid.uuid4())})
        except Exception: logging.exception('internal'); self.reply(500,{'success':False,'code':'INTERNAL_ERROR','message':'Internal error.','correlationId':str(uuid.uuid4())})

if __name__=='__main__':
    c=Config()
    if len(sys.argv)>1 and sys.argv[1]=='inspect': print(json.dumps(inspect(sys.argv[2],c.suffixes),indent=2)); raise SystemExit
    app=App(c); srv=ThreadingHTTPServer((c.host,c.port),H); srv.app=app
    if c.cert and c.key:
        x=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); x.minimum_version=ssl.TLSVersion.TLSv1_2; x.load_cert_chain(c.cert,c.key); srv.socket=x.wrap_socket(srv.socket,server_side=True)
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s'); srv.serve_forever()
