# Organisational structure revalidation — 26 Sep 2026

Sources, and nothing else:

- **List export.** `Organizaitonal_Departments_Information` (site NITDADGO-EAAACTIVITYTRACKING,
  list 8aab9c4e), 50 rows, exported 26 Sep 2026 with its column schema.
- **Memo.** HRM internal memo NITDA/HQ/NB/105, 11 Sep 2026, *Management approval of changes to
  the Agency's organisational structure and re-deployment of some Directors*.
- **Baseline.** `docs/reference/approved/organizational-units.csv` →
  `config/organizational-units.config.js` (50 units), `docs/reference/directorate-aliases.csv`,
  and the deployed flow definitions under `docs/folio-Master-Flows-and-Endpoints/contracts/deployed/`.

No personal address or name is recorded here. People are resolved from DGO_UserDirectory.

## 1. List export against the approved units

| Check | Result |
|---|---|
| Unit keys (DSU_KEY) | 50 = 50. None added, none missing. |
| Titles, unit mailboxes, headship types, head titles | Identical. |
| Head mailbox (DSU_HeadEmail) | Identical for 35 units. The other 15 differ only where the approved config deliberately left the address blank (see below). |

The matrix's approved side (50 unit keys) is therefore current. All 27 owner mappings, and the memo
alias added below, point to keys that exist in the list.

**Addresses left blank in the config.** `scripts/build-org-routing.mjs` admits only a unit-key
mailbox, a generic office name, or one of those behind a headship prefix.

| Unit | List value | Why it is not admitted | Finding |
|---|---|---|---|
| ITD head | `DIT@` | `IT` is not a unit key (the key is `ITD`) | Role mailbox, refused by the rule. Needs an owner decision. |
| SWZO head | `hszwo@` | `ZWO` is not a unit key | Probably a transposition of `hswzo@`. The list owner should confirm. |
| EA, EAA, PA, SA-×9, CP, DNCE | personal mailboxes | They name a person | Correctly left blank. |

## 2. Defect found: the flows read the Departments and Categories columns by the wrong name

Both lists were imported from spreadsheets, so SharePoint gave their columns the internal names
`field_1`…`field_N`. The connector returns internal names only.

| List | Evidence | Internal names |
|---|---|---|
| Departments | The export's own schema | `field_1` DSU_KEY · `field_2` DSU_Email · `field_3` DSU_HeadEmail · `field_4` headship type · `field_5` head's personal email · `field_6` DSU_HeadTitle |
| Categories | Every deployed reader of f64c8b65 (12 definitions) | `field_1` Category Code · `field_2` Subcategory · `field_3` SubCategory Code · `field_4` Default Primary Responsible · `field_6`–`8` INFORMDSU1–3 · `field_9` Timeline · `field_14` Priority |

The generated DGO_FETCH_ALL and DGO_REFERENCE_DATA read `DSU_KEY`, `DSU_Email`, `Category`,
`Subcategory`, `Priority` and similar display names. Every department and category would have
reached the platform empty, so routing had no unit keys.

**Fixed** in `scripts/build-internal-designer-paste.mjs`, and both packages are regenerated:

- Departments are read from `field_1/2/3/6`. The head's personal address (`field_5`) is not
  served.
- Categories are read from `field_1…9, 14`. They now serve every key that `normalizeCategory`
  reads: codes, primary, supporting, INFORMDSU1–3, priority and timeline.

**Corrected against the deployed flows:**

- `DSU_KEY` for a category is `field_4` (Default Primary Responsible), as in
  `config/category-matrix.config.js`. The deployed flows read `field_3`, which is the subcategory
  code.
- Supporting is `field_5`. The deployed flows disagree (6 read `field_5`, 6 read `field_6`), and
  `field_6` is INFORMDSU1.

**Related client fix** in `core/domain.js`: `normalizeCategory` passed the array index into
`text()`, so an empty INFORMDSU slot arrived as "0", "1" or "2".

**Regression test:** `tests/directory-served-shape.test.mjs` now runs both packages over rows shaped
like this export.

## 3. The memo against the list and the baseline

| Memo item | In the list today | Effect on the platform | Action |
|---|---|---|---|
| New **Compliance & Supervision Department (CSP)**, acting head | Absent | No key, so nothing can be routed or mapped to it | **Owner:** add the CSP row (DSU_KEY, unit mailbox, head mailbox `DCSP@`?, headship Acting, head title) to the list and the approved CSV. |
| **Stakeholder Management & Partnership (SMP)** absorbed into Special Duties | SMP still a unit | The category matrix routes 2 subcategories to SMP: GOV/STE StakeHolder Engagements and GOV/IAC Inter Agency Collaborations | **Owner:** re-point these 2 rows to SDO, or keep SMP. Memo §5 says to keep existing arrangements until further notice. |
| **Special Duties Directorate** (list: "Special Duties Office") | SDO | A Microsoft 365 department named "Special Duties Directorate" would have fallen to Unassigned | **Done:** alias `Special Duties Directorate → SDO` added (basis: the memo). |
| New Directors for Cybersecurity, Administration & General Services and Special Duties | Head mailboxes are role mailboxes (DCS@, AGS@, Dsdo@), which is correct | None on routing. The list's personal-email column still names the previous holders for CS, AGS and SDO (also ZOC, SMP and DNCE) | **List owner:** update `DSU_Head Personal_Email`. The platform does not serve that column. |
| The memo is issued by HRM under "DEPT./UNIT: HRA" | — | Confirms the adopted correction HRA → HRM | None. |

**Aliases that depend on CSP.** Two owner mappings go to RC: "Standards Guidelines and Frameworks"
and "e-Government Development and Regulations". The memo gives CSP the "enforcement of standards
and guidelines". Once CSP is a key, the owner should decide whether they move to it.

## 4. Owner decisions outstanding

1. **Done (26 Sep 2026).** CSP is in `docs/reference/approved/organizational-units.csv` and
   `config/organizational-units.config.js` (51 units): title *Compliance & Supervision
   Department*, headship Acting, from the memo. The unit mailbox, head mailbox and head title are
   blank because no source states them. **List owner:** add the same row to the Departments list
   with those three values.
2. **Done (26 Sep 2026).** The owner moved SMP's 2 category rows to SDO. Two `rowUnit` corrections
   in `approved/dsu-key-corrections.csv` move StakeHolder Engagements and Inter Agency
   Collaborations, and keep their informed units (DGO, CEO). SMP itself stays a unit, so staff
   directorates are unchanged, as memo §5 requires. **List owner:** set Default Primary
   Responsible (`field_4`) to SDO on the same 2 rows of the category list, because the fetch
   flows serve the list, not the config.
3. Once CSP exists: re-map "Standards Guidelines and Frameworks" and/or "e-Government Development
   and Regulations" to CSP.
4. `DIT@`: confirm it is the ITD head's role mailbox. If it is, the admission rule gets an explicit
   exception.
5. `hszwo@`: confirm the correct spelling in the list.
6. SSZO (1 account): assign a unit key.
