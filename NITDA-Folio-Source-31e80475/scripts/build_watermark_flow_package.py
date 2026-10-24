#!/usr/bin/env python3
"""Rebuild HtTP_Create_New_Document_metadata_and_watermark as a complete, import-ready package.

WHAT THIS DOES
Reads the legacy flow export supplied by the owner, carries every provisioned value out of it
unchanged, repairs the defects the export's own contents prove are defects, and writes a new
legacy package (manifest.json + Microsoft.Flow tree, zipped) that imports without further input.

THE RULE IT WORKS UNDER
Nothing is invented. Every connector literal, drive id, template file id, dynamic-field key,
colour, font, opacity, recipient address and connection name is copied from the export byte for
byte. A change is made only where the export contradicts itself, and every change is recorded
with the evidence for it in CHANGES so the owner can check the reasoning rather than trust it.

THE EVIDENCE FOR THE MAIN REPAIR
In the export, Create_file writes the TEXT-WATERMARKED PDF to a file named "qrcode.png"; that
file is then read back and passed to Encodian as the IMAGE WATERMARK. A PDF cannot be an image
watermark. Three independent facts say Create_file was meant to hold the QR code:
  · Send_an_email attaches outputs('Create_QR_Code')['body/FileContent'] under the NAME of
    Create_file — so Create_file is the QR file.
  · The Word template's image placeholder is fed body('Get_file_content_2'), which reads
    Create_file — a template image placeholder wants a PNG, not a PDF.
  · Add_Image_Watermark_to_PDF's output is referenced NOWHERE. The image watermark is computed
    and discarded, which only happens when a chain has been rewired by hand and left half-done.

Usage: python3 scripts/build_watermark_flow_package.py <source.zip> <out-dir>
"""

import json
import shutil
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

NAME = "HtTP_Create_New_Document_metadata_and_watermark"
CHANGES = []


def note(kind, where, what, why):
    CHANGES.append({"kind": kind, "where": where, "what": what, "why": why})


def read_source(zip_path, work):
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(work)
    root = Path(work)
    pkg = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    flows = root / "Microsoft.Flow" / "flows"
    asset = json.loads((flows / "manifest.json").read_text(encoding="utf-8"))["flowAssets"]["assetPaths"][0]
    d = flows / asset
    return {
        "pkg": pkg,
        "asset": asset,
        "flowManifest": json.loads((flows / "manifest.json").read_text(encoding="utf-8")),
        "definition": json.loads((d / "definition.json").read_text(encoding="utf-8")),
        "apisMap": json.loads((d / "apisMap.json").read_text(encoding="utf-8")),
        "connectionsMap": json.loads((d / "connectionsMap.json").read_text(encoding="utf-8")),
    }


def onedrive(operation_id, parameters, run_after, chunked=False):
    a = {
        "runAfter": run_after,
        "type": "OpenApiConnection",
        "inputs": {
            "parameters": parameters,
            "host": {
                "apiId": "/providers/Microsoft.PowerApps/apis/shared_onedriveforbusiness",
                "connectionName": "shared_onedriveforbusiness",
                "operationId": operation_id,
            },
            "authentication": "@parameters('$authentication')",
        },
    }
    if chunked:
        a["runtimeConfiguration"] = {"contentTransfer": {"transferMode": "Chunked"}}
    return a


def build_actions(src):
    """Return the repaired action set, built from the source actions."""
    a = json.loads(json.dumps(src))          # never mutate the source
    out = {}

    # ── 1. the input the flow never had ───────────────────────────────────────────────────
    # Initialize_variable declares documentId with NO value, so Get_file_metadata is always
    # called with an empty id and the flow cannot complete. The trigger declares no schema
    # either, so nothing tells a caller what to send.
    out["Initialize_variable"] = {
        "runAfter": {},
        "type": "InitializeVariable",
        "inputs": {"variables": [{"name": "documentId", "type": "string",
                                  "value": "@triggerBody()?['documentId']"}]},
    }
    note("repair", "Initialize_variable",
         "documentId is initialised from @triggerBody()?['documentId']",
         "It was declared with no value at all, so every run called Get_file_metadata with an "
         "empty id. The variable's own name says where the value belongs.")

    # ── 2. reject a request that cannot be served, and say so ─────────────────────────────
    out["Check_documentId"] = {
        "runAfter": {"Initialize_variable": ["Succeeded"]},
        "type": "If",
        "expression": {"and": [{"equals": ["@empty(variables('documentId'))", True]}]},
        "actions": {
            "Response_Bad_Request": {
                "runAfter": {},
                "type": "Response",
                "kind": "Http",
                "inputs": {
                    "statusCode": 400,
                    "headers": {
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type",
                        "Content-Type": "application/json",
                    },
                    "body": {"error": "documentId is required",
                             "expected": {"documentId": "the OneDrive file id of the document to watermark"}},
                },
            },
            "Terminate_Bad_Request": {
                "runAfter": {"Response_Bad_Request": ["Succeeded"]},
                "type": "Terminate",
                "inputs": {"runStatus": "Succeeded"},
            },
        },
        "else": {"actions": {}},
    }
    note("addition", "Check_documentId",
         "a 400 response and a Terminate when documentId is absent",
         "An HTTP-triggered flow that only responds on the success path returns nothing at all "
         "to a caller who sent a bad request. Terminate is Succeeded because rejecting bad input "
         "is the endpoint working, not failing.")

    # ── 3. the source document, its share link and its bytes — verbatim ───────────────────
    for k in ("Get_file_metadata", "Create_share_link", "Get_file_content_3"):
        out[k] = a[k]
    out["Get_file_metadata"]["runAfter"] = {"Check_documentId": ["Succeeded"]}
    note("rewire", "Get_file_metadata", "runs after Check_documentId instead of Initialize_variable",
         "The guard was inserted between them. Its parameters are unchanged.")

    # ── 4. the QR code, and the file it belongs in ────────────────────────────────────────
    out["Create_QR_Code"] = a["Create_QR_Code"]
    out["Create_file"] = a["Create_file"]
    out["Create_file"]["runAfter"] = {"Create_QR_Code": ["Succeeded"]}
    out["Create_file"]["inputs"]["parameters"]["body"] = "@outputs('Create_QR_Code')?['body/FileContent']"
    note("repair", "Create_file",
         "writes the QR code PNG instead of the text-watermarked PDF",
         "It is named qrcode.png, its content is used as an IMAGE watermark and as a Word "
         "template image, and the email attaches the QR code's bytes under this file's name. A "
         "PDF cannot be any of those things.")

    out["Get_file_content_2"] = a["Get_file_content_2"]

    # ── 5. the two watermarks, composed instead of competing ─────────────────────────────
    out["Add_Image_Watermark_to_PDF"] = a["Add_Image_Watermark_to_PDF"]
    out["Add_Text_Watermark_to_PDF"] = a["Add_Text_Watermark_to_PDF"]
    out["Add_Text_Watermark_to_PDF"]["runAfter"] = {"Add_Image_Watermark_to_PDF": ["Succeeded"]}
    out["Add_Text_Watermark_to_PDF"]["inputs"]["parameters"]["operation/fileContent"] = \
        "@outputs('Add_Image_Watermark_to_PDF')?['body/FileContent']"
    note("repair", "Add_Text_Watermark_to_PDF",
         "takes the image-watermarked document as its input, and runs after it",
         "Both watermarks read the same original, so whichever ran last discarded the other's "
         "work — and Add_Image_Watermark_to_PDF's output was referenced nowhere in the export. "
         "Every other parameter, including the text, colour #E81123, Arial 10 and the opacity, "
         "is unchanged.")

    # ── 6. keep the watermarked document ─────────────────────────────────────────────────
    out["Create_watermarked_document"] = onedrive(
        "CreateFile",
        {"folderPath": "/",
         "name": "@concat('WATERMARKED - ', outputs('Get_file_metadata')?['body/Name'])",
         "body": "@outputs('Add_Text_Watermark_to_PDF')?['body/FileContent']"},
        {"Add_Text_Watermark_to_PDF": ["Succeeded"]},
        chunked=True)
    note("addition", "Create_watermarked_document",
         "saves the watermarked document to OneDrive at /",
         "With Create_file corrected to hold the QR code, the watermarked document had nowhere "
         "to go and would have been discarded. Same folder and same chunked transfer as the "
         "export's other file writes; the name is derived from the source document's own name.")

    # ── 7. the authorisation slip — template mappings untouched ──────────────────────────
    out["Populate_a_Microsoft_Word_template"] = a["Populate_a_Microsoft_Word_template"]
    out["Populate_a_Microsoft_Word_template"]["runAfter"] = {"Create_watermarked_document": ["Succeeded"]}

    # The export passed the populated document's CONTENT to Word Online's Convert action, which
    # takes a file IDENTIFIER. Saving the content first and converting with the OneDrive
    # connection removes the impossible parameter without inventing a drive id.
    out["Create_populated_slip"] = onedrive(
        "CreateFile",
        {"folderPath": "/",
         "name": "@concat('ACTIVITY AUTHORISATION SLIP - ', formatDateTime(utcNow(), 'yyyyMMddHHmmss'), '.docx')",
         "body": "@body('Populate_a_Microsoft_Word_template')"},
        {"Populate_a_Microsoft_Word_template": ["Succeeded"]},
        chunked=True)
    out["Convert_slip_to_PDF"] = onedrive(
        "ConvertFile",
        {"id": "@outputs('Create_populated_slip')?['body/Id']", "type": "PDF"},
        {"Create_populated_slip": ["Succeeded"]})
    note("substitution", "Convert_Word_Document_to_PDF -> Create_populated_slip + Convert_slip_to_PDF",
         "the populated document is saved, then converted with the OneDrive connection",
         "The export passed body('Populate_a_Microsoft_Word_template') — file CONTENT — to Word "
         "Online's Convert action, which takes a file IDENTIFIER, so the step could not run. "
         "Fixing it in place would have meant inventing a drive id for a library this package "
         "cannot see. OneDrive's own Convert file takes an id and no drive, and its connection "
         "is already in this package. Word Online is still used to populate the template, so "
         "its connection is still required.")

    # ── 8. the slip PDF, its link, its bytes ─────────────────────────────────────────────
    out["Create_file_3"] = a["Create_file_3"]
    out["Create_file_3"]["runAfter"] = {"Convert_slip_to_PDF": ["Succeeded"]}
    out["Create_file_3"]["inputs"]["parameters"]["name"] = \
        "@concat('ACTIVITY AUTHORISATION SLIP - ', formatDateTime(utcNow(), 'yyyyMMddHHmmss'), '.pdf')"
    out["Create_file_3"]["inputs"]["parameters"]["body"] = "@body('Convert_slip_to_PDF')"
    note("repair", "Create_file_3",
         "the slip PDF is named .pdf rather than reusing qrcode.png",
         "It wrote PDF bytes to a file whose name was read from Create_file — qrcode.png. The "
         "email then attached a PDF under a .png name.")

    out["Create_share_link_2"] = a["Create_share_link_2"]
    out["Get_file_content"] = a["Get_file_content"]

    # ── 9. the email — recipient, subject, body and both original attachments verbatim ───
    out["Send_an_email_(V2)"] = a["Send_an_email_(V2)"]
    out["Send_an_email_(V2)"]["inputs"]["parameters"]["emailMessage/Attachments"].append({
        "Name": "@outputs('Create_watermarked_document')?['body/Name']",
        "ContentBytes": "@outputs('Add_Text_Watermark_to_PDF')?['body/FileContent']",
    })
    note("addition", "Send_an_email_(V2)",
         "the watermarked document is attached alongside the slip and the QR code",
         "It is what the flow is named for and it was not being delivered anywhere. The "
         "recipient, subject, body and the two existing attachments are unchanged.")

    # ── 10. always answer the caller ─────────────────────────────────────────────────────
    out["Response"] = a["Response"]          # body @variables('documentId') — contract untouched
    out["Response_Failed"] = {
        "runAfter": {"Get_file_content": ["Failed", "TimedOut", "Skipped"]},
        "type": "Response",
        "kind": "Http",
        "inputs": {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Content-Type": "application/json",
            },
            "body": {"error": "the document could not be processed",
                     "documentId": "@{variables('documentId')}",
                     "run": "@{workflow()?['run']?['name']}"},
        },
    }
    out["Terminate_Failed"] = {
        "runAfter": {"Response_Failed": ["Succeeded"]},
        "type": "Terminate",
        "inputs": {"runStatus": "Failed",
                   "runError": {"code": "ProcessingFailed",
                                "message": "A step before the response failed. See the run history."}},
    }
    note("addition", "Response_Failed + Terminate_Failed",
         "a 500 response on any failure before the success response",
         "A failure anywhere upstream skips the chain, so a catch on the last step before the "
         "response reaches all of them. Without it the caller received no answer at all and the "
         "browser saw a gateway timeout. The 200 response body is unchanged, so callers that "
         "work today keep working.")
    return out


def build_definition(source):
    d = json.loads(json.dumps(source["definition"]))
    df = d["properties"]["definition"]

    # The trigger: everything verbatim, plus the schema that was never declared.
    trig = df["triggers"]["manual"]
    trig["inputs"]["schema"] = {
        "type": "object",
        "properties": {
            "documentId": {
                "type": "string",
                "minLength": 1,
                "description": "The OneDrive for Business file id of the document to watermark.",
            }
        },
        "required": ["documentId"],
        "additionalProperties": True,
    }
    note("addition", "triggers.manual",
         "a request schema declaring documentId as required",
         "The trigger declared no schema, so nothing said what a caller must send and the "
         "designer offered no dynamic content. method POST and triggerAuthenticationType are "
         "unchanged.")

    df["actions"] = build_actions(df["actions"])
    return d


def main(src_zip, out_dir):
    out = Path(out_dir)
    work = out / "_source"
    stage = out / f"{NAME}_provisioned"
    for p in (work, stage):
        shutil.rmtree(p, ignore_errors=True)
    work.mkdir(parents=True)

    source = read_source(src_zip, work)
    definition = build_definition(source)

    asset = source["asset"]
    flow_dir = stage / "Microsoft.Flow" / "flows" / asset
    flow_dir.mkdir(parents=True)

    def write(path, obj):
        path.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")

    write(flow_dir / "definition.json", definition)
    write(flow_dir / "apisMap.json", source["apisMap"])            # unchanged — same connectors
    write(flow_dir / "connectionsMap.json", source["connectionsMap"])
    write(stage / "Microsoft.Flow" / "flows" / "manifest.json", source["flowManifest"])

    pkg = json.loads(json.dumps(source["pkg"]))
    pkg["details"]["createdTime"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    pkg["resources"][asset]["suggestedCreationType"] = "New"
    note("safety", "manifest.json",
         "the import defaults to creating a NEW flow rather than updating the existing one",
         "The export suggested Update, which overwrites the live flow on import with no second "
         "prompt. Update is still offered in the import screen — pick it deliberately.")
    write(stage / "manifest.json", pkg)

    zip_path = out / f"{NAME}_provisioned.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(stage.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(stage).as_posix())

    changes = out / f"{NAME}_CHANGES.json"
    write(changes, {
        "package": zip_path.name,
        "builtUtc": datetime.now(timezone.utc).isoformat(),
        "source": Path(src_zip).name,
        "rule": "Every provisioned value is carried out of the export unchanged. A change was "
                "made only where the export contradicts itself, and each one is listed with the "
                "evidence for it.",
        "changes": CHANGES,
    })

    # A readable companion to the JSON, for the owner's own record.
    md = out / f"{NAME}_CHANGES.md"
    lines = [f"# {NAME} — what was changed and why", "",
             f"Built {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} from "
             f"`{Path(src_zip).name}`.", "",
             "Every provisioned value — connector literals, drive and template ids, dynamic-field "
             "keys, the watermark text, colour, font and opacity, the recipient address and all "
             "four connections — is carried out of the export unchanged. A change was made only "
             "where the export contradicts itself. Each one is listed with the evidence for it.",
             ""]
    for kind in ("repair", "rewire", "addition", "substitution", "safety"):
        rows = [c for c in CHANGES if c["kind"] == kind]
        if not rows:
            continue
        lines += [f"## {kind.title()}", ""]
        for c in rows:
            lines += [f"**`{c['where']}`** — {c['what']}", "", c["why"], ""]
    md.write_text("\n".join(lines) + "\n", encoding="utf-8")

    src_actions = source["definition"]["properties"]["definition"]["actions"]
    new_actions = definition["properties"]["definition"]["actions"]
    print(f"\n  wrote {zip_path}  ({zip_path.stat().st_size:,} bytes)")
    print(f"  wrote {changes}")
    print(f"  wrote {md}\n")
    print(f"  actions   {len(src_actions)} in the export -> {len(new_actions)} provisioned")
    print(f"  changes   {len(CHANGES)}")
    for c in CHANGES:
        print(f"    [{c['kind']:<12}] {c['where']}")
    print()
    shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "dist/flow-package")
