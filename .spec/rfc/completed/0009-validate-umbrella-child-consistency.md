# RFC 0009: Validate umbrella/child link consistency (child of 0006)

**Status:** Implemented

**Parent:** [0006](0006-one-concern-and-umbrella-rfc-convention.md)

## Summary

Teach `validate` (and optionally `sync-check`) to verify umbrella↔child declarations so broken or one-sided hierarchies fail or warn before commit.

## Problem

Even with docs (0007) and deliver flags (0008), hand edits drift: umbrella Children table missing a child, child `**Parent:**` pointing at the wrong id, or a file marked Umbrella with zero children after spawn should have happened. Nothing in validate catches that today.

## Goals

- If `**Type:** Umbrella` (or title/ROADMAP `(Umbrella)` marker): require a Children section listing at least one child id once the umbrella is past Draft *or* warn while Draft if Children is empty after deliver-with-children workflow — prefer: warn on empty Children; error if listed child id has no file / no matching Parent back-link.
- If `**Parent:** NNNN` present: parent file must exist; parent should be umbrella; child’s id should appear in parent’s Children list (mismatch = error or warning — prefer error for missing back-link).
- Keep one-concern as documentation + soft warning at most (no word-count hard fail).
- Tests for mutual link success and each failure mode.

## Non-goals

- Inferring concerns from prose.
- Blocking archive of umbrellas that still have Draft children (may be a warning in sync-check).

## Design

Extend `cmdValidate` with pure helpers: `parseUmbrellaChildren(text)`, `parseParentId(text)`, `isUmbrella(text)`. Reuse layout paths to resolve sibling RFC files. Optionally add a `sync-check` pass that lists active umbrellas with unresolved child links.

## Acceptance

- Broken parent/child links are reported by `validate` with actionable messages.
- Well-formed umbrella 0006 + children 0007–0009 (after 0008 markers exist) validate clean.
- `npm test` covers link consistency cases.
