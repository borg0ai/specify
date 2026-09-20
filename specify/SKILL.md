---
name: specify
description: Manage RFC-based spec documents through their full lifecycle — create, validate, advance status, archive, and check cross-file consistency across ROADMAP.md, TASK_TRACKING.md, and an rfc/NNNN-slug.md tree. Use when the user asks to create a new RFC, check RFC status/format, move an RFC to Approved/Implemented/Rejected, archive a completed RFC, or verify ROADMAP/TASK_TRACKING/rfc files agree with each other before a commit.
license: MIT
metadata:
  version: "0.1"
---

# Specify

A CLI (`bin/specify.mjs`) that reads and writes the three-file RFC convention under `.spec/`: `.spec/ROADMAP.md` (index), `.spec/TASK_TRACKING.md` (task board), `.spec/rfc/NNNN-slug.md` (spec bodies, with `completed/` and `rejected/` archive subdirs). This is the only layout `specify` recognizes — it does not look for `docs/rfc/` or root-level `ROADMAP.md`. If `.spec/` doesn't exist yet, `init` scaffolds it.

Every command exits non-zero on failure. Never report success from a non-zero exit, and never hand-edit ROADMAP/TASK_TRACKING/RFC files when a command exists for the operation — the commands keep the three files in sync in one pass, which manual edits reliably drift out of.

## Scope discipline (enforced)

**One RFC = one concern.** Never dump unrelated fixes or features into a single mega-RFC.

When a theme spans multiple concerns, use an **umbrella + children**:

1. `deliver <id> <slug> "<title>" --umbrella` — indexes children; holds completion criteria; **no** implementation detail dump.
2. `deliver <id> <slug> "<title>" --parent <umbrella-id>` — one concern; writes `**Parent:**` and appends a row to the umbrella's `## Children` table in the same change set.
3. Track work and checklists on children in `TASK_TRACKING.md`.
4. Close the umbrella when children are Approved/Implemented. **Never reopen** an umbrella for new work — spawn a new child or a new umbrella.

`validate` and `sync-check` enforce mutual links: every listed child must declare that parent; every `**Parent:**` must point at an Umbrella that lists the child. An RFC cannot be both umbrella and child.

## Commands

```bash
node bin/specify.mjs init                                      # locate or scaffold .spec/, print next RFC id
node bin/specify.mjs validate <rfc-file>                       # schema + ROADMAP + umbrella/child links
node bin/specify.mjs deliver <id> <slug> <title>               # standalone RFC + ROADMAP + TASK_TRACKING
node bin/specify.mjs deliver <id> <slug> <title> --umbrella    # umbrella template + Type marker
node bin/specify.mjs deliver <id> <slug> <title> --parent NNNN # child template; link both ways
node bin/specify.mjs advance <id> <new-status>                 # update status in RFC header + ROADMAP row
node bin/specify.mjs archive <id>                              # move Implemented/Rejected/Superseded RFC
node bin/specify.mjs sync-check                                # ROADMAP/TASK_TRACKING/rfc + umbrella links
```

Add `--json` for machine-readable output, `--root <dir>` to point at a repo other than the cwd.

## Workflow

1. **Starting work:** run `init` for the next id. If the theme is multi-concern, deliver an `--umbrella` first, then one `--parent <id>` child per concern. If it is a single concern, deliver a standalone RFC (no flags). Fill TODO sections before treating the RFC as authored.
2. **Before treating any RFC edit as done:** run `validate <file>`. Fix every reported error; recommended-section warnings are informational — use judgment; do not invent empty sections to silence them.
3. **Changing status:** run `advance <id> <status>` — updates RFC header and ROADMAP together.
4. **Implemented/Rejected/Superseded:** after `advance`, if `needsArchive: true`, run `archive <id>`.
5. **Before a commit that touches RFC files:** run `sync-check`.

## Status enum

`Draft` → `Under Review` → `Approved` → `Implemented`, plus `Rejected` and `Superseded`. `Superseded` requires a "superseded by NNNN" reference somewhere in the RFC body.

## What validate actually checks

- Filename matches `NNNN-kebab-slug.md`.
- A `**Status:**` (or `- **Status**:`) header line exists and its leading word is in the enum — trailing notes and emoji are allowed and ignored for the enum check.
- An H1 title line exists.
- A `## Summary` section exists and is non-empty — the only universally-enforced section. Missing recommended sections are warnings.
- No `- [ ]`/`- [x]` checklist items in an **active** RFC body (archived checklists are allowed as history).
- ROADMAP nearby-status mismatch → warning (hint only).
- **Umbrella/child:** `**Type:** Umbrella` (or title `(Umbrella)`) with empty Children → warning; listed child missing file or wrong/missing Parent → error; `**Parent:**` without umbrella parent or without back-link in Children → error; both umbrella and parent on one file → error.

## Do not

- Bundle multiple concerns into one RFC — split into umbrella + children (or separate standalones).
- Put implementation detail dumps in an umbrella body — children own Design/Acceptance for their concern.
- Duplicate the RFC index as a `README.md` under `.spec/` or `rfc/`.
- Put task checklists inside an active RFC body — they belong in TASK_TRACKING.md only.
- Leave ROADMAP status and RFC header status disagreeing — use `advance`.
- Move a file into `completed/`/`rejected/` without `advance` first — `archive` refuses non-archivable statuses.
- Reopen a closed umbrella for new work — new child or new umbrella instead.

## Setup

No install required — the CLI is plain Node (`>=22`), zero runtime dependencies. Run tests from the repo root with `npm test` (`node --test`, discovers `tests/`).
