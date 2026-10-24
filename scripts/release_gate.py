"""Offline, value-free exposure audit. A clean scan is not release approval."""

import argparse
import base64
import binascii
from collections import Counter
import html
import io
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote
import zipfile
import zlib


ROOT = Path(__file__).resolve().parents[1]
MAX_FILE = 32 * 1024 * 1024
MAX_TOTAL = 256 * 1024 * 1024
MAX_MEMBERS = 20000
MAX_DEPTH = 4
SIGNATURE = re.compile(r"\bsig\s*=\s*[A-Za-z0-9_+/%-]{20,}", re.I)
DATA_URL = re.compile(rb"data:[^,\s\"'<>]{0,120};base64,([A-Za-z0-9+/_=-]+)", re.I)
LOCAL_CONFIG = re.compile(r"^config\.local(?:\s*\(\d+\))?\.js$", re.I)
ARCHIVES = {".zip", ".docx", ".xlsx", ".pptx", ".vsdx"}
UNSUPPORTED = {".7z", ".rar", ".gz", ".tar", ".tgz", ".bz2", ".xz"}


def has_signature(data):
    text = data.decode("utf-8", errors="replace")
    for _ in range(4):
        if SIGNATURE.search(text):
            return True
        decoded = html.unescape(unquote(text))
        if decoded == text:
            break
        text = decoded
    return bool(SIGNATURE.search(text))


def inspect_content(name, data, counts, budget, depth=0):
    """Inspect in memory, never extract archives or report values/member names."""
    budget["bytes"] += len(data)
    budget["members"] += 1
    if (len(data) > MAX_FILE or budget["bytes"] > MAX_TOTAL
            or budget["members"] > MAX_MEMBERS):
        counts["unscannable"] += 1
        return
    if LOCAL_CONFIG.fullmatch(Path(name).name):
        counts["local_config_files"] += 1
    if has_signature(data):
        counts["signature_bearing_items"] += 1
    for match in DATA_URL.finditer(data):
        if depth >= MAX_DEPTH:
            counts["unscannable"] += 1
            break
        try:
            decoded = base64.b64decode(match[1], altchars=b"-_", validate=True)
        except (ValueError, binascii.Error):
            counts["unscannable"] += 1
            continue
        counts["encoded_payloads"] += 1
        inspect_content("embedded", decoded, counts, budget, depth + 1)
    suffix = Path(name).suffix.lower()
    if suffix in UNSUPPORTED:
        counts["unscannable"] += 1
    elif suffix in ARCHIVES or data.startswith(b"PK\x03\x04"):
        if depth >= MAX_DEPTH:
            counts["unscannable"] += 1
            return
        counts["archives"] += 1
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                for member in archive.infolist():
                    if member.is_dir():
                        continue
                    if (member.file_size > MAX_FILE
                            or budget["bytes"] + member.file_size > MAX_TOTAL
                            or budget["members"] >= MAX_MEMBERS):
                        counts["unscannable"] += 1
                        continue
                    with archive.open(member) as stream:
                        content = stream.read(MAX_FILE + 1)
                    inspect_content(member.filename, content, counts, budget, depth + 1)
        except (OSError, ValueError, RuntimeError, EOFError, zipfile.BadZipFile,
                NotImplementedError, zlib.error):
            counts["unscannable"] += 1


def audit(root):
    counts = Counter(files=0, archives=0, encoded_payloads=0, signature_bearing_items=0,
                     local_config_files=0, unscannable=0, excluded_agent_files=0)
    budget = {"bytes": 0, "members": 0}
    try:
        result = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            cwd=root, check=True, capture_output=True,
        )
    except (OSError, subprocess.CalledProcessError):
        counts["unscannable"] += 1
        return dict(counts)
    for raw in sorted(set(result.stdout.split(b"\0")) - {b""}):
        name = raw.decode("utf-8", errors="surrogateescape")
        if name.startswith(".github/agents/") or "/.github/agents/" in name:
            counts["excluded_agent_files"] += 1
            continue
        counts["files"] += 1
        target = root / name
        try:
            if (target.is_symlink() or not target.resolve().is_relative_to(root.resolve())
                    or not target.is_file() or target.stat().st_size > MAX_FILE):
                counts["unscannable"] += 1
                continue
            with target.open("rb") as stream:
                data = stream.read(MAX_FILE + 1)
            inspect_content(name, data, counts, budget)
        except (OSError, ValueError):
            counts["unscannable"] += 1
    return dict(counts)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["audit", "release"])
    args = parser.parse_args(argv)
    counts = audit(ROOT)
    print(json.dumps({"scope": "tracked and non-ignored working files; ZIP/OOXML and base64 data URLs",
                      "history_and_ignored_files_scanned": False, "counts": counts},
                     sort_keys=True))
    if args.mode == "release":
        print("NO-GO: owner exposure/access and rotation verification, enforced server-side "
              "authorization, and staging/operational acceptance are not established.")
        return 2
    return int(any(counts[k] for k in
                   ("signature_bearing_items", "local_config_files", "unscannable")))


if __name__ == "__main__":
    raise SystemExit(main())
