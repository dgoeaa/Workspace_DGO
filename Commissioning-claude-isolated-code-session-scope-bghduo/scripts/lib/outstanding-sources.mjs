/**
 * One reader for every source of outstanding work.
 *
 * WHY THIS IS A LIBRARY AND NOT TWO COPIES
 *
 * `npm run outstanding` totals the five declared sources. `npm run master` enumerates the same
 * items with what each one needs to close. Two commands reading the same five files by two
 * hand-written copies of the same patterns is precisely the arrangement that produced the
 * round-tripping this baseline spent a week correcting: the copies drift, both look right, and the
 * disagreement surfaces as a closed item being asked for again.
 *
 * So the patterns live here once. If the rollup and the master register disagree about how many
 * items exist, it is a bug in one of them, not a difference of reading.
 *
 * WHAT AN ENTRY CARRIES
 *
 * Every field below is either READ FROM THE SOURCE or `null`. Nothing is inferred, defaulted, or
 * filled with a plausible sentence. A source that states no closure criterion yields `trigger:
 * null`, and the generated document says so in those words — because "not established by the
 * source" is a finding about the estate, and inventing a criterion would hide it.
 *
 *   id, title, source, open, status   — identity and standing
 *   owner                             — who can act, where the source names one
 *   what                              — what the item is
 *   why                               — why it exists, or why it is still open
 *   state                             — where it stands today
 *   actions                           — the steps stated
 *   inputs                            — decisions and constraints that must be supplied
 *   trigger                           — what decisively closes it
 *   validation                        — how closure would be checked
 *   deps                              — ids the source names as prerequisites
 *   ordering                          — a sentence in the source that constrains order
 *   severity, category                — the source's own grading
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const SOURCES_PATH = 'docs/deployment/OUTSTANDING_SOURCES.json';

/* Ids this estate uses, so a dependency written in prose can be found in a sentence. Anchored on
   a word boundary at both ends: `ITEM-2` must not match inside `ITEM-25`. The five sources use
   disjoint prefixes — ITEM/G/CFG/MANUAL, GOV, P, F, and B/S/C — so an id found in prose resolves
   to exactly one item wherever it was written. */
const ID_IN_PROSE = /\b(ITEM-\d{1,3}|GOV-\d{2}|CFG-\d|MANUAL-\d|GAP-\d{3}|G-\d{2}|P-\d{2}|F-\d{2}|[BSC]\d{1,2})\b/g;

/* A RANGE WRITTEN IN PROSE IS A DEPENDENCY ON EVERY MEMBER, NOT ON ITS TWO ENDS.
   P-13 says "close ITEM-38 through ITEM-42" and GOV-11 says the package "does not save (B1–B7)".
   Reading only the endpoints made P-13 look released — ITEM-38 and ITEM-42 have both closed —
   while ITEM-40 and ITEM-41, which it also names, are open. That is an undercount that inverts the
   verdict, so ranges are expanded into their members.

   THE PREFIX MUST BE REPEATED ON BOTH ENDS, and that is not fussiness. Allowing the second end to
   be a bare number made `ITEM-9 — 39 of 77 flows have no stated purpose` read as ITEM-9 through
   ITEM-39: one prose dash invented thirty-one dependencies, seventeen of them on items that do not
   exist. A range in this estate is always written `ITEM-38 through ITEM-42` or `B1–B7`. */
const RANGE = /\b([A-Z][A-Z]{0,11}-?)(\d{1,3})\s*(?:through|to|–|—|-{1,2})\s*\1(\d{1,3})\b/g;

/* Sentences that constrain ORDER, as opposed to sentences that merely mention another item.
   Kept tight and quoted back in the output so the reading can be checked rather than trusted.
   `depends on` is DELIBERATELY ABSENT: prerequisites are already read structurally from the
   dependencies field, and as a phrase it fires on description rather than sequence — C5's "the one
   field a consecutive-failures alert depends on" is a statement about a column, not about order. */
const ORDERING = /[^.]*\b(must precede|before they are|before it is|before them|before its|re-orders|must not proceed until|only after|cannot(?:\s+\w+){0,3}\s+until|is not live until|should be resolved before)\b[^.]*\./i;

const ids = (text) => {
  const s = String(text || '');
  const found = new Set(s.match(ID_IN_PROSE) || []);
  for (const m of s.matchAll(RANGE)) {
    const [from, to] = [Number(m[2]), Number(m[3])];
    /* A range that runs backwards, or spans more than the estate's largest register, is a number
       pair that happens to look like one — a date, a count, a version. Left alone. */
    if (to <= from || to - from > 60) continue;
    /* `P-01 to P-17` is zero-padded and `B1–B7` is not; the range's own first number says which. */
    const width = m[2].startsWith('0') ? m[2].length : 1;
    for (let n = from; n <= to; n++) {
      const id = `${m[1]}${String(n).padStart(width, '0')}`;
      ID_IN_PROSE.lastIndex = 0;
      if (ID_IN_PROSE.test(id)) found.add(id);
      ID_IN_PROSE.lastIndex = 0;
    }
  }
  return [...found];
};
const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []);
/* A SENTENCE ENDS AT A FULL STOP FOLLOWED BY A NEW SENTENCE, NOT AT EVERY FULL STOP.
   Splitting on the character alone cut `portal-field-spec.json` into `portal-field-spec. json` and
   ended B1's summary mid-list at `internal-field-evidence.` — this estate's prose is full of
   filenames, version numbers and `flow-contracts/deployed/` paths, and a summariser that mangles
   them produces a document whose quotes do not match the source it quotes. So a boundary needs a
   terminator, then whitespace, then something that starts a sentence. */
const firstSentences = (text, n = 2) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const parts = s.split(/(?<=[.!?])\s+(?=[A-Z`"'(‘“])/);
  return parts.slice(0, n).join(' ').trim() || null;
};

/* ------------------------------------------------------------------ *
 * Readers — one per shape a source actually has
 * ------------------------------------------------------------------ */

export const readers = {
  /* A JSON array of items, each carrying a status that is or is not in a declared closed set.
     The readiness register. The only source that states a closure criterion per item. */
  'json-items'(src, text) {
    const doc = JSON.parse(text);
    const items = doc[src.itemsAt] || [];
    const closed = new Set(src.closedStatuses || []);
    return items.map((i) => {
      const dep = list(i.dependencies);
      return {
        id: i[src.idField],
        title: i[src.titleField],
        owner: i[src.ownerField] || null,
        status: i[src.statusField],
        open: !closed.has(i[src.statusField]),
        category: i.category || null,
        severity: null,
        what: i.description || null,
        why: i.whyOpen || null,
        state: [i.status, i.targetDateStatus === 'ESTABLISHED_NONE' ? 'no target date established' : i.targetDateStatus]
          .filter(Boolean).join(' · ') || null,
        actions: list(i.steps).length ? list(i.steps) : list(i.requirements),
        inputs: [...list(i.decisions), ...list(i.constraints)],
        trigger: i.resolutionCriteria || null,
        validation: i.validation || null,
        deps: dep.flatMap((d) => ids(d)),
        ordering: dep.map((d) => (ORDERING.exec(d) || [])[0]).find(Boolean)
          || (ORDERING.exec(i.whyOpen || '') || [])[0] || null,
        blocks: list(i.blocks), doesNotBlock: list(i.doesNotBlock),
      };
    });
  },

  /* Two arrays: what is open and what has been closed. The split IS the status.
     The governance estate position. */
  'json-open-closed'(src, text) {
    const doc = JSON.parse(text);
    const mk = (f, open) => ({
      id: f[src.idField],
      title: f[src.titleField],
      owner: f[src.ownerField] || null,
      status: open ? 'OPEN' : 'CLOSED',
      open,
      category: null,
      severity: f.severity || null,
      what: f.detail || null,
      why: f.consequence || f.blocksNote || null,
      state: [f.repositoryStatus && `repository: ${f.repositoryStatus}`,
        f.tenantStatus && `tenant: ${f.tenantStatus}`].filter(Boolean).join(' · ') || null,
      actions: list(f.resolution),
      inputs: [],
      /* Every governance finding HAS a checkable closure condition, and it is the one
         tests/closure-alignment.test.mjs already enforces — so this is read from the estate's
         own gate rather than invented for the document. */
      trigger: f.resolution
        ? `${list(f.resolution).join(' ')} — then moved to closedFindings with repositoryStatus and tenantStatus both reading resolved, which npm run test:closure enforces.`
        : null,
      validation: 'npm run test:governanceestate · npm run test:closure',
      deps: ids(f.blocksNote),
      ordering: (ORDERING.exec(f.blocksNote || '') || [])[0]
        || (/[^.]*\b(?:Step \d|re-orders)\b[^.]*\./i.exec(f.blocksNote || '') || [])[0] || null,
      blocksCommissioning: f.blocksCommissioning === true,
      blocksNote: f.blocksNote || null,
    });
    return [
      ...(doc[src.openAt] || []).map((f) => mk(f, true)),
      ...(doc[src.closedAt] || []).map((f) => mk(f, false)),
    ];
  },

  /* Markdown headings, `## P-01 Title` or `### B1 · Title`, with the prose beneath each one.
     A heading may cover a RANGE — the flow-truth review writes `### C11–C12 · Three columns carry
     the wrong identity`, two findings under one head — so a range is expanded into its members.
     Counting that as one finding under-reports the work by exactly the number of ranges. */
  'markdown-headings'(src, text) {
    const re = new RegExp(src.headingPattern, 'gm');
    const hits = [...text.matchAll(re)].map((m) => ({ at: m.index, id: m[1], title: (m[2] || '').trim() }));
    const out = [];
    /* A RECORD IS NEVER EDITED, SO SUPERSESSION IS DECLARED FROM OUTSIDE IT.
       An audit's findings stay counted open until a tracked source establishes otherwise — that is
       the rule this estate already lives by, and the reason all 29 flow-truth findings were open
       beside a passing suite that answered most of them. A source may now name a declaration that
       says, per finding, what has since been established. The record stays verbatim; the counting
       changes. */
    const superseded = supersessionFor(src);
    hits.forEach((h, n) => {
      const body = text.slice(h.at, n + 1 < hits.length ? hits[n + 1].at : text.length);
      const range = /^([A-Za-z-]*?)(\d+)\s*[–—-]\s*(?:[A-Za-z-]*?)(\d+)$/.exec(h.id);
      const members = range && Number(range[3]) > Number(range[2])
        ? Array.from({ length: Number(range[3]) - Number(range[2]) + 1 },
          (_, k) => `${range[1]}${Number(range[2]) + k}`)
        : [h.id];
      for (const id of members) {
        const e = entryFromProse(src, id, h.title, body, members);
        const sup = superseded.get(id);
        if (sup) {
          e.open = !sup.closed;
          e.status = sup.closed ? 'SUPERSEDED' : 'OPEN';
          if (sup.closed) {
            e.state = `superseded — ${sup.by}`;
            e.trigger = sup.trigger;
          } else if (sup.trigger) {
            /* Not superseded, but the declaration states what would supersede it, which is a
               closure criterion where the record itself states none. */
            e.trigger = sup.trigger;
          }
        }
        out.push(e);
      }
    });
    return out;
  },

  /* Findings written as a bold run-in head: `**F-01 · Title.**`, with prose to the next head. */
  'markdown-bold-findings'(src, text) {
    const re = new RegExp(src.findingPattern, 'gm');
    const hits = [...text.matchAll(re)].map((m) => ({ at: m.index, id: m[1], title: (m[2] || '').trim().replace(/\.$/, '') }));
    return hits.map((h, n) =>
      entryFromProse(src, h.id, h.title, text.slice(h.at, n + 1 < hits.length ? hits[n + 1].at : text.length), [h.id]));
  },
};

/* Reads a source's `supersededBy` declaration into a map of id → {closed, by, trigger}.
   ROOT is bound at readAll(); a source declaring supersession before that is a programming
   error rather than a data one, so it throws rather than quietly counting everything open. */
let SUPERSESSION_ROOT = null;
function supersessionFor(src) {
  const out = new Map();
  const d = src.supersededBy;
  if (!d) return out;
  if (!SUPERSESSION_ROOT) throw new Error(`${src.id}: supersededBy read before the root was bound`);
  const abs = join(SUPERSESSION_ROOT, d.path);
  if (!existsSync(abs)) throw new Error(`${src.id}: supersededBy names ${d.path}, which does not exist`);
  const doc = JSON.parse(readFileSync(abs, 'utf8'));
  for (const row of doc[d.itemsAt] || []) {
    const id = row[d.idField];
    if (!id) continue;
    const closed = Boolean(row[d.closedWhen]);
    out.set(id, {
      closed,
      by: closed
        ? `${(row[d.viaField] || []).join('; ') || d.because}`
        : null,
      trigger: closed
        ? `${d.because} Held by: ${(row[d.viaField] || []).join('; ')}.`
        : (row[d.wouldCloseField] || null),
    });
  }
  return out;
}

/* A finding recorded as prose. Both audits write one, and what they state varies by finding —
   so each field is read where it is written and left null where it is not. The two audits between
   them carry an owner on ten findings and a `**Fix**` on thirteen; the rest state neither, and
   that gap is reported rather than filled. */
function entryFromProse(src, id, title, body, members) {
  const owner = (/\*Owner:\s*([^.*]+?)\.?\*/.exec(body.replace(/\n/g, ' ')) || [])[1] || null;
  const severity = (/\*\*Severity\*\*\s*([^.*]+)/.exec(body) || [])[1] || null;
  const fix = (/\*\*Fix\*\*\s*([\s\S]*?)(?=\n\n|\n\*\*|$)/.exec(body) || [])[1] || null;
  /* Strip the head, the owner tag and the severity/fix run-in to leave the finding itself. */
  const prose = body
    .replace(/^#{1,4}[^\n]*\n/, '').replace(/^\*\*[^*]+\*\*/, '')
    .replace(/\*Owner:[^*]*\*/g, '').replace(/\*\*Severity\*\*[\s\S]*$/, '')
    .replace(/```[\s\S]*?```/g, ' ').replace(/^\|.*$/gm, ' ');
  return {
    id,
    title: members.length > 1 ? `${title} _(covered with ${members.join(', ')})_` : title,
    owner: owner ? owner.replace(/\s+/g, ' ').trim() : null,
    status: src.allOpen ? 'OPEN' : 'UNKNOWN',
    open: Boolean(src.allOpen),
    category: null,
    severity: severity ? severity.replace(/\s+/g, ' ').trim() : null,
    what: firstSentences(prose, 3) || title,
    why: src.allOpenBecause || null,
    state: src.allOpen ? 'open — the source states one position for every entry and carries no per-item status' : null,
    actions: fix ? [fix.replace(/\s+/g, ' ').trim()] : [],
    inputs: [],
    trigger: null,
    validation: (src.gatedBy || []).join(' · ') || null,
    deps: ids(prose).filter((x) => x !== id),
    ordering: (ORDERING.exec(prose) || [])[0] || null,
  };
}

/* ------------------------------------------------------------------ *
 * Read every declared source
 * ------------------------------------------------------------------ */

export function readAll(ROOT) {
  SUPERSESSION_ROOT = ROOT;
  const read = (p) => readFileSync(join(ROOT, p), 'utf8');
  const declared = JSON.parse(read(SOURCES_PATH));
  const results = [];
  const problems = [];
  const uncounted = declared.sources.filter((s) => s.counted === false);

  for (const src of declared.sources.filter((s) => s.counted !== false)) {
    if (!existsSync(join(ROOT, src.path))) { problems.push(`${src.id}: ${src.path} does not exist`); continue; }
    const reader = readers[src.reader];
    if (!reader) { problems.push(`${src.id}: no reader for "${src.reader}"`); continue; }
    let entries = [];
    try { entries = reader(src, read(src.path)).map((e) => ({ ...e, source: src.id })); }
    catch (e) { problems.push(`${src.id}: ${e.message}`); continue; }

    /* A source that suddenly reads zero has almost certainly changed shape rather than been
       finished, and silently reporting nothing left is the worst failure this code could have. */
    if (!entries.length) problems.push(`${src.id}: read 0 entries — the pattern no longer matches. Check ${src.path}.`);

    results.push({
      src, entries,
      open: entries.filter((e) => e.open),
      closed: entries.filter((e) => !e.open),
    });
  }
  return { declared, results, problems, uncounted };
}

/* ------------------------------------------------------------------ *
 * Who can act
 * ------------------------------------------------------------------ */

/* Owners are free text across five sources, so this groups on what they have in common rather
   than normalising them into a fixed list nobody maintains. An owner naming both a party and a
   condition ("operator, once the rotated URLs exist") lands under the party. */
export function actorOf(owner) {
  if (!owner) return 'not stated in the source';
  const o = owner.toLowerCase();
  if (o.includes('agency')) return 'the agency';
  if (o.includes('tenant administrator')) return 'tenant administrator';
  if (o.includes('operator')) return 'operator';
  if (o.includes('platform technical owner')) return 'platform technical owner';
  if (o.includes('governance owner')) return 'governance owner';
  if (o.includes('operational owner')) return 'operational owner';
  if (o.includes('author')) return 'author';
  if (o.includes('security')) return 'security authority';
  if (o.includes('power automate')) return 'Power Automate implementation';
  return owner.length > 48 ? `${owner.slice(0, 45)}…` : owner;
}
