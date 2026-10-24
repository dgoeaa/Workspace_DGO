import subprocess,unittest
from pathlib import Path
S=Path(__file__).parents[1]/'termux-setup.sh'
class T(unittest.TestCase):
 def test_syntax(self): self.assertEqual(subprocess.run(['bash','-n',str(S)]).returncode,0)
 def test_interface(self):
  t=S.read_text()
  for x in 'install update verify diagnose repair backup rollback uninstall help'.split(): self.assertIn(x,t)
 def test_guards(self):
  t=S.read_text();
  for x in ('ro.build.version.sdk','aarch64|armv7l|x86_64|i686','TERMUX_APK_RELEASE','200 MiB','POST-INSTALL CHECKS PASSED'): self.assertIn(x,t)
 def test_security_idempotency(self):
  t=S.read_text(); self.assertNotIn('set -x',t); self.assertIn('chmod 600',t); self.assertIn('grep -Fq',t); self.assertIn('.next',t); self.assertIn('mv -Tf',t)
