# RFC 0013: Nest child tasks on deliver and check them on archive (child of 0010)

**Status:** Implemented

**Parent:** [0010](0010-finish-path-sync.md)

## Summary

`deliver` puts open tasks in `## Active` and nests a child under its umbrella line. `archive` checks that RFC's box and, once the top-level block is fully checked, moves the block to `## Done`. `sync-check` requires a checklist line per RFC file, and an archived id must be `[x]`.

## Problem

`deliver` appended `- [ ] Implement RFC ...` at the end of `TASK_TRACKING.md`. In this repo that end is inside `## Done`, so new work landed under Done still unchecked, and children were not indented under the umbrella. `advance` and `archive` never touched the board. `sync-check` never opened the file, so the three-file claim was only ROADMAP plus `rfc/`.

## Goals

- A standalone or umbrella `deliver` creates or reuses `## Active` and does not append into `## Done`.
- `deliver --parent <id>` indents the child under the parent's checklist line when that line exists.
- `archive` flips `- [ ]` to `- [x]` on lines that mention `RFC <id>`.
- A top-level `## Active` block moves under `## Done` only when every checkbox in that block is `[x]`. Archiving one child leaves the umbrella block in Active.
- `sync-check` errors when an RFC file id has no checklist line, and when an archived id still has an unchecked line.

## Non-goals

- Parsing free-form notes such as "closed; do not reopen". Existing Done lines that already contain `RFC <id>` and `[x]` stay valid.
- Checking boxes on `advance`. The board closes when the file is archived.
- Putting checklists inside the RFC body. `validate` still rejects those on active RFCs.

## Design

Pure helpers in `specify/scripts/lib/task-board.mjs`: `insertTaskLine`, `markTaskChecked`, `taskBoardErrors`. `cmdDeliver` writes `insertTaskLine` instead of concatenating a stub. `cmdArchive` writes `markTaskChecked` after the move. `cmdSyncCheck` passes active ids as `{ archived: false }` and ids found under `completed/` or `rejected/` as `{ archived: true }`.

Lines created for 0010–0013 before this command existed were placed once under `## Active`, nested, so the later `archive` run can promote that block. New delivers do this themselves.

## Acceptance

- `deliver --parent` produces a two-space child line under the umbrella line inside `## Active`.
- Archiving only the child checks the child and leaves the block in Active. Archiving the umbrella after that moves both lines under `## Done` and removes the empty Active block.
- `sync-check` fails an archived RFC whose line is still `- [ ]`.
- `npm test` covers nesting, promotion, and the task-board errors.
