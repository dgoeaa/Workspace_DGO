#!/usr/bin/env python3
"""Check the rebuilt package before anyone imports it.

Three classes of mistake are possible in a rebuild like this, and none of them shows up until
the flow is in the tenant:

  · A STRUCTURAL mistake — a missing file, a broken map — and the import fails.
  · A GRAPH mistake — an action reading the output of one that has not run yet, or has been
    renamed. Power Automate accepts the import and the flow fails at run time. This is what the
    original export suffered from, so a rebuild that reintroduced it would be worthless.
  · A FIDELITY mistake — a provisioned value silently altered. The flow runs and does something
    subtly different: a different recipient, a different watermark, a different template.

So this checks all three, against the SOURCE package rather than against the builder's own idea
of what it did.

Usage: python3 scripts/verify_watermark_flow_package.py <source.zip> <built.zip>
Exit:  0 = safe to import, 1 = otherwise
"""

import json
import re
import sys
import zipfile

REF = re.compile(r"(?:outputs|body|actions)\('([^']+)'\)")


def load(zip_path):
    with zipfile.ZipFile(zip_path) as z:
        names = z.namelist()
        flows = [n for n in names if n.endswith("definition.json")][0]
        asset = flows.split("/")[-2]
        rd = lambda n: json.loads(z.read(n).decode("utf-8"))
        return {
            "names": names,
            "asset": asset,
            "pkg": rd("manifest.json"),
            "definition": rd(flows),
            "apisMap": rd(f"Microsoft.Flow/flows/{asset}/apisMap.json"),
            "connectionsMap": rd(f"Microsoft.Flow/flows/{asset}/connectionsMap.json"),
        }


def ancestors(actions, name, seen=None):
    """Every action that must finish before `name` starts."""
    seen = seen if seen is not None else set()
    for parent in (actions.get(name, {}).get("runAfter") or {}):
        if parent not in seen:
            seen.add(parent)
            ancestors(actions, parent, seen)
    return seen


def flatten(actions, prefix=""):
    """Actions at every nesting level, keyed by name (names are global in a definition)."""
    flat = {}
    for k, v in actions.items():
        flat[k] = v
        for branch in ("actions",):
            if isinstance(v.get(branch), dict):
                flat.update(flatten(v[branch], k))
        if isinstance(v.get("else"), dict) and isinstance(v["else"].get("actions"), dict):
            flat.update(flatten(v["else"]["actions"], k))
    return flat


def main(src_zip, built_zip):
    src, got = load(src_zip), load(built_zip)
    fail, checks = [], 0

    def ok(cond, msg):
        nonlocal checks
        checks += 1
        if not cond:
            fail.append(msg)

    # ── structure ─────────────────────────────────────────────────────────────────────────
    asset = got["asset"]
    want_files = {
        "manifest.json",
        "Microsoft.Flow/flows/manifest.json",
        f"Microsoft.Flow/flows/{asset}/definition.json",
        f"Microsoft.Flow/flows/{asset}/apisMap.json",
        f"Microsoft.Flow/flows/{asset}/connectionsMap.json",
    }
    ok(set(got["names"]) == want_files,
       f"package files are {sorted(got['names'])}, a legacy package needs exactly {sorted(want_files)}")
    ok(asset == src["asset"], "the flow asset id changed, so the package manifest no longer addresses it")
    ok(got["apisMap"] == src["apisMap"], "apisMap changed")
    ok(got["connectionsMap"] == src["connectionsMap"], "connectionsMap changed")
    ok(set(got["pkg"]["resources"]) == set(src["pkg"]["resources"]),
       "the manifest's resources changed, so a connection would be prompted for or lost")

    sp = src["definition"]["properties"]
    gp = got["definition"]["properties"]
    ok(gp["connectionReferences"] == sp["connectionReferences"],
       "connectionReferences changed — the import would ask for different connections")
    ok(gp["displayName"] == sp["displayName"], "displayName changed")
    ok(gp["apiId"] == sp["apiId"], "apiId changed")

    sdf, gdf = sp["definition"], gp["definition"]
    ok(gdf["$schema"] == sdf["$schema"], "definition $schema changed")
    ok(gdf["contentVersion"] == sdf["contentVersion"], "contentVersion changed")
    ok(gdf["parameters"] == sdf["parameters"], "definition parameters changed")

    # ── the trigger keeps its posture ─────────────────────────────────────────────────────
    st, gt = sdf["triggers"]["manual"], gdf["triggers"]["manual"]
    for k in ("type", "kind"):
        ok(st[k] == gt[k], f"trigger {k} changed")
    for k in ("method", "triggerAuthenticationType"):
        ok(st["inputs"].get(k) == gt["inputs"].get(k),
           f"trigger {k} changed from {st['inputs'].get(k)!r} to {gt['inputs'].get(k)!r}")
    ok("schema" in gt["inputs"], "the trigger still declares no request schema")

    # ── the graph ─────────────────────────────────────────────────────────────────────────
    acts = flatten(gdf["actions"])
    known = set(acts)
    for name, body in acts.items():
        for parent in (body.get("runAfter") or {}):
            ok(parent in known, f"{name} runs after {parent}, which does not exist")
        anc = ancestors(acts, name)
        for ref in set(REF.findall(json.dumps(body))):
            if ref == name or ref not in known:
                ok(ref in known, f"{name} reads outputs('{ref}'), which does not exist")
                continue
            # A reference inside a nested branch is reached through its parent scope.
            ok(ref in anc or ref in ancestors(acts, next((p for p, v in acts.items()
                                                          if name in flatten(v.get("actions", {}))), name)),
               f"{name} reads outputs('{ref}') but {ref} is not guaranteed to have run first")

    starts = [n for n, b in acts.items() if not (b.get("runAfter") or {})]
    ok(len(starts) >= 1, "no action starts the flow")

    # An action whose output nobody reads is work computed and thrown away — precisely the
    # defect in the export, where Add_Image_Watermark_to_PDF was watermarked and discarded.
    # Exempt only the actions that exist FOR their side effect rather than their output.
    doc = json.dumps(gdf["actions"])
    terminal_types = {"Response", "Terminate", "InitializeVariable", "SetVariable", "If", "Scope"}
    side_effect_ops = {"SendEmailV2"}
    orphans = [n for n, b in acts.items()
               if b.get("type") not in terminal_types
               and (b.get("inputs", {}).get("host", {}) or {}).get("operationId") not in side_effect_ops
               and not re.search(r"(?:outputs|body)\('" + re.escape(n) + r"'\)", doc)]
    ok(not orphans, f"these actions produce output nobody reads: {orphans}")

    # ── connections ───────────────────────────────────────────────────────────────────────
    used = {b["inputs"]["host"]["connectionName"] for b in acts.values()
            if b.get("type") == "OpenApiConnection"}
    ok(used <= set(gp["connectionReferences"]),
       f"actions use connections not in connectionReferences: {sorted(used - set(gp['connectionReferences']))}")
    ok(used <= set(got["connectionsMap"]),
       f"actions use connections absent from connectionsMap: {sorted(used - set(got['connectionsMap']))}")

    # ── fidelity: every provisioned literal survives ──────────────────────────────────────
    # Pulled out of the SOURCE definition, not typed here, so the check cannot drift from it.
    def literals(node, out):
        if isinstance(node, dict):
            for k, v in node.items():
                if k in ("metadata", "runAfter"):
                    continue
                literals(v, out)
        elif isinstance(node, list):
            for v in node:
                literals(v, out)
        elif isinstance(node, str) and len(node) >= 8 and not node.startswith("@"):
            out.add(node)
        return out

    provisioned = literals(sdf["actions"], set())
    kept = literals(gdf["actions"], set())
    # The two values the rebuild deliberately drops, both recorded in CHANGES: the Word Online
    # convert operation that could not run, and the drive id that only that operation addressed.
    replaced = {"GetFilePDF", "b!8kLhzz4nN02YpdEzRVmW6X11Y3CFDKtEsKUc7X0pIVvLAGclntvmSILjAxEFt11K"}
    missing = sorted(provisioned - replaced - kept)
    ok(not missing, f"provisioned values lost in the rebuild: {missing[:8]}")

    print(f"  source actions            {len(flatten(sdf['actions']))}")
    print(f"  provisioned actions       {len(acts)}")
    print(f"  provisioned literals kept {len(provisioned - replaced) - len(missing)} of {len(provisioned - replaced)}")
    print(f"  connections referenced    {len(used)}")
    print(f"  assertions run            {checks}")

    if fail:
        print(f"\n❌ {len(fail)} problem(s):")
        for f in fail:
            print(f"     {f}")
        return 1
    print("\n✅ the package is well formed, every action reads only outputs that are guaranteed")
    print("   to exist by the time it runs, no action's work is discarded, the four connections")
    print("   are unchanged, and every provisioned value survives verbatim.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
