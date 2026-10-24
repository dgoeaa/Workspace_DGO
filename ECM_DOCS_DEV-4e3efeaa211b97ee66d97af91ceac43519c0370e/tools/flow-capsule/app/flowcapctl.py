#!/usr/bin/env python3
import argparse,getpass,json,os,sqlite3,tarfile,tempfile
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
def call(base,path,method='GET',token=None,body=None,timeout=90):
 data=None if body is None else json.dumps(body,separators=(',',':')).encode(); h={'Accept':'application/json'}
 if data is not None:h['Content-Type']='application/json'
 if token:h['Authorization']='Bearer '+token
 try:
  with urlopen(Request(base.rstrip('/')+path,data=data,headers=h,method=method),timeout=timeout) as r: raw,status=r.read(),r.status
 except HTTPError as e:raw,status=e.read(),e.code
 except URLError as e:raise SystemExit('Connection failed: '+str(e.reason))
 try:o=json.loads(raw)
 except:o={'raw':raw.decode(errors='replace')}
 if not 200<=status<300:raise SystemExit(json.dumps(o,indent=2))
 return o
def token(path,role):
 p=Path(path)
 if p.exists():return json.loads(p.read_text())[role+'Token']
 v=os.getenv('FLOWCAP_'+role.upper()+'_TOKEN')
 return v or getpass.getpass(role.capitalize()+' bearer token: ')
def main():
 p=argparse.ArgumentParser(); p.add_argument('--base-url',default=os.getenv('FLOWCAP_BASE_URL','http://127.0.0.1:8787')); p.add_argument('--credentials',default=os.getenv('FLOWCAP_CREDENTIALS','/var/lib/flowcapsule/bootstrap-credentials.json')); s=p.add_subparsers(dest='cmd',required=True)
 s.add_parser('health'); s.add_parser('list')
 c=s.add_parser('configure-flow'); c.add_argument('--alias'); c.add_argument('--identity'); c.add_argument('--environment'); c.add_argument('--contract-version'); c.add_argument('--url-file')
 for n in ('versions','verify','enable','disable'):
  z=s.add_parser(n); z.add_argument('alias')
 r=s.add_parser('rollback'); r.add_argument('alias'); r.add_argument('version',type=int)
 i=s.add_parser('invoke'); i.add_argument('alias'); i.add_argument('--body-file',required=True)
 b=s.add_parser('backup'); b.add_argument('--data-dir',default='/var/lib/flowcapsule'); b.add_argument('--output',required=True)
 a=p.parse_args()
 if a.cmd=='health':o=call(a.base_url,'/health')
 elif a.cmd=='list':o=call(a.base_url,'/admin/flows',token=token(a.credentials,'admin'))
 elif a.cmd=='configure-flow':
  alias=a.alias or input('Logical alias: ').strip(); identity=a.identity or input('Flow identity: ').strip(); env=a.environment or input('Environment: ').strip(); ver=a.contract_version or input('Contract version: ').strip(); url=Path(a.url_file).read_text().rstrip('\r\n') if a.url_file else getpass.getpass('Complete Power Automate URL (hidden): ')
  o=call(a.base_url,'/admin/flows','POST',token(a.credentials,'admin'),{'alias':alias,'url':url,'flowIdentity':identity,'environment':env,'contractVersion':ver})
 elif a.cmd=='versions':o=call(a.base_url,f'/admin/flows/{a.alias}/versions',token=token(a.credentials,'admin'))
 elif a.cmd=='verify':o=call(a.base_url,f'/admin/flows/{a.alias}/verify','POST',token(a.credentials,'admin'))
 elif a.cmd=='rollback':o=call(a.base_url,f'/admin/flows/{a.alias}/rollback/{a.version}','POST',token(a.credentials,'admin'))
 elif a.cmd in ('enable','disable'):o=call(a.base_url,f'/admin/flows/{a.alias}/{a.cmd}','POST',token(a.credentials,'admin'))
 elif a.cmd=='invoke':o=call(a.base_url,f'/invoke/{a.alias}','POST',token(a.credentials,'invoke'),body=json.loads(Path(a.body_file).read_text()))
 elif a.cmd=='backup':
  src=Path(a.data_dir); dest=Path(a.output).resolve(); dest.parent.mkdir(parents=True,exist_ok=True); db=src/'registry.db'
  if not db.exists():raise SystemExit('Registry database not found.')
  with tempfile.TemporaryDirectory() as t:
   snap=Path(t)/'registry.db'; x=sqlite3.connect(db); y=sqlite3.connect(snap); x.backup(y); y.close(); x.close()
   with tarfile.open(dest,'w:gz') as tf:
    tf.add(snap,arcname='registry.db'); cp=src/'bootstrap-credentials.json'
    if cp.exists():tf.add(cp,arcname='bootstrap-credentials.json')
  os.chmod(dest,0o600); o={'backup':str(dest),'mode':'0600'}
 print(json.dumps(o,indent=2))
if __name__=='__main__':main()
