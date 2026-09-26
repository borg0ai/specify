# RFC 0015: SKILL.md must not hardcode an install path for the CLI

**Status:** Implemented

## Summary

RFC 0014's "Where the CLI lives" section hardcoded `~/.claude/skills/specify/scripts/specify.mjs` as the example install path. That's a machine-specific, agent-specific path — violates the same "no machine-specific absolute path" rule this repo's own `skillify` validator enforces. Replace it with guidance to resolve `scripts/specify.mjs` relative to whatever base directory the host provides at invocation time.

## Problem

Install location varies by agent (Claude Code vs Codex vs Cursor vs OpenCode use different directories), by scope (project-local vs `-g` global), and by machine. Hardcoding one example as if it were canonical teaches the wrong lesson and could mislead a reader into constructing a path that doesn't exist on their setup.

## Goals

- SKILL.md's CLI-location guidance references the host-provided base directory concept generically, with no literal path.
- The general principle — never hardcode an install path — is stated explicitly.

## Non-goals

- No change to CLI logic, install mechanics, or `npx skills add` behavior.

## Design

Edit the "Where the CLI lives" section in `specify/SKILL.md`: replace the `~/.claude/skills/specify/...` example with `<this-skill's-base-directory>/scripts/specify.mjs`, and add one sentence stating installs vary by agent/scope/machine so paths must always be resolved from the base directory given at invocation, never hardcoded.

## Acceptance

- `specify/SKILL.md` contains no literal `~/.claude/skills/...` or other machine-specific path.
- `node skillify/scripts/validate-skill.mjs specify` still passes.
- Full test suite still passes (26/26).
