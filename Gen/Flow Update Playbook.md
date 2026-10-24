NITDA DGDigitalOpsDGO Digital Ops

**Flow Update Playbook**Folio · Internal

Power Automate · Any Tenant · Any Flow

# Change Live Flows Safely, Without the Designer

A complete, tested method for changing one flow or a set of flows: back it up, find the exact place to change, change a draft, check every changed line, write it, read it back, and return to the backup automatically if anything differs. One script and three common tools, on Windows, macOS, Linux and Android.

bash · curl · jqAny tenant and environmentOne flow or a setAutomatic undoNo designer edits

Your Progress

0 of 0 steps

01Configure

## Your Settings

Enter them once. Every command in this playbook is then written with your values, so nothing is left to fill in by hand. They are kept in this browser only.

Tenant IDPower Automate → Settings (gear) → Session details → Tenant ID.

Environment IDSession details → Environment ID, or the part after `/environments/` in a flow's address. Leave empty for the default environment.

Flow IDs, One per LineOpen the flow: the ID is the part after `/flows/` in the address. One line for one flow, several lines for a set.

Another Cloud or a Blocked Sign-In App

Flow Service Address (FLOWAPI)Leave empty for the commercial cloud.

Sign-In Address (LOGIN)Leave empty for the commercial cloud.

Sign-In App (CLIENT)Change only if sign-in reports that the app is not allowed in the tenant.

Paste in Every New Terminal Window

02Prepare

## Tools and the Script

bash, curl and jq 1.6 or later, then one file, `flowpatch.sh`, in a folder of its own. That folder holds the backups.

✓ Testedflowpatch.sh · 188 lines · run end to end against a stand-in for Microsoft sign-in and the Flow service

```
#!/usr/bin/env bash
# flowpatch.sh: change any Power Automate flow, or a set of flows, safely and without the designer.
# Needs bash, curl and jq 1.6+. Every write is backed up first, read back after, and undone if the result differs.
#
# One flow                                   A set of flows (flow ids in a file, one per line)
#   signin                                     many backup <ids file>     back up all, draft new-<id>.json each
#   backup  <flow id>                          many replace <old> <new>   same text change in every draft
#   draft   <backup>             -> new.json   many set-text <path> <text>
#   list    <file>               every step    many check                 check every draft
#   where   <file> <step name>   its path      many write                 write each, stop at the first failure
#   find    <file> <text>        every match   many restore               put every backup back
#   show    <file> <path>
#   set     <file> <path> <json value>         <path> is a JSON array printed by list, where or find,
#   set-text <file> <path> <text | @file>      for example '["actions","Send_Email","inputs"]'
#   replace <file> <old text> <new text>
#   check   <backup> <file>
#   write   <flow id> <backup> <file>
#   restore <flow id> <backup>
#
# Settings: TENANT (required), ENVIRONMENT (default Default-<TENANT>), FLOWAPI, LOGIN, CLIENT.
set -euo pipefail
umask 077
LOGIN="${LOGIN:-https://login.microsoftonline.com}"
FLOWAPI="${FLOWAPI:-https://api.flow.microsoft.com}"
CLIENT="${CLIENT:-1950a258-227b-4e31-a9cf-717495945fc2}"
SCOPE='https://service.flow.microsoft.com//.default offline_access openid profile'
TOKENFILE="${TOKENFILE:-$HOME/.flowpatch-token}"
MANIFEST="${MANIFEST:-batch.tsv}"
need_tenant() { : "${TENANT:?Set TENANT first: export TENANT=<tenant id>}"; ENVIRONMENT="${ENVIRONMENT:-Default-$TENANT}"; }

url() { printf '%s/providers/Microsoft.ProcessSimple/environments/%s/flows/%s?api-version=2016-11-01' "$FLOWAPI" "$ENVIRONMENT" "$1"; }
auth() { [ -s "$TOKENFILE" ] || { echo "Not signed in: run bash flowpatch.sh signin" >&2; exit 1; }; printf 'Authorization: Bearer %s' "$(cat "$TOKENFILE")"; }
get() {
  local code; code=$(curl -sS -o .flowpatch-get.json -w '%{http_code}' -H "$(auth)" "$(url "$1")")
  case "$code" in
    2*) cat .flowpatch-get.json; rm -f .flowpatch-get.json ;;
    401) echo "Sign-in expired: run bash flowpatch.sh signin" >&2; exit 1 ;;
    *) echo "UNREADABLE: flow $1 (HTTP $code): $(jq -r '.error.message // empty' .flowpatch-get.json 2>/dev/null)" >&2; exit 1 ;;
  esac
}
# The comparison: key order, metadata, an empty runAfter and the authentication the service adds are not differences.
norm() { jq -S 'walk(if type == "object" then del(.metadata)
  | (if has("runAfter") and .runAfter == {} then del(.runAfter) else . end)
  | (if (.inputs | type) == "object" then .inputs |= del(.authentication) else . end) else . end)'; }
put() { curl -sS -o .flowpatch-put.json -w '%{http_code}' -X PATCH -H "$(auth)" -H 'Content-Type: application/json' --data-binary @"$2" "$(url "$1")"; }
# A step is an object under "actions" (or "triggers") whose container belongs to the definition, a step, or a branch.
STEPS='def steps: paths(type == "object") as $p
  | select(($p | length) >= 2 and ($p[-2] == "actions" or $p[-2] == "triggers"))
  | select(($p | length) == 2 or (getpath($p[:-2]) | type == "object" and has("type")) or $p[-3] == "else" or $p[-3] == "default" or (($p | length) >= 4 and $p[-4] == "cases"))
  | $p;'
defn() { jq 'if has("definition") then .definition else . end' "$1"; }   # a backup file or a definition file
pathok() { jq -e 'type == "array" and all(.[]; type == "string" or type == "number")' <<<"$1" > /dev/null 2>&1 || { echo "The path must be a JSON array, as list, where or find print it." >&2; exit 2; }; }

cmd="${1:-}"; shift || true
case "$cmd" in
signin)
  need_tenant
  dc=$(curl -sS -X POST "$LOGIN/$TENANT/oauth2/v2.0/devicecode" --data-urlencode "client_id=$CLIENT" --data-urlencode "scope=$SCOPE")
  if [ -z "$(jq -r '.device_code // empty' <<<"$dc")" ]; then
    echo "Sign-in is not available: $(jq -r '.error_description // .error // .' <<<"$dc" | head -1)"
    echo "If it names the app as not allowed, try the other public app: export CLIENT=9cee029c-6210-4654-90bb-17e6e9d36617"; exit 1
  fi
  echo "Open $(jq -r '.verification_uri' <<<"$dc") and enter the code $(jq -r '.user_code' <<<"$dc")"
  echo "Sign in as an owner or co-owner of the flows. This window carries on by itself."
  interval=$(jq -r '.interval // 5' <<<"$dc"); device=$(jq -r '.device_code' <<<"$dc")
  while :; do
    sleep "$interval"
    t=$(curl -sS -X POST "$LOGIN/$TENANT/oauth2/v2.0/token" --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:device_code" \
      --data-urlencode "client_id=$CLIENT" --data-urlencode "device_code=$device")
    at=$(jq -r '.access_token // empty' <<<"$t")
    if [ -n "$at" ]; then printf '%s' "$at" > "$TOKENFILE"; echo "Signed in. The sign-in lasts about an hour."; exit 0; fi
    case "$(jq -r '.error' <<<"$t")" in
      authorization_pending) ;;
      slow_down) interval=$((interval + 5)) ;;
      *) echo "Sign-in failed: $(jq -r '.error_description // .error' <<<"$t" | head -1)"; exit 1 ;;
    esac
  done ;;
backup)
  need_tenant; id="${1:?usage: backup <flow id>}"
  f="backup-$id-$(date -u +%Y%m%dT%H%M%SZ).json"; n=2
  while [ -e "$f" ]; do f="backup-$id-$(date -u +%Y%m%dT%H%M%SZ)-$n.json"; n=$((n + 1)); done  # never overwrite a backup
  get "$id" | jq --arg id "$id" '{flowId: $id, name: .properties.displayName, lastModifiedTime: .properties.lastModifiedTime,
    definition: .properties.definition, connectionReferences: .properties.connectionReferences}' > "$f"
  echo "Backed up \"$(jq -r .name "$f")\" to $f (keep it private: it holds the whole flow)" ;;
draft)
  b="${1:?usage: draft <backup> [output file]}"; out="${2:-new.json}"
  jq '.definition' "$b" > "$out"; echo "Wrote $out. Find what to change with list, where or find; change it with set, set-text or replace." ;;
list)
  f="${1:?usage: list <file>}"
  defn "$f" | jq -r "$STEPS"' steps as $p | getpath($p) as $a
    | ([$p[] | select(. == "actions")] | length) as $d
    | (if $p[-3] == "else" then "[if no] " elif $p[-3] == "default" then "[default] " elif (($p | length) >= 4 and $p[-4] == "cases") then "[case \($p[-3])] " elif $p[-2] == "actions" and $d > 1 and (getpath($p[:-2]).type == "If") then "[if yes] " else "" end) as $b
    | "\("  " * ([$d - 1, 0] | max))\(if $p[-2] == "triggers" then "trigger " else "" end)\($b)\($p[-1])  (\($a.type // "?"))\n\("  " * ([$d - 1, 0] | max))    \($p | tojson)"' ;;
where)
  f="${1:?usage: where <file> <step name>}"; q="${2:?usage: where <file> <step name>}"
  r=$(defn "$f" | jq -r --arg q "$q" "$STEPS"' ($q | ascii_downcase | gsub(" "; "_")) as $k | steps as $p
    | select(($p[-1] | ascii_downcase) == $k or ($p[-1] | ascii_downcase | contains($k))) | "\($p[-1])  (\(getpath($p).type))\n    \($p | tojson)"')
  [ -n "$r" ] && echo "$r" || { echo "No step named like \"$q\". Run list to see every step: in the file, spaces in names are underscores."; exit 1; } ;;
find)
  f="${1:?usage: find <file> <text>}"; q="${2:?usage: find <file> <text>}"
  r=$(defn "$f" | jq -r --arg q "$q" 'paths(type == "string") as $p | getpath($p) as $v
    | select($v | ascii_downcase | contains($q | ascii_downcase))
    | "\($p | tojson)\n    \($v | gsub("\\s+"; " ") | if length > 140 then .[0:140] + "…" else . end)"')
  [ -n "$r" ] && echo "$r" || { echo "\"$q\" does not appear in any value."; exit 1; } ;;
show)
  f="${1:?usage: show <file> <path>}"; p="${2:?usage: show <file> <path>}"; pathok "$p"
  r=$(defn "$f" | jq --argjson p "$p" 'try getpath($p) catch null')
  [ "$r" != null ] && echo "$r" || { echo "Nothing at that path. Check it with list, where or find."; exit 1; } ;;
set|set-text)
  f="${1:?usage: $cmd <file> <path> <value>}"; p="${2:?usage: $cmd <file> <path> <value>}"; v="${3?usage: $cmd <file> <path> <value>}"; pathok "$p"
  jq -e --argjson p "$p" '($p[:-1] | length) == 0 or (try (getpath($p[:-1]) | type == "object" or type == "array") catch false)' "$f" > /dev/null \
    || { echo "STOP: the place that should hold this value does not exist. Check the path with list, where or find."; exit 1; }
  if [ "$cmd" = set-text ]; then
    if [ "${v:0:1}" = "@" ] && [ -f "${v:1}" ]; then jq --argjson p "$p" --rawfile v "${v:1}" 'setpath($p; $v)' "$f" > "$f.next"
    else jq --argjson p "$p" --arg v "$v" 'setpath($p; $v)' "$f" > "$f.next"; fi
  else
    jq -e . <<<"$v" > /dev/null 2>&1 || { echo "STOP: the value is not JSON. For text use set-text, or wrap it in double quotes inside single quotes: '\"text\"'."; exit 1; }
    jq --argjson p "$p" --argjson v "$v" 'setpath($p; $v)' "$f" > "$f.next"
  fi
  before=$(jq -c --argjson p "$p" 'getpath($p)' "$f"); mv "$f.next" "$f"
  echo "Set $(jq -c . <<<"$p")"; echo "  was: ${before:0:160}"; echo "  now: $(jq -c --argjson p "$p" 'getpath($p)' "$f" | cut -c1-160)" ;;
replace)
  f="${1:?usage: replace <file> <old text> <new text>}"; o="${2:?usage: replace <file> <old text> <new text>}"; nw="${3?usage: replace <file> <old text> <new text>}"
  c=$(jq --arg o "$o" '[.. | strings | select(contains($o)) | split($o) | length - 1] | add // 0' "$f")
  [ "$c" -gt 0 ] || { echo "\"$o\" does not appear in $f: nothing replaced."; exit 0; }
  jq --arg o "$o" --arg n "$nw" 'walk(if type == "string" then split($o) | join($n) else . end)' "$f" > "$f.next" && mv "$f.next" "$f"
  echo "Replaced $c occurrence(s) in $f." ;;
check)
  b="${1:?usage: check <backup> <file>}"; new="${2:?usage: check <backup> <file>}"
  jq empty "$new" 2>/dev/null || { echo "STOP: $new is not valid JSON. Fix it, then check again."; exit 1; }
  long=$(jq '[.. | strings | select(startswith("@")) | length] | max // 0' "$new")
  steps=$(jq "$STEPS"' [steps | select(.[-2] == "actions")] | length' "$new")
  ok=1
  [ "$long" -le 8192 ] || { echo "STOP: one expression is $long characters; the service allows 8192. Use one string with @{…} for each value instead of one long expression."; ok=0; }
  [ "$steps" -le 500 ] || { echo "STOP: $steps actions; the service allows 500 per flow."; ok=0; }
  [ "$(jq -S -c '.definition.triggers' "$b")" = "$(jq -S -c '.triggers' "$new")" ] || { echo "STOP: the trigger changed, which would change the flow's address. Leave the trigger as it is."; ok=0; }
  if diff <(jq '.definition' "$b" | norm) <(norm < "$new") > "${new%.json}.diff"; then echo "NOTHING TO DO: $new is the same as the flow."; exit 0; fi
  echo "WILL_UPDATE: $(grep -c '^[<>]' "${new%.json}.diff") changed line(s), listed in ${new%.json}.diff (< now, > after)."
  [ "$ok" = 1 ] && echo "Checks passed: valid JSON, longest expression $long, $steps actions, trigger unchanged." || exit 1 ;;
write)
  need_tenant; id="${1:?usage: write <flow id> <backup> <file>}"; b="${2:?}"; new="${3:?}"
  verdict=$(bash "$0" check "$b" "$new") || { echo "STOP: the check does not pass. Run: bash flowpatch.sh check $b $new"; exit 1; }
  case "$verdict" in NOTHING*) echo "$verdict Nothing written."; exit 0 ;; esac
  now=$(get "$id" | jq -r '.properties.lastModifiedTime')
  [ "$now" = "$(jq -r .lastModifiedTime "$b")" ] || { echo "CHANGED: the flow was saved after your backup. Nothing written. Take a new backup and make the change again."; exit 1; }
  jq -n --slurpfile d "$new" --slurpfile b "$b" '{properties: {definition: $d[0], connectionReferences: $b[0].connectionReferences}}' > .flowpatch-patch.json
  code=$(put "$id" .flowpatch-patch.json)
  case "$code" in 2*) ;; *) echo "REFUSED (HTTP $code): $(jq -r '.error.message // .' .flowpatch-put.json | head -3). Nothing was changed."; exit 1 ;; esac
  if diff <(get "$id" | jq '.properties.definition' | norm) <(norm < "$new") > "readback-$id.diff"; then
    rm -f "readback-$id.diff" .flowpatch-patch.json .flowpatch-put.json; echo "APPLIED: written and read back."
  else
    echo "READ-BACK DIFFERS (see readback-$id.diff). Putting the backup back..."; bash "$0" restore "$id" "$b"
    echo "To try again, take a new backup first: the restore counts as a save."; exit 1
  fi ;;
restore)
  need_tenant; id="${1:?usage: restore <flow id> <backup>}"; b="${2:?}"
  jq '{properties: {definition, connectionReferences}}' "$b" > .flowpatch-patch.json
  code=$(put "$id" .flowpatch-patch.json)
  case "$code" in 2*) ;; *) echo "RESTORE REFUSED (HTTP $code): $(jq -r '.error.message // .' .flowpatch-put.json | head -3). Run the restore again."; exit 1 ;; esac
  if diff <(get "$id" | jq '.properties.definition' | norm) <(jq '.definition' "$b" | norm) > /dev/null; then
    rm -f .flowpatch-patch.json .flowpatch-put.json; echo "RESTORED: the backup is back and read back."
  else echo "RESTORE DIFFERS: run bash flowpatch.sh restore $id $b again."; exit 1; fi ;;
many)
  sub="${1:?usage: many backup|replace|set|set-text|check|write|restore …}"; shift
  if [ "$sub" = backup ]; then
    ids="${1:?usage: many backup <file of flow ids>}"; : > "$MANIFEST.next"
    while IFS= read -r id || [ -n "$id" ]; do
      id="${id%%#*}"; id="$(echo "$id" | tr -d '[:space:]')"; [ -n "$id" ] || continue
      line=$(bash "$0" backup "$id" < /dev/null) || { rm -f "$MANIFEST.next"; echo "STOPPED at $id: it could not be backed up. No manifest written."; exit 1; }
      b=$(sed -E 's/.* to ([^ ]+) .*/\1/' <<<"$line"); jq '.definition' "$b" > "new-$id.json"
      printf '%s\t%s\t%s\n' "$id" "$b" "new-$id.json" >> "$MANIFEST.next"; echo "$line"
    done < "$ids"
    mv "$MANIFEST.next" "$MANIFEST"; echo "$(wc -l < "$MANIFEST" | tr -d ' ') flow(s) backed up; drafts are new-<flow id>.json; the list is in $MANIFEST."; exit 0
  fi
  [ -s "$MANIFEST" ] || { echo "No $MANIFEST here: run many backup <file of flow ids> first."; exit 1; }
  failed=0; done_ids=""
  while IFS=$'\t' read -r id b n; do
    case "$sub" in
      replace|set|set-text) echo "== $id"; bash "$0" "$sub" "$n" "$@" < /dev/null || failed=1 ;;
      check) echo "== $id"; bash "$0" check "$b" "$n" < /dev/null || failed=1 ;;
      write) echo "== $id"; if bash "$0" write "$id" "$b" "$n" < /dev/null; then done_ids="$done_ids $id"; else echo "STOPPED at $id. Written before it:${done_ids:- none}. Their backups stay in $MANIFEST."; exit 1; fi ;;
      restore) echo "== $id"; bash "$0" restore "$id" "$b" < /dev/null || failed=1 ;;
      *) echo "Unknown: many $sub"; exit 2 ;;
    esac
  done < "$MANIFEST"
  exit $failed ;;
*) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
```

03Walkthrough

## One Flow, Start to Finish

Nine steps from sign-in to a verified change. Each shows what the terminal should answer. Nothing reaches the flow until step 8. Tick each step as you complete it.

04Locate

## Locate Anything in a Flow

A flow is one JSON document. Every step, value, expression and input has an exact address: a path, written as a JSON array of keys from the top. The script prints these paths, and every change command takes one.

How a Flow Is Laid Out

triggers › manual › inputs › schema leave the trigger as it is actions › Initialize_variable › inputs › variables › 0 › value actions › Scope_Main › actions › … inside a Scope actions › Condition › expression the test actions › Condition › actions › … If yes actions › Condition › else › actions › … If no actions › Switch › cases › Case_1 › actions › … actions › Switch › default › actions › … actions › Apply_to_each › actions › … also Do until actions › Send_an_email\_(V2) › inputs › parameters › emailMessage/Body

ⓘA step's name in the file is its designer name with spaces turned into underscores: **Send an email (V2)** is `Send_an_email_(V2)`. An expression is any value starting with `@` or containing `@{…}`.

Four Commands That Find Any Place

Where Each Kind of Step Keeps Its Values

| Step in the Designer | Type | Where Its Values Are |
| --- | --- | --- |

05Inspect

## Flow Explorer

Paste a flow: a backup file, a draft, or a definition copied from anywhere. Pick a step to see every value inside it with its exact path, and copy the command that shows or changes it. It runs in this page only; nothing is sent anywhere.

Flow JSON

Steps

06Change

## Make the Change

Every change command works on the draft, prints the value before and after, and refuses a path that does not exist. Nothing reaches the flow until you write.

⚠Keep four things true. The trigger is unchanged (the check enforces it). Every name in a `runAfter` is a step in the same container. Each expression stays under 8,192 characters (the check enforces it). Expressions name steps exactly as they are written in the file.

07Walkthrough

## A Set of Flows

The same change across several flows, or a different change in each. The flow IDs come from your settings. The write stops at the first flow that does not land, returns it to its backup, and names the flows already written.

08Read

## What Each Result Means

Every command ends with one of these words. Select one to see what it means and what to do next.

09Resolve

## When Something Goes Wrong

Type a few words of the message. Each entry gives the cause and the fix.

Six Rules

10Reference

## The Method Underneath

What the script sends, so that the same method can be built into any tool or language.

| Part | Value |
| --- | --- |

11Reference

## Quick Reference

National Information Technology Development Agency · DGO Digital Ops · FolioFlow Update Playbook · works with any Power Automate tenant, environment and flow