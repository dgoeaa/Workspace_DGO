/* Workspace wayfinding, applied to every screen after it renders.

   The platform audit of 2026-10-20 found the same three faults on most screens, each written separately per module:

   1. A record pane stacks four to eight panels (the record, its forms, its history). Reaching the fourth meant scrolling
      past the first three, and nothing said what was further down.
   2. A long page (Reports, the ERP–ECM Charter, Diagnostics, Admin Suite: three to ten screens tall) had no way to move
      within it but the scroll wheel.
   3. A list became its own scroll region (styles/app.css "Master-detail screens"), and a module re-renders its whole
      view when a record is selected, so the list went back to its first row on every selection.

   This runs after each render, so each module keeps rendering plain markup and needs no change:

   - a record pane with three or more headed sections gets a section bar at its top;
   - a page more than two screens tall with three or more headed sections gets an "On this page" bar under its header;
   - the list pane of a master-detail screen keeps its scroll position across re-renders, except when the officer
     pages through it;
   - a record row that opens on click (an <article>, <div> or <tr> with data-select, data-record, or a row-link or
     list-item with data-id) can be reached with Tab and opened with Enter or Space, keeps focus through the re-render
     its own selection causes, and the selected row says so to a screen reader (aria-current). Before this a keyboard
     could not open a record on any list screen;
   - when a different record opens, its pane fades in briefly so the change is seen (not under reduced motion).

   A screen that already draws its own bar (Intake's .cc-detail-nav) is left alone. Nothing here changes a record, a
   form value or a route: it only adds buttons that scroll. */

const SECTION_MIN = 3;
const PAGE_MIN = 3;
const PAGE_SCREENS = 2;
const HELD_MS = 900;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const labelOf = el => {
  const h = el.querySelector(':scope > .panel-eyebrow, :scope > .eyebrow, :scope > h2, :scope > h3, :scope > header h2, :scope > header h3, :scope > .pagehead h2, :scope > summary, :scope > div > .panel-eyebrow, :scope > div > h2, :scope > div > h3, :scope > legend');
  const text = (h?.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length > 34 ? text.slice(0, 32).trimEnd() + '…' : text;
};
const visible = el => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
const scrollerOf = el => {
  for (let e = el.parentElement; e; e = e.parentElement) {
    const oy = getComputedStyle(e).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight + 1) return e;
    if (e.classList.contains('dgo-main')) return e;
  }
  return document.querySelector('.dgo-main');
};

const PAGE_MAX = 12;
const isSection = el => !el.classList.contains('section-nav') && !el.classList.contains('md-back')
  && el.matches('section, .panel, form, aside, details') && visible(el) && !!labelOf(el);
function sectionsIn(container) {
  return [...container.children].filter(isSection);
}
/* A page's sections are not always its direct children: Admin Suite and the Operator HUD group panels in an unheaded
   grid, and Reports puts every report section inside one panel. An unheaded wrapper is looked through; a headed section
   taller than the screen is replaced by its own headed sections when it has three or more. */
function pageSections(workspace, screen) {
  const out = [];
  for (const el of workspace.children) {
    if (!visible(el) || el.classList.contains('section-nav')) continue;
    const inner = [...el.querySelectorAll(':scope > section, :scope > .panel, :scope > form, :scope > details')].filter(isSection);
    if (isSection(el)) {
      if (el.getBoundingClientRect().height > screen && inner.length >= 3) out.push(...inner);
      else out.push(el);
    } else if (el.matches('div') && inner.length) out.push(...inner);
  }
  return out.slice(0, PAGE_MAX);
}

function buildNav(sections, label, page) {
  const nav = document.createElement('nav');
  nav.classList.add('section-nav');
  if (page) nav.classList.add('section-nav--page');
  nav.setAttribute('aria-label', label);
  nav.dataset.enhanced = 'true';
  sections.forEach((sec, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.classList.add('section-jump');
    b.textContent = labelOf(sec);
    b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    b.addEventListener('click', () => jump(nav, sections, i));
    nav.append(b);
  });
  return nav;
}

function press(nav, i) { [...nav.children].forEach((b, n) => b.setAttribute('aria-pressed', String(n === i))); }

/* Scroll only the box the section lives in, and .dgo-main when that box is the pane of a master-detail split (to bring
   the split to the top). scrollIntoView would also move the shell frame. */
function jump(nav, sections, i) {
  const target = sections[i];
  if (!target?.isConnected) return;
  const behavior = reducedMotion() ? 'auto' : 'smooth';
  const box = scrollerOf(target);
  const main = document.querySelector('.dgo-main');
  const split = target.closest('[data-md]');
  const offset = nav.getBoundingClientRect().height + 12;
  if (box && main && box !== main && split) {
    const padTop = parseFloat(getComputedStyle(main).paddingTop) || 0;
    main.scrollTo({ top: main.scrollTop + split.getBoundingClientRect().top - main.getBoundingClientRect().top - padTop, behavior });
  }
  if (box) {
    const top = i === 0 ? 0 : box.scrollTop + target.getBoundingClientRect().top - box.getBoundingClientRect().top - offset;
    box.scrollTo({ top: Math.max(0, top), behavior });
  }
  press(nav, i);
  nav.dataset.held = String(Date.now());
}

function track(nav, sections) {
  const box = scrollerOf(sections[0]);
  if (!box) return;
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (!nav.isConnected) { box.removeEventListener('scroll', onScroll); return; }
      if (Date.now() - Number(nav.dataset.held || 0) < HELD_MS) return;
      const edge = nav.getBoundingClientRect().bottom + 16;
      let current = 0;
      sections.forEach((s, i) => { if (s.getBoundingClientRect().top <= edge) current = i; });
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) current = sections.length - 1;
      press(nav, current);
    });
  };
  box.addEventListener('scroll', onScroll, { passive: true });
}

function enhanceDetail(split) {
  const pane = split.querySelector(':scope > .detail-col') || split.lastElementChild;
  if (!pane || pane.querySelector(':scope > .cc-detail-nav, :scope > .section-nav')) return;
  const sections = sectionsIn(pane);
  if (sections.length < SECTION_MIN) return;
  const nav = buildNav(sections, 'Record sections', false);
  const back = pane.querySelector(':scope > .md-back');
  back ? back.after(nav) : pane.prepend(nav);
  track(nav, sections);
}

function enhancePage(workspace) {
  if (workspace.querySelector(':scope > [data-md], :scope > .section-nav')) return;
  const main = document.querySelector('.dgo-main');
  if (!main || main.scrollHeight < main.clientHeight * PAGE_SCREENS) return;
  const sections = pageSections(workspace, main.clientHeight);
  if (sections.length < PAGE_MIN) return;
  const nav = buildNav(sections, 'On this page', true);
  const head = workspace.querySelector(':scope > .pagehead, :scope > header');
  head ? head.after(nav) : workspace.prepend(nav);
  track(nav, sections);
}

/* Record rows. */
const ROW = '[data-select], [data-record], .row-link[data-id], .list-item[data-id]';
const rowKey = el => {
  for (const a of ['select', 'record', 'id']) if (el.dataset[a] != null) return `[data-${a}="${CSS.escape(el.dataset[a])}"]`;
  return null;
};
let refocus = null;
function enhanceRows(root) {
  root.querySelectorAll(ROW).forEach(el => {
    if (el.matches('a, button, input, select, textarea') || el.hasAttribute('tabindex')) return;
    el.tabIndex = 0;
    if (el.tagName !== 'TR') el.setAttribute('role', 'button');
  });
  root.querySelectorAll('.list-item.active, .row-active, .row-link.active').forEach(el => el.setAttribute('aria-current', 'true'));
  if (refocus) {
    const el = root.querySelector(refocus);
    refocus = null;
    el?.focus({ preventScroll: true });
  }
}

/* A fresh record in the pane: compared by its first heading, which every record pane renders. */
let lastRecord = '';
function markRecordChange(split) {
  const pane = split.querySelector(':scope > .detail-col') || split.lastElementChild;
  const key = (pane?.querySelector('h1, h2, h3')?.textContent || '').trim();
  if (pane && key && key !== lastRecord && lastRecord) {
    pane.classList.add('pane-enter');
    pane.addEventListener('animationend', () => pane.classList.remove('pane-enter'), { once: true });
  }
  lastRecord = key;
}

/* List memory. Keyed by route; the first child of the split is the list pane on every master-detail screen. */
const listTop = new Map();
let paging = false;
const routeKey = () => location.hash.replace(/^#\/?/, '').split('?')[0];
/* The list pane is the split's first child, or the .list-col inside it when the pane wraps the list and its pager. */
const listPane = root => {
  const first = root.querySelector('.route-stage > .workspace > [data-md] > :first-child');
  return first?.querySelector(':scope > .list-col') || first;
};

function restoreList(root, seen) {
  const pane = listPane(root);
  if (!pane || seen.has(pane)) return;
  seen.add(pane);
  const top = listTop.get(routeKey());
  if (paging) { paging = false; listTop.set(routeKey(), 0); return; }
  if (top) pane.scrollTop = top;
}

export function enhanceWorkspace(outlet) {
  if (!outlet || outlet.dataset.enhancer) return;
  outlet.dataset.enhancer = 'on';
  const seen = new WeakSet();
  outlet.addEventListener('scroll', e => {
    const pane = listPane(outlet);
    if (e.target === pane) listTop.set(routeKey(), pane.scrollTop);
  }, { capture: true, passive: true });
  outlet.addEventListener('click', e => { if (e.target.closest?.('[data-page], .pager button, [data-pager]')) paging = true; }, { capture: true });
  addEventListener('hashchange', () => { paging = false; lastRecord = ''; });
  outlet.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest?.(ROW);
    if (!row || row !== e.target || row.matches('a, button, input, select, textarea')) return;
    e.preventDefault();
    refocus = rowKey(row);
    row.click();
  });

  let queued = false;
  const pass = () => {
    queued = false;
    const workspace = outlet.querySelector('.route-stage > .workspace');
    if (!workspace) return;
    restoreList(outlet, seen);
    enhanceRows(workspace);
    const split = workspace.querySelector(':scope > [data-md]');
    if (split) { markRecordChange(split); enhanceDetail(split); }
    else enhancePage(workspace);
  };
  new MutationObserver(records => {
    if (records.every(r => [...r.addedNodes].every(n => n.nodeType === 1 && n.dataset?.enhanced))) return;
    if (!queued) { queued = true; requestAnimationFrame(pass); }
  }).observe(outlet, { childList: true, subtree: true });
}

/* Phone header (owner direction, 2026-10-20: the header "can even disappear most times, it is not priority").
   At phone width the ministry bar and the top bar take about 150px of an 844px screen. Scrolling down through
   content slides both away; scrolling up, returning to the top, or moving keyboard focus into the top bar brings them
   back. Any scroller in the workspace counts, so this works inside a record pane as well as on a long page. Wider
   screens are not affected. */
const PHONE = '(max-width: 640px)';
const HIDE_AFTER = 48;
const STEP = 8;
export function autoHideChrome(shell) {
  if (!shell || shell.dataset.chromeWatch || typeof matchMedia !== 'function') return;
  shell.dataset.chromeWatch = 'on';
  const phone = matchMedia(PHONE);
  const last = new WeakMap();
  const show = () => shell.removeAttribute('data-chrome');
  document.addEventListener('scroll', e => {
    const el = e.target;
    if (!phone.matches || !(el instanceof Element) || !el.closest('.dgo-main')) return;
    const top = el.scrollTop, prev = last.get(el) ?? top;
    last.set(el, top);
    if (top <= STEP) return show();
    if (top - prev > STEP && top > HIDE_AFTER) shell.setAttribute('data-chrome', 'hidden');
    else if (prev - top > STEP) show();
  }, { capture: true, passive: true });
  shell.addEventListener('focusin', e => { if (e.target.closest?.('.dgo-topbar, .dgo-ministry-bar')) show(); });
  addEventListener('hashchange', show);
  phone.addEventListener?.('change', show);
}
