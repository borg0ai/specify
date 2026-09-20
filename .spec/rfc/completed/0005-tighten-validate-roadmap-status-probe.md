# RFC 0005: Tighten cmdValidate ROADMAP status probe (child of 0002)

**Status:** Implemented

**Parent:** [0002](0002-harden-status-replace-and-title-sanitize.md)

## Summary

Narrow `cmdValidate`'s nearby-status regex so status-like words in prose near an RFC id do not false-positive as ROADMAP status mismatches. Remains warning-only.

## Problem

At ~line 178:

```js
new RegExp(`\\b${id}\\b[\\s\\S]{0,200}?\\b(${STATUSES.join("|")})\\b`)
```

First status-like word within 200 characters of the id is treated as the ROADMAP status. Prose mentioning `Draft` / `Approved` near the id can warn incorrectly. Lower severity (read-only warning) but erodes trust in validate.

## Goals

- Prefer Status column of the same table row that links the RFC, or require the status word after the link on that line.
- Keep mismatches as warnings, not errors.
- Optional test: prose with a status word near the id does not warn when the Status column agrees.

## Non-goals

- Promoting this check to a hard failure.
- Mutation path fixes (RFCs 0003, 0004).

## Design

Parse the ROADMAP row containing `](.../NNNN-....md)` for that id and read its status cell when the table shape is present; fall back to a post-link-on-same-line match for free-form ROADMAP prose.

## Acceptance

- False positives from nearby prose are eliminated or sharply reduced for table-shaped ROADMAP rows.
- Check stays warning-only.
- `npm test` passes when a stability case is added.
