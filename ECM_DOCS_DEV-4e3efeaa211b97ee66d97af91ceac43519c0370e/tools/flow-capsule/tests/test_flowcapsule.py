import sys,tempfile,unittest
from pathlib import Path
# The registry package shipped flowcapsule.py beside this test; the Termux package shipped it
# under app/, which is the layout the installer stages and therefore the one kept here. This is
# the only edit to the vendored test: the same parents[1] resolution test_installer.py already
# uses, so the suite runs from either the repository root or this directory.
sys.path.insert(0,str(Path(__file__).parents[1]/'app'))
import flowcapsule as f
class T(unittest.TestCase):
 def test_inspect_preserves_and_masks(self):
  u='https://x.api.powerplatform.com/workflows/abc/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1&sig=secret'; x=f.inspect(u,('.api.powerplatform.com',)); self.assertTrue(x['valid']); self.assertEqual(x['fingerprint'],f.digest(u)); self.assertNotIn('secret',x['maskedUrl'])
 def test_required_and_duplicates(self):
  u='https://x.api.powerplatform.com/workflows/a/triggers/manual/paths/invoke?api-version=1&sp=x&sv=1&sig=a&sig=b'; x=f.inspect(u,('.api.powerplatform.com',)); self.assertFalse(x['valid']); self.assertTrue(any('Duplicate' in i for i in x['issues']))
 def test_registration_metadata_rules(self):
  ok=lambda v: bool(f.VERSION.fullmatch(v)); self.assertTrue(ok('dgo-mail/2.0')); self.assertTrue(ok('2026-09-18.1')); self.assertFalse(ok('/leading')); self.assertFalse(ok('has space')); self.assertFalse(f.META.fullmatch('a/b'))
 def test_store_exact_atomic_versions_integrity(self):
  with tempfile.TemporaryDirectory() as d:
   import os; os.environ['FLOWCAP_DATA_DIR']=d; c=f.Config(); s=f.Store(c); u='https://x.api.powerplatform.com/workflows/a/triggers/manual/paths/invoke?api-version=1&sp=x&sv=1&sig=a'; s.activate('a','orders.create',u,'id','prod','1',{}); self.assertEqual(s.active('orders.create')['original_url'],u); self.assertEqual(s.active('orders.create')['fingerprint'],f.digest(u)); s.activate('a','orders.create',u+'2','id','prod','1',{}); self.assertEqual(s.active('orders.create')['version'],2); s.rollback('a','orders.create',1,{}); self.assertEqual(s.active('orders.create')['version'],1)
 def test_invoke_forwards_only_the_folio_proof(self):
  import json,threading
  from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
  got=[]
  class H(BaseHTTPRequestHandler):
   def log_message(self,*a): pass
   def do_POST(self):
    got.append({k.lower():v for k,v in self.headers.items()}); self.rfile.read(int(self.headers['Content-Length'])); x=b'{}'; self.send_response(200); self.send_header('Content-Length','2'); self.end_headers(); self.wfile.write(x)
  srv=ThreadingHTTPServer(('127.0.0.1',0),H); threading.Thread(target=srv.serve_forever,daemon=True).start()
  try: f.call(f'http://127.0.0.1:{srv.server_address[1]}/',{'a':1},5,1000,{'X-DGO-Proof':'Bearer p','Authorization':'Bearer leak','Cookie':'c'})
  finally: srv.shutdown()
  self.assertEqual(got[0].get('x-dgo-proof'),'Bearer p'); self.assertNotIn('authorization',got[0]); self.assertNotIn('cookie',got[0])
 # The Document Portal's path through the Vault: a browser on a listed origin, a raw-file upload,
 # and a rate limit that one visitor cannot use up for everyone else.
 def serve(self,env):
  import os,threading,json
  from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
  got=[]
  class Flow(BaseHTTPRequestHandler):
   def log_message(self,*a): pass
   def answer(self):
    got.append({'method':self.command,'headers':{k.lower():v for k,v in self.headers.items()},'body':self.rfile.read(int(self.headers['Content-Length']))}); x=b'{"ok":true}'; self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(x))); self.end_headers(); self.wfile.write(x)
   do_POST=answer; do_PUT=answer
  flow=ThreadingHTTPServer(('127.0.0.1',0),Flow); threading.Thread(target=flow.serve_forever,daemon=True).start(); self.addCleanup(flow.shutdown)
  d=tempfile.mkdtemp(); self.addCleanup(__import__('shutil').rmtree,d,True)
  os.environ.update({'FLOWCAP_DATA_DIR':d,**env}); self.addCleanup(lambda: [os.environ.pop(k,None) for k in env])
  app=f.App(f.Config()); token=json.loads(Path(app.c.creds).read_text())['invokeToken']
  for alias in ('portal.submission','portal.upload'): app.s.activate('t',alias,f'http://127.0.0.1:{flow.server_address[1]}/{alias}','id','prod','1',{})
  srv=ThreadingHTTPServer(('127.0.0.1',0),f.H); srv.app=app; threading.Thread(target=srv.serve_forever,daemon=True).start(); self.addCleanup(srv.shutdown)
  return f'http://127.0.0.1:{srv.server_address[1]}',token,got
 def send(self,url,method='POST',body=b'{}',headers=None):
  from urllib.request import Request,urlopen
  from urllib.error import HTTPError
  try:
   with urlopen(Request(url,data=body,method=method,headers=headers or {})) as r: return r.status,dict(r.headers)
  except HTTPError as e: return e.code,dict(e.headers)
 def test_cors_only_for_listed_origin_and_never_on_admin(self):
  base,token,_=self.serve({'FLOWCAP_ALLOWED_ORIGINS':'https://portal.example'})
  st,h=self.send(base+'/invoke/portal.submission','OPTIONS',None,{'Origin':'https://portal.example','Access-Control-Request-Method':'POST'})
  self.assertEqual(st,204); self.assertEqual(h.get('Access-Control-Allow-Origin'),'https://portal.example'); self.assertIn('X-Upload-Ticket',h.get('Access-Control-Allow-Headers'))
  self.assertEqual(self.send(base+'/invoke/portal.submission','OPTIONS',None,{'Origin':'https://evil.example'})[0],403)
  self.assertEqual(self.send(base+'/admin/flows','OPTIONS',None,{'Origin':'https://portal.example'})[0],403)
  st,h=self.send(base+'/invoke/portal.submission',headers={'Origin':'https://portal.example','Authorization':'Bearer '+token,'Content-Type':'application/json'})
  self.assertEqual(st,200); self.assertEqual(h.get('Access-Control-Allow-Origin'),'https://portal.example')
  st,h=self.send(base+'/admin/flows','GET',None,{'Origin':'https://portal.example','Authorization':'Bearer '+token})
  self.assertEqual(st,403); self.assertNotIn('Access-Control-Allow-Origin',h)
 def test_upload_put_passes_bytes_and_ticket_unchanged(self):
  base,token,got=self.serve({'FLOWCAP_MAX_UPLOAD_BYTES':'2000000'})
  data=bytes(range(256))*6000
  st,_=self.send(base+'/invoke/portal.upload','PUT',data,{'Authorization':'Bearer '+token,'Content-Type':'application/octet-stream','X-Upload-Ticket':'tk-1'})
  self.assertEqual(st,200); self.assertEqual(got[0]['method'],'PUT'); self.assertEqual(got[0]['body'],data)
  self.assertEqual(got[0]['headers'].get('x-upload-ticket'),'tk-1'); self.assertEqual(got[0]['headers'].get('content-type'),'application/octet-stream'); self.assertNotIn('authorization',got[0]['headers'])
  self.assertEqual(self.send(base+'/invoke/portal.upload','PUT',b'x'*2000001,{'Authorization':'Bearer '+token,'Content-Type':'application/octet-stream'})[0],413)
  self.assertEqual(self.send(base+'/invoke/portal.upload','PUT',b'{}',{'Authorization':'Bearer '+token,'Content-Type':'application/json'})[0],415)
 def test_rate_limit_is_per_visitor_behind_the_proxy(self):
  base,token,_=self.serve({'FLOWCAP_RATE_LIMIT_PER_MINUTE':'2'})
  call=lambda ip: self.send(base+'/invoke/portal.submission',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','X-Forwarded-For':'1.1.1.1, '+ip})[0]
  self.assertEqual([call('10.0.0.1') for _ in range(3)],[200,200,429])
  # Another visitor on the same token is not affected; a spoofed left-hand entry changes nothing.
  self.assertEqual(call('10.0.0.2'),200)
if __name__=='__main__': unittest.main()
