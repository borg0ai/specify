# RFC 0002: CLI status/title hardening (Umbrella)

**Status:** Implemented

**Type:** Umbrella

## Summary

Coordinate one-concern child RFCs that harden `specify` write/read paths around status words and titles. This umbrella defines scope and completion criteria only — implementation lives in children. Bug 2 (RFC-body `**Status:**` replace) is verified safe and has no child.

## Problem

Several related defects sit in `specify/bin/specify.mjs` (unanchored ROADMAP status replace, title markdown injection, validate false-positive status probe). Bundling them in one implementation RFC violates one-concern discipline. An umbrella keeps the theme visible while each fix ships as its own reviewable unit.

## Goals

- Index child RFCs for Bugs 1, 3, and 4; record Bug 2 as verified-no-change.
- Umbrella reaches Implemented when all children are Approved (or Implemented) and tracked — not when every line of code has shipped.
- Never reopen this umbrella for new defects; spawn a new child or a new umbrella instead.

## Non-goals

- Implementation details (regex anchors, sanitizers, tests) — those belong in children.
- Changing the status enum or RFC lifecycle statuses.
- The separate governance work that makes `specify` itself enforce one-concern + umbrella (see RFC 0006).

## Children

| RFC | Concern | Severity |
|-----|---------|----------|
| [0003](0003-anchor-advance-roadmap-status-replace.md) | Bug 1: anchor `cmdAdvance` ROADMAP status replace | High |
| [0004](0004-sanitize-deliver-title-for-markdown.md) | Bug 4: sanitize `cmdDeliver` title for markdown/table safety | Medium |
| [0005](0005-tighten-validate-roadmap-status-probe.md) | Bug 3: tighten `cmdValidate` nearby-status warning | Low |

**Verified, no child:** Bug 2 — `cmdAdvance` RFC-body replace at `/\*\*Status:\*\*\s*.+/` is already header-anchored; leave as-is unless a later RFC scopes header-format parity with `parseRfcHeader`.

## Design

Umbrella only. Child RFCs own Design/Acceptance for their concern. Recommended order: 0003 then 0004 (both mutations); 0005 last (warning-only).

## Acceptance

- Children 0003–0005 exist, are indexed in ROADMAP, and each addresses exactly one concern.
- Bug 2 documented here as verified-no-change.
- This umbrella may advance to Implemented once children are Approved or Implemented and TASK_TRACKING reflects them; do not reopen for new work.
