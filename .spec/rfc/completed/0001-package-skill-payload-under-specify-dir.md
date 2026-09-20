# RFC 0001: Package skill payload under specify/, keep tests at repo root

**Status:** Implemented

## Summary

Move the installable skill payload (`bin/`, `SKILL.md`, `schemas/`, `scripts/`, its own `package.json`, `LICENSE`) into a `specify/` subdirectory so `npx skills add borg0ai/specify` only installs the payload, not the repo's dev tooling or tests. Repo root keeps only what's needed to develop the repo itself: `README.md`, root `LICENSE`, a thin test-runner `package.json`, and `tests/`.

## Problem

The repo was flat — `bin/`, `SKILL.md`, `test/`, `schemas/`, etc. all sat directly at repo root. `npx skills add` copies whatever directory tree it's pointed at; with a flat layout there is no way to install the skill without also installing `test/` and other dev-only files. `archify` (a sibling skill repo) already solves this by nesting the real payload one level down (`archify/archify/`) and keeping tests inside that nested dir excluded from its build step — this RFC applies the same directory-level split to `specify`, since `specify` has no separate build/package step to rely on for exclusion.

## Goals

- `specify/` subdirectory contains exactly what a consumer installs: `bin/`, `SKILL.md`, `schemas/`, `scripts/release.mjs`, `LICENSE`, its own `package.json` (no test script).
- Repo root contains only repo-development concerns: `README.md`, `LICENSE` (for GitHub license detection), `tests/` (renamed from `test/`, using `node --test` auto-discovery so new test files need no config changes), and a thin root `package.json` (`private: true`) whose `test`/`release` scripts are the actual entry points for `npm test` / `npm run release`.
- All existing CLI behavior (`init`, `validate`, `deliver`, `advance`, `archive`, `sync-check`) unchanged — this is a pure file-move, no logic changes.
- README documents both the RFC three-file convention `specify` manages and how to install `specify` itself via `npx skills add`.

## Non-goals

- No change to `bin/specify.mjs` command logic or output format.
- No CI workflow / package-smoke script yet (tracked as follow-up work, not part of this RFC).
- No npm publish / `npx specify` distribution path — install is via `npx skills add` only.

## Design

- `git mv` of `bin/`, `SKILL.md`, `schemas/`, `scripts/`, `package.json`, `LICENSE`, and empty scaffold dirs (`assets/`, `brand-marks/`, `delta/`, `examples/`, `migrations/`, `recipes/`, `renderers/`) into `specify/specify/`... `specify/` (repo) → `specify/` (payload dir) — i.e. `bin/specify.mjs` becomes `specify/bin/specify.mjs`.
- `test/` renamed to `tests/` and kept at repo root (not moved into the payload dir), since a deployed skill should never ship its own test suite.
- `tests/cli.test.mjs`'s CLI path updated: `path.join(import.meta.dirname, "..", "specify", "bin", "specify.mjs")`.
- New root `package.json` (`private: true`) with `"test": "node --test"` (bare — Node's test runner auto-discovers `tests/**/*.test.mjs`, so growing the suite needs no script edits) and `"release": "node specify/scripts/release.mjs"`.
- `specify/package.json` (the payload manifest) had its `test` script removed — it no longer has a `tests/` directory alongside it to run.
- Root `LICENSE` restored as a copy (GitHub license badge/detection needs it there) alongside `specify/LICENSE` (shipped with the installed payload) — same dual placement `archify` uses.
- README's Install section uses `npx skills add borg0ai/specify` and a new "How it works" section explaining the three-file RFC convention (`ROADMAP.md` / `TASK_TRACKING.md` / `rfc/NNNN-slug.md`) that `specify` itself operates on.

## Acceptance

- `npm test` from repo root passes (8/8), running `tests/cli.test.mjs` against `specify/bin/specify.mjs`.
- `specify/` directory contains no test files.
- `git status` after the move shows only renames/adds, no unintended deletions (verified: initially some empty scaffold dirs under `assets/`, `brand-marks/`, `delta/`, `renderers/` showed as deleted by accident during the move — restored via `git checkout --` before re-doing the move correctly).
- README's Install/Test sections match the actual resulting paths.
