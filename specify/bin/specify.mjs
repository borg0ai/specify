#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const STATUSES = ["Draft", "Under Review", "Approved", "Implemented", "Rejected", "Superseded"];
const ARCHIVE_STATUSES = { Implemented: "completed", Rejected: "rejected", Superseded: "rejected" };

function usage() {
  console.log(`specify <command> [args] [--json] [--root <dir>]

Commands:
  init                          Discover or scaffold ROADMAP.md / TASK_TRACKING.md / rfc/, print next RFC id
  validate <rfc-file>           Check one RFC file against schema + ROADMAP/status consistency
  deliver <id> <slug> <title>   Create RFC file + ROADMAP index row + TASK_TRACKING stub in one change set
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

  // ROADMAP.md in this project is free-form prose with markdown links to RFCs, not a structured
  // table — a nearby status word is a hint, not proof, so mismatches here are a warning, not
  // an error. This only checks RFCs referenced with a `[NNNN](.../NNNN-slug.md)` link; a RFC
  // absent from ROADMAP.md entirely gets no warning here (many older RFCs predate that convention).
  if (layout && filenameMatch) {
    const p = paths(layout);
    const roadmapText = await readIfExists(p.roadmap);
    const id = filenameMatch[1];
    const linkPattern = new RegExp(`\\]\\(\\S*?/${id}-[a-z0-9-]+\\.md\\)`);
    if (linkPattern.test(roadmapText)) {
      const idPattern = new RegExp(`\\b${id}\\b[\\s\\S]{0,200}?\\b(${STATUSES.join("|")})\\b`);
      const m = roadmapText.match(idPattern);
      if (m && statusWord && m[1] !== statusWord) {
        warnings.push(`Possible status mismatch: RFC header says "${statusWord}", nearby ROADMAP.md text says "${m[1]}" — verify manually`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, id: filenameMatch?.[1], status, title };
}

function rfcTemplate(id, title) {
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

async function cmdDeliver(layout, id, slug, title) {
  if (!layout) return { ok: false, errors: ["No ROADMAP/rfc tree found. Run `specify init` first."] };
  if (!/^[0-9]{4}$/.test(id)) return { ok: false, errors: [`id must be 4 digits, got: ${id}`] };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { ok: false, errors: [`slug must be kebab-case, got: ${slug}`] };

  const p = paths(layout);
  await mkdir(p.rfcDir, { recursive: true });
  const rfcPath = path.join(p.rfcDir, `${id}-${slug}.md`);
  if (existsSync(rfcPath)) return { ok: false, errors: [`RFC file already exists: ${rfcPath}`] };

  await writeFile(rfcPath, rfcTemplate(id, title), "utf8");

  const roadmapText = await readIfExists(p.roadmap);
  const indexRow = `| ${id} | [${title}](${path.relative(path.dirname(p.roadmap), rfcPath)}) | Draft |\n`;
  await writeFile(p.roadmap, roadmapText + (roadmapText.endsWith("\n") ? "" : "\n") + indexRow, "utf8");

  const tasksText = await readIfExists(p.tasks);
  const taskLine = `- [ ] Implement RFC ${id}: ${title} (RFC ${id})\n`;
  await writeFile(p.tasks, tasksText + (tasksText.endsWith("\n") ? "" : "\n") + taskLine, "utf8");

  return { ok: true, rfcPath, roadmap: p.roadmap, tasks: p.tasks };
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
  const lines = roadmapText.split("\n").map((line) => {
    if (line.includes(id)) {
      return line.replace(new RegExp(STATUSES.join("|")), newStatus);
    }
    return line;
  });
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
  const roadmapText = await readIfExists(p.roadmap);
  const roadmapIds = extractRoadmapIds(roadmapText);

  const { glob } = await import("node:fs/promises");
  const activeIds = [];
  for await (const entry of glob("*.md", { cwd: p.rfcDir })) {
    const m = entry.match(/^([0-9]{4})-/);
    if (m) activeIds.push(m[1]);
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

  return { ok: errors.length === 0, errors, roadmapIds, activeIds };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const rootIdx = args.indexOf("--root");
  const rootArg = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
  const positional = args.filter((a, i) => a !== "--json" && (rootIdx < 0 || (i !== rootIdx && i !== rootIdx + 1)));
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
      result = await cmdDeliver(layout, rest[0], rest[1], rest.slice(2).join(" "));
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
