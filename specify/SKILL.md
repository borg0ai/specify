---
name: specify
description: Manage RFC-based spec documents through their full lifecycle — create, validate, advance status, archive, and check cross-file consistency across ROADMAP.md, TASK_TRACKING.md, and an rfc/NNNN-slug.md tree. Use when the user asks to create a new RFC, check RFC status/format, move an RFC to Approved/Implemented/Rejected, archive a completed RFC, or verify ROADMAP/TASK_TRACKING/rfc files agree with each other before a commit.
license: MIT
metadata:
  version: "0.1"
---

# Specify

A CLI (`bin/specify.mjs`) that reads and writes the three-file RFC convention: `ROADMAP.md` (index), `TASK_TRACKING.md` (task board), `rfc/NNNN-slug.md` (spec bodies, with `completed/` and `rejected/` archive subdirs). It locates that convention automatically wherever the three pieces live — inside `.spec/`, at repo root with `docs/rfc/`, or a `.spec/rfc/` tree paired with root-level `ROADMAP.md`/`TASK_TRACKING.md` (all three are real layouts seen in practice; don't assume one).

Every command exits non-zero on failure. Never report success from a non-zero exit, and never hand-edit ROADMAP/TASK_TRACKING/RFC files when a command exists for the operation — the commands keep the three files in sync in one pass, which manual edits reliably drift out of.

## Commands

```bash
node bin/specify.mjs init                                   # locate the tree, print next RFC id
node bin/specify.mjs validate <rfc-file>                    # check one RFC's format + status consistency
node bin/specify.mjs deliver <id> <slug> <title>             # create RFC + ROADMAP row + TASK_TRACKING line
node bin/specify.mjs advance <id> <new-status>               # update status in RFC header + ROADMAP row
node bin/specify.mjs archive <id>                             # move an Implemented/Rejected/Superseded RFC
node bin/specify.mjs sync-check                               # verify all three files agree (pre-commit gate)
```

Add `--json` for machine-readable output, `--root <dir>` to point at a repo other than the cwd.

## Workflow

1. **Starting a new RFC:** run `init` to confirm the tree and get the next id, then `deliver <id> <slug> "<title>"`. This writes the RFC file from a template, appends the ROADMAP index row, and appends a TASK_TRACKING line — all three in one call, matching the "do all steps in one change set" rule this convention expects. Fill in the RFC's TODO sections yourself; don't leave them as placeholders when you report the RFC as created.
2. **Before treating any RFC edit as done:** run `validate <file>`. Fix every reported error; recommended-section warnings are informational — use judgment on whether they apply; do not fix a warning by inventing a section with no content.
3. **Changing status:** run `advance <id> <status>` rather than editing the `**Status:**` line by hand — it updates both the RFC header and the ROADMAP row together, which is the exact failure mode ("ROADMAP says Approved, RFC header still says Draft") that manual edits produce.
4. **Implemented/Rejected/Superseded:** after `advance`, if the result reports `needsArchive: true`, run `archive <id>` to move the file into `rfc/completed/` or `rfc/rejected/`. An RFC's status and its directory must agree — `sync-check` catches it if they don't.
5. **Before a commit that touches RFC files:** run `sync-check`. It flags an RFC with no ROADMAP index row and an id appearing both active and archived at once.

## Status enum

`Draft` → `Under Review` → `Approved` → `Implemented`, plus `Rejected` and `Superseded`. `Superseded` requires a "superseded by NNNN" reference somewhere in the RFC body.

## What validate actually checks

- Filename matches `NNNN-kebab-slug.md`.
- A `**Status:**` (or `- **Status**:`) header line exists and its leading word is in the enum — trailing notes and emoji (`✅ Implemented（2026-07-24, follow-up scope）`) are allowed and ignored for the enum check.
- An H1 title line exists.
- A `## Summary` section exists and is non-empty — this is the only universally-enforced section, because `Problem`/`Goals`/`Non-goals`/`Design`/`Delivery`/`Acceptance` vary by author and era in real RFC trees. Missing ones are reported as warnings, not errors.
- No `- [ ]`/`- [x]` checklist items in an **active** RFC body (those belong in TASK_TRACKING.md and drift out of sync otherwise) — a checklist in an already-archived RFC (`completed/`/`rejected/`) is treated as a legitimate historical record, not a violation.
- If ROADMAP.md links to this RFC's id and mentions a status word nearby, a mismatch against the RFC header is reported as a warning — ROADMAP.md is often free-form prose with markdown links rather than a structured table, so this is a hint to check manually, not a hard failure.

## Do not

- Duplicate the RFC index as a `README.md` under `.spec/` or `rfc/` — the convention is exactly three files/trees.
- Put task checklists inside an active RFC body — they belong in TASK_TRACKING.md only.
- Leave ROADMAP status and RFC header status disagreeing after any status change — `advance` exists precisely to prevent this.
- Move a file into `completed/`/`rejected/` without first setting its status via `advance` — `archive` refuses to move a file whose status isn't in `Implemented`/`Rejected`/`Superseded`.

## Setup

No install required — the CLI is plain Node (`>=18`), zero runtime dependencies. Run tests with `npm test` (`node --test test/cli.test.mjs`).
