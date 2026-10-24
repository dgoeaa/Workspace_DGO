/* The PowerShell this repository ships must parse under Windows PowerShell 5.1.
 *
 * Every .ps1 here targets modules built on .NET Framework — PnP.PowerShell and
 * Microsoft.PowerApps.PowerShell — so 5.1 is the documented runtime and the one an operator
 * actually opens. PowerShell 7 accepts a strictly larger grammar, which makes it useless as a
 * gate: a script can parse perfectly under 7 and fail at line 1 under 5.1. That happened, with
 * a multi-line `$x = if (...) {...} elseif ...` that 7 continues across the newline and 5.1
 * terminates at it.
 *
 * So this checks for the divergences themselves rather than trusting a parser that is too
 * permissive to notice. It is a lint, not a parser — it will not catch everything, but it
 * catches the classes that have actually bitten. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log('  ✅ ' + name); return; }
  failed++; console.log('  ❌ ' + name + (detail ? '\n     ' + detail : ''));
};

const root = new URL('../', import.meta.url);
const scriptsDir = fileURLToPath(new URL('scripts/', root));
const files = readdirSync(scriptsDir).filter((f) => f.endsWith('.ps1'));

console.log('\nWindows PowerShell 5.1 compatibility');
ok('there are PowerShell scripts to check', files.length > 0);

/* Comments and string literals are stripped before scanning for operators, so a `&&` inside a
 * message or a regex is not reported as a command-chain operator. */
function stripLiterals(line) {
  return line
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"`]|`.)*"/g, '""')
    .replace(/#.*$/, '');
}

const braceDelta = (line) => {
  const t = stripLiterals(line);
  return (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length;
};

const findings = [];

/* 0. Encoding. This is the one that actually broke, and it breaks silently.
 *
 * Windows PowerShell 5.1 reads a .ps1 with no byte-order mark as the system ANSI codepage,
 * not as UTF-8. A file saved BOM-less UTF-8 therefore has every multi-byte character
 * mis-decoded — and an em-dash (E2 80 94) becomes "â€”", whose last character is U+201D, a
 * smart double quote. PowerShell's lexer treats smart quotes as string delimiters, so a
 * decorative dash in a comment silently opens a string, the lexer desyncs, and the parser
 * reports "the string is missing the terminator" on some innocent line far below.
 *
 * PowerShell 7 reads BOM-less files as UTF-8 and sees none of this, which is precisely why
 * it cannot be the gate.
 *
 * Two independent defences, both required: the file is pure ASCII, so any codepage decodes
 * it identically even if the BOM is lost; and it carries a BOM, so a non-ASCII character
 * added later is still read correctly. */
const PS_QUOTES = new Set(['\u2018', '\u2019', '\u201C', '\u201D']);

for (const file of files) {
  const bytes = readFileSync(join(scriptsDir, file));
  const hasBom = bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  const nonAscii = [...bytes].filter((b) => b > 0x7F).length - (hasBom ? 3 : 0);

  if (nonAscii > 0) {
    /* Simulate the 5.1 mis-decode and count the quote characters it injects. */
    const asAnsi = new TextDecoder('windows-1252').decode(bytes);
    const injected = [...asAnsi].filter((c) => PS_QUOTES.has(c)).length;
    findings.push(`${file}  ${nonAscii} non-ASCII byte(s); read as windows-1252 they inject ${injected} smart-quote character(s) that PowerShell's lexer treats as string delimiters. Replace them with ASCII (- for dashes, -> for arrows).`);
  }
  if (!hasBom) {
    findings.push(`${file}  no UTF-8 byte-order mark. Windows PowerShell 5.1 reads a BOM-less .ps1 as the system ANSI codepage, so any non-ASCII character added later will be mis-decoded into string delimiters.`);
  }
}

for (const file of files) {
  const lines = readFileSync(join(scriptsDir, file), 'utf8').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const code = stripLiterals(raw);

    /* 1. if/switch used as an assigned EXPRESSION must close on its own line. This is the one
     *    that broke: 5.1 ends the assignment at the newline after '}' and then meets an
     *    orphaned 'elseif'. */
    if (/=\s*(if|switch)\s*[\(\{]/.test(code)) {
      /* Walk forward only while braces are still open. A construct that balances on its own
       * line is the single-line form, which 5.1 accepts and which most of these scripts use. */
      let depth = braceDelta(raw);
      let span = 1;
      let j = i;
      while (depth !== 0 && j + 1 < lines.length && span < 40) {
        j++; span++;
        depth += braceDelta(lines[j]);
      }
      /* Two ways to be the broken form: the braces themselves span lines, or they closed here
       * and the continuation sits on the next line where 5.1 will no longer be reading. */
      let nextLine = '';
      for (let k = j + 1; k < lines.length; k++) {
        if (lines[k].trim() !== '') { nextLine = lines[k].trim(); break; }
      }
      if (span > 1 || /^(elseif|else)\b/.test(nextLine)) {
        findings.push(`${file}:${i + 1}  multi-line \`= if/switch\` expression — 5.1 ends the assignment at the first newline. Use statement form: assign a default, then if/elseif/else as statements.`);
      }
    }

    /* 2. Operators and cmdlets that exist only in PowerShell 7. */
    if (/(?<![|&])\|\|(?!\|)/.test(code) || /(?<![|&])&&(?!&)/.test(code)) {
      findings.push(`${file}:${i + 1}  pipeline chain operator (&& / ||) — PowerShell 7 only. Use -and/-or, or separate statements with an if.`);
    }
    if (/\?\?=|\?\?|\?\./.test(code)) {
      findings.push(`${file}:${i + 1}  null-coalescing / null-conditional operator — PowerShell 7 only.`);
    }
    if (/-Parallel\b/.test(code)) {
      findings.push(`${file}:${i + 1}  ForEach-Object -Parallel — PowerShell 7 only.`);
    }
    if (/ConvertFrom-Json\b[^|]*-AsHashtable\b/.test(code)) {
      findings.push(`${file}:${i + 1}  ConvertFrom-Json -AsHashtable — PowerShell 7 only.`);
    }
    if (/-Encoding\s+utf8NoBOM\b/i.test(code)) {
      findings.push(`${file}:${i + 1}  -Encoding utf8NoBOM — PowerShell 7 only. Use [System.IO.File]::WriteAllText with UTF8Encoding($false).`);
    }

    /* 3. A BOM in a file something will JSON.parse. Under 5.1, -Encoding UTF8 writes one, and
     *    JSON.parse rejects a leading BOM outright — so a script that writes .json this way
     *    produces files no reader in this repository can load. */
    if (/(Set-Content|Out-File|Add-Content)\b/.test(code) && /-Encoding\s+UTF8\b/i.test(code)) {
      const window = lines.slice(Math.max(0, i - 6), i + 2).join('\n');
      if (/\.json/i.test(window)) {
        findings.push(`${file}:${i + 1}  writing JSON with -Encoding UTF8 — 5.1 emits a BOM and JSON.parse rejects it. Use [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false))).`);
      }
    }
  }
}

ok('no PowerShell 7-only syntax in scripts that must run on 5.1', findings.length === 0, findings.join('\n     '));

/* The lint has to be able to fail, or a green result means nothing. */
const bait = [
  '$wf = if ($a) { 1 }',
  '      elseif ($b) { 2 }',
  '      else { 3 }',
].join('\n');
let baitCaught = false;
{
  const lines = bait.split('\n');
  const code = stripLiterals(lines[0]);
  if (/=\s*(if|switch)\s*[\(\{]/.test(code)) {
    const next = (lines[1] || '').trim();
    if (/^(elseif|else)\b/.test(next)) baitCaught = true;
  }
}
ok('the check actually detects the construct that broke', baitCaught);

console.log(failed ? `\n❌ ${failed} failed` : '\n✅ all passed');
process.exit(failed ? 1 : 0);
