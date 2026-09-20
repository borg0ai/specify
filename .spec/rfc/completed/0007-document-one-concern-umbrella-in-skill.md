# RFC 0007: Document one-concern and umbrella lifecycle in SKILL.md (child of 0006)

**Status:** Implemented

**Parent:** [0006](0006-one-concern-and-umbrella-rfc-convention.md)

## Summary

Update `specify/SKILL.md` (and README if it mirrors workflow) so agents must follow one-concern-per-RFC and umbrella/child lifecycle when creating specs.

## Problem

SKILL.md today describes commands and status enum but never says “do not mega-RFC” or how to structure umbrellas. Agents reading only the skill will keep bundling concerns.

## Goals

- Add a dedicated Workflow / Governance section: one concern; when to open an umbrella; child linking; never-reopen rule.
- Add Do-not bullets: no mono catch-all RFCs; no implementation detail dumps in umbrellas; checklists stay in TASK_TRACKING.
- Point at `--umbrella` / `--parent` once RFC 0008 lands (or document the manual link convention until then).

## Non-goals

- CLI flag implementation (RFC 0008).
- Validate rules (RFC 0009).

## Design

Edit `specify/SKILL.md` Workflow and Do not sections. Keep prose short and imperative (skill consumers skim). Mirror a brief note in root README only if the Install/How-it-works section already summarizes convention.

## Acceptance

- SKILL.md explicitly requires one concern per RFC and describes umbrella → children → close → never reopen.
- A reader with no prior project memory can author an umbrella + child set correctly from the skill alone.
- `specify validate` on this RFC still passes.
