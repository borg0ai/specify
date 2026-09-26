# RFC 0014: Document installed-skill CLI path vs dev checkout in SKILL.md

**Status:** Implemented

## Summary

`SKILL.md` never states where the CLI actually lives once installed. When `/specify` runs against a target project that isn't the `specify` dev repo itself, the only correct entry point is the *installed* copy (`npx skills add` puts it at, e.g., `~/.claude/skills/specify/scripts/specify.mjs`, with `--root <target>` pointing at the project being managed) — not a path relative to the target project, and not the `specify` dev checkout unless that checkout is literally what's being worked on.

## Problem

A session working in `archify` (a project with no `specify` CLI of its own) concluded "no `scripts/specify.mjs` found, cannot safely scaffold" and declined to run `init`, even though the correctly-installed skill was available at `~/.claude/skills/specify/scripts/specify.mjs` the whole time. The confusion: `specify` is a *skill*, not a per-project dependency — it should never be expected to live inside the project it's managing. `SKILL.md`'s command examples (`node scripts/specify.mjs init ...`) read as if `scripts/specify.mjs` is relative to the current project, which is wrong for every project except `specify`'s own dev repo.

## Goals

- `SKILL.md` states explicitly: the CLI is invoked from wherever it's installed (global `~/.claude/skills/specify/scripts/specify.mjs` after `npx skills add -g`, or project-local `.claude/skills/specify/scripts/specify.mjs` for a project install), always with `--root <target-project>` to point at the project actually being managed.
- Add one worked example showing a session managing RFCs for project B using a specify skill installed for project A / globally — the exact scenario that caused the confusion.
- No behavior change to `bin`/`scripts`/CLI logic — this is a documentation-only fix.

## Non-goals

- Not changing `npx skills add` install locations or discovery mechanics (that's `vercel-labs/skills`'s territory, not this repo's).
- Not adding a "CLI not found, install it now" auto-remediation flow to `specify.mjs` itself — out of scope for this RFC.

## Design

Add a short "Where the CLI lives" section near the top of `specify/SKILL.md`, before the Commands block, stating the installed-path vs dev-checkout distinction and the `--root` pattern. Update the Commands block's shown paths to make clear they're illustrative, not literally relative to cwd in the general case.

## Acceptance

- `specify/SKILL.md` has a section explaining installed-skill CLI location vs `--root` usage.
- A reader following the doc for a project other than `specify` itself would know to invoke the installed skill's path with `--root <their-project>`, not search for `scripts/specify.mjs` inside their own project.
