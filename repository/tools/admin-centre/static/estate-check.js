/* The configuration check: the Estate Console's own analysis (core/endpoint-atlas.js), run in this page.
 *
 * A configuration file loaded here (a deployed config.local.js, or a values file) is read by pattern, never run, and held
 * in this page's memory only. It is never sent to the Centre, written anywhere, or shown with its signatures: every
 * address the analysis returns is redacted, and so is the report it exports. */
import { describeEstate, findings, summarise, exportReport, workflowIdOf, signatureLengthOf } from '/modules/core/endpoint-atlas.js';
import { EndpointAtlas } from '/modules/config/endpoint-atlas.data.js';

/* KEY=value lines, as a values file holds them. */
function parseValues(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1].replace(/^(DGO|PF)_ENDPOINT_/, '')] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/* KEY: 'value' entries, as config.local.js holds them. Read by pattern, never evaluated. */
function parseConfigLocal(text) {
  const out = {};
  for (const m of String(text).matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:\s*(["'])([^"']*)\2/gm)) {
    if (m[3]) out[m[1]] = m[3];
  }
  return out;
}

function read(text) {
  const looksConfig = /DGO_CONFIG|PF_CONFIG/.test(text);
  return { urls: looksConfig ? parseConfigLocal(text) : parseValues(text), kind: looksConfig ? 'config.local.js' : 'values file' };
}

function check(urls) {
  const resolve = (k) => urls[k] || '';
  return { keys: describeEstate({ resolve }), findings: findings({ resolve }), summary: summarise({ resolve }) };
}

function report(urls) {
  return exportReport({ resolve: (k) => urls[k] || '' });
}

/* Two deployments side by side: by workflow and signature length, never by showing a signature. */
function compare(current, baseline) {
  return EndpointAtlas.keys.map((k) => {
    const a = current[k.key] || '', b = baseline[k.key] || '';
    const wfA = workflowIdOf(a) || '', wfB = workflowIdOf(b) || '';
    let verdict;
    if (!a && !b) verdict = 'both empty';
    else if (!a) verdict = 'only in baseline';
    else if (!b) verdict = 'only in current';
    else if (a === b) verdict = 'identical';
    else if (wfA !== wfB) verdict = 'different workflow';
    else verdict = 'different signature';
    return { key: k.key, surface: k.surface, verdict, workflowCurrent: wfA, workflowBaseline: wfB, sigCurrent: signatureLengthOf(a), sigBaseline: signatureLengthOf(b) };
  });
}

window.FolioEstateCheck = Object.freeze({ read, check, report, compare });
window.dispatchEvent(new Event('folio-estate-check-ready'));
