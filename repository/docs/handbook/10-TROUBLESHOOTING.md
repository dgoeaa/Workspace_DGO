# 10 · Troubleshooting

Start from evidence, not from a guess. For any fault, establish in this order:

1. **Did the request reach the flow?** Look in the flow's run history. No run means the browser never sent
   it, or the gateway refused it before a run started.
2. **What did the flow receive and answer?** Open the run: the trigger's headers and body, each action's
   inputs and outputs, the Response action's status.
3. **What did the browser record?** Use the command in §10.2.
4. **Reproduce with the real code**, changing one thing at a time.

## 10.1 Cannot sign in

| Symptom | Cause | Fix |
| --- | --- | --- |
| No code e-mail | Junk folder; mistyped address | Check junk; retype the address. A code is mailed only to an active Folio user, so a mistyped or unregistered address gets no e-mail. |
| The code is refused | Mistyped or expired code; or the address is not **active** in `DGO_UserDirectory` (OTP_VERIFY checks the code and the directory) | Request a new code. If it is still refused, an administrator checks the person's row: `Email` exactly as typed, `Status` = `active`. |
| Refused after several tries | Five wrong attempts | Request a new code |
| Asked to sign in again | The proof lasts 4 hours, and ends when the tab closes | Sign in again |

## 10.2 Data does not load after sign-in

**Symptom:** the Workspace opens but every count is 0, and ⟳ says "The registry could not be reached".

**Step 1: did FETCH_ALL run?** Open the run history of `IP_FETCH_ALL_BOOTSTRAP` at the time of the sign-in.

| What you find | Means | Go to |
| --- | --- | --- |
| No run | The browser never sent the request | Step 2 |
| A run answering **200** | The data was sent; the browser did not take it in, or was looked at before it arrived (it takes about 20 seconds) | Wait and recheck; then Step 2 |
| A run answering **401**, body `{"action":"fetchAll"}` only, no `X-Correlation-Id` | That was the **Endpoint Console probe**, not a data load. Expected. | Ignore it |
| A run answering **401** with `payload`, `requestId` and `X-Correlation-Id` | A real load whose proof was missing, expired, or whose person is not active | Check the person's directory row; sign in again |
| A run answering **500** | The flow failed | Open the failed action |

**Step 2: what did the browser record?** In the affected browser, sign in, wait 30 seconds, press F12,
open **Console**, paste this and press Enter. It prints no token. It runs one read-only data load and
reports each stage, waiting up to 2 minutes.

```js
(async()=>{const o={booted:!!window.__DGO_BOOTED__,secure:isSecureContext,href:location.origin};const step=async(n,f,ms=60000)=>{const t=performance.now();try{const v=await Promise.race([f(),new Promise((_,j)=>setTimeout(()=>j(new Error('no answer after '+ms/1000+'s')),ms))]);o[n]={ok:true,ms:Math.round(performance.now()-t),v};}catch(e){o[n]={ok:false,ms:Math.round(performance.now()-t),error:(e&&e.name)+': '+(e&&e.message)};}};const {State}=await import('/core/state.js');o.loading=!!State.get().runtime?.loading;o.lastLoad=State.get().runtime?.lastLoad||null;await step('auth',async()=>{const a=await import('/core/auth.js');const i=await a.ensureAuthenticated('diagnostic');return {role:i&&i.role};});await step('url',async()=>{const d=await import('/core/data-client.js');const u=d.resolveUrl('FETCH_ALL');return {configured:!!u,host:u?new URL(u).host:''};});await step('request',async()=>{const {FetchManager}=await import('/core/fetch-manager.js');const r=await FetchManager.fetch('FETCH_ALL',{force:true,requestedAt:new Date().toISOString()},{force:true,cacheNamespace:'FETCH_ALL'});const d=r.data?.data||r.data||{};return {source:r.source,docs:(d.docs||[]).length,tasks:(d.tasks||[]).length};},120000);console.log(JSON.stringify(o,null,1));return o})()
```

| Output | Means |
| --- | --- |
| `booted: false` | Start-up stopped after drawing the screen. Clear the site's data (padlock › Site settings › Delete data) and reload. |
| `auth` not ok | No valid sign-in: sign in again |
| `url` not ok | The build has no FETCH_ALL address: redeploy the build |
| `request` not ok | Read the error; check FETCH_ALL's run history at that time |
| all ok, with document and task counts | The service works. Press ⟳. |

**What it was on 2026-10-09.** The deployed build, flows and account all worked: a clean browser received the
data. The owner's browsers held JavaScript files cached for 30 days from earlier builds (the host's default),
and sent no data request after signing in. After the site's data was cleared, every load succeeded. The root
`.htaccess` now makes browsers revalidate every page, script and stylesheet, so a redeploy cannot leave a
browser on old files.

## 10.3 "NITDA Folio could not start"

The start-up watchdog in `index.html` shows this if start-up has not finished within 15 seconds. Since build
`5b9f7ed` it pauses while the sign-in box waits for you, so it should only appear for a real failure. Press
**Try again**. If it repeats, open **Technical details** and send the failing file names to IT support.

## 10.4 401s in run history that nobody caused

Bodies of exactly `{"action":"<action>"}` with only a `Content-Type` header come from the **Endpoint Console
probe** (System Health › Administration). The probe carries no proof on purpose. 401 is its healthy result.

## 10.5 A flow change is refused

`npm run flows:update -- apply` refuses, before writing, any package that would give a flow more than **500
actions** or contain an expression longer than **8,192 characters**: the tenant would reject either. Split the
work into its own flow (as USER_ADMIN was) or shorten the expression.

## 10.6 Limits and design notes at commissioning

Facts read from the code, configuration and live flows, checked again at commissioning on 2026-10-19. Every item the
register tracks is closed (`npm run outstanding`: 0 open); what remains here are design limits and notes for operators.

| Gap | Effect | Tracked |
| --- | --- | --- |
| AI analysis off | AI buttons say unavailable | ITEM-88, resolved by decision |
| Writes are not de-duplicated by the server, except in DYNAMIC_ACTIONS | The Workspace waits 90 s for a write and never repeats one itself (2026-10-10), so it creates no duplicate; a person pressing Assign twice still could | G-04 obligation 6 |
| FETCH_ALL reads the newest 500 documents and 500 tasks | Older records are not on the dashboards; use Lookup | Design limit |
| FETCH_ALL's role-catalogue check is a constant `true` | `DGO_RoleCatalogue` is read but decides nothing; data scope comes from the role and persona | Not in the register (scope is enforced; the catalogue check is redundant) |
| A link opens the Command Center instead of the screen it names | The host's browser check (first visit in 6 hours) dropped the `#/` part of the link | Open the link again; links Folio sends use `/acknowledge.html` or `?TaskID=`, which survive it (release 41) |
| `docs/PLATFORM.md` §4 names some superseded flows (for example `IP_FETCH_ALL__EXTENDED_ENDPOINT` for FETCH_ALL) | Readers of that page get a stale picture | Regenerate from current registers; the build ledger is current |
