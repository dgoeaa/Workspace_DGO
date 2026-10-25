import csv
import json
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]


class FolioDispositionsTest(unittest.TestCase):
    def setUp(self):
        self.decisions = json.loads(
            (ROOT / "docs/folio-source-dispositions.json").read_text()
        )
        with (ROOT / self.decisions["curationSource"]).open(newline="") as stream:
            self.curation = {
                row["path"]: row for row in csv.DictReader(stream)
            }
        self.inventory = (ROOT / self.decisions["pathInventory"]).read_text()

    def test_every_runtime_and_large_file_entry_has_an_explicit_pending_decision(self):
        runtime = json.loads(
            (ROOT / "Repo_root/tests/repo-hygiene-baseline.json").read_text()
        )["runtime"]
        large = json.loads(
            (ROOT / "Repo_root/docs/governance/approved-large-files.json").read_text()
        )["approved_large_files"]
        for key, prefix, paths, count in [
            ("runtime", "H", runtime, 36),
            ("largeFiles", "L", [entry["path"] for entry in large], 20),
        ]:
            entries = self.decisions[key]
            self.assertEqual(len(entries), count)
            self.assertEqual(len(paths), count)
            for number, (entry, path) in enumerate(zip(entries, paths), 1):
                identifier = f"{prefix}{number:02}"
                self.assertEqual(entry["id"], identifier)
                self.assertEqual(entry["status"], "pending-owner-decision")
                self.assertEqual(
                    entry["curation"], self.curation[path]["decision"], identifier
                )
                self.assertFalse((ROOT / "Repo_root" / path).exists(), identifier)
        self.assertEqual(
            sum(row["curation"] == "EXCLUDE" for row in self.decisions["largeFiles"]),
            17,
        )

    def test_six_excluded_target_requests_cover_exactly_nine_original_occurrences(self):
        original = {
            identifier: (source, target)
            for identifier, source, target in re.findall(
                r"^(R\d{2}) \| (.+):\d+ \| (.+)$", self.inventory, re.M
            )
        }
        requests = self.decisions["excludedReferences"]
        self.assertEqual(len(requests), 6)
        occurrences = []
        for request in requests:
            self.assertEqual(request["status"], "pending-owner-decision")
            target = request["path"].rstrip("/")
            records = [
                row for name, row in self.curation.items()
                if name == target or name.startswith(target + "/")
            ]
            self.assertEqual(len(records), 4 if request["id"] == "R05" else 1)
            self.assertTrue(all(row["decision"] == "EXCLUDE" for row in records))
            for identifier in request.get("occurrences", [request["id"]]):
                source, reference = original[identifier]
                resolved = (ROOT / "Repo_root" / Path(source).parent / reference).resolve()
                self.assertEqual(
                    resolved, (ROOT / "Repo_root" / target).resolve(), identifier
                )
                occurrences.append(identifier)
        self.assertEqual(len(occurrences), 9)
        self.assertEqual(len(set(occurrences)), 9)

    def test_external_items_record_dependencies_not_manufactured_approvals(self):
        rows = self.decisions["external"]
        self.assertEqual(
            {identifier for row in rows for identifier in row["ids"]},
            {"E1", "E2", "T1", "S1", "P1", "B1", "O1"},
        )
        for row in rows:
            self.assertIn(row["status"], {
                "pending-authorized-owner-evidence",
                "not-authorized-in-source-task",
                "pending-owner-decision",
            })
            self.assertTrue(row["dependency"])


if __name__ == "__main__":
    unittest.main()
