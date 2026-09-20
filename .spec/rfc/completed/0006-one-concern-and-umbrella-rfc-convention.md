# RFC 0006: One-concern RFCs and umbrella/child convention in specify (Umbrella)

**Status:** Implemented

**Type:** Umbrella

## Summary

Make `specify` encode and enforce the house rule already used across sibling projects: **one RFC = one concern**, and multi-concern themes ship as an **umbrella RFC** that indexes **child RFCs**. Agents and humans following SKILL.md + CLI should not recreate mega-RFCs by default.

## Problem

`specify` today helps create/validate/advance/archive RFCs but is silent on scope discipline. Authors (and agents) naturally dump related bugs into one body — exactly what produced the original RFC 0002 mega-doc. Sibling repos already practice umbrella + children (e.g. commando RFC-038 → 039/040/041; Photasa “one concern per RFC”; umbrella lifecycle: spawn children → close umbrella → never reopen). That knowledge lives in memory, not in this skill.

## Goals

- Document the convention in `specify/SKILL.md` so every consumer of the skill sees it first.
- Give `deliver` first-class umbrella/child support (`--umbrella`, `--parent <id>`) and distinct templates.
- Teach `validate` (and where useful `sync-check`) to check umbrella↔child link consistency.
- Dogfood: RFC 0002 + children 0003–0005 already follow the pattern this umbrella formalizes.

## Non-goals

- Auto-splitting an existing mega-RFC (human/agent judgment).
- Hard-failing every large RFC by word count alone (heuristics only as warnings unless link rules fail).
- Changing the status enum.
- Implementing the CLI mutation bugfixes themselves (umbrella 0002 / children 0003–0005).

## Children

| RFC | Concern |
|-----|---------|
| [0007](0007-document-one-concern-umbrella-in-skill.md) | Document one-concern + umbrella lifecycle in SKILL.md |
| [0008](0008-deliver-umbrella-parent-cli.md) | `deliver --umbrella` / `--parent` + templates |
| [0009](0009-validate-umbrella-child-consistency.md) | Validate umbrella/child link consistency |

## Design

Umbrella only. Convention rules (stated here for children to implement against):

1. **One concern** — one shippable decision or fix per child RFC; no mixing unrelated mutations.
2. **Umbrella** — indexes children, states completion criteria, holds cross-cutting non-goals; no implementation checklists in the body.
3. **Lifecycle** — Create umbrella → spawn children → track work on children → close umbrella when children are Approved/Implemented → **never reopen** umbrella for new work (new child or new umbrella).
4. **Parent/child links** — umbrella lists children; each child declares `**Parent:**` (or equivalent) back to the umbrella.

## Acceptance

- Children 0007–0009 exist and are indexed.
- After children ship: SKILL.md states the rules; `deliver` can create umbrella/child shapes; `validate` flags broken umbrella/child links.
- This umbrella may advance to Implemented when children are Approved or Implemented; do not reopen.
