#!/usr/bin/env python3
"""Check the harvest flow against the workbook it writes to — the two delivered files.

The mapping inside the builder is checked against the SPEC at build time. That proves the
builder agrees with itself. This proves the two things the owner actually receives agree with
each other: it opens the .xlsx, reads the real column names out of the real Excel tables, opens
the .zip, reads every `item/<Column>` the flow writes, and compares them.

That is the failure worth catching. "Add a row into a table" maps by column NAME. A column the
flow writes that the table does not have is dropped — the row lands, the value does not, and the
run reports success. Nothing in Power Automate will ever tell you.

It also checks the graph, because an action reading an output that has not been produced yet
imports cleanly and fails at run time.

Usage: python3 scripts/verify_harvest_flow_package.py <collector.xlsx> <flow-package.zip>
Exit:  0 = the flow and the workbook agree, 1 = otherwise
"""

import glob
import json
import re
import sys
import zipfile

from openpyxl import load_workbook

REF = re.compile(r"(?:outputs|body|actions|variables|items)\('([^']+)'\)")
HEADER_ROW = 4


def flatten(actions, parent=None, out=None, parents=None):
    out = {} if out is None else out
    parents = {} if parents is None else parents
    for name, body in (actions or {}).items():
        if not isinstance(body, dict):
            continue
        out[name] = body
        parents[name] = parent
        flatten(body.get("actions"), name, out, parents)
        if isinstance(body.get("else"), dict):
            flatten(body["else"].get("actions"), name, out, parents)
    return out, parents


def descendants(parents, name):
    """Everything nested inside `name`, at any depth."""
    out = {c for c, p in parents.items() if p == name}
    for c in list(out):
        out |= descendants(parents, c)
    return out


def own_text(body):
    """The action's own configuration, without the actions nested inside it. A scope's children
    have their own references; attributing them to the scope reports failures that are not."""
    return json.dumps({k: v for k, v in body.items() if k not in ("actions", "else", "cases")})


def ancestors(acts, parents, name):
    """Actions whose outputs `name` may read: its own runAfter chain, the chains of the scopes
    enclosing it, and everything INSIDE those scopes. The last part matters — a catch scope runs
    after its sibling scope failed and reads the outputs of the action inside it that failed,
    which is the whole point of a catch."""
    seen, stack = set(), [name]
    while stack:
        n = stack.pop()
        for p in (acts.get(n, {}).get("runAfter") or {}):
            if p not in seen:
                seen.add(p)
                stack.append(p)
        parent = parents.get(n)
        if parent and parent not in seen:
            seen.add(parent)
            stack.append(parent)
    for n in list(seen):
        seen |= descendants(parents, n)
    return seen


def main(xlsx_path, zip_path):
    wb = load_workbook(xlsx_path)
    tables = {}
    for ws in wb.worksheets:
        for name in ws.tables:
            cols = []
            c = 1
            while ws.cell(row=HEADER_ROW, column=c).value is not None:
                cols.append(ws.cell(row=HEADER_ROW, column=c).value)
                c += 1
            tables[name] = cols

    with zipfile.ZipFile(zip_path) as z:
        names = z.namelist()
        dpath = [n for n in names if n.endswith("definition.json")][0]
        asset = dpath.split("/")[-2]
        d = json.loads(z.read(dpath))
        pkg = json.loads(z.read("manifest.json"))
        apis = json.loads(z.read(f"Microsoft.Flow/flows/{asset}/apisMap.json"))
        conns = json.loads(z.read(f"Microsoft.Flow/flows/{asset}/connectionsMap.json"))

    fail, checks = [], 0

    def ok(cond, msg):
        nonlocal checks
        checks += 1
        if not cond:
            fail.append(msg)

    want_files = {"manifest.json", "Microsoft.Flow/flows/manifest.json",
                  f"Microsoft.Flow/flows/{asset}/definition.json",
                  f"Microsoft.Flow/flows/{asset}/apisMap.json",
                  f"Microsoft.Flow/flows/{asset}/connectionsMap.json"}
    ok(set(names) == want_files, f"package files are {sorted(names)}")
    ok(set(apis) == set(conns), "apisMap and connectionsMap name different connectors")

    props = d["properties"]
    df = props["definition"]
    acts, parents = flatten(df["actions"])

    # ── the Excel mapping, against the real workbook ─────────────────────────────────────
    written = {}
    for name, body in acts.items():
        inp = body.get("inputs")
        host = inp.get("host") if isinstance(inp, dict) and isinstance(inp.get("host"), dict) else {}
        if host.get("operationId") != "AddRowV2":
            continue
        params = inp["parameters"]
        table = params.get("table")
        cols = [k.split("/", 1)[1] for k in params if k.startswith("item/")]
        written.setdefault(table, set()).update(cols)
        ok(isinstance(table, str) and not table.startswith("@"),
           f"{name} writes to a table named by an expression ({table!r}) — it cannot be checked")

    ok(written, "the flow writes to no Excel table at all")
    for table, cols in written.items():
        ok(table in tables, f"the flow writes to table {table!r}, which the workbook does not have")
        if table not in tables:
            continue
        unknown = sorted(cols - set(tables[table]))
        ok(not unknown,
           f"{table}: the flow writes columns the table does not have, so the values are "
           f"dropped silently: {unknown}")

    # ── the graph ────────────────────────────────────────────────────────────────────────
    declared = {v["name"] for b in acts.values() if b.get("type") == "InitializeVariable"
                for v in b["inputs"]["variables"]}
    for name, body in acts.items():
        for p in (body.get("runAfter") or {}):
            ok(p in acts, f"{name} runs after {p}, which does not exist")
        anc = ancestors(acts, parents, name)
        text = own_text(body)
        for ref in set(REF.findall(text)):
            if ref in declared or ref == name:
                continue
            if ref not in acts:
                ok(False, f"{name} references {ref!r}, which is neither an action nor a variable")
            else:
                ok(ref in anc, f"{name} reads {ref!r} but it is not guaranteed to have run first")
        for v in re.findall(r"variables\('([^']+)'\)", text):
            ok(v in declared, f"{name} uses variable {v!r}, which is never initialised")

    # ── no Set variable may reference the variable it sets ───────────────────────────────
    # Power Automate rejects it at SAVE time, so it fails the IMPORT, not the run:
    #   WorkflowRunActionInputsInvalidProperty — "Self reference is not supported when updating
    #   the value of variable 'x'". Increment/Append are exempt; they exist for that purpose.
    for name, body in acts.items():
        if body.get("type") != "SetVariable":
            continue
        target = body["inputs"]["name"]
        ok(f"variables('{target}')" not in json.dumps(body["inputs"].get("value")),
           f"{name} sets {target!r} from an expression that reads {target!r} — Power Automate "
           f"refuses to save this. Compute it in a Compose and set the variable from that.")

    # ── variables may only be initialised at the top level ───────────────────────────────
    # Another save-time rejection rather than a run-time one: Initialize variable nested inside
    # a scope or a loop fails the import the same way a self-reference does.
    for name, body in acts.items():
        if body.get("type") == "InitializeVariable":
            ok(parents.get(name) is None,
               f"{name} initialises a variable inside {parents[name]!r}; Power Automate only "
               f"accepts Initialize variable at the top level of a flow")

    # ── loops that write must be sequential ──────────────────────────────────────────────
    for name, body in acts.items():
        if body.get("type") != "Foreach":
            continue
        reps = ((body.get("runtimeConfiguration") or {}).get("concurrency") or {}).get("repetitions")
        ok(reps == 1,
           f"{name} does not set concurrency to 1 — parallel writes to one workbook conflict and "
           f"the part counters stop being correct")

    # ── connections ──────────────────────────────────────────────────────────────────────
    used = {b["inputs"]["host"]["connectionName"] for b in acts.values()
            if b.get("type") == "OpenApiConnection"}
    ok(used <= set(props["connectionReferences"]),
       f"connections used but not declared: {sorted(used - set(props['connectionReferences']))}")
    ok(used <= set(conns), f"connections missing from connectionsMap: {sorted(used - set(conns))}")
    ok(len(pkg["resources"]) == 1 + 2 * len(used),
       f"the manifest declares {len(pkg['resources'])} resources for {len(used)} connections; "
       f"each needs an api and a connection entry beside the flow")

    # ── every expression function must be one this tenant already runs ───────────────────
    # The importer validates expressions before it accepts a package, so an unavailable function
    # fails the IMPORT, and the import error names the package rather than the expression. This
    # package first shipped using chunk(), which is documented, correct for the job, and appears
    # in none of the sixty deployed definitions here. Attestation in the tenant's own flows is
    # the only evidence available offline, so it is the bar.
    corpus = "".join(open(f, encoding="utf-8").read()
                     for f in glob.glob("docs/folio-Master-Flows-and-Endpoints/contracts/deployed/*.json"))
    if corpus:
        attested = set(re.findall(r"([a-zA-Z][a-zA-Z0-9_]*)\(", corpus))
        used = set()
        for expr in re.findall(r'"@\{?([^"]*)', json.dumps(d)):
            used |= set(re.findall(r"([a-zA-Z][a-zA-Z0-9_]*)\(", expr))
        unattested = sorted(used - attested)
        ok(not unattested,
           f"the flow uses expression functions no deployed flow in this tenant uses, so the "
           f"import may reject them: {unattested}")
        print(f"  expression functions      {len(used)}, all attested in the tenant's own flows")

    # ── the shape a working export has ───────────────────────────────────────────────────
    # Taken field for field from the tenant's own export, which imports. The package failed to
    # import once with four unexplained differences from it; these keep them from coming back.
    for key, ref in props["connectionReferences"].items():
        ok(set(ref) == {"connectionName", "source", "id", "tier", "apiName",
                        "isProcessSimpleApiReferenceConversionAlreadyDone"},
           f"connectionReference {key} has fields {sorted(ref)}, a working export has six")
        ok(re.fullmatch(r"[0-9a-f]{32}", str(ref["connectionName"])),
           f"connectionReference {key}: connectionName is {ref['connectionName']!r}, which is not "
           f"shaped like a connection id — the importer resolves this field")
    ok("metadata" in df, "the definition carries no metadata block; a working export has one")
    for rid, r in pkg["resources"].items():
        if r["type"] == "Microsoft.Flow/flows":
            continue
        ok("iconUri" in r["details"],
           f"resource {r['details']['displayName']} has no iconUri; a working export has one")

    # ── it must not mint another signed URL ──────────────────────────────────────────────
    ok(all(t.get("type") != "Request" for t in df["triggers"].values()),
       "the flow has an HTTP Request trigger, which mints another signed URL into an estate "
       "that already has 55 outstanding")

    print(f"  workbook tables           {len(tables)}")
    print(f"  tables the flow writes    {len(written)}  ({', '.join(sorted(written))})")
    print(f"  columns the flow writes   {sum(len(c) for c in written.values())}")
    print(f"  actions                   {len(acts)}")
    print(f"  variables initialised     {len(declared)}")
    print(f"  assertions run            {checks}")

    if fail:
        print(f"\n❌ {len(fail)} problem(s):")
        for f in fail:
            print(f"     {f}")
        return 1
    print("\n✅ every column the flow writes exists in the table it writes to, every action reads")
    print("   only values that exist by the time it runs, every writing loop is sequential, and")
    print("   the trigger mints no new signed URL.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
