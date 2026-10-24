#!/usr/bin/env node
/**
 * contracts/deployed holds the adopted estate: one definition per adopted flow (registers/flow-adoption.json).
 *
 *   npm run adoptedestate            write the missing definitions
 *   npm run adoptedestate -- --check fail if one is missing, stale, or names a flow that is not adopted
 *
 * Every tool that reads contracts/deployed as "the estate" (flow shapes, the notification matrix, the definition map,
 * the catalogue, provisioning, the process documentation) then reads the flows the platform runs and nothing else.
 * An adopted flow whose only tenant record is a capture (captures/, 2026-10-01) or an export (exports/) gets a
 * definition written here from the newest of them, marked `derivedFrom`. An adopted flow already exported here keeps
 * its export. The Mailer's definitions live in mailer/flows/definitions and are not repeated here.
 */
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openZip } from './lib/zip-reader.mjs';
import { ADOPTED } from './lib/flow-adoption-data.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const B = 'docs/folio-Master-Flows-and-Endpoints';
const DEP = `${B}/contracts/deployed`;
const CAPTURED = '2026-10-01';
const MAILER = 'Correspondence Mailer';

const J = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8').replace(/^﻿/, ''));
const deployed = readdirSync(join(ROOT, DEP)).filter((f) => f.endsWith('.json'));
const idOf = (f) => (/__([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})__full_definition\.json$/i.exec(f) || [])[1]?.toLowerCase();
const exportsHeld = readdirSync(join(ROOT, `${B}/exports`)).filter((f) => f.endsWith('.zip')).map((f) => {
  const z = openZip(join(ROOT, `${B}/exports/${f}`));
  const def = JSON.parse(z.members.find((m) => /^Microsoft\.Flow\/flows\/[^/]+\/definition\.json$/.test(m.name)).read().toString('utf8'));
  const man = JSON.parse(z.members.find((m) => m.name === 'manifest.json').read().toString('utf8'));
  return { file: `${B}/exports/${f}`, id: def.name, name: def.properties.displayName, at: man.details?.createdTime || '', definition: def.properties.definition };
});
const capturesHeld = readdirSync(join(ROOT, `${B}/captures`)).filter((f) => f.endsWith('.json')).map((f) => ({ file: `${B}/captures/${f}`, d: J(`${B}/captures/${f}`) }))
  .filter((c) => c.d.FlowGuid && c.d.Definition).map((c) => ({ file: c.file, id: c.d.FlowGuid.toLowerCase(), name: c.d.Name, at: CAPTURED, definition: c.d.Definition }));
const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, '_');

const want = {};
for (const a of ADOPTED.filter((x) => x.fn !== MAILER)) {
  const exported = deployed.find((f) => idOf(f) === a.id && !J(`${DEP}/${f}`).derivedFrom);
  if (exported) continue;
  const src = [...exportsHeld, ...capturesHeld].filter((s) => s.id === a.id).sort((x, y) => (String(x.at) < String(y.at) ? -1 : String(x.at) > String(y.at) ? 1 : 0)).pop();
  if (!src) throw new Error(`${a.name} (${a.id}): adopted, but no export or capture holds its definition`);
  const name = `${safe(src.name)}__${a.id}__full_definition.json`;
  want[name] = `${JSON.stringify({
    exportedBy: src.file.includes('/exports/') ? 'Power Automate export package, produced in the tenant and supplied by the owner' : 'Tenant capture (docs/folio-Master-Flows-and-Endpoints/captures, 2026-10-01)',
    exportedAtUtc: src.at, derivedFrom: src.file,
    workflow_identity: { internal_name: a.id, full_resource_id: `/providers/Microsoft.Flow/flows/${a.id}`, tags: { flowDisplayName: src.name } },
    definition: src.definition,
  }, null, 2)}\n`;
}

let bad = 0;
for (const [f, body] of Object.entries(want)) {
  let cur = null; try { cur = readFileSync(join(ROOT, DEP, f), 'utf8'); } catch { /* new */ }
  if (cur === body) continue;
  if (CHECK) { console.error(`adopted estate: ${DEP}/${f} is missing or stale — run: npm run adoptedestate`); bad++; } else writeFileSync(join(ROOT, DEP, f), body);
}
/* A derived definition no adopted flow wants is removed; an export of a flow that is not adopted is a retired artefact
   (npm run flowadoption -- --check names it). */
for (const f of deployed) {
  if (want[f] || !J(`${DEP}/${f}`).derivedFrom) continue;
  if (CHECK) { console.error(`adopted estate: ${DEP}/${f} is not an adopted flow's definition`); bad++; } else rmSync(join(ROOT, DEP, f));
}
if (bad) process.exit(1);
const total = readdirSync(join(ROOT, DEP)).filter((f) => f.endsWith('.json')).length;
console.log(`adopted estate: ${total} definitions in contracts/deployed (${Object.keys(want).length} derived from captures and exports)${CHECK ? '' : ' (written)'}`);
