# Scope lock

This repository runs sessions under a **single-branch lock**. The authoritative
scope lives in `.claude/branch-lock.json` and is enforced by
`.claude/hooks/branch_lock.py` on every tool call.

**Rules for any Claude session working here:**

1. Work only on the branch named in `.claude/branch-lock.json`, inside this
   working tree. Do not check out, create, merge, rebase, cherry-pick, diff, or
   read any other branch.
2. Do not read, list, clone, or query any other repository — including through
   the GitHub tools.
3. Do not read paths outside this working tree: no `$HOME`, no other clones, no
   `~/.claude`, no raw `.git` internals.
4. Do not carry in facts, file contents, decisions, or history from any other
   conversation, session, or branch. **If it is not in this working tree on this
   branch, it does not exist for this task.** Ask rather than assume.
5. Do not access the network unless `allow_web` is true in the lock file.
6. Do not modify `.claude/branch-lock.json`, `.claude/settings.json`, or
   anything under `.claude/hooks/`. A session cannot widen its own scope. If the
   scope is wrong, stop and say so.

If a task cannot be completed inside this scope, name exactly what is out of
scope and stop. Do not work around the lock.

This file is guidance, not enforcement — the hook is enforcement. Editing this
file changes nothing about what is allowed.
