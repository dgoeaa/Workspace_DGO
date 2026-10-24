#!/usr/bin/env python3
"""Confine a Claude Code session to one repo and one branch.

Wired into .claude/settings.json as a PreToolUse / SessionStart /
UserPromptSubmit hook. Every tool call is inspected before it runs; anything
that would read, write, or reference content outside the branch declared in
.claude/branch-lock.json is denied deterministically, without asking the model
to police itself.

Scope is read fresh on every call, so editing the lock file takes effect at
once. The guard files themselves are write-protected: set
BRANCH_LOCK_ALLOW_GUARD_EDITS=1 in the *environment* (not from inside a
session) when you genuinely want the leash changed from a session.
"""

import json
import os
import re
import shlex
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(HERE))
LOCK_FILE = os.path.join(PROJECT_DIR, ".claude", "branch-lock.json")

# Files that define the leash. Never editable from inside a locked session.
GUARD_PATHS = (
    ".claude/branch-lock.json",
    ".claude/hooks/",
    ".claude/settings.json",
    ".claude/settings.local.json",
)
GUARD_SCRIPTS = ("lock-branch.sh",)

FILE_TOOLS = ("Read", "Edit", "Write", "NotebookEdit", "Glob", "Grep")
PATH_KEYS = ("file_path", "path", "notebook_path", "filePath")

BANNED_BINS = {"gh", "hub", "glab", "svn", "hg", "eval"}
NET_BINS = {"curl", "wget", "nc", "ncat", "ssh", "scp", "rsync", "ftp"}
READ_ONLY_BINS = {
    "cat", "head", "tail", "less", "more", "grep", "rg", "egrep", "fgrep",
    "wc", "diff", "file", "stat", "ls", "find", "sha256sum", "md5sum", "jq",
    "git", "echo", "printf", "which", "basename", "dirname", "realpath",
    "sort", "uniq",
}
INTERPRETERS = {
    "python", "python3", "node", "nodejs", "perl", "ruby", "php", "sh", "bash",
    "zsh", "awk", "gawk", "sed", "ed", "tee", "dd", "tr", "patch",
}
WRAPPERS = {"sudo", "env", "time", "nohup", "command", "xargs", "nice", "stdbuf", "timeout"}

GIT_BANNED = {
    "clone", "remote", "submodule", "worktree", "filter-branch", "filter-repo",
    "replace", "bundle", "request-pull", "am", "apply", "svn", "p4", "daemon",
    "instaweb",
}
GIT_REF_ARGS = {
    "log", "show", "diff", "checkout", "switch", "merge", "rebase", "reset",
    "cherry-pick", "revert", "restore", "archive", "rev-list", "rev-parse",
    "describe", "shortlog", "blame", "range-diff", "cat-file", "ls-tree",
    "read-tree", "merge-base", "diff-tree", "grep", "bisect", "tag", "notes",
    "stash", "push", "pull", "fetch", "branch", "update-ref", "symbolic-ref",
}
GIT_WRITES_FILES = {"checkout", "restore", "apply", "rm", "mv", "clean", "stash"}

SHA_RE = re.compile(r"^[0-9a-f]{7,40}$")
REDIR_RE = re.compile(r"\d*(?:>>|>|<<|<)&?\d*\s*\S*")
HEREDOC_RE = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
REDIRECT_TO_GUARD = re.compile(r">>?\s*\S*\.claude/")


def fail(reason):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": "BRANCH LOCK: " + reason,
        }
    }))
    sys.exit(0)


def ok():
    sys.exit(0)


def guard_fail(what):
    if os.environ.get("BRANCH_LOCK_ALLOW_GUARD_EDITS") == "1":
        return
    fail("`%s` would modify the branch-lock guard itself. A session cannot widen its own "
         "scope; change it outside the session, or set BRANCH_LOCK_ALLOW_GUARD_EDITS=1 "
         "in the environment." % what.strip()[:120])


def load_lock():
    try:
        with open(LOCK_FILE) as fh:
            return json.load(fh)
    except Exception as exc:  # a missing or broken lock must fail closed, not open
        fail("cannot read %s (%s). Fix the lock file before running tools." % (LOCK_FILE, exc))


def git(*args):
    try:
        out = subprocess.run(["git", "-C", PROJECT_DIR] + list(args),
                             capture_output=True, text=True, timeout=10)
        return out.returncode, out.stdout.strip()
    except Exception:
        return 1, ""


# --------------------------------------------------------------------------- paths

def allowed_roots(lock):
    roots = [os.path.realpath(PROJECT_DIR)]
    scratch = os.environ.get("CLAUDE_SCRATCHPAD_DIR")
    if scratch:
        roots.append(os.path.realpath(scratch))
    for extra in lock.get("extra_read_roots") or []:
        roots.append(os.path.realpath(os.path.expanduser(extra)))
    return roots


def inside_scope(path, lock):
    real = os.path.realpath(os.path.expanduser(path))
    if real.startswith(os.path.expanduser("~/.claude/plans")):
        return True                          # Claude Code writes its plan files here
    if real.startswith("/tmp/claude-"):      # this session's scratchpad
        return True
    for root in allowed_roots(lock):
        if real == root or real.startswith(root + os.sep):
            return True
    return False


def is_guard(path):
    real = os.path.realpath(os.path.expanduser(path))
    root = os.path.realpath(PROJECT_DIR)
    if not (real == root or real.startswith(root + os.sep)):
        return False
    rel = os.path.relpath(real, root)
    return any(rel == g or rel.startswith(g) for g in GUARD_PATHS)


def read_script(token):
    """Contents of a script file handed to an interpreter, if it is one."""
    if token.startswith("-"):
        return ""
    path = token if os.path.isabs(token) else os.path.join(PROJECT_DIR, token)
    try:
        if os.path.isfile(path) and os.path.getsize(path) < 1000000:
            with open(path, "r", errors="ignore") as fh:
                return fh.read()
    except Exception:
        pass
    return ""


def mentions_guard(text):
    probe = text.strip().strip("\"'").rstrip("/")
    if not probe:
        return False
    for g in GUARD_PATHS:
        bare = g.rstrip("/")
        if bare in text:
            return True
        if probe not in (".", "..", "") and bare.startswith(probe + "/"):
            return True          # names a parent directory of a guard file
    return any(s in text for s in GUARD_SCRIPTS)


# --------------------------------------------------------------------------- shell parsing

def strip_heredocs(raw):
    """Return (command text without heredoc bodies, list of those bodies).

    A heredoc body is data being written, not a command. Parsing it as shell
    produces false positives; scanning it still matters for interpreters.
    """
    lines = raw.split("\n")
    out, bodies, i = [], [], 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        i += 1
        m = HEREDOC_RE.search(line)
        if not m:
            continue
        delim, body = m.group(2), []
        while i < len(lines) and lines[i].strip() != delim:
            body.append(lines[i])
            i += 1
        i += 1                       # consume the delimiter line
        bodies.append("\n".join(body))
    return "\n".join(out), bodies


def split_segments(cmd):
    """Split a shell command into pipeline/list segments, respecting quotes."""
    segs, cur, quote, i, n = [], "", None, 0, len(cmd)
    while i < n:
        c = cmd[i]
        if quote:
            cur += c
            if c == quote:
                quote = None
            i += 1
            continue
        if c in "\"'":
            quote = c
            cur += c
            i += 1
            continue
        if c == "\\" and i + 1 < n:
            cur += c + cmd[i + 1]
            i += 2
            continue
        if cmd.startswith("&&", i) or cmd.startswith("||", i):
            segs.append(cur); cur = ""; i += 2
            continue
        if c in ";|&\n":
            segs.append(cur); cur = ""; i += 1
            continue
        cur += c
        i += 1
    segs.append(cur)
    for inner in re.findall(r"\$\(([^()]*)\)", cmd) + re.findall(r"`([^`]*)`", cmd):
        segs.extend(split_segments(inner))
    return [s.strip() for s in segs if s.strip()]


def tokenize(seg):
    try:
        return shlex.split(seg, posix=True)
    except ValueError:
        return seg.split()


def strip_wrappers(tokens):
    out = list(tokens)
    while out:
        head = out[0]
        if "=" in head and not head.startswith("-") and "/" not in head.split("=")[0]:
            out = out[1:]                     # VAR=value prefix
            continue
        if head in WRAPPERS:
            out = out[1:]
            while out and out[0].startswith("-"):
                out = out[1:]
            continue
        break
    return out


# --------------------------------------------------------------------------- git

def ref_allowed(token, lock):
    branch = lock["branch"]
    base = re.split(r"[~^@]", token)[0].rstrip(".") or token
    if base in ("", "HEAD", "@", branch, "origin/" + branch,
                "refs/heads/" + branch, "refs/remotes/origin/" + branch):
        return True
    if SHA_RE.match(base):
        code, _ = git("merge-base", "--is-ancestor", base, "HEAD")
        return code == 0          # a bare sha passes only if already in this history
    return False


def check_git(tokens, lock):
    branch = lock["branch"]
    rest = tokens[1:]
    for i, a in enumerate(rest):
        if a == "-C" and i + 1 < len(rest) and not inside_scope(rest[i + 1], lock):
            fail("`git -C %s` points outside %s." % (rest[i + 1], PROJECT_DIR))
        if a.startswith(("--git-dir", "--work-tree")):
            fail("`%s` can retarget git at another repository." % a)

    sub = next((a for a in rest if not a.startswith("-")), None)
    if sub is None:
        return
    if sub in GIT_BANNED:
        fail("`git %s` reaches outside the locked branch (new remotes, worktrees, or repos)." % sub)

    if sub in GIT_WRITES_FILES and any(mentions_guard(t) for t in rest):
        guard_fail("git " + sub)

    if sub in ("checkout", "switch"):
        if "--" in tokens:
            return                                    # restoring paths, not switching
        for t in tokens[2:]:
            if t.startswith("-"):
                if t in ("-b", "-B", "-c", "-C", "--orphan", "--detach"):
                    fail("creating or detaching a branch is not allowed; locked to `%s`." % branch)
                continue
            if not ref_allowed(t, lock):
                fail("`git %s %s` would leave the locked branch `%s`." % (sub, t, branch))
        return

    if sub == "branch":
        for t in tokens[2:]:
            if t in ("-d", "-D", "-m", "-M", "-c", "-C", "--delete", "--move"):
                fail("creating, renaming, or deleting branches is not allowed; locked to `%s`." % branch)
        return

    if sub in ("push", "pull", "fetch"):
        positionals = [t for t in tokens[2:] if not t.startswith("-")]
        for flag in tokens[2:]:
            if flag in ("--all", "--mirror", "--tags", "--prune", "--delete"):
                fail("`git %s %s` touches refs beyond `%s`." % (sub, flag, branch))
        if positionals and positionals[0] != "origin":
            fail("only the `origin` remote is in scope (got `%s`)." % positionals[0])
        refspecs = positionals[1:]
        if sub == "fetch" and not refspecs:
            fail("bare `git fetch` pulls every branch. Use `git fetch origin %s`." % branch)
        for spec in refspecs:
            src, _, dst = spec.partition(":")
            for part in (src, dst or src):
                if part and not ref_allowed(part, lock):
                    fail("refspec `%s` names a ref outside `%s`." % (spec, branch))
        return

    if sub in GIT_REF_ARGS:
        args = tokens[2:]
        if "--" in args:
            args = args[:args.index("--")]
        for t in args:
            if t.startswith("-") or t == sub:
                continue
            if os.path.exists(os.path.join(PROJECT_DIR, t)):
                continue                                # it is a path, not a ref
            if ref_allowed(t, lock):
                continue
            if sub in ("stash", "bisect", "tag", "notes", "grep", "rev-parse",
                       "describe", "branch") and not SHA_RE.match(t):
                continue                                # subcommand words, patterns, names
            fail("`git %s` references `%s`, which is outside branch `%s`." % (sub, t, branch))


# --------------------------------------------------------------------------- bash

def check_bash(tool_input, lock):
    raw = tool_input.get("command", "") or ""
    cmd, bodies = strip_heredocs(raw)

    if re.search(r"base64\s+(-d|--decode)", cmd) or re.search(r"\|\s*(ba)?sh\b", cmd):
        fail("obfuscated execution (base64 decode, pipe-to-shell) is not allowed under a branch lock.")

    for seg in split_segments(cmd):
        tokens = strip_wrappers(tokenize(seg))
        if not tokens:
            continue
        binary = os.path.basename(tokens[0])

        if binary in BANNED_BINS:
            fail("`%s` can reach repositories and branches outside the lock." % binary)
        if binary in NET_BINS and not lock.get("allow_web"):
            fail("`%s` is network egress; set \"allow_web\": true in branch-lock.json to permit it." % binary)

        if binary == "git":
            check_git(strip_wrappers(tokenize(REDIR_RE.sub(" ", seg))), lock)

        # Guard-file protection. Read-only tools may name guard paths; anything
        # that can write must not. Interpreters get their heredoc bodies scanned
        # too, since that is where a script rewriting the guard would live.
        if REDIRECT_TO_GUARD.search(seg):
            guard_fail(seg)
        if binary in INTERPRETERS:
            scanned = [seg] + bodies + [read_script(t) for t in tokens[1:]]
            if any(s and mentions_guard(s) for s in scanned):
                guard_fail(seg)
        elif binary not in READ_ONLY_BINS and any(mentions_guard(t) for t in tokens[1:]):
            guard_fail(seg)
        if any(os.path.basename(t) in GUARD_SCRIPTS for t in tokens):
            guard_fail(seg)

        # Absolute paths outside the locked tree.
        for t in tokens[1:]:
            arg = t.split("=", 1)[1] if (t.startswith("--") and "=" in t) else t
            if not arg.startswith(("/", "~")):
                continue
            if arg.startswith(("/usr/", "/bin/", "/sbin/", "/lib/", "/opt/",
                               "/etc/", "/proc/", "/dev/", "/var/log/")):
                continue
            if not inside_scope(arg, lock):
                fail("path `%s` is outside the locked working tree %s." % (arg, PROJECT_DIR))


# --------------------------------------------------------------------------- github mcp

def check_github_tool(tool_name, tool_input, lock):
    want_owner, _, want_repo = lock["repo"].partition("/")
    owner, repo = tool_input.get("owner"), tool_input.get("repo")
    if owner and repo and (owner.lower() != want_owner.lower() or repo.lower() != want_repo.lower()):
        fail("%s targets %s/%s; this session is locked to %s." % (tool_name, owner, repo, lock["repo"]))
    if (not owner or not repo) and re.search(r"(search|list_repos|list_branches|fork)", tool_name):
        fail("%s can range across repositories or branches; out of scope under a branch lock." % tool_name)
    for key in ("ref", "branch", "base", "head", "base_branch", "branch_name", "sha"):
        val = tool_input.get(key)
        if isinstance(val, str) and val and not ref_allowed(val, lock):
            fail("%s uses %s=`%s`, outside branch `%s`." % (tool_name, key, val, lock["branch"]))


# --------------------------------------------------------------------------- events

def pre_tool_use(payload, lock):
    tool = payload.get("tool_name", "")
    ti = payload.get("tool_input") or {}

    if tool == "Bash":
        check_bash(ti, lock)
    elif tool in FILE_TOOLS:
        for key in PATH_KEYS:
            p = ti.get(key)
            if not isinstance(p, str) or not p:
                continue
            target = p if os.path.isabs(p) else os.path.join(PROJECT_DIR, p)
            if not inside_scope(target, lock):
                fail("%s on `%s` is outside the locked working tree %s." % (tool, p, PROJECT_DIR))
            if tool in ("Edit", "Write", "NotebookEdit") and is_guard(target):
                guard_fail(p)
            if tool in ("Read", "Edit", "Write") and re.search(r"(^|/)\.git/", target):
                fail("raw .git internals expose every branch's objects; use the gated git commands instead.")
    elif tool in ("WebFetch", "WebSearch") and not lock.get("allow_web"):
        fail("%s is out of scope; set \"allow_web\": true in branch-lock.json to permit it." % tool)
    elif tool in ("Agent", "Task") and not lock.get("allow_subagents", True):
        fail("subagents are disabled under this branch lock.")
    elif tool.startswith("mcp__github__"):
        check_github_tool(tool, ti, lock)
    ok()


def scope_banner(lock):
    code, current = git("rev-parse", "--abbrev-ref", "HEAD")
    lines = [
        "SCOPE LOCK (enforced by .claude/hooks/branch_lock.py, not by judgement):",
        "  repo   : %s" % lock["repo"],
        "  branch : %s" % lock["branch"],
        "  tree   : %s" % PROJECT_DIR,
        "  web    : %s" % ("allowed" if lock.get("allow_web") else "denied"),
        "Do not read, reference, or reason about any other branch, repo, path, or prior conversation.",
    ]
    if code == 0 and current != lock["branch"]:
        lines.append("WARNING: checked-out branch is `%s`, not the locked `%s`. "
                     "Stop and tell the user before doing any work." % (current, lock["branch"]))
    return "\n".join(lines)


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        ok()
    lock = load_lock()
    event = payload.get("hook_event_name", "")
    if event == "PreToolUse":
        pre_tool_use(payload, lock)
    elif event in ("SessionStart", "UserPromptSubmit"):
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": event,
            "additionalContext": scope_banner(lock),
        }}))
    ok()


if __name__ == "__main__":
    main()
