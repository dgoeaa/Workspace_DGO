/**
 * One sign-in for the whole browser (owner, 2026-10-20; core/otp-identity.js). The proof is held in localStorage, so a
 * second tab, a task e-mail's link and a reload all use it; a proof a tab still holds in sessionStorage is moved across;
 * an expired one is dropped; a sign-in or sign-out in another tab reaches this one; and the flow's seven-decimal expiry
 * is read the same in every browser.
 */
const store = () => ({ _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } });
globalThis.localStorage = store();
globalThis.sessionStorage = store();
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, querySelector() { return null; }, createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; }, body: { appendChild() {} } };
if (typeof globalThis.CustomEvent === 'undefined') globalThis.CustomEvent = class extends Event { constructor(t, o) { super(t); this.detail = o?.detail; } };

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
console.log('\nShared sign-in across tabs\n');

const KEY = 'dgo.r11.identity.proof';
const O = await import('../core/otp-identity.js');
const proof = (ms) => JSON.stringify({ token: 't', expiresAt: Date.now() + ms, claims: { email: 'a@nitda.gov.ng', name: 'A' } });

ok(O.parseExpiry('2026-10-20T14:00:00.1234567Z') === Date.parse('2026-10-20T14:00:00.123Z'), 'the flow\'s seven-decimal expiry is read to the millisecond');
ok(O.parseExpiry('2026-10-20T14:00:00Z') === Date.parse('2026-10-20T14:00:00Z') && O.parseExpiry(1792504800123) === 1792504800123, 'a plain timestamp and a number read as themselves');
ok(Number.isNaN(O.parseExpiry('')), 'no expiry is no expiry (the sign-in refuses it)');

localStorage.setItem(KEY, proof(3600e3));
ok(O.isSignedIn() && O.heldIdentity()?.email === 'a@nitda.gov.ng', 'a proof held for the browser signs in a new tab without a code');

O.signOut();
ok(!O.isSignedIn() && localStorage.getItem(KEY) === null && sessionStorage.getItem(KEY) === null, 'Sign out leaves no proof in either storage');

sessionStorage.setItem(KEY, proof(3600e3));
ok(O.isSignedIn() && localStorage.getItem(KEY) && sessionStorage.getItem(KEY) === null, 'a proof a tab held before the change is moved to the shared storage');
O.signOut();

localStorage.setItem(KEY, proof(-1000));
ok(!O.isSignedIn() && localStorage.getItem(KEY) === null, 'an expired proof signs nobody in, and is removed');

const tab = new EventTarget();
O.watchOtherTabs(tab);
const seen = [];
tab.addEventListener('dgo:signed-in', (e) => seen.push(['in', e.detail?.from]));
tab.addEventListener('dgo:signed-out', (e) => seen.push(['out', e.detail?.from]));
const storageEvent = (key) => { const e = new Event('storage'); e.key = key; return e; };
localStorage.setItem(KEY, proof(3600e3)); tab.dispatchEvent(storageEvent(KEY));
ok(O.isSignedIn() && seen.at(-1)?.[0] === 'in' && seen.at(-1)?.[1] === 'another-tab', 'a sign-in in another tab signs this tab in (dgo:signed-in, from another tab)');
localStorage.removeItem(KEY); tab.dispatchEvent(storageEvent(KEY));
ok(!O.isSignedIn() && seen.at(-1)?.[0] === 'out', 'a sign-out in another tab signs this tab out (dgo:signed-out)');
const n = seen.length; tab.dispatchEvent(storageEvent('dgo.some.other.key'));
ok(seen.length === n, 'a change to any other stored value is ignored');
tab.dispatchEvent(storageEvent(KEY));
ok(seen.length === n, 'a second sign-out notice, with nothing held, raises nothing');

const fs = await import('node:fs');
const shell = fs.readFileSync(new URL('../shared/shell.js', import.meta.url), 'utf8');
const boot = fs.readFileSync(new URL('../core/boot.js', import.meta.url), 'utf8');
const dialog = fs.readFileSync(new URL('../shared/sign-in-dialog.js', import.meta.url), 'utf8');
ok(/data-sign-out/.test(shell) && /signOut\(\); forgetLoadedRecords\(\); location\.reload\(\)/.test(shell) && /'dgo:signed-out',\(\)=>\{ forgetLoadedRecords\(\); location\.reload\(\)/.test(shell), 'the account menu has Sign out, and a sign-out anywhere returns every tab to the sign-in');
ok(/watchOtherTabs\(window\)/.test(boot), 'boot follows the other tabs once the sign-in provider is installed');
ok(/another-tab/.test(dialog) && /isSignedIn\(\)/.test(dialog), 'an open sign-in box closes and carries on when another tab signs in');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
