#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const STATUSES = ["Draft", "Under Review", "Approved", "Implemented", "Rejected", "Superseded"];
const ARCHIVE_STATUSES = { Implemented: "completed", Rejected: "rejected", Superseded: "rejected" };

/** Marker written into RFC bodies and ROADMAP titles for umbrella RFCs. */
const UMBRELLA_TYPE_LINE = "**Type:** Umbrella";
const UMBRELLA_TITLE_SUFFIX = "(Umbrella)";
const PARENT_HEADER_RE = /\*\*Parent:\*\*\s*(?:\[([0-9]{4})\]|\*?([0-9]{4}))/;

function usage() {
  console.log(`specify <command> [args] [--json] [--root <dir>]

Commands:
  init                          Discover or scaffold ROADMAP.md / TASK_TRACKING.md / rfc/, print next RFC id
  validate <rfc-file>           Check one RFC file against schema + ROADMAP/status consistency
  deliver <id> <slug> <title>   Create RFC file + ROADMAP index row + TASK_TRACKING stub in one change set
                                [--umbrella]  umbrella template + Type marker
                                [--parent <id>]  child template, Parent link, append to umbrella Children
  advance <id> <status>         Move an RFC to a new status, syncing ROADMAP + RFC header
  archive <id>                  Move an Implemented/Rejected/Superseded RFC to its archive dir
  sync-check                    Verify ROADMAP, TASK_TRACKING, and rfc/ agree (pre-commit gate)
`);
}

function findRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const docDir = path.join(dir, ".spec");
    const rfcDir = path.join(docDir, "rfc");
    if (existsSync(rfcDir) && existsSync(path.join(docDir, "ROADMAP.md"))) {
      return { root: dir, docDir, rfcDir };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function paths(layout) {
  return {
    roadmap: path.join(layout.docDir, "ROADMAP.md"),
    tasks: path.join(layout.docDir, "TASK_TRACKING.md"),
    rfcDir: layout.rfcDir,
  };
}

async function readIfExists(p) {
  return existsSync(p) ? readFile(p, "utf8") : "";
}

function extractRoadmapIds(roadmapText) {
  // Match RFC references as markdown links to rfc files, e.g. [0154](.spec/rfc/completed/0154-slug.md)
  // or [0104](docs/rfc/0104-slug.md) — not bare 4-digit numbers, which collide with years/dates.
  const ids = [...roadmapText.matchAll(/\]\(\S*?\/([0-9]{4})-[a-z0-9-]+\.md\)/g)].map((m) => m[1]);
  return [...new Set(ids)].sort();
}

function nextId(existingIds) {
  const max = existingIds.reduce((acc, id) => Math.max(acc, parseInt(id, 10)), 0);
  return String(max + 1).padStart(4, "0");
}

function parseRfcHeader(rfcText) {
  // Accepts "**Status:** X", "**Status**: X", and "- **Status**: X", with an optional leading
  // emoji before the value. The value often carries a trailing parenthetical note (dates, scope) —
  // e.g. "Implemented（2026-07-24 …）" — so `status` keeps the full line and `statusWord` is just
  // the enum token used for comparisons.
  const statusMatch = rfcText.match(/\*\*Status:?\*\*:?\s*[^\w]*\s*(.+)/);
  const titleMatch = rfcText.match(/^#\s+(?:RFC\s+[0-9]{4}:\s*)?(.+)$/m);
  const status = statusMatch ? statusMatch[1].trim() : null;
  const statusWordMatch = status?.match(/^([A-Za-z][A-Za-z ]*[A-Za-z])/);
  return {
    status,
    statusWord: statusWordMatch ? statusWordMatch[1].trim() : status,
    title: titleMatch ? titleMatch[1].trim() : null,
  };
}

function parseSections(rfcText, required) {
  const sections = {};
  for (const name of required) {
    const re = new RegExp(`##\\s+${name}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
    const m = rfcText.match(re);
    sections[name] = m ? m[1].trim() : "";
  }
  return sections;
}

/** True when header metadata declares Type Umbrella or title carries the umbrella suffix. */
function isUmbrella(rfcText) {
  // Only the block before the first ## counts — RFC bodies often quote `**Type:** Umbrella` in prose.
  const headerBlock = rfcText.split(/^##\s+/m)[0] ?? rfcText;
  if (/^\*\*Type:\*\*\s*Umbrella\s*$/im.test(headerBlock)) return true;
  const { title } = parseRfcHeader(rfcText);
  return Boolean(title && title.includes(UMBRELLA_TITLE_SUFFIX));
}

/** Extract parent id from `**Parent:** [NNNN](...)` or `**Parent:** NNNN`. */
function parseParentId(rfcText) {
  const m = rfcText.match(PARENT_HEADER_RE);
  return m ? m[1] || m[2] : null;
}

/** Extract child RFC ids listed under a ## Children section. */
function parseUmbrellaChildren(rfcText) {
  const section = parseSections(rfcText, ["Children"]).Children;
  if (!section) return [];
  const ids = [];
  for (const m of section.matchAll(/\[([0-9]{4})\]\([^)]+\)/g)) {
    ids.push(m[1]);
  }
  return [...new Set(ids)];
}

/** Resolve `NNNN-*.md` under rfcDir, completed/, or rejected/. */
async function findRfcPathById(rfcDir, id) {
  const { glob } = await import("node:fs/promises");
  const patterns = [`${id}-*.md`, `completed/${id}-*.md`, `rejected/${id}-*.md`];
  for (const pattern of patterns) {
    for await (const entry of glob(pattern, { cwd: rfcDir })) {
      return path.join(rfcDir, entry);
    }
  }
  return null;
}

function ensureTitleSuffix(title, suffix) {
  return title.includes(suffix) ? title : `${title} ${suffix}`;
}

/** Longer status phrases first so "Under Review" wins over shorter tokens. */
function statusAlternation() {
  return [...STATUSES]
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

/**
 * Strip characters that break markdown links or table rows when interpolated as a title.
 * Newlines → space; `]`, `)`, `|` removed.
 */
function sanitizeMarkdownTitle(title) {
  return String(title)
    .replace(/[\r\n]+/g, " ")
    .replace(/[\])|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Update only the ROADMAP status for `id` — never title/link text that happens to contain a status word.
 */
function replaceRoadmapLineStatus(line, id, newStatus) {
  if (!line.includes(id)) return line;
  const alt = statusAlternation();
  const tableRe = new RegExp(
    `(\\|\\s*${id}\\s*\\|\\s*\\[[^\\]]*\\]\\([^)]+\\)\\s*\\|\\s*)(${alt})(\\s*\\|)`,
  );
  if (tableRe.test(line)) {
    return line.replace(tableRe, `$1${newStatus}$3`);
  }
  // Free-form / prose index: first status token after the markdown link for this id
  const linkRe = new RegExp(`\\]\\(\\S*?/${id}-[a-z0-9-]+\\.md\\)`);
  const linkMatch = linkRe.exec(line);
  if (!linkMatch) return line;
  const closeIdx = line.indexOf(")", linkMatch.index);
  if (closeIdx < 0) return line;
  const before = line.slice(0, closeIdx + 1);
  const after = line.slice(closeIdx + 1);
  if (!new RegExp(`\\b(${alt})\\b`).test(after)) return line;
  return before + after.replace(new RegExp(`\\b(${alt})\\b`), newStatus);
}

/**
 * Read ROADMAP status for an id from its table row Status cell, or the first status
 * token after its markdown link on the same line. Ignores status words in other prose.
 */
function extractRoadmapStatusForId(roadmapText, id) {
  const alt = statusAlternation();
  const linkRe = new RegExp(`\\]\\(\\S*?/${id}-[a-z0-9-]+\\.md\\)`);
  for (const line of roadmapText.split("\n")) {
    if (!linkRe.test(line)) continue;
    const tableM = line.match(
      new RegExp(`\\|\\s*${id}\\s*\\|\\s*\\[[^\\]]*\\]\\([^)]+\\)\\s*\\|\\s*(${alt})\\s*\\|`),
    );
    if (tableM) return tableM[1];
    const linkMatch = linkRe.exec(line);
    if (!linkMatch) continue;
    const closeIdx = line.indexOf(")", linkMatch.index);
    if (closeIdx < 0) continue;
    const after = line.slice(closeIdx + 1);
    const m = after.match(new RegExp(`\\b(${alt})\\b`));
    if (m) return m[1];
  }
  return null;
}

function rfcTemplateStandard(id, title) {
  return `# RFC ${id}: ${title}

**Status:** Draft

## Summary

TODO: one-paragraph summary.

## Problem

TODO: why this RFC exists.

## Goals

TODO: what it aims to achieve.

## Non-goals

TODO: explicitly out of scope.

## Design

TODO: technical approach, files/modules touched.

## Acceptance

TODO: how to verify this is done.
`;
}

function rfcTemplateUmbrella(id, title) {
  const displayTitle = ensureTitleSuffix(title, UMBRELLA_TITLE_SUFFIX);
  return `# RFC ${id}: ${displayTitle}

**Status:** Draft

${UMBRELLA_TYPE_LINE}

## Summary

TODO: one-paragraph theme summary. Index children only — no implementation details here.

## Problem

TODO: why this theme needs an umbrella.

## Goals

TODO: completion criteria for the umbrella (usually: children Approved/Implemented).

## Non-goals

TODO: what stays out of this umbrella (and must not reopen it later).

## Children

| RFC | Concern |
|-----|---------|

## Acceptance

TODO: umbrella may close when listed children meet the Goals criteria; never reopen for new work.
`;
}

function rfcTemplateChild(id, title, parentId, parentRelLink) {
  const displayTitle = ensureTitleSuffix(title, `(child of ${parentId})`);
  return `# RFC ${id}: ${displayTitle}

**Status:** Draft

**Parent:** [${parentId}](${parentRelLink})

## Summary

TODO: one-paragraph summary of this single concern.

## Problem

TODO: why this child exists.

## Goals

TODO: what this one concern achieves.

## Non-goals

TODO: explicitly out of scope (belongs in siblings or elsewhere).

## Design

TODO: technical approach, files/modules touched.

## Acceptance

TODO: how to verify this child is done.
`;
}

/**
 * Insert a Children-table row for `childId` into an umbrella body.
 * Returns null if a row for that id already exists.
 */
function appendChildRowToUmbrella(umbrellaText, childId, _childSlug, childTitle, childRelFromParent) {
  if (parseUmbrellaChildren(umbrellaText).includes(childId)) {
    return null;
  }
  const row = `| [${childId}](${childRelFromParent}) | ${childTitle} |`;
  const childrenHeader = /^##\s+Children\s*$/m;
  if (!childrenHeader.test(umbrellaText)) {
    return `${umbrellaText.trimEnd()}\n\n## Children\n\n| RFC | Concern |\n|-----|---------|\n${row}\n`;
  }
  // Append after the header separator line when present; otherwise after the ## Children heading.
  const withSeparator = umbrellaText.match(/##\s+Children\s*\n\|[^\n]+\|\n\|[-| ]+\|\n/);
  if (withSeparator) {
    const insertAt = withSeparator.index + withSeparator[0].length;
    return umbrellaText.slice(0, insertAt) + `${row}\n` + umbrellaText.slice(insertAt);
  }
  return umbrellaText.replace(/(##\s+Children\s*\n)/, `$1\n| RFC | Concern |\n|-----|---------|\n${row}\n`);
}

async function cmdInit(layout, rootArg) {
  if (!layout) {
    const root = path.resolve(rootArg);
    const rfcDir = path.join(root, ".spec", "rfc");
    const roadmapPath = path.join(root, ".spec", "ROADMAP.md");
    const tasksPath = path.join(root, ".spec", "TASK_TRACKING.md");
    await mkdir(rfcDir, { recursive: true });
    await mkdir(path.join(rfcDir, "completed"), { recursive: true });
    await mkdir(path.join(rfcDir, "rejected"), { recursive: true });
    await writeFile(roadmapPath, "# Roadmap\n\n| RFC | Title | Status |\n|-----|-------|--------|\n");
    await writeFile(tasksPath, "# Task Tracking\n");
    layout = { root, docDir: path.join(root, ".spec"), rfcDir };
    const p = paths(layout);
    return {
      ok: true,
      scaffolded: true,
      root: layout.root,
      roadmap: p.roadmap,
      tasks: p.tasks,
      rfcDir: p.rfcDir,
      existingIds: [],
      nextId: "0001",
    };
  }
  const p = paths(layout);
  const roadmapText = await readIfExists(p.roadmap);
  const ids = extractRoadmapIds(roadmapText);
  return {
    ok: true,
    root: layout.root,
    roadmap: p.roadmap,
    tasks: p.tasks,
    rfcDir: p.rfcDir,
    existingIds: ids,
    nextId: nextId(ids),
  };
}

/**
 * Enforce umbrella/child mutual links (RFC 0009).
 * Mutates errors/warnings arrays in place.
 */
async function checkUmbrellaChildLinks(layout, rfcFile, text, id, errors, warnings) {
  if (!layout || !id) return;
  const p = paths(layout);
  const umbrella = isUmbrella(text);
  const parentId = parseParentId(text);
  const children = parseUmbrellaChildren(text);

  if (umbrella && parentId) {
    errors.push(`RFC ${id} is marked Umbrella but also declares Parent ${parentId} — pick one role`);
  }
  if (umbrella && children.length === 0) {
    warnings.push(`Umbrella RFC ${id} has an empty Children table — spawn child RFCs with deliver --parent ${id}`);
  }
  if (umbrella) {
    for (const childId of children) {
      const childPath = await findRfcPathById(p.rfcDir, childId);
      if (!childPath) {
        errors.push(`Umbrella ${id} lists child ${childId} but no RFC file was found`);
        continue;
      }
      const childText = await readFile(childPath, "utf8");
      const backParent = parseParentId(childText);
      if (backParent !== id) {
        errors.push(
          `Umbrella ${id} lists child ${childId}, but that RFC's Parent is ${backParent ?? "(missing)"} — expected ${id}`,
        );
      }
    }
  }

  if (parentId) {
    const parentPath = await findRfcPathById(p.rfcDir, parentId);
    if (!parentPath) {
      errors.push(`RFC ${id} declares Parent ${parentId} but no parent RFC file was found`);
      return;
    }
    const parentText = await readFile(parentPath, "utf8");
    if (!isUmbrella(parentText)) {
      errors.push(`RFC ${id} declares Parent ${parentId}, but that RFC is not marked Umbrella`);
    }
    const listed = parseUmbrellaChildren(parentText);
    if (!listed.includes(id)) {
      errors.push(`RFC ${id} declares Parent ${parentId}, but umbrella ${parentId}'s Children table does not list ${id}`);
    }
  }
}

async function cmdValidate(layout, rfcFile) {
  const errors = [];
  if (!existsSync(rfcFile)) {
    return { ok: false, errors: [`RFC file not found: ${rfcFile}`] };
  }
  const text = await readFile(rfcFile, "utf8");
  const filename = path.basename(rfcFile);
  const filenameMatch = filename.match(/^([0-9]{4})-([a-z0-9-]+)\.md$/);
  if (!filenameMatch) {
    errors.push(`Filename must match NNNN-kebab-slug.md, got: ${filename}`);
  }
  const { status, statusWord, title } = parseRfcHeader(text);
  if (!status) errors.push('Missing "**Status:** <Status>" header line');
  if (statusWord && !STATUSES.includes(statusWord)) {
    errors.push(`Status "${statusWord}" not in enum: ${STATUSES.join(", ")}`);
  }
  if (!title) errors.push("Missing H1 title line");
  const isArchived = /[/\\](completed|rejected)[/\\]/.test(rfcFile);

  // Only "Summary" is universal across this project's RFCs (Problem/Goals/Design/Delivery/Acceptance
  // vary by author and era). Missing Summary is an error; missing recommended sections is a warning.
  const required = ["Summary"];
  const recommended = ["Problem", "Goals", "Acceptance"];
  const sections = parseSections(text, [...required, ...recommended]);
  const warnings = [];
  for (const name of required) {
    if (!sections[name]) errors.push(`Missing or empty section: ## ${name}`);
  }
  for (const name of recommended) {
    if (!sections[name]) warnings.push(`Recommended section missing: ## ${name}`);
  }

  // Checklists in an active RFC duplicate TASK_TRACKING.md and drift out of sync; a checklist in an
  // already-archived RFC (completed/rejected) is a legitimate historical record of what shipped.
  if (!isArchived && /^\s*-\s*\[[ x]\]/m.test(text)) {
    errors.push("RFC body contains task checklist items — checklists belong in TASK_TRACKING.md only");
  }

  if (statusWord === "Superseded" && !/superseded by\s+[0-9]{4}/i.test(text)) {
    errors.push('Status is Superseded but no "superseded by NNNN" reference found');
  }

  // ROADMAP status probe: prefer the Status column (or post-link token) on the same line as the
  // RFC's markdown link — never the first status-like word within a 200-char window of the id.
  if (layout && filenameMatch) {
    const p = paths(layout);
    const roadmapText = await readIfExists(p.roadmap);
    const id = filenameMatch[1];
    const roadmapStatus = extractRoadmapStatusForId(roadmapText, id);
    if (roadmapStatus && statusWord && roadmapStatus !== statusWord) {
      warnings.push(
        `Possible status mismatch: RFC header says "${statusWord}", ROADMAP.md row says "${roadmapStatus}" — verify manually`,
      );
    }
  }

  await checkUmbrellaChildLinks(layout, rfcFile, text, filenameMatch?.[1], errors, warnings);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    id: filenameMatch?.[1],
    status,
    title,
    role: isUmbrella(text) ? "umbrella" : parseParentId(text) ? "child" : "standalone",
  };
}

async function cmdDeliver(layout, id, slug, title, options = {}) {
  const { umbrella = false, parentId = null } = options;
  if (!layout) return { ok: false, errors: ["No ROADMAP/rfc tree found. Run `specify init` first."] };
  if (!/^[0-9]{4}$/.test(id)) return { ok: false, errors: [`id must be 4 digits, got: ${id}`] };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { ok: false, errors: [`slug must be kebab-case, got: ${slug}`] };
  if (umbrella && parentId) {
    return { ok: false, errors: ["Cannot combine --umbrella and --parent; an RFC is one role only"] };
  }
  const safeTitle = sanitizeMarkdownTitle(title ?? "");
  if (!safeTitle) {
    return { ok: false, errors: ["title is required (empty after sanitization)"] };
  }
  title = safeTitle;

  const p = paths(layout);
  await mkdir(p.rfcDir, { recursive: true });
  const rfcPath = path.join(p.rfcDir, `${id}-${slug}.md`);
  if (existsSync(rfcPath)) return { ok: false, errors: [`RFC file already exists: ${rfcPath}`] };

  let body;
  let roadmapTitle = title;
  let parentPath = null;

  if (umbrella) {
    body = rfcTemplateUmbrella(id, title);
    roadmapTitle = ensureTitleSuffix(title, UMBRELLA_TITLE_SUFFIX);
  } else if (parentId) {
    if (!/^[0-9]{4}$/.test(parentId)) {
      return { ok: false, errors: [`--parent id must be 4 digits, got: ${parentId}`] };
    }
    parentPath = await findRfcPathById(p.rfcDir, parentId);
    if (!parentPath) {
      return { ok: false, errors: [`--parent ${parentId}: no RFC file found`] };
    }
    const parentText = await readFile(parentPath, "utf8");
    if (!isUmbrella(parentText)) {
      return { ok: false, errors: [`--parent ${parentId} is not marked Umbrella (add **Type:** Umbrella or deliver it with --umbrella)`] };
    }
    const parentRel = path.relative(p.rfcDir, parentPath).split(path.sep).join("/");
    body = rfcTemplateChild(id, title, parentId, parentRel);
    roadmapTitle = ensureTitleSuffix(title, `(child of ${parentId})`);
  } else {
    body = rfcTemplateStandard(id, title);
  }

  await writeFile(rfcPath, body, "utf8");

  if (parentPath) {
    const parentText = await readFile(parentPath, "utf8");
    const childRelFromParent = path.relative(path.dirname(parentPath), rfcPath).split(path.sep).join("/");
    const updatedParent = appendChildRowToUmbrella(parentText, id, slug, title, childRelFromParent);
    if (updatedParent) {
      await writeFile(parentPath, updatedParent, "utf8");
    }
  }

  const roadmapText = await readIfExists(p.roadmap);
  const relRfc = path.relative(path.dirname(p.roadmap), rfcPath).split(path.sep).join("/");
  const indexRow = `| ${id} | [${roadmapTitle}](${relRfc}) | Draft |\n`;
  await writeFile(p.roadmap, roadmapText + (roadmapText.endsWith("\n") ? "" : "\n") + indexRow, "utf8");

  const tasksText = await readIfExists(p.tasks);
  const taskLine = `- [ ] Implement RFC ${id}: ${roadmapTitle} (RFC ${id})\n`;
  await writeFile(p.tasks, tasksText + (tasksText.endsWith("\n") ? "" : "\n") + taskLine, "utf8");

  return {
    ok: true,
    rfcPath,
    roadmap: p.roadmap,
    tasks: p.tasks,
    role: umbrella ? "umbrella" : parentId ? "child" : "standalone",
    parentId: parentId || undefined,
    title: roadmapTitle,
  };
}

async function cmdAdvance(layout, id, newStatus) {
  if (!layout) return { ok: false, errors: ["No ROADMAP/rfc tree found."] };
  if (!STATUSES.includes(newStatus)) {
    return { ok: false, errors: [`Status must be one of: ${STATUSES.join(", ")}`] };
  }
  const p = paths(layout);
  const { glob } = await import("node:fs/promises");
  let rfcPath = null;
  for await (const entry of glob(`${id}-*.md`, { cwd: p.rfcDir })) {
    rfcPath = path.join(p.rfcDir, entry);
  }
  if (!rfcPath) return { ok: false, errors: [`No RFC file found for id ${id} in ${p.rfcDir}`] };

  const text = await readFile(rfcPath, "utf8");
  const updated = text.replace(/\*\*Status:\*\*\s*.+/, `**Status:** ${newStatus}`);
  await writeFile(rfcPath, updated, "utf8");

  const roadmapText = await readFile(p.roadmap, "utf8");
  const lines = roadmapText.split("\n").map((line) => replaceRoadmapLineStatus(line, id, newStatus));
  await writeFile(p.roadmap, lines.join("\n"), "utf8");

  return { ok: true, rfcPath, roadmap: p.roadmap, newStatus, needsArchive: newStatus in ARCHIVE_STATUSES };
}

async function cmdArchive(layout, id) {
  if (!layout) return { ok: false, errors: ["No ROADMAP/rfc tree found."] };
  const p = paths(layout);
  const { glob } = await import("node:fs/promises");
  let rfcPath = null;
  for await (const entry of glob(`${id}-*.md`, { cwd: p.rfcDir })) {
    rfcPath = path.join(p.rfcDir, entry);
  }
  if (!rfcPath) return { ok: false, errors: [`No active RFC file found for id ${id}`] };

  const text = await readFile(rfcPath, "utf8");
  const { statusWord } = parseRfcHeader(text);
  const archiveSub = ARCHIVE_STATUSES[statusWord];
  if (!archiveSub) {
    return { ok: false, errors: [`Status "${statusWord}" is not archivable (must be Implemented, Rejected, or Superseded)`] };
  }
  const destDir = path.join(p.rfcDir, archiveSub);
  await mkdir(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(rfcPath));
  await rename(rfcPath, dest);
  return { ok: true, from: rfcPath, to: dest, status: statusWord };
}

async function cmdSyncCheck(layout) {
  if (!layout) return { ok: false, errors: ["No ROADMAP/rfc tree found."] };
  const p = paths(layout);
  const errors = [];
  const warnings = [];
  const roadmapText = await readIfExists(p.roadmap);
  const roadmapIds = extractRoadmapIds(roadmapText);

  const { glob } = await import("node:fs/promises");
  const activeIds = [];
  const activeFiles = [];
  for await (const entry of glob("*.md", { cwd: p.rfcDir })) {
    const m = entry.match(/^([0-9]{4})-/);
    if (m) {
      activeIds.push(m[1]);
      activeFiles.push(path.join(p.rfcDir, entry));
    }
  }

  for (const id of activeIds) {
    if (!roadmapIds.includes(id)) {
      errors.push(`RFC ${id} exists in ${p.rfcDir} but has no ROADMAP.md index row`);
    }
  }

  for (const dir of ["completed", "rejected"]) {
    const archiveDir = path.join(p.rfcDir, dir);
    if (!existsSync(archiveDir)) continue;
    for await (const entry of glob("*.md", { cwd: archiveDir })) {
      const m = entry.match(/^([0-9]{4})-/);
      if (m && activeIds.includes(m[1])) {
        errors.push(`RFC ${m[1]} appears both active and archived (${dir}/)`);
      }
    }
  }

  // Soft umbrella/child consistency pass — same rules as validate, aggregated for the tree.
  for (const file of activeFiles) {
    const text = await readFile(file, "utf8");
    const id = path.basename(file).slice(0, 4);
    const localErrors = [];
    const localWarnings = [];
    await checkUmbrellaChildLinks(layout, file, text, id, localErrors, localWarnings);
    errors.push(...localErrors);
    warnings.push(...localWarnings);
  }

  return { ok: errors.length === 0, errors, warnings, roadmapIds, activeIds };
}

/** Strip global flags; return { positional, jsonMode, rootArg, umbrella, parentId }. */
function parseArgv(argv) {
  const args = [...argv];
  const jsonMode = args.includes("--json");
  const umbrella = args.includes("--umbrella");
  let parentId = null;
  const parentIdx = args.indexOf("--parent");
  if (parentIdx >= 0) {
    parentId = args[parentIdx + 1] ?? null;
  }
  const rootIdx = args.indexOf("--root");
  const rootArg = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();

  const skip = new Set();
  if (jsonMode) skip.add(args.indexOf("--json"));
  if (umbrella) skip.add(args.indexOf("--umbrella"));
  if (parentIdx >= 0) {
    skip.add(parentIdx);
    if (parentIdx + 1 < args.length) skip.add(parentIdx + 1);
  }
  if (rootIdx >= 0) {
    skip.add(rootIdx);
    if (rootIdx + 1 < args.length) skip.add(rootIdx + 1);
  }
  const positional = args.filter((_, i) => !skip.has(i));
  return { positional, jsonMode, rootArg, umbrella, parentId };
}

async function main() {
  const { positional, jsonMode, rootArg, umbrella, parentId } = parseArgv(process.argv.slice(2));
  const [command, ...rest] = positional;

  const layout = findRoot(path.resolve(rootArg));

  let result;
  switch (command) {
    case "init":
      result = await cmdInit(layout, rootArg);
      break;
    case "validate":
      result = await cmdValidate(layout, rest[0]);
      break;
    case "deliver":
      result = await cmdDeliver(layout, rest[0], rest[1], rest.slice(2).join(" "), { umbrella, parentId });
      break;
    case "advance":
      result = await cmdAdvance(layout, rest[0], rest[1]);
      break;
    case "archive":
      result = await cmdArchive(layout, rest[0]);
      break;
    case "sync-check":
      result = await cmdSyncCheck(layout);
      break;
    default:
      usage();
      process.exit(command ? 1 : 0);
  }

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.ok ? "OK" : "FAILED");
    for (const [k, v] of Object.entries(result)) {
      if (k === "ok") continue;
      console.log(`${k}: ${Array.isArray(v) ? "\n  - " + v.join("\n  - ") : JSON.stringify(v)}`);
    }
  }
  process.exit(result.ok ? 0 : 1);
}

main();
