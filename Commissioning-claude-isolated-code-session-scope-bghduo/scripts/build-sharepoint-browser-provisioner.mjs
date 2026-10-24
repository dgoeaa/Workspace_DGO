#!/usr/bin/env node
/* Bakes docs/deployment/sharepoint/portal-field-spec.json into
 * scripts/provision-sharepoint-fields.browser.js.
 *
 * The browser provisioner runs from a devtools console, where it cannot read a file off
 * disk, so the specification has to travel inside it. Generating that file rather than
 * hand-maintaining it is the only way the two runners cannot drift: PowerShell reads the
 * JSON directly, the browser reads a copy this script stamped from the same JSON.
 *
 * Run after any edit to portal-field-spec.json:
 *     node scripts/build-sharepoint-browser-provisioner.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = join(here, '../docs/deployment/sharepoint/portal-field-spec.json');
const outPath = join(here, 'provision-sharepoint-fields.browser.js');
const templatePath = join(here, 'lib/sharepoint-browser-provisioner.template.js');

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const template = readFileSync(templatePath, 'utf8');
/* Columns that already exist on adopted lists and must carry an index. They are not in the
 * field spec because the spec describes columns to CREATE; these are settings on columns the
 * estate already has, and leaving them as five manual clicks is what kept them undone. */
const indexTargets = JSON.parse(readFileSync(join(here, '../docs/deployment/sharepoint/index-targets.json'), 'utf8')).targets;

const marker = '/* __SPEC__ */';
if (!template.includes(marker)) {
  console.error(`Template ${templatePath} has no ${marker} placeholder.`);
  process.exit(1);
}

/* Only what the runner reads. The spec's prose — purpose, provenance, capturedState — stays
 * out: it is documentation for a person reading the JSON, and shipping it would put a second
 * copy of the narrative somewhere nobody will update. */
const slim = {
  specVersion: spec.specVersion,
  lists: spec.lists.map((l) => ({
    listOrder: l.listOrder,
    site: l.site,
    siteUrl: l.siteUrl,
    listTitle: l.listTitle,
    listGuid: l.listGuid,
    fields: l.fields.map((f) => {
      const out = {
        internalName: f.internalName,
        displayName: f.displayName,
        fieldType: f.fieldType,
      };
      if (f.required) out.required = true;
      if (f.indexed) out.indexed = true;
      if (f.enforceUnique) out.enforceUnique = true;
      if (f.numLines) out.numLines = f.numLines;
      if (f.richText) out.richText = true;
      if (f.choices) out.choices = f.choices;
      if (f.defaultValue) out.defaultValue = f.defaultValue;
      if (f.choiceFormat) out.choiceFormat = f.choiceFormat;
      return out;
    }),
  })),
  indexTargets: indexTargets.map((t) => ({
    site: t.site, siteUrl: t.siteUrl, listTitle: t.listTitle,
    listGuid: t.listGuid, internalName: t.internalName, itemsAtCapture: t.itemsAtCapture,
  })),
};

const banner = `/* GENERATED FILE — do not edit by hand.
 * Built from docs/deployment/sharepoint/portal-field-spec.json (specVersion ${spec.specVersion})
 * by scripts/build-sharepoint-browser-provisioner.mjs. Edit the specification and re-run.
 */\n`;

/* THE COUNTS IN THE INSTRUCTIONS ARE DERIVED, NOT TYPED.
 * The template used to say "any of the three sites" and "all thirteen already exist". The spec
 * carries four sites and fourteen lists, and one of the sites the sentence omitted is the one
 * holding Flow Configuration — the list open item 8 needs a column on. An operator who signed
 * into three sites and read "one paste reaches all of them" had no reason to check the fourth.
 * Counting from the spec at build time is the only version that cannot go stale again. */
const sites = [...new Set(slim.lists.map((l) => l.siteUrl))].sort();
const siteList = sites.map((u) => {
  const on = slim.lists.filter((l) => l.siteUrl === u).map((l) => l.listTitle);
  return ` *     ${u}\n *       ${on.join(', ')}`;
}).join('\n');

writeFileSync(outPath, banner + template
  .replace(marker, JSON.stringify(slim, null, 2))
  .replace('__SITE_COUNT__', String(sites.length))
  .replace('__SITE_LIST__', siteList)
  .replace('__LIST_COUNT__', String(slim.lists.length)));

const fields = slim.lists.reduce((n, l) => n + l.fields.length, 0);
console.log(`Wrote ${outPath} — ${slim.lists.length} lists, ${fields} columns, ${slim.indexTargets.length} index targets, spec ${spec.specVersion}`);
