# Phase 2 exit: the claim concurrency test

[IDENTIFICATION_SYSTEM.md](../../../reference/identification/IDENTIFICATION_SYSTEM.md) §13 sets the exit criterion
for Phase 2, the generation kit: *20 parallel claims give 20 distinct, gap-free numbers*. No Phase 3 flow claims a
number until this test has passed in the tenant.

## Kit corrections made before the test (4 October 2026)

Nothing from the kit had run in the tenant. Read against the calls that have, two defects were found and fixed at
their single source, `scripts/lib/identification-kit.mjs`:

1. **Request bodies were object literals.** The counter claim, the counter create and the VOID row each sent an
   object holding expressions, the form that failed with 400 *Not well formatted JSON stream* in run
   `08584106116380843146636461148CU01`. Every body is now built as `setProperty(json('{}'), …)`, the form the deployed
   *01 - GOV - Provision HTTP Flow Registry* uses. All 34 bodies were evaluated and give the intended JSON.
2. **Connector calls were in full-definition form** (`host.connectionName` plus `authentication`). They are now in
   designer-paste form (`host.connection`, no `authentication`), as every paste that has run in the tenant is.

3. **A Select map was text with `@{…}` in it.** The designer refused it on save ("Enter a valid JSON", 4 October
   2026). The reference list is now built with one `concat(…)` expression, as `Select_Dataset_Bindings` already was.
4. **Connector retries ran underneath the kit's own attempts.** The first test run (4 October 2026, 13:54 UTC) was
   still running after 16 minutes. Each counter call now has Power Automate's retry policy set to *none*, so the
   flat attempts, each re-reading the counter, are the only retry, as B1 intends.
5. **Five attempts with a 1 to 3 s Delay could not meet §13** (run 2 below). By owner decision, spec 1.2.2 sets the
   Claim Reference block to 10 attempts with a `rand(1, 6)` s Delay. Each claim block now has 30 counter calls, all with
   retry policy *none*.

The VOID row now follows owner decision Q2: Title `VOID`, Status `void`. `npm run test:idkit` checks all three
rules.

## The test: `Scope_Phase2_ClaimTest_Flow.paste.json`

The kit's identity header, then 20 iterations **in parallel**, each running the kit's Claim Reference block on a
test counter, `ZTST`, then an e-mailed report holding every claim's result. It never touches the NITDA, TASK or
FILE counters. The first claim creates the row `ZTST-2026` in Portal Sequence Counters, and that row stays as
evidence (delete it after the result is recorded, if wanted).

**Before running it,** turn on *Enforce unique values* for **Title** in Portal Sequence Counters (List settings →
Title → Enforce unique values = Yes). The kit relies on it: when several flows find no counter row for a new year,
only one create may succeed.

**Run:** create an instant flow `ID_Phase2_Claim_Test` (manual trigger). Add empty **Send an HTTP request to
SharePoint** and **Send an email (V2)** steps, paste, delete the empty steps, save and run. Send back the report.

**It passes (§13) when** all 20 claims hold distinct numbers 1…20 with no gap, the `ZTST-2026` row's
`CurrentSequence` is 20, and there is exactly one `ZTST-2026` row. A claim that runs out of attempts answers
503 RETRY_LATER without taking a number, and the report shows it.

## Results

### Run 1: 4 October 2026, `08584104848238817597193178493CU00`

Started 13:54 UTC and finished 14:09 UTC. This run used the paste from before correction 4, with connector retries still
on. Summary: [`evidence/phase2-claim-test-2026-10-04-run1.summary.json`](evidence/phase2-claim-test-2026-10-04-run1.summary.json).

| Check | Result |
|---|---|
| Claims that succeeded | 20 of 20 |
| Numbers | `ZTST-2026-00001` to `ZTST-2026-00020`: distinct, no gap |
| Counter rows | One. The claim that drew 1 created `ZTST-2026` on attempt 1. The other 19 creates were refused by enforce-unique Title, and no claim drew 1 a second time. |
| `CurrentSequence` | 20. The last claim wrote 20 through an IF-MATCH update, and no later claim succeeded. |

**The criterion is met, but the run does not exercise the kit as shipped.** The 19 refused creates were retried by
the connector for 10 to 15 minutes. That spread their second attempts across 15 minutes, so the IF-MATCH claim
path saw almost no contention: only two pairs overlapped (numbers 5 and 6, numbers 17 and 18), and each pair still
drew distinct numbers. Correction 4 removes those retries. Run 2 tests the corrected paste, with all 19 second
attempts contending inside a few seconds.

### Run 2: 4 October 2026, `08584104803611417096886877458CU00`

This run used the corrected paste, with the connector retry policy set to *none*, after the `ZTST-2026` row was deleted. Started
15:08:46 UTC and finished 15:09:06 UTC. Summary:
[`evidence/phase2-claim-test-2026-10-04-run2.summary.json`](evidence/phase2-claim-test-2026-10-04-run2.summary.json).

| Check | Result |
|---|---|
| Claims that got a number | 18 of 20. The other 2 failed all 5 attempts, took no number and wrote nothing (503 RETRY_LATER). |
| Numbers | `ZTST-2026-00001` to `ZTST-2026-00018`: distinct, no gap |
| Counter rows | One. 19 creates were refused by enforce-unique Title. |
| `CurrentSequence` | 18 |
| Wins by attempt | 1, 6, 4, 5, 2 on attempts 1 to 5 |

**What this proves:** under real contention, with 19 claims competing inside 15 seconds, the claim never issues a number twice, never
skips one, and never makes a second counter row.

**What it does not meet:** §13 asks for *20 distinct, gap-free numbers from 20 parallel claims*. Two claims ran out of the
5 attempts §8.2 allows. With 20 claims arriving together, only about one claim wins per round in each Delay slot, and
`rand(1, 4)` whole seconds gives three slots. §8.2's own parameters (5 attempts, a 1 to 3 s Delay) cannot reliably
give 20 of 20. A simulation calibrated on this run gives 20 of 20 in about 0% of runs at 5 attempts and 1 to 3 s,
about 98% at 8 attempts and 1 to 5 s, and 100% at 10 attempts and 1 to 5 s. Closing Phase 2 needs an owner decision
between §8.2's parameters and §13's criterion. **Decided 4 October 2026:** 10 attempts, 1 to 5 s (spec 1.2.2,
correction 5).

### Run 3: 4 October 2026, `08584104751220439613793458278CU15`: **PASS**

This run used the spec 1.2.2 paste: 10 attempts, a `rand(1, 6)` s Delay and connector retry policy *none*. The `ZTST-2026` row was
deleted first. Started 16:36:05 UTC and finished 16:36:36 UTC (31 s). Summary:
[`evidence/phase2-claim-test-2026-10-04-run3.summary.json`](evidence/phase2-claim-test-2026-10-04-run3.summary.json).

| Check | Result |
|---|---|
| Claims that got a number | **20 of 20** |
| Numbers | `ZTST-2026-00001` to `ZTST-2026-00020`: distinct, no gap |
| Counter rows | One. 19 creates were refused by enforce-unique Title, and no claim drew 1 twice. |
| `CurrentSequence` | 20. The claim that drew 20 wrote it, and any later successful update would have drawn a number above 20. |
| Wins by attempt | 1, 8, 3, 7, 1 on attempts 1 to 5. Attempts 6 to 10 were never needed. |

**Phase 2 exit (§13) is met.** Phase 3 flows may claim numbers with the kit. The `ZTST-2026` row can be deleted, or kept
as evidence.
