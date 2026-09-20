# specify

CLI for managing RFC-based spec documents through their full lifecycle. Reads and writes the three-file convention: `ROADMAP.md` (index), `TASK_TRACKING.md` (task board), and an `rfc/NNNN-slug.md` tree (with `completed/` and `rejected/` archive subdirs).

Also packaged as an [agent skill](https://github.com/vercel-labs/skills) (`SKILL.md`), installable into Claude Code and 75+ other supported agents — see [specify/SKILL.md](./specify/SKILL.md) for the full command reference, workflow, and validation rules.

## How it works

`specify` doesn't store any state of its own — it operates entirely on plain Markdown files already sitting in your repo:

- **`ROADMAP.md`** — one row per RFC: id, title, status, notes. The index.
- **`TASK_TRACKING.md`** — the task board: one line per RFC linking to its concrete work items.
- **`rfc/NNNN-slug.md`** — the actual spec body, with a `**Status:**` header line and a `## Summary` section. Terminal-status RFCs (`Implemented`, `Rejected`, `Superseded`) live under `rfc/completed/` or `rfc/rejected/`.

Every command reads and writes these three pieces together in one pass, so they can never drift out of sync the way hand-editing does (e.g. "ROADMAP says Approved, RFC header still says Draft"). `init` auto-detects which of the real-world layouts your repo uses (`.spec/`, root + `docs/rfc/`, or `.spec/rfc/` with root-level index files) rather than assuming one. `sync-check` is the pre-commit gate: it fails if an RFC has no ROADMAP row, or if an id exists both as active and archived at once.

## Install

```bash
npx skills add borg0ai/specify
```

## Commands

```bash
specify init                                   # locate the tree, print next RFC id
specify validate <rfc-file>                    # check one RFC's format + status consistency
specify deliver <id> <slug> <title>            # create RFC + ROADMAP row + TASK_TRACKING line
specify advance <id> <new-status>              # update status in RFC header + ROADMAP row
specify archive <id>                           # move an Implemented/Rejected/Superseded RFC
specify sync-check                             # verify all three files agree (pre-commit gate)
```

Add `--json` for machine-readable output, `--root <dir>` to point at a repo other than the cwd.

Full workflow, status enum, and what `validate` checks: see [specify/SKILL.md](./specify/SKILL.md).

## Test

```bash
npm test
```

Tests live at repo root (`tests/`), outside the `specify/` directory that gets installed — the deployed skill never ships test files.

## License

MIT
