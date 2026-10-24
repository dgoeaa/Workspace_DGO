# Commissioning from a phone — Termux and the harvest bookmark

> **What this part is.** The same commissioning path as **Part 1**, on Android, where there
> is no devtools console and no desktop terminal. It stood as
> `CLEAR-THE-LAST-BLOCKER-TERMUX.md` until 2026-09-24 and is carried here so the estate has
> one runbook rather than one per device.
>
> **This part owns `scripts/harvest-trigger-urls.bookmarklet.txt`.** §4a below is the only
> place in this repository that tells anyone to run it, which is what
> `docs/reference/document-ownership.json` records. It performs the step **Part 3 §3.2** owns
> — the same two Flow API calls per flow — by the one mechanism a phone has; §3.2 remains the
> source for the step itself, and this part restates none of it.

## §0 · Read this before you start

### 0.1 One values file, generated for you

| | What it is | Who creates it | Where |
|---|---|---|---|
| `~/dgo-values.txt` | **The values file.** 25 `KEY=URL` lines. | **§4a's bookmark** writes it complete, signatures and all. Otherwise **`npm run values:template`** (§3) writes it complete but for the signatures, and §4 fills those in. | Termux's own home folder, outside the repository. Deleted at the end. |
| `config/config.local.js` | Internal platform config | `npm run setup` writes it | Inside the repository. Git-ignored. |
| `document-portal/config.local.js` | Public portal config | `npm run setup` writes it | Inside the repository. Git-ignored. |

You do not create the values file by hand and you do not edit the other two at all.

In Termux, `~` is `/data/data/com.termux/files/home` — Termux's own private folder, not your
phone's Downloads or Documents. That is the right place: no other app can read it. Do **not** put
it in shared storage.

### 0.2 The signature is the password

A trigger URL ends `sig=…`. That parameter **is** the password to the flow — anyone holding it
can invoke it.

- **Never paste one into a chat, a ticket, an email, or a notes app**, including a Claude session.
  All keep it permanently, and deleting the message revokes nothing. Only regenerating the trigger
  in Power Automate revokes anything.
- **On a phone this matters more, not less.** The Android clipboard is readable by your keyboard
  app and, on some versions, by whatever is in the foreground. Copy, switch straight to Termux,
  pipe it in, clear the clipboard (§4.4).
- Do not let a screenshot or screen recorder catch the designer with the URL field expanded.

### 0.3 Two apps, and they must come from the same place

You need **Termux** and **Termux:API**, both from **F-Droid**:

- Termux — <https://f-droid.org/packages/com.termux/>
- Termux:API — <https://f-droid.org/packages/com.termux.api/>

Two traps that cost an hour each:

- **The Google Play build of Termux is deprecated** and its packages no longer update. Uninstall
  it and install from F-Droid.
- **Both apps must come from the same source.** F-Droid Termux plus Play Store Termux:API fails on
  a signature mismatch, and the symptom is not an error — the `termux-*` commands simply hang.

Termux:API is not strictly required for §4 — §4.3 gives a fallback — but it is what makes that a
one-command-per-key job, and **§4a cannot work without it**: the clipboard is how the harvested
file crosses from Chrome to Termux without ever being displayed. Install it.

---

## §1 · Set Termux up

Open Termux. You get a prompt ending in `$`.

**1.1 Update.** First run only; a minute or two.

```bash
pkg update && pkg upgrade -y
```

**1.2 Install.**

```bash
pkg install -y git nodejs nano termux-api
```

`git` fetches the repository · `nodejs` runs everything here · `nano` is a text editor, since
Termux ships with none · `termux-api` is the command-line half of the Termux:API app.

**1.3 Check.**

```bash
git --version
node --version
```

Expected: any `git version 2.x`, and Node **22 or higher**. Below 22 this repository fails with a
syntax error, not a version message — try `pkg install -y nodejs-lts`, or `pkg update` then
`pkg upgrade nodejs`.

**1.4 Extra keys row.** Long-press the terminal → **Keyboard** → enable it. That gives you `CTRL`,
`TAB` and arrows. On most devices **Volume-Down also acts as Ctrl**.

**1.5 Stop Android killing Termux while you are in Chrome.**

```bash
termux-wake-lock
```

Release it at the end with `termux-wake-unlock`. Also set Android Settings → Apps → Termux →
Battery to **Unrestricted**.

---

## §2 · Get the repository

```bash
cd ~
git clone https://github.com/dgoeaa/ECM_DOCS_DEV.git ecm_docs_dev
cd ~/ecm_docs_dev
git checkout claude/system-remediation-gaps-ahpmsy
```

About **33 MiB**, unpacking to roughly 66 MB — use Wi-Fi if metered. With two-factor
authentication on GitHub, `git` asks for a username and a **personal access token**, not your
password.

Already cloned? `cd ~/ecm_docs_dev && git checkout claude/system-remediation-gaps-ahpmsy && git pull`

```bash
pwd
git branch --show-current
```

Expected: a path ending in `ecm_docs_dev`, and `claude/system-remediation-gaps-ahpmsy`.

**Every remaining command is typed in Termux, in this folder.** If Termux restarts,
`cd ~/ecm_docs_dev` first.

**You do not need `npm install`** — which is why this works on a phone at all.

**Confirm the ids are reconciled against the tenant:**

```bash
npm run reconcile
```

Expected: `25 keys`, `20 distinct workflows`, `25/25 carry a complete URL template`. If it lists
keys moving to different workflows, that is the register correcting the repository — expected.

**See where you stand:**

```bash
npm run commission
```

Scroll to the top for the `⛔ BLOCKER` section. Unwired endpoints are the blocker; §4a, §5 and §6
clear it, or §3–§6 the long way.

---

## §3 · Generate the values file

**Read §4a before you start this.** It fetches all 24 URLs from the API in one tap and writes
this file complete, which makes §3 and §4 unnecessary. Come back here if the bookmark will not
run on your phone, or if §4a reports a flow you do not co-own. This route always works.

```bash
umask 077
npm run values:template ~/dgo-values.txt
```

`umask 077` makes it readable by your account alone. Expected:

```
✅ wrote /data/data/com.termux/files/home/dgo-values.txt
   25 keys — 18 internal, 7 portal
   25 arrive with the URL already complete; add the signature after each 'sig='.
```

Read the flow headings without editing anything:

```bash
grep '^#   workflow' ~/dgo-values.txt
```

Twenty workflows serve the 25 keys — so twenty visits to Power Automate, not twenty-five.

---

## §4 · Twenty signatures, one command each

### 4.1 Copy one in the browser

Open **Chrome** and sign in to Power Automate with an account that can **edit** flows in
environment `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1`.

**Turn on desktop mode first: Chrome → ⋮ → tick "Desktop site"**, and rotate to landscape. The
designer does not render usably in mobile layout.

For each workflow id in the values file:

1. Address bar:
   `https://make.powerautomate.com/environments/Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1/flows/<id>/details`
2. **Edit** → tap **When an HTTP request is received** to expand it.
3. Find **HTTP POST URL** (newer builds label it **HTTP URL**).
4. **Use the copy icon.** Dragging to select is how a copy gets truncated on a touch screen.
5. **Do not tap Regenerate.** For these 25 keys the rotation is behind you — regenerating now
   revokes the URL a deployed surface is using and means coming back for a new one.

You may copy the whole URL — §4.2 takes the signature out of it and discards the rest.

**"Already rotated" has a scope, and it is exactly these 25 keys.** `npm run rotation` reports
ROTATED because all 25 resolve to workflows other than the ones the published signatures belong
to, so none of those signatures authenticates anything the platform calls. The same report states
what it cannot establish: that a flow *outside* the 25 was regenerated. That wider worklist is 39
flows and it belongs to §3 of **Part 3 of this runbook** — which is
why that document reads as though the rotation is still ahead of you. Both are true of different
sets of flows.

### 4.2 Put it on the right line, without an editor

Switch to Termux. One command per key, naming the key from the heading above its line:

```bash
termux-clipboard-get | npm run values:sign -- ~/dgo-values.txt FETCH_ALL
```

Expected: `✅ FETCH_ALL signed — 1/25 keys complete`.

Where a heading says **`2 keys, ONE url`**, run it twice with the same clipboard:

```bash
termux-clipboard-get | npm run values:sign -- ~/dgo-values.txt FETCH_ACTIVITIES
termux-clipboard-get | npm run values:sign -- ~/dgo-values.txt GET_DOCS
```

The URL never appears on screen, in your scrollback, or in `~/.bash_history` — it goes from the
clipboard into the file and nowhere else.

**It refuses rather than corrupting the file:**

| | |
|---|---|
| `8 characters, expected 43` | The copy was cut short. Re-copy with the copy icon. |
| `FETCH_AL is not a key` | Typo. It lists the 25 real keys. |
| `already has a signature` | You have done this key. Add `--replace` if you mean to change it. |

### 4.3 If `termux-clipboard-get` hangs or prints nothing

Termux:API is missing or came from a different source than Termux (§0.3). Fix that, or paste
interactively — the command reads standard input either way:

```bash
npm run values:sign -- ~/dgo-values.txt FETCH_ALL
```

Long-press → **Paste**, press Enter, then **Ctrl+D**. Turn auto-correct and auto-capitalise off
first: a capitalised first letter silently breaks a signature.

### 4.4 Clear the clipboard when you are done

```bash
termux-clipboard-set ""
```

---

## §4a · All twenty in one tap

**This replaces §3 and §4 entirely.** One bookmark fetches every trigger URL from the same API
the portal itself calls, using the session you are already signed into, and hands you the
finished values file on the clipboard. Twenty designer visits become two taps.

**Why a bookmark and not a console script.** On a laptop this same harvest is a devtools console
run, and §3.2 of **Part 3 of this runbook** is the document that
carries that step. Chrome for Android has no devtools console, and remote debugging needs the
laptop this runbook exists to do without — so the same harvest ships as a `javascript:` URL,
which is the one way a phone browser will run it on a page you are signed into.

**It needs the same permission as §4 and no more**: you must own or co-own each flow. No tenant
admin, no app registration, no PowerShell. It reads each flow and asks for its trigger URL; it
changes nothing in the tenant — in particular it regenerates nothing, so nothing a deployed
surface is using is revoked by running it.

**What it collects is live, not about to be rotated.** For these 25 keys the rotation is behind
you: `npm run rotation` reports ROTATED, on the evidence that all 25 resolve to workflows other
than the ones the published signatures belong to. The 39-flow worklist in §3 of
**Part 3 of this runbook** is a wider set than these 25, and it is
that document's to carry.

### 4a.1 Put the bookmark on the clipboard

```bash
cd ~/ecm_docs_dev
termux-clipboard-set < scripts/harvest-trigger-urls.bookmarklet.txt
```

That file is generated from the endpoint register and is committed. **It carries no
credential** — only the 25 keys and their workflow ids, both already public in this repository
— so `cat`-ing it, pasting it, or keeping the bookmark afterwards exposes nothing.

If it is ever out of step with the register, rebuild it: `npm run harvest:bookmarklet`.

### 4a.2 Save it as a bookmark in Chrome

Chrome deletes the `javascript:` prefix when you paste into the address bar — deliberately, and
there is no setting for it. A saved bookmark is the way around that:

1. Open any page, tap ⋮ → **☆** to bookmark it.
2. ⋮ → **Bookmarks**, long-press the new one → **Edit**.
3. **Name**: `dgo harvest`. **URL**: clear it and long-press → **Paste**.
4. Save.

### 4a.3 Run it on a Power Automate tab

1. Open `https://make.powerautomate.com`.
2. In the address bar type `dgo harvest` and **tap the bookmark in the suggestions** — do not
   press Enter, which searches for the words instead.
3. The first tap says **Open a flow, and this will catch it**. That is expected: the bookmark
   reads the API address and the token off the portal's own traffic rather than guessing them, so
   it has to watch one call go past. Tap **Close**, open any flow you own from **My flows**, then
   tap the bookmark again. Do not reload the page in between.
4. Now a panel slides up listing the 20 flows, naming the API host it observed, and saying how
   many the portal has already handed over by itself. Nothing has been fetched yet. Tap
   **Fetch 20 trigger URLs**.
5. It ticks through them, then says `25 keys ready`. Tap **Copy the values file**.

**Every URL is checked before it is kept**, exactly as on the laptop route: the flow is addressed
by its tenant flow id and the URL that comes back must name the workflow id the register holds for
that key. A flow answering for a different workflow is discarded, not copied.

**Nothing is ever shown on screen.** The file is built in memory and goes straight to the
clipboard, so no URL and no signature reaches the display, a screenshot, or a screen recording.

**If one flow fails, nothing is copied.** A half-complete values file wires some endpoints and
leaves the rest answering 401 with no pattern to it — so the panel names the flow that failed
and offers no copy button. The usual cause is a flow owned by a colleague: ask to be added as a
co-owner and tap again, or take that one key through §4 by hand.

**There is a second route inside the same bookmark, and it asks the API for nothing.** Opening a
flow makes the portal fetch that flow's HTTP POST URL so it can show it to you — and that answer
goes past the same hook, so the bookmark keeps it without calling anything itself. Each URL is
filed under the workflow id it names and matched to a contract key only by that id, so opening
the wrong flow cannot produce a wrong credential.

This is the answer when every key answers `401` no matter how many times you re-observe the
token: the session is authorised for the maker UI and refused at the management API, and only the
portal's own requests get through. Open each flow the failure screen lists, tapping the bookmark
whenever you like to check progress, and when the last one is in the button changes from
**Fetch N trigger URLs** to **Build the values file**. On a phone this costs almost nothing —
tapping through flows is what you would be doing under §4 anyway, and here each visit is one tap
instead of a copy.

### 4a.4 Read the clipboard into the file

Back in Termux:

```bash
umask 077
termux-clipboard-get > ~/dgo-values.txt
termux-clipboard-set ""
```

**The `>` is not optional.** `termux-clipboard-get` on its own prints 25 credentials into your
scrollback, where they stay. `umask 077` first makes the file readable by your account alone.

Then go to **§5** — `check:values` is the same gate for both routes, and it will tell you
immediately if the clipboard arrived truncated.

| If the panel says | What it means |
|---|---|
| `Wrong tab` | The bookmark ran somewhere other than Power Automate. Open a flow you own and tap it there. |
| `Open a flow, and this will catch it` | Not an error. Nothing has been watched on this tab yet. Close, open any flow you own, tap the bookmark again. |
| `serves workflow …, not …` | The flow it found is not the one that key belongs to, so its URL was discarded. Not a permissions problem: the register or the crosswalk has moved. |
| every key `401` | One expired or wrong token, not one problem per flow. Close, open a flow you own, tap the bookmark again. If it persists, reload the portal, wait for **My flows** to list, then tap again. If it *still* persists, stop trying to fix the token: open the flows the panel lists and let the bookmark read the portal's own answers instead. |
| `asks the API for nothing at all`, then a list of flows | The second route. Those flows have not been opened on this tab yet. Open each one, then tap the bookmark again. |
| **Build the values file** where **Fetch …** used to be | Every flow has already been seen. Nothing will be called; tap it. |
| nothing happens at all | Chrome did not run the bookmark. Check you tapped the suggestion rather than pressing Enter, and that the URL field still begins `javascript:` after saving. If it does not, this phone strips it — use §3 and §4. |
| `The browser refused the clipboard` | Tap **Copy the values file** again; the grant needs a fresh tap. |

---

## §5 · Check before writing anything

```bash
npm run check:values -- ~/dgo-values.txt
```

Prints **no URL, no host and no signature** — only shapes — so its output is safe to show anyone.

Expected: `✅ 25 value(s), all with a complete 43-character signature.`

**43 is exact.** A signature is base64url of an HMAC-SHA256 — 32 bytes, 43 characters unpadded.
Any other number is a defect in the paste.

| What you see | What it means |
|---|---|
| `the URL is complete but its signature is blank` | That key is not done yet. It names which. |
| `sig is N characters, not 43` — N smaller | Truncated on copy. |
| `sig is N characters, not 43` — N larger | Something extra came with it. |
| `no sig= parameter` | The line was overwritten. `npm run values:template ~/dgo-values.txt` and start that key again. |

---

## §6 · Write both config files

```bash
npm run setup -- --values ~/dgo-values.txt --force
```

The standalone `--` is not a typo — it tells npm the flags belong to the script.

**`--force` is required.** `setup` will not overwrite an existing `config.local.js` without it,
and refuses outright (exit 2) rather than silently discarding your values.

**`--recover` is retired** and refuses to run. It read URLs from this repository's reference
corpus; the rotation revoked those signatures and the workflows behind them are superseded. It
produced a config that looked complete and answered 401 on every call. You do not need it: your
values file carries all 24 keys.

Expected:

```
  Internal runtime  (config/config.local.js)
    18/18 endpoints wired
  Public portal     (document-portal/config.local.js)
    7/7 endpoints wired
  ✅ wrote config/config.local.js
  ✅ wrote document-portal/config.local.js
```

---

## §7 · Confirm

```bash
npm run check:config
npm run check:config:portal
npm run commission
```

Both config checks must end **`READY. Every key is present, well-formed, and points at the flow it
should.`** That last clause is the reconciliation working: each URL's workflow id is checked
against the register. `points at the WRONG FLOW` means a signature went on the wrong line.

`commission` must end **`No automated blocker for pilot usage.`** Warnings and manuals remain and
are meant to — the manuals need a person, not a script.

---

## §7a · Is your terminal transcript safe to paste?

**Every command in this runbook is safe.** Measured: a canary signature was wired into a real
config and every command's output searched for it.

**Safe:** `npm run reconcile`, `values:template`, `values:sign`, `check:values`, `setup`,
`check:config`, `check:config:portal`, `commission`, `verify:endpoints`, `harvest:bookmarklet`,
and `git status` / `diff` / `log` — the config files are git-ignored, so they appear in no diff.

**Safe, and worth saying so:** `cat scripts/harvest-trigger-urls.bookmarklet.txt` and
`termux-clipboard-set < scripts/harvest-trigger-urls.bookmarklet.txt`. The bookmark carries
workflow ids, which this repository already publishes, and no signature. It is the file it
*fetches* that is the credential, and that never lands anywhere but your clipboard and
`~/dgo-values.txt`.

**Not safe:** `cat ~/dgo-values.txt`, `termux-clipboard-get` **on its own** without a pipe or a
`>` redirect — after §4a that clipboard holds all 24 credentials at once — `nano
~/dgo-values.txt`, and `history` if you ever typed a signature as part of a command.

**Why `values:sign` is shaped as a pipe.** The signature is never a shell argument and never
reaches the screen, so it is absent from both your scrollback and `~/.bash_history`. Typing
`npm run values:sign -- ~/dgo-values.txt FETCH_ALL <the signature>` would put it in both,
permanently, in a file you would never think to check — which is why the command does not accept
it that way.

**`verify:endpoints` and third-party text.** It prints the first 160 characters of any non-JSON
response so a gateway 403 is diagnosable. That body is written by whatever answered — a proxy, a
WAF — and echoing the request line back is what those do by default; the request line is the
signed URL. Since 2026-09-04 that snippet is redacted at the point of capture, and
`npm run test:verification` fails if the redaction is removed. On an older checkout, treat its
output as unsafe to paste.

**If you have already pasted a signature somewhere.** Deleting the message does nothing — the
credential is not in the message, it *is* the message. Regenerate that flow's trigger in Power
Automate, then redo §4 and §6 for that key.

---

## §8 · Afterwards

Keep the values file until §6 of Part 3 of this runbook confirms the endpoints answer. Then:

```bash
git status --porcelain | grep -iE 'config\.local|dgo-values'   # must print nothing
shred -u ~/dgo-values.txt || rm -f ~/dgo-values.txt
termux-clipboard-set ""
termux-wake-unlock
```

If that `git status` prints anything, **do not commit** — a credential is about to be published.
The two `config.local.js` files are git-ignored; a values file is only safe because it lives in
`~`, outside the repository, so the grep looks for both.

**Keep the bookmark.** It holds nothing secret and it is how you re-harvest in one tap after a
rotation. What you delete is the values file and the clipboard.

**What is left that a phone cannot do.** §7 of the walkthrough — building the package and
deploying both front ends — and §8's 150-test browser suite. Both need a laptop. Everything before
them is done.

---

## Provenance

Everything repository-side was measured on this codebase: the 33 MiB clone size, the 66 MB working
tree, the `reconcile` / `values:template` / `values:sign` / `check:values` / `setup` /
`check:config` / `commission` outputs (rehearsed end to end against the real tree with placeholder
signatures, reaching **18/18 internal, 7/7 portal, READY on both surfaces and zero blockers**,
then restored), and the fact that none of it needs `node_modules`.

**§4a specifically.** The bookmark is generated from the endpoint register, so its 25 keys and 20
workflow ids cannot drift from it — `npm run test:harvestbookmarklet` fails if they do. Its
behaviour is not assumed either: `tests/harvest-bookmarklet.test.mjs` executes the payload against
a hand-built DOM and asserts the four properties this section relies on — that no request goes out
before the tap, that two calls per flow are made with the page's own bearer token, that one
unresolvable flow suppresses the file entirely, and that no URL or signature is ever rendered.
What that cannot cover is the tenant: the API shapes are the console harvester's, which has been
run against this environment, but §4a's own fetches have not.

The Android-side steps — F-Droid packages, `pkg` names, the Termux:API signature-matching
requirement, the extra-keys row, the battery setting, and §4a's bookmark mechanics (Chrome
stripping `javascript:` on paste, and running a bookmark by name from the address bar) — follow
Termux's and Chrome's own documented behaviour and have not been executed on a device from here.
If one differs on your phone, §3 and §4 reach the same file, and the repository commands after it
are unaffected either way.
