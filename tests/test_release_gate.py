import contextlib
import base64
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import zlib


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "release_gate.py"
SPEC = importlib.util.spec_from_file_location("release_gate", SCRIPT)
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)


class ReleaseGateTest(unittest.TestCase):
    def scan(self, name, data):
        counts = gate.Counter()
        gate.inspect_content(name, data, counts, {"bytes": 0, "members": 0})
        return counts

    def archive(self, name, data):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(name, data)
        return stream.getvalue()

    def test_plain_encoded_and_html_signatures(self):
        token = b"X" * 43
        for prefix in (b"sig=", b"SIG=", b"sig%3D", b"sig%253D", b"sig&#61;"):
            with self.subTest(prefix=prefix):
                self.assertTrue(gate.has_signature(prefix + token))
        self.assertFalse(gate.has_signature(b"sig=ROTATE_ME"))

    def test_nested_archive_and_local_config(self):
        data = self.archive("nested.zip", self.archive("config.local (1).js",
                                                      b"sig=" + b"X" * 43))
        counts = self.scan("release.zip", data)
        self.assertEqual(counts["signature_bearing_items"], 1)
        self.assertEqual(counts["local_config_files"], 1)
        self.assertEqual(counts["archives"], 2)

    def test_base64_browser_module_is_not_a_secret_hiding_place(self):
        payload = b"sig=" + b"X" * 43
        html = b'<script src="data:text/javascript;base64,' + base64.b64encode(payload) + b'">'
        counts = self.scan("mailer.html", html)
        self.assertEqual(counts["signature_bearing_items"], 1)
        self.assertEqual(counts["encoded_payloads"], 1)
        with patch.object(gate, "MAX_DEPTH", 0):
            self.assertEqual(self.scan("mailer.html", html)["unscannable"], 1)
        self.assertEqual(self.scan("bad.html", b"data:text/javascript;base64,abc")["unscannable"], 1)

    def test_unreadable_unsupported_and_bounded_archives(self):
        self.assertEqual(self.scan("bad.zip", b"broken")["unscannable"], 1)
        self.assertEqual(self.scan("unknown.7z", b"binary")["unscannable"], 1)
        data = self.archive("large.txt", b"x" * 300)
        with patch.object(gate, "MAX_FILE", 200):
            self.assertGreater(self.scan("large.zip", data)["unscannable"], 0)
        with patch.object(gate, "MAX_DEPTH", 0):
            self.assertEqual(self.scan("release.zip", data)["unscannable"], 1)
        with patch.object(gate.zipfile.ZipFile, "open", side_effect=zlib.error):
            self.assertEqual(self.scan("damaged.zip", data)["unscannable"], 1)

    def test_git_failure_is_not_clean(self):
        with patch.object(gate.subprocess, "run", side_effect=OSError):
            self.assertEqual(gate.audit(Path("/missing"))["unscannable"], 1)

    def test_working_tree_scope_and_symlink_refusal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            (root / "clean.txt").write_text("offline")
            (root / "config.local (1).js").write_text("")
            (root / ".gitignore").write_text("ignored.txt\n")
            (root / "ignored.txt").write_text("sig=" + "X" * 43)
            (root / "link").symlink_to(root / "clean.txt")
            counts = gate.audit(root)
            self.assertEqual(counts["files"], 4)
            self.assertEqual(counts["local_config_files"], 1)
            self.assertEqual(counts["signature_bearing_items"], 0)
            self.assertEqual(counts["unscannable"], 1)

    def test_release_refuses_even_clean_scan_and_output_is_value_free(self):
        with patch.object(gate, "audit", return_value={}), contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(gate.main(["release"]), 2)
        self.assertIn("NO-GO", out.getvalue())
        self.assertNotIn("X" * 43, out.getvalue())

    def test_audit_exit_and_counts_only_output(self):
        counts = dict(signature_bearing_items=1, local_config_files=0, unscannable=0)
        with patch.object(gate, "audit", return_value=counts), contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(gate.main(["audit"]), 1)
        self.assertEqual(json.loads(out.getvalue())["counts"], counts)
        counts["signature_bearing_items"] = 0
        with patch.object(gate, "audit", return_value=counts), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(gate.main(["audit"]), 0)


if __name__ == "__main__":
    unittest.main()
