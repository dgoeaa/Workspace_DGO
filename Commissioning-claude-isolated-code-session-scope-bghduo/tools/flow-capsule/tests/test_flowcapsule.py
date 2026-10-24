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
 def test_store_exact_atomic_versions_integrity(self):
  with tempfile.TemporaryDirectory() as d:
   import os; os.environ['FLOWCAP_DATA_DIR']=d; c=f.Config(); s=f.Store(c); u='https://x.api.powerplatform.com/workflows/a/triggers/manual/paths/invoke?api-version=1&sp=x&sv=1&sig=a'; s.activate('a','orders.create',u,'id','prod','1',{}); self.assertEqual(s.active('orders.create')['original_url'],u); self.assertEqual(s.active('orders.create')['fingerprint'],f.digest(u)); s.activate('a','orders.create',u+'2','id','prod','1',{}); self.assertEqual(s.active('orders.create')['version'],2); s.rollback('a','orders.create',1,{}); self.assertEqual(s.active('orders.create')['version'],1)
if __name__=='__main__': unittest.main()
