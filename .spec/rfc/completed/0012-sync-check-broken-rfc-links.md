# RFC 0012: Fail sync-check when an RFC markdown link does not resolve (child of 0010)

**Status:** Implemented

**Parent:** [0010](0010-finish-path-sync.md)

## Summary

`sync-check` fails when a markdown link under `.spec/` points at an `NNNN-slug.md` file that is not on disk.

## Problem

Link text in ROADMAP can name an id even after the file moves or is deleted. `extractRoadmapIds` only captures the id inside the URL. A row can keep an id while its path 404s, and the pre-commit gate still exits 0. That is how hand-fixed `rfc/completed/` links stayed invisible to the tool.

## Goals

- Scan every `.spec/**/*.md` file.
- Treat a link as an RFC link when the path (hash stripped) matches `NNNN-kebab-slug.md`.
- Emit `Broken RFC link in <file>: <target>` and exit non-zero when the resolved path does not exist.
- Ignore `http` links and links that are not RFC filenames.

## Non-goals

- Requiring every ROADMAP id to have a file when the id is only prose without an RFC filename link. Existing id-row checks stay as they are.
- Task-board checkbox rules. Those belong to RFC 0013.
- Validating section schema. That stays on `validate`.

## Design

`listBrokenRfcLinks` in `specify/scripts/lib/markdown-links.mjs` returns missing RFC targets relative to the file that contains them. `cmdSyncCheck` walks `listDocMarkdown` and appends one error per broken target. Resolution is `path.resolve` from the linking file's directory, which matches links `archive` writes (`rfc/completed/...` from `ROADMAP.md`, `completed/...` from a sibling still in `rfc/`).

## Acceptance

- A ROADMAP link to `rfc/0098-missing.md` makes `sync-check` fail and name that file.
- A tree whose RFC links resolve, including this repo's already-archived rows, still passes.
- `npm test` covers the missing-file case.
