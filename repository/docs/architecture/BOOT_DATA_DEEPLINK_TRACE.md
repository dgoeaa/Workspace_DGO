# Boot, data loading and deep links: trace and verification

> **Status:** verified 2026-10-20 against the code on `claude/system-remediation-gaps-ahpmsy`. Every behaviour below is
> exercised by a test named in §6; each defect in §5 was reproduced against the earlier code before it was fixed.

This traces what the Workspace (`index.html`) does from the moment the page is requested to the moment an officer is
looking at the record a link named: the shared steps every visit runs, and the steps that differ by sign-in state, by
link type and by screen.

## 1. The sequence at a glance

| # | Step | Where | Runs |
|---|---|---|---|
| 1 | Static load: `config/config.local.js` (signed addresses; missing is allowed), `shared/figma-uiux-runtime.js`, `core/boot.js` | `index.html` | every visit |
| 2 | Boot watchdog armed (15 s; paused while the person is being asked for something) | `index.html` | every visit |
| 3 | Icon sprite, platform provisioning check | `core/boot.js` | every visit |
| 4 | Sign-in gate: OTP provider installed, other tabs watched, `getAccessToken()` awaited | `core/boot.js`, `core/otp-identity.js` | sign-in enforced |
| 5 | Routes registered (31 screens), theme and density applied | `core/boot.js` | every visit |
| 6 | Demonstration welcome (`core/welcome-experience.js`) | `core/boot.js` | sign-in **not** enforced, first visit |
| 7 | Shell mounted (`<dgo-shell>`); router started; first screen drawn from the address | `shared/shell.js`, `core/router.js` | every visit |
| 8 | Deep link resolved; welcome tour, unless a link was opened | `core/deeplink-resolver.js`, `shared/welcome-runtime.js` | next animation frame |
| 9 | `__DGO_BOOTED__ = true` (watchdog stands down) | `core/boot.js` | every visit |
| 10 | Data load: `FETCH_ALL`, else `FETCH_ACTIVITIES`, else deferred | `core/data-loader.js` | every visit, in the background |
| 11 | `dgo:data-loaded` → the open screen is drawn again with what arrived (or with why nothing did) | `shared/shell.js` | after every load |

## 2. Boot and sign-in

**Common to every visit.** Steps 1–3, 5, 7 and 9 above. A failure inside `boot()` is caught and shown as
"DGO could not start" with the error escaped; a failure to load the module graph at all (which `boot()` cannot catch) is
caught by the watchdog, which shows "NITDA Folio could not start" with a Try again button after 15 s.

**Sign-in enforced (production).** Before anything is drawn:

1. `installOtpProvider()` registers the OTP provider with `core/auth.js` and restores a held proof.
2. `watchOtherTabs(window)` follows sign-in and sign-out made in other tabs (§2.1).
3. `setSignInPrompt()` registers `shared/sign-in-dialog.js` as the way to ask.
4. `getAccessToken()`:
   - **a live proof is held** (this browser signed in less than 4 hours ago, in any tab): it resolves at once and no
     dialog opens;
   - **no proof, or an expired one** (the expired one is removed): the sign-in dialog opens; the watchdog pauses
     (`__DGO_SIGNING_IN__`) and restarts its 15 s once the dialog closes;
   - **the dialog is cancelled:** the Workspace draws as an unauthenticated visitor, which every screen refuses; the
     first data load asks again.
5. Who the screens are for comes from the proof's claims (`core/current-user.js`). The sidebar and the account menu show
   that person; they used to show the packaged "Registry" profile to everyone (§5, D-6).

**Sign-in not enforced (local and demonstration).** No proof is needed. The demonstration welcome
(`core/welcome-experience.js`) runs on a first visit and waits on the person; the watchdog now waits with it (§5, D-5).

### 2.1 One sign-in for the browser

The proof is kept in `localStorage` (`dgo.r11.identity.proof`), so every tab of the Workspace in the same browser shares
it, and it survives a reload and a browser restart until its 4 hours run out (owner, 2026-10-20). It used to be kept in
`sessionStorage`, which belongs to one tab. A proof a tab still holds there is moved across the first time it is read.

| Event | This tab | Every other tab |
|---|---|---|
| Sign in | proof stored; `dgo:signed-in`; screen redrawn | the browser's `storage` event; the proof is taken up; an open sign-in dialog closes and the action that asked carries on; `dgo:signed-in`; screen redrawn; a load that failed for want of a sign-in is made again |
| Sign out (account menu) | proof removed; the records the last load brought are cleared; page reloads to the sign-in | `dgo:signed-out`; records cleared; page reloads to the sign-in |
| 4 hours pass | the next server call asks for a code | the same, independently |

What stays on Sign out: what only this device holds (a record not yet sent, a row marked *on this device only*, the
pending queue), and the briefs, meetings, projects, approvals and registry files, which a load merges rather than
replaces.

## 3. Data loading

`loadRuntimeData()` (`core/data-loader.js`) runs once at boot, after the shell is drawn, and again on ⟳, on a screen's
own reload button, and after a sign-in that follows a failed load. Only one load runs at a time; a second request joins
the one in flight.

1. **`FETCH_ALL`** through `FetchManager` (cached by namespace; `force` bypasses the cache). The reply is unwrapped
   (`assertEnvelope`), each collection is read under any of its names, stamped with the entry point it came through, and
   normalised. Collections are then **replaced** (activities, portal register, tasks, comments, users, categories,
   departments, e-mails), keeping rows marked *on this device only*, or **merged by key** (approvals, briefs, meetings,
   projects, registry files), keeping what only this device knows. The derived views (Intake's correspondence, the task
   view) are recomputed; the directory is stamped as served; the archive bundles are restored.
2. **If `FETCH_ALL` fails**, `FETCH_ACTIVITIES` is asked for the documents alone; the load is recorded as
   `FETCH_ACTIVITIES` with the reason the first failed.
3. **If both fail**, the load is recorded as deferred (`ok: false`, `offline: true`) with both reasons; nothing already
   held is removed.
4. Every outcome is announced (`dgo:data-loaded`), and the shell draws the open screen again. A screen drawn while the
   load ran says **Loading…**; once it is announced, it shows the records, or says that they did not arrive (§5, D-4).

A screen that loads on entry (DG/CEO) does so once per visit: not while a load is in flight, nor within a minute of the
last one (§5, D-7).

## 4. Deep links

### 4.1 Common path

`resolveInitial()` reads the address once the shell is drawn. `parseDeepLink()` (`core/deeplink-parse.js`) takes the
parameters from the query and from after the route in the hash (`#/route?x=1`; the query wins), keeps only those in
`config/deeplink.config.js`, bounds each to 256 characters (a list to 50 ids), and returns the route, the action and the
context. The **first accepted parameter wins**, in the order the config lists them. `apply()` then **replaces** the last
link's context (it used to merge, so yesterday's task id rode along with today's link), records an acknowledgement link
in the receipt ledger, and goes to the route; when the screen is already that route, it is drawn again for the new
link (§5, D-3).

A link is read **once per tab**. A reload keeps the address, link and all; while the address still carries the link this
tab already resolved and names a screen, the reload stays on that screen (§5, D-2). The same link in a new tab, or a new
link, resolves as before. A first-time officer who opens a link goes to the task; the welcome tour waits for their next
plain visit (§5, D-8).

Identity never comes from a link. `actorEmail`, `role`, `persona` and the other preserved parameters ride along as
context for display; the acknowledgement is recorded as the signed-in person (tested).

### 4.2 Each link type

| Link | Screen | What that screen does with it |
|---|---|---|
| `TaskID`, `taskId`, `ACK`, `AssnPID`, `item` | Acknowledgment Queue | selects the task; if it is not loaded yet, **Loading…**, then the task or *has not loaded* |
| `items=204,205` (bulk assignment) | Acknowledgment Queue | opens the first; the rest ride along as `taskIds` |
| `ref=TASK-204` | Acknowledgment Queue | a task reference is acknowledged, not looked up |
| `DGOPID`, `ITEMID`, `ref`, `referenceId` | Lookup | finds the record by id or reference and opens it once (the link is then spent, so coming back to Lookup is not hijacked); if it is not loaded, **Loading…**, then *has not loaded* with **Load latest records** |
| `USERSUPPORT`, `support` | Assistant | opens the Assistant |
| `acknowledge.html`, `index_bulk.html` (old hosts; `page=` after forwarding) | Acknowledgment Queue | as `item` |
| `support.html` (`page=support.html`) | Assistant | as `support` |
| anything else, or nothing | the route in the hash, or the Command Center | an unknown route says *Workspace not found* and offers **Go to the Command Center** (§5, D-9) |

### 4.3 Signed out

With sign-in enforced, a link opened signed out asks for the code **first**; the address is not touched until then, so
after sign-in the link resolves exactly as it would signed in. A task link opened before the data arrives shows the task
when it does.

## 5. Defects found and fixed

| # | Defect, as reproduced | Fix |
|---|---|---|
| D-1 | A route with parameters after it (`#/correspondence?view=routed`) opened *Workspace not found*. | `core/router.js`: the route is the part of the hash before `?`. |
| D-2 | A reload after moving on from a link sent the officer back to the link's screen, and re-opened a Lookup link already spent. | `core/deeplink-resolver.js`: a link is resolved once per tab. |
| D-3 | A new link opened on the screen it names (`?item=22222#/acknowledgment`) left the screen drawn for the previous link. | `apply()` draws the screen again when the route does not change. |
| D-4 | When both loads failed, nothing redrew the open screen; with the new Loading banner it would have stayed on *Loading…*. Before that banner, a linked screen said *has not loaded* while the load was still running. | `core/data-loader.js` announces a failed load too; the Acknowledgment Queue and Lookup say **Loading…** while a load runs. |
| D-5 | Sign-in not enforced: the demonstration welcome waited on the person while the watchdog counted, and "NITDA Folio could not start" replaced it after 15 s. | `core/boot.js`: the watchdog waits while the welcome is open, as it does for the sign-in. |
| D-6 | With sign-in enforced, the sidebar and the account menu showed the packaged "Registry · dgsregistry@…" to every officer. | `shared/shell.js` shows the person the proof names. |
| D-7 | The DG/CEO screen forced a load each time it was drawn, and every load draws the open screen: 149 `FETCH_ALL` requests in 6 seconds. | `modules/executive.js` loads on entry once a minute at most, and not while a load runs. |
| D-8 | A first-time officer who opened a task link had the welcome tour drawn over the task. | `core/boot.js`: no tour on a visit that opened a link. |
| D-9 | An unknown route left the officer with no way on. | It offers **Go to the Command Center**. |
| D-10 | A sign-in made in another tab did not reload data a cancelled sign-in had left unloaded. | `shared/shell.js` loads again after a sign-in when the last load did not succeed. |

## 6. Verification

| Test | What it proves |
|---|---|
| `tests/boot-data-deeplinks.spec.js` (15) | §2–§5 in a browser against the dev server with sign-in enforced: cold boot, held, expired and migrated proofs, Sign out, the signed-in person shown, `FETCH_ALL` → `FETCH_ACTIVITIES` → deferred, Loading then the record, the DG/CEO single load, all 15 link forms signed in and signed out, the forwarder page, a route with parameters, an unknown route, reload after moving on, a new link on the same screen, no tour over a link |
| `tests/deeplinks-signin.spec.js` (5) | the acknowledgement journey end to end (one request, carrying the proof, as the signed-in assignee), Lookup links, the watchdog during sign-in, a task link before its data, and one sign-in across three tabs with Sign out ending all three |
| `tests/shared-sign-in.test.mjs` (14) | the proof's storage, migration, expiry, cross-tab events and the flow's seven-decimal expiry |
| `tests/deeplinks.test.mjs`, `tests/module-rationalisation.test.mjs` | link parsing rules; the load's replace and merge rules |

Run: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test tests/boot-data-deeplinks.spec.js tests/deeplinks-signin.spec.js`
and `npm run test:sharedsignin`.
