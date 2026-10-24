#!/usr/bin/env python3
"""Prove the workbook holds every value the model does, unaltered.

The claim this workbook makes is that nothing was filtered, shortened, summarised or
reformatted. That claim cannot be checked by looking at it: a truncated JSON body and a whole
one look identical in a narrow column, and a value Excel coerced into a date reads as a
plausible date. So this reads the delivered .xlsx back and compares it, cell by cell, against
the model it was built from.

Continuation columns are REASSEMBLED before comparison. A value split across three cells must
concatenate back to exactly the original — that is what makes the split lossless rather than
merely tidy.

ONE normalisation is accepted, by name and with a count: the spreadsheet format stores a line
break as LF, so a value carrying CRLF comes back with LF. Nothing is dropped or shortened by
it. Every other difference — a character lost, a value coerced, a cell reformatted — fails.
The accepted case is narrow on purpose: an allowance wide enough to hide a truncation would
defeat the point of running this at all.

Usage: python3 scripts/verify_endpoint_workbook.py <model.json> <workbook.xlsx>
Exit:  0 = every value survived intact, 1 = otherwise
"""

import json
import sys

from openpyxl import load_workbook

CELL_LIMIT = 32767
HEADER_ROW = 4


def main(model_path, xlsx_path):
    model = json.load(open(model_path, encoding="utf-8"))
    wb = load_workbook(xlsx_path, data_only=False)

    failures = []
    checked = 0
    split_values = 0
    longest = 0
    crlf_normalised = 0

    for sheet in model["sheets"]:
        name = sheet["name"][:31]
        if name not in wb.sheetnames:
            failures.append(f"{name}: sheet missing from the workbook")
            continue
        ws = wb[name]

        # Rebuild the column layout the renderer produced, including continuations.
        extra = {}
        for r in sheet["rows"]:
            for i, v in enumerate(r):
                if isinstance(v, str) and len(v) > CELL_LIMIT:
                    extra[i] = max(extra.get(i, 1), -(-len(v) // CELL_LIMIT))

        header = [ws.cell(row=HEADER_ROW, column=c).value for c in range(1, ws.max_column + 1)]
        expected_cols = sum(extra.get(i, 1) for i in range(len(sheet["columns"])))
        if len([h for h in header if h]) != expected_cols:
            failures.append(f"{name}: header has {len([h for h in header if h])} columns, expected {expected_cols}")

        if len(sheet["rows"]) != ws.max_row - HEADER_ROW:
            failures.append(f"{name}: {ws.max_row - HEADER_ROW} data rows, model has {len(sheet['rows'])}")

        for ri, row in enumerate(sheet["rows"], start=HEADER_ROW + 1):
            col = 1
            for i, want in enumerate(row):
                parts = extra.get(i, 1)
                got = ""
                for p in range(parts):
                    cell = ws.cell(row=ri, column=col + p).value
                    got += "" if cell is None else str(cell)
                col += parts
                checked += 1
                if isinstance(want, str):
                    if len(want) > CELL_LIMIT:
                        split_values += 1
                    longest = max(longest, len(want))
                    if got != want and got == want.replace("\r\n", "\n").replace("\r", "\n"):
                        crlf_normalised += 1
                    elif got != want:
                        failures.append(
                            f"{name} r{ri} c{col - parts} ({sheet['columns'][i]}): "
                            f"{len(want)} chars in, {len(got)} out"
                            + ("  [TRUNCATED]" if got == want[:len(got)] and len(got) < len(want) else "  [ALTERED]"))
                else:
                    if str(got) != str(want):
                        failures.append(f"{name} r{ri} c{col - parts} ({sheet['columns'][i]}): {want!r} != {got!r}")

    print(f"  cells compared            {checked}")
    print(f"  values needing a split    {split_values}")
    print(f"  longest single value      {longest} chars (cell limit is {CELL_LIMIT})")
    print(f"  sheets in workbook        {len(wb.sheetnames)}")
    print(f"  CRLF normalised to LF     {crlf_normalised}  (the spreadsheet format stores line breaks as LF)")

    if failures:
        print(f"\n❌ {len(failures)} value(s) do not match the model:")
        for f in failures[:25]:
            print(f"     {f}")
        if len(failures) > 25:
            print(f"     … and {len(failures) - 25} more")
        return 1

    print("\n✅ every value in the model is present in the workbook, character for character,")
    print("   including the ones split across continuation columns. The only difference anywhere")
    print(f"   is {crlf_normalised} value(s) whose CRLF line break is stored as LF by the file format.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
