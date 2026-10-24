#!/usr/bin/env node
/**
 * DO THE PACKAGES LOOK LIKE OPERATIONS POWER AUTOMATE HAS ALREADY ACCEPTED?
 *
 * Three packages failed at SAVE time and an operator found all three by pasting them. Every check
 * in this repository passed them, because they validate the LIST schema and rules written by
 * hand — never the connector's operation definition, which is what refuses the save.
 *
 * This compares each package against docs/reference/connector/sharepoint-operation-shape.json,
 * learned from 361 SharePoint operations inside definitions the platform has accepted. It cannot
 * prove a package will save. It can say "no accepted operation in this estate looks like this",
 * which is what all three failures had in common and what nothing here was asking.
 *
 * Rules are weighted by the evidence behind them: a pattern holding across 40 observations is an
 * ERROR, one across 5 is a WARN, and anything thinner is not a rule.
 *
 *     node scripts/verify-connector-conformance.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHAPE = JSON.parse(readFileSync(join(ROOT, 'docs/reference/connector/sharepoint-operation-shape.json'), 'utf8'));
const DIRS = ['docs/deployment/internal/flows/designer-paste', 'docs/deployment/sharepoint/flows/designer-paste'];
const STRONG = 20, WEAK = 5;

const findings = [];
const add = (pkg, sev, rule, action, detail, evidence) => findings.push({ pkg, sev, rule, action, detail, evidence });

/* Per-list Title discipline, recomputed here from the same corpus the shape file was built on. */
const titleByList = new Map();
for (const [guid, cols] of Object.entries(SHAPE.columnsSeenPerList || {}))
  titleByList.set(guid, cols.includes('Title'));

for (const dir of DIRS) {
  for (const file of readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.designer-paste.json') && !f.includes('.variables.')).sort()) {
    const name = file.replace('.designer-paste.json', '');
    const sv = JSON.parse(readFileSync(join(ROOT, dir, file), 'utf8')).serializedValue;
    (function walk(actions) {
      for (const [an, v] of Object.entries(actions || {})) {
        if (!v || typeof v !== 'object') continue;
        const h = v.inputs?.host;
        if (h?.operationId && /sharepoint/i.test(h.apiId || h.connection || '')) {
          const op = SHAPE.operations[h.operationId];
          const p = v.inputs?.parameters || {};
          const guid = String(p.table || '').toLowerCase();

          if (!op) {
            add(name, 'WARN', 'operation-never-observed', an,
              `${h.operationId} does not appear in any accepted definition in this estate`,
              'nothing to compare against — the operation may be fine, but nothing here can say so');
          } else {
            /* 1. A parameter every accepted instance carries, missing here. */
            for (const k of op.alwaysPresent) {
              const present = k === 'item/*' ? Object.keys(p).some((x) => x.startsWith('item/')) : (k in p);
              if (!present) add(name, op.observed >= STRONG ? 'ERROR' : 'WARN', 'missing-always-present-parameter', an,
                `${h.operationId} is missing ${k}`,
                `present in all ${op.observed} accepted ${h.operationId} operations in this estate`);
            }
            /* 2. A parameter shape no accepted instance of this operation has ever used. */
            for (const k of Object.keys(p)) {
              const shape = k.startsWith('item/') ? 'item/*' : k;
              if (!(shape in op.parameters)) add(name, op.observed >= STRONG ? 'ERROR' : 'WARN', 'parameter-never-observed', an,
                `${h.operationId} carries ${shape}, which no accepted ${h.operationId} in this estate carries`,
                `${op.observed} accepted operations examined`);
            }
          }

          /* 3. A column the estate addresses through /Value, addressed directly here. This is
                exactly OpenApiOperationParameterValidationFailed on item/Severity. */
          const byValue = SHAPE.columnsAddressedByValue?.[guid] || [];
          for (const k of Object.keys(p)) {
            if (!k.startsWith('item/')) continue;
            const col = k.slice(5).split('/')[0];
            const rec = byValue.find((c) => c.column === col);
            if (rec && !k.endsWith('/Value'))
              add(name, rec.viaValue >= WEAK ? 'ERROR' : 'WARN', 'choice-column-addressed-directly', an,
                `item/${col} is written directly; this estate writes it as item/${col}/Value`,
                `${rec.viaValue} accepted operation(s) use /Value, ${rec.direct} use it directly`);
          }

          /* 4. A column no accepted operation has ever written to this list. That is what
                WorkflowOperationParametersExtraParameter looked like on item/RunRecordJson. */
          const seen = SHAPE.columnsSeenPerList?.[guid];
          if (seen && /^(PostItem|PatchItem)$/.test(h.operationId)) {
            for (const k of Object.keys(p)) {
              if (!k.startsWith('item/')) continue;
              const col = k.slice(5).split('/')[0];
              if (!seen.includes(col)) add(name, 'WARN', 'column-never-written-here', an,
                `item/${col} — no accepted operation in this estate writes that column to this list`,
                `the list has ${seen.length} column(s) observed in accepted writes. If the column was provisioned recently this is expected; if not, the designer refuses the save.`);
            }
            /* 5. Every column the estate's accepted writes ALWAYS carry. This is the rule the
                  designer states as "missing required property item/OTP_Code", and the one this
                  generator broke three times by narrowing a patch to the fields that change. */
            const req = SHAPE.requiredByList?.[guid]?.[h.operationId];
            if (req && req.observed >= 3) {
              for (const col of req.alwaysPresent) {
                if (!Object.keys(p).some((k) => k === `item/${col}` || k.startsWith(`item/${col}/`)))
                  add(name, req.observed >= WEAK ? 'ERROR' : 'WARN', 'missing-required-column-for-this-list', an,
                    `${h.operationId} omits item/${col}`,
                    `all ${req.observed} accepted ${h.operationId} writes to this list carry it — the connector refuses the save without it`);
              }
            }
            /* 6. Title discipline, per list rather than absolute. */
            if (titleByList.get(guid) && !Object.keys(p).some((k) => k === 'item/Title' || k.startsWith('item/Title/')))
              add(name, 'ERROR', 'write-without-title-on-a-list-that-uses-it', an,
                `${h.operationId} writes to this list without item/Title`,
                'every accepted write to this list in the estate carries Title');
          }
        }
        walk(v.actions); walk(v.else?.actions);
        if (v.cases) for (const c of Object.values(v.cases)) walk(c.actions);
        walk(v.default?.actions);
      }
    })(sv.actions);
  }
}

const errs = findings.filter((f) => f.sev === 'ERROR');
const warns = findings.filter((f) => f.sev === 'WARN');
console.log(`\nConnector conformance — against ${SHAPE.corpus.operations} accepted operations in ${SHAPE.corpus.definitions} definitions\n`);
if (!findings.length) console.log('  ✅ every operation matches the shape of operations this platform has accepted');
for (const f of findings) console.log(`  ${f.sev === 'ERROR' ? '❌' : '⚠️ '} ${f.pkg} · ${f.action}\n       ${f.rule}: ${f.detail}\n       evidence: ${f.evidence}`);
console.log(`\n${errs.length ? '❌' : '✅'} ${errs.length} error(s), ${warns.length} warning(s)\n`);
process.exit(errs.length ? 1 : 0);
