# RFC 0010: Finish-path sync for archive links and task board (Umbrella)

**Status:** Implemented

**Type:** Umbrella

## Summary

Close the gap between how this repo actually works `.spec/` and what `specify` writes at the end of an RFC: archive must keep markdown links pointed at the moved file, `sync-check` must fail when those links or task lines disagree, and the task board must nest children and check them off when the RFC is archived.

## Problem

`init`, `deliver`, and `advance` already keep ROADMAP, the RFC body, and a task stub in step while a spec is opened and moved through status. Finishing still drifted. `archive` only renamed the file, so ROADMAP links in this tree had to be hand-pointed at `rfc/completed/`. `TASK_TRACKING.md` nesting, `[x]`, and the `## Done` section were hand-maintained. `sync-check` claimed to compare the task board but never read it, and it did not notice a ROADMAP link whose target was gone.

## Goals

- Children 0011, 0012, and 0013 are Implemented and archived.
- After that, `sync-check` on this repo exits 0.
- This umbrella stays an index. It does not gain implementation detail beyond the child list.

## Non-goals

- Editing RFC prose sections (Summary, Design, Acceptance) from the CLI.
- Reopening this umbrella for a later finish-path concern. Spawn a new child or a new umbrella.
- Rewriting historical `completed/` links that already resolve. `archive` fixes links at move time.

## Children

| RFC | Concern |
|-----|---------|
| [0011](0011-rewrite-links-on-archive.md) | Rewrite markdown links when archive moves an RFC |
| [0012](0012-sync-check-broken-rfc-links.md) | Fail sync-check when an RFC markdown link does not resolve |
| [0013](0013-task-board-on-deliver-archive.md) | Nest child tasks on deliver and check them on archive |

## Acceptance

Close this umbrella only when 0011, 0012, and 0013 are Implemented and archived, and `sync-check` passes on this repository. Do not reopen it for new work.
