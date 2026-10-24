/**
 * Who owns each executable instruction, and the banner that says so.
 *
 * WHY THIS REPLACED A PRECEDENCE SENTENCE
 *
 * Twelve documents in this estate carried a variation of:
 *
 *     "Where this document and that one differ on a command, that one is right."
 *
 * Read plainly, that sentence says two documents carry the same command and may disagree. It
 * resolves the conflict instead of preventing it, and it only helps a reader who already suspects
 * there is one. A reader holding the wrong document and no suspicion follows it to the end.
 *
 * Measured on 2026-09-10, five of sixteen instructed browser scripts had more than one
 * instructing document; `provision-sharepoint-fields.browser.js` had nine. The precedence
 * sentences were not a safeguard against that, they were a symptom of it.
 *
 * So ownership is declared once, in `docs/reference/document-ownership.json`, and every generator
 * emits its banner from here. A document either carries the steps for a domain or it does not,
 * and the banner says which — no tie-breaker, because there is nothing to break a tie between.
 * `tests/single-source-of-truth.test.mjs` fails the build if a non-owner starts instructing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REGISTER = path.join(ROOT, 'docs/reference/document-ownership.json');

export const ownership = JSON.parse(fs.readFileSync(REGISTER, 'utf8'));

/** @param {string} rel repository-relative path of a document @returns {object|undefined} */
export const domainOwning = (rel) => ownership.domains.find((d) => d.owner === rel);

/** The domain whose owner a non-owner document should point at, chosen by directory proximity. */
export function domainFor(rel) {
  const own = domainOwning(rel);
  if (own) return own;
  const dir = path.dirname(rel);
  const sameDir = ownership.domains.find((d) => path.dirname(d.owner) === dir);
  return sameDir || ownership.domains.find((d) => d.id === 'portal-endpoint');
}

/** A markdown link from `rel` to `target`, both repository-relative. */
export const linkFrom = (rel, target) => {
  const r = path.relative(path.dirname(rel), target).split(path.sep).join('/');
  return r.startsWith('.') ? r : `./${r}`;
};

/** The declared derived-step view for `rel`, if it renders steps it does not own. */
export const derivedViewFor = (rel) =>
  (ownership.derivedStepViews?.views || []).find((v) => v.document === rel);

/**
 * The banner a document carries about where its commands live.
 *
 * Three shapes, because there are three truthful things a document can be:
 *   · a domain owner — the steps are here and nothing else restates them
 *   · a derived step view — it renders steps generated from a declared source, and owns none
 *   · neither — it carries no commands at all
 *
 * The third was applied to ACTION_PLAN.md, which carries 24 `**Do**` blocks. A banner that says
 * "carries no commands" on a document full of commands is worse than no banner: it tells a reader
 * to go somewhere else for steps that are right in front of them.
 *
 * @param {string} rel repository-relative path of the document being generated
 * @returns {string} markdown blockquote, no trailing newline
 */
export function ownershipBanner(rel) {
  const derived = derivedViewFor(rel);
  if (derived) {
    return `> **This document carries steps, and owns none of them.** ${derived.blocks},\n`
      + `> every one generated from [\`${path.basename(derived.source)}\`](${linkFrom(rel, derived.source)})\n`
      + `> by \`${derived.generator}\`. Change the register, not this file — a \`--check\` fails the build on drift.\n`
      + `>\n`
      + `> Console steps are elsewhere: ${ownership.domains.filter((d) => d.scripts?.length)
        .map((d) => `[\`${path.basename(d.owner)}\`](${linkFrom(rel, d.owner)})`).join(' and ')}.`;
  }
  const owned = domainOwning(rel);
  if (owned) {
    const what = owned.scripts?.length
      ? `${owned.scripts.length} console script(s) are run from here.`
      : 'Every step for this domain is written out here.';
    return `> **This document carries the steps for ${owned.title.toLowerCase()}, and it is the only one that does.**\n`
      + `> ${what} Every other document in this repository\n`
      + `> may name a step and say that it lives here; none of them restates it. There is no precedence\n`
      + `> rule to apply, because there is nothing to have a conflict with.`;
  }
  const d = domainFor(rel);
  const role = ownership.nonExecutableRoles?.[rel];
  return `> **This document carries no commands.** The steps for ${d.title.toLowerCase()} live in\n`
    + `> [\`${path.basename(d.owner)}\`](${linkFrom(rel, d.owner)}), which is the only document that carries them.\n`
    + `> This document is ${role || 'a supporting record'}. If you are here to execute, go there.`;
}
