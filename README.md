# specify

CLI for managing RFC-based spec documents through their full lifecycle. Reads and writes the three-file convention: `ROADMAP.md` (index), `TASK_TRACKING.md` (task board), and an `rfc/NNNN-slug.md` tree (with `completed/` and `rejected/` archive subdirs).

Also packaged as an [agent skill](https://github.com/vercel-labs/skills) (`SKILL.md`), installable into Claude Code and 75+ other supported agents — see [specify/SKILL.md](./specify/SKILL.md) for the full command reference, workflow, and validation rules.

## How it works

`specify` doesn't store any state of its own — it operates entirely on plain Markdown files already sitting in your repo:

- **`ROADMAP.md`** — one row per RFC: id, title, status, notes. The index.
- **`TASK_TRACKING.md`** — the task board: one line per RFC linking to its concrete work items.
- **`rfc/NNNN-slug.md`** — the actual spec body, with a `**Status:**` header line and a `## Summary` section. Terminal-status RFCs (`Implemented`, `Rejected`, `Superseded`) live under `rfc/completed/` or `rfc/rejected/`.

Every command reads and writes these three pieces together in one pass, so they can never drift out of sync the way hand-editing does (e.g. "ROADMAP says Approved, RFC header still says Draft"). The layout is always `.spec/` — `init` scaffolds it if it doesn't exist yet. `sync-check` is the pre-commit gate: it fails if an RFC has no ROADMAP row, if an id exists both as active and archived at once, if umbrella/child Parent↔Children links disagree, if a markdown link to an `NNNN-slug.md` file does not resolve, or if an RFC file has no TASK_TRACKING checkbox (archived ids must be `[x]`).

**Scope rule:** one RFC = one concern. Multi-concern themes use `deliver --umbrella` plus `deliver --parent <id>` children — `validate` enforces the mutual links.

## Install

```bash
npx skills add borg0ai/specify
```

Install for Codex, OpenCode, Claude Code, Antigravity, and Cursor in one command:

```bash
npx skills add borg0ai/specify -a codex -a opencode -a claude-code -a antigravity -a cursor
```

## Commands

```bash
specify init                                   # locate or scaffold .spec/, print next RFC id
specify validate <rfc-file>                    # schema + ROADMAP + umbrella/child links
specify deliver <id> <slug> <title>            # standalone RFC + ROADMAP + TASK_TRACKING
specify deliver <id> <slug> <title> --umbrella # umbrella template
specify deliver <id> <slug> <title> --parent N # child; link both ways to umbrella N
specify advance <id> <new-status>              # update status in RFC header + ROADMAP row
specify archive <id>                           # move archivable RFC, rewrite links, check its task
specify sync-check                             # resolving RFC links, task lines, umbrella links
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
