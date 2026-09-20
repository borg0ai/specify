# RFC 0008: Add deliver --umbrella/--parent and templates (child of 0006)

**Status:** Implemented

**Parent:** [0006](0006-one-concern-and-umbrella-rfc-convention.md)

## Summary

Extend `deliver` so creating an umbrella or a child is a first-class, synced operation: flags, templates, ROADMAP title markers, and parent/child stubs written in one change set.

## Problem

Today `deliver` always emits the same implementation-oriented template. Authors must hand-edit `**Type:** Umbrella`, Children tables, and `**Parent:**` links — easy to forget, and the tool does not “make sure” of the pattern.

## Goals

- `deliver ... --umbrella` uses an umbrella template (`**Type:** Umbrella`, empty Children table, no implementation Design dump).
- `deliver ... --parent <id>` uses a child template with `**Parent:** [NNNN](...)` filled in, and appends a row to the parent’s Children table when the parent is an umbrella.
- ROADMAP title includes `(Umbrella)` or `(child of NNNN)` consistently (or equivalent machine-readable marker).
- Reject `--parent` pointing at a missing id; warn or error if parent is not marked umbrella.
- Tests cover both flag paths and ROADMAP/TASK_TRACKING sync.

## Non-goals

- Auto-detecting that a draft is “too big” and forcing a split.
- Validate-only rules (RFC 0009) beyond what deliver must write for those rules to pass.

## Design

Parse `--umbrella` / `--parent <id>` from argv alongside existing `--json` / `--root`. Constants for markers (`UMBRELLA_MARKER`, `PARENT_HEADER`). Pure helpers for template bodies. When linking into parent, update parent file in the same deliver change set so ROADMAP/TASK_TRACKING/RFC stay consistent.

## Acceptance

- `deliver 0010 foo "Bar" --umbrella` creates a valid umbrella stub.
- `deliver 0011 baz "Qux" --parent 0010` creates a child, links both ways, syncs ROADMAP/TASK_TRACKING.
- Failure modes (missing parent, non-umbrella parent) exit non-zero with clear errors.
- `npm test` covers the above.
