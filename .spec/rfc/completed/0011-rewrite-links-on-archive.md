# RFC 0011: Rewrite markdown links when archive moves an RFC (child of 0010)

**Status:** Implemented

**Parent:** [0010](0010-finish-path-sync.md)

## Summary

`archive` moves an RFC into `completed/` or `rejected/` and rewrites markdown links so ROADMAP, the umbrella Children table, and links inside the moved file still resolve.

## Problem

`archive` used `rename` and left every link at the pre-move path. This repo's ROADMAP rows point at `rfc/completed/...` only because those links were edited by hand afterward. An umbrella that stays active while a child is archived keeps a Children link aimed at the old filename.

## Goals

- After `archive <id>`, the ROADMAP link for that id is relative to `ROADMAP.md` and opens the archived file.
- Links in other `.spec/**/*.md` files that resolved to the old path now resolve to the new path.
- Links inside the moved RFC are retargeted from the archive directory back to the same files they pointed at before the move.
- External `http` links are left unchanged.

## Non-goals

- Rewriting links that never resolved to the moved file.
- Updating status text. That stays on `advance`.
- Checking the task board. That is RFC 0013.

## Design

Pure helpers in `specify/scripts/lib/markdown-links.mjs`:

- `retargetRelativeLinks` rewrites relative targets in the moved file from its old directory to the archive directory.
- `replaceLinksPointingAt` rewrites a link in another file only when the target normalizes to the old absolute path.

`cmdArchive` renames the file, retargets its body, then walks `.spec/**/*.md` (skipping the destination) and applies `replaceLinksPointingAt`.

## Acceptance

- Archiving a child leaves `rfc/completed/<id>-<slug>.md` in ROADMAP and `completed/<id>-<slug>.md` in the still-active umbrella.
- The archived child's `**Parent:**` link points at `../<umbrella>.md` when the umbrella is still in `rfc/`.
- `npm test` covers the rewrite. `sync-check` passes after the move.
