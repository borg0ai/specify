# RFC 0016: Add approval-gated implementation workflow to SKILL.md

**Status:** Implemented

## Summary

Add a lightweight "before implementing" checkpoint to `specify`'s workflow section: once an RFC is delivered, present a short plan and ask for explicit go-ahead before writing code, rather than immediately implementing after `deliver`. This closes the actual functional gap that a separate approval-gated skill (`rfc-workflow`, a third-party plugin skill observed installed alongside `specify`) fills, so `specify` alone covers both the document lifecycle and the "don't implement without checking in" discipline.

## Problem

Two installed skills currently describe overlapping territory: a third-party `rfc-management` skill re-describes the exact same `.spec/ROADMAP.md` + `.spec/TASK_TRACKING.md` + `.spec/rfc/NNNN-slug.md` convention `specify` already enforces mechanically (via `deliver`/`advance`/`archive`/`sync-check`) — but only as prose playbook instructions with no actual code checking anything. A sibling `rfc-workflow` skill adds a real, non-overlapping capability: presenting an implementation plan and requiring explicit approval before writing code. `specify`'s current "RFC before code, no exceptions" rule (RFC 0014) only enforces that the RFC document exists first — it says nothing about pausing for approval on the plan before implementing.

## Goals

- After `deliver`, before starting implementation, `specify`'s workflow instructs presenting a short plan (files/modules touched, approach) and pausing for user go-ahead — mirroring `rfc-workflow`'s actual useful behavior, without duplicating its document-tree confusion.
- Three explicit outcomes at the checkpoint, not just approve-and-go:
  - **Approved:** proceed to implementation.
  - **Rejected:** `advance <id> Rejected` then `archive <id>` (moves the file to `.spec/rfc/rejected/`) — do not leave a rejected plan sitting active in `.spec/rfc/`.
  - **Pending:** a new first-class status, same treatment as Rejected — `advance <id> Pending` then `archive <id>` moves the file to a new `.spec/rfc/pending/` archive dir. Used when the user gives feedback short of a clear approve/reject and work pauses rather than continuing at the Draft/Approved checkpoint.
- This absorbs the one genuinely non-overlapping capability from `rfc-workflow` so a user doesn't need to install a second skill for it.

## Non-goals

- Not reproducing `rfc-workflow`'s full four-phase structure (numbered menus, rollback tracking, diff-preview-per-file) — that's heavier process than `specify`'s existing lightweight step-by-step workflow needs.
- Not deprecating or removing any other installed skill — out of scope for a `specify`-repo RFC to act on skills it doesn't own.

## Design

- `bin`/`scripts/specify.mjs`: add `"Pending"` to the `STATUSES` enum, and `Pending: "pending"` to `ARCHIVE_STATUSES` (same shape as `Implemented`/`Rejected`/`Superseded`) so `advance <id> Pending` reports `needsArchive: true` and `archive <id>` moves the file into a new `.spec/rfc/pending/` subdirectory, exactly like `completed/`/`rejected/` today.
- `cmdInit`'s scaffold branch: also `mkdir` `.spec/rfc/pending/` alongside `completed/` and `rejected/` when bootstrapping a fresh `.spec/` tree.
- `validate`'s archived-RFC detection (`isArchived`, used to allow checklists in archived bodies) extends its directory-name check to include `pending`.
- `specify/SKILL.md`: Status enum section lists `Pending` alongside `Rejected`/`Superseded`; Workflow section's approval checkpoint documents all three outcomes (Approved/Rejected/Pending) with their exact commands.
- Tests: cover `advance <id> Pending` + `archive <id>` moving a file to `.spec/rfc/pending/`, and that a fresh `init` scaffold creates the `pending/` directory.

## Acceptance

- `specify/SKILL.md`'s Workflow section has an explicit approval checkpoint with three outcomes, each naming its exact command sequence.
- `Pending` works end-to-end: `advance <id> Pending` sets the header and ROADMAP row, reports `needsArchive: true`; `archive <id>` moves the file to `.spec/rfc/pending/`.
- Fresh `init` scaffolds `.spec/rfc/pending/` alongside `completed/` and `rejected/`.
- `node skillify/scripts/validate-skill.mjs specify` still passes.
- Full test suite still passes.
