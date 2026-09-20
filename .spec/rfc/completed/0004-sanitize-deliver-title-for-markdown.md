# RFC 0004: Sanitize cmdDeliver title for markdown safety (child of 0002)

**Status:** Implemented

**Parent:** [0002](0002-harden-status-replace-and-title-sanitize.md)

## Summary

Sanitize titles before `cmdDeliver` writes them into ROADMAP markdown links, table cells, TASK_TRACKING lines, and RFC H1s, so `]`, `)`, `|`, and newlines cannot break structure.

## Problem

At ~line 233, title is interpolated raw:

```js
`| ${id} | [${title}](${path.relative(...)}) | Draft |\n`
```

CLI assembly at ~line 348 is `rest.slice(2).join(" ")` with no sanitization. `]`, `)`, `|`, or `\n` in the title breaks the link, splits the table row, or injects extra rows. Title also flows into TASK_TRACKING and `rfcTemplate` H1.

## Goals

- Pure helper (e.g. `sanitizeMarkdownTitle`) applied once at the write boundary in `cmdDeliver`.
- Collapse/reject newlines; escape or strip `]`, `)`, `|` for link/table safety.
- Regression tests for awkward titles; ROADMAP remains one well-formed row/link.

## Non-goals

- Broader CLI argv quoting overhaul beyond title safety.
- Changing how positional args are joined (`rest.slice(2).join(" ")` may stay).
- ROADMAP status-replace anchoring (RFC 0003).

## Design

Sanitize at write time in `cmdDeliver` before template / ROADMAP / TASK_TRACKING writes. Prefer stripping or replacing dangerous characters over rejecting the whole deliver, unless empty-after-sanitize should error.

## Acceptance

- Titles containing `]`, `)`, `|`, or newlines cannot inject extra ROADMAP rows or break `[text](url)`.
- Regression tests cover those characters.
- `npm test` passes.
