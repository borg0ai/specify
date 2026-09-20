# RFC 0003: Anchor cmdAdvance ROADMAP status replace (child of 0002)

**Status:** Implemented

**Parent:** [0002](0002-harden-status-replace-and-title-sanitize.md)

## Summary

Fix `cmdAdvance`'s ROADMAP line rewrite so only the status field changes. Today an unanchored `STATUSES.join("|")` replace corrupts titles that contain enum words.

## Problem

In `specify/bin/specify.mjs` (~line 263), lines containing the RFC id are rewritten with:

```js
line.replace(new RegExp(STATUSES.join("|")), newStatus)
```

First enum token anywhere on the line wins. A title like `Draft Mode for Approved Content` loses `Draft` instead of updating the Status column. Silent mutation bug.

## Goals

- Replace only the ROADMAP status cell (or the status token after the markdown link), never title/link text.
- Regression test: advance an RFC whose title contains a status word; assert title unchanged and status column updated.

## Non-goals

- RFC-body `**Status:**` replace (Bug 2 — verified safe under umbrella 0002).
- Title sanitization (RFC 0004).
- Validate warning probe (RFC 0005).

## Design

Prefer matching the trailing status column of a table row that contains the id link, or replace a status token only after the closing `)` of the markdown link on that line. Avoid bare whole-line `STATUSES.join("|")`.

## Acceptance

- Advancing status never mutates title/link text that contains an enum word.
- New regression test covers the title-with-status-word case.
- `npm test` passes.
