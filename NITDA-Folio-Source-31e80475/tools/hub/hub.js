// Platform Hub page. Holds no platform list: everything comes from /api/platforms, which
// scripts/hub-server.mjs reads from scripts/platforms.config.mjs.

const $ = (id) => document.getElementById(id);
const STORE = 'dgo.hub.filters';
const POLL_MS = 15_000;

let data = { audiences: [], platforms: [] };
let status = {};

const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* storage unavailable */ } };

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
}

function visible(p) {
  const q = $('q').value.trim().toLowerCase();
  const aud = $('aud').value;
  const role = $('role').value;
  if (aud && p.audience !== aud) return false;
  if (role) {
    const a = data.audiences.find(x => x.id === p.audience);
    if (!a || !(a.roles.includes('*') || a.roles.includes(role))) return false;
  }
  if (q && ![p.name, p.purpose, p.summary, p.category, p.id].join(' ').toLowerCase().includes(q)) return false;
  return true;
}

function card(p) {
  const s = status[p.id]?.state || 'unknown';
  const label = { up: 'Running', down: 'Not running', unknown: 'Checking…' }[s];
  const fb = p.fallbackFor && data.platforms.find(x => x.id === p.fallbackFor);
  return el('article', { class: 'card', 'aria-label': p.name },
    el('h3', {}, p.name),
    el('p', {}, p.purpose),
    el('div', { class: 'meta' },
      el('span', { class: 'badge' }, p.category),
      p.group ? el('span', { class: 'badge' }, `Group: ${p.group}`) : null,
      el('span', {}, p.exposure === 'local' ? 'Localhost only' : p.exposure === 'public' ? 'Public' : 'Internal'),
      el('span', {}, `Owner: ${p.owner}`)),
    fb ? el('p', { class: 'meta' }, `Fallback for ${fb.name}: use that first.`) : null,
    el('span', { class: `status ${s}` }, label),
    el('div', { class: 'actions' },
      s === 'down'
        ? el('span', {}, 'Start it with ', el('code', {}, p.startCommand))
        : el('a', { class: 'open', href: p.url, target: '_blank', rel: 'noopener' }, `Open ${p.name}`),
      el('code', {}, p.url)),
    p.prodUrl ? el('p', { class: 'meta' }, 'Published at ', el('a', { href: p.prodUrl, target: '_blank', rel: 'noopener' }, p.prodUrl)) : null);
}

function render() {
  const groups = $('groups');
  groups.replaceChildren();
  let shown = 0;
  for (const a of data.audiences) {
    const items = data.platforms.filter(p => p.audience === a.id && visible(p));
    if (!items.length) continue;
    shown += items.length;
    groups.append(el('section', { 'aria-labelledby': `h-${a.id}` },
      el('h2', { id: `h-${a.id}` }, a.label),
      el('div', { class: 'grid' }, ...items.map(card))));
  }
  const up = data.platforms.filter(p => status[p.id]?.state === 'up').length;
  $('summary').textContent = `${shown} of ${data.platforms.length} platforms shown · ${up} running`;
  $('advisory').hidden = !$('role').value;
  save({ q: $('q').value, aud: $('aud').value, role: $('role').value });
}

async function poll() {
  try {
    status = await (await fetch('/api/status')).json();
    render();
  } catch { /* keep the last known status */ }
}

async function init() {
  try {
    data = await (await fetch('/api/platforms')).json();
  } catch (err) {
    $('error').hidden = false;
    $('error').textContent = `Could not load the platform list: ${err.message}`;
    return;
  }
  /* DL-4 — one link format for every platform: /?to=<platformId>&<params> forwards the
     params to that platform. Only ids in the registry are accepted, so this cannot be used
     to send someone to an arbitrary site. */
  const qs = new URLSearchParams(location.search);
  const to = qs.get('to');
  if (to) {
    const target = data.platforms.find(p => p.id === to);
    if (target) {
      qs.delete('to');
      const dest = new URL(target.url);
      qs.forEach((v, k) => dest.searchParams.set(k, v));
      location.replace(dest.href);
      return;
    }
    $('error').hidden = false;
    $('error').textContent = `This link asks for a platform called "${to}", which isn't one of ours. Choose one below.`;
  }
  for (const a of data.audiences) $('aud').append(el('option', { value: a.id }, a.label));
  const saved = load();
  for (const k of ['q', 'aud', 'role']) if (saved[k]) $(k).value = saved[k];
  for (const k of ['q', 'aud', 'role']) $(k).addEventListener('input', render);
  render();
  await poll();
  setInterval(poll, POLL_MS);
}

init();
