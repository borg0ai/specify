import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, "..", "specify", "bin", "specify.mjs");

async function run(args, cwd) {
  try {
    const { stdout } = await execFileP("node", [CLI, ...args, "--json"], { cwd });
    return JSON.parse(stdout);
  } catch (err) {
    return JSON.parse(err.stdout);
  }
}

async function makeFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "specify-test-"));
  await mkdir(path.join(dir, ".spec", "rfc", "completed"), { recursive: true });
  await writeFile(path.join(dir, ".spec", "ROADMAP.md"), "# ROADMAP\n\nSee [0001](.spec/rfc/0001-first.md).\n");
  await writeFile(path.join(dir, ".spec", "TASK_TRACKING.md"), "# TASK_TRACKING\n");
  await writeFile(
    path.join(dir, ".spec", "rfc", "0001-first.md"),
    "# RFC 0001: First\n\n**Status:** Draft\n\n## Summary\n\nTest.\n",
  );
  return dir;
}

test("init finds existing .spec layout and computes next id", async () => {
  const dir = await makeFixture();
  const result = await run(["init"], dir);
  assert.equal(result.ok, true);
  assert.deepEqual(result.existingIds, ["0001"]);
  assert.equal(result.nextId, "0002");
  await rm(dir, { recursive: true, force: true });
});

test("init scaffolds .spec/rfc, ROADMAP.md, and TASK_TRACKING.md in an empty repo", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "specify-test-"));
  const result = await run(["init"], dir);
  assert.equal(result.ok, true);
  assert.equal(result.scaffolded, true);
  assert.equal(result.nextId, "0001");
  assert.deepEqual(result.existingIds, []);
  await readFile(path.join(dir, ".spec", "ROADMAP.md"), "utf8");
  await readFile(path.join(dir, ".spec", "TASK_TRACKING.md"), "utf8");

  const deliverResult = await run(["deliver", "0001", "first", "First RFC"], dir);
  assert.equal(deliverResult.ok, true);

  const second = await run(["init"], dir);
  assert.equal(second.ok, true);
  assert.ok(!second.scaffolded);
  assert.deepEqual(second.existingIds, ["0001"]);
  await rm(dir, { recursive: true, force: true });
});

test("init does not mistake years in prose for RFC ids", async () => {
  const dir = await makeFixture();
  await writeFile(
    path.join(dir, "ROADMAP.md"),
    "# ROADMAP\n\nBaseline date 2026-04-05. See [0001](.spec/rfc/0001-first.md).\n",
  );
  const result = await run(["init"], dir);
  assert.deepEqual(result.existingIds, ["0001"]);
  await rm(dir, { recursive: true, force: true });
});

test("validate passes a well-formed RFC and reports recommended-section warnings", async () => {
  const dir = await makeFixture();
  const result = await run(["validate", ".spec/rfc/0001-first.md"], dir);
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.ok(result.warnings.some((w) => w.includes("Problem")));
  await rm(dir, { recursive: true, force: true });
});

test("validate accepts '- **Status**: X (note)' form and strips emoji/parenthetical for enum check", async () => {
  const dir = await makeFixture();
  await writeFile(
    path.join(dir, ".spec", "rfc", "completed", "0002-done.md"),
    "# RFC 0002: Done\n\n- **Status**: ✅ Implemented（2026-01-01, follow-up scope）\n\n## Summary\n\nShipped.\n",
  );
  const result = await run(["validate", ".spec/rfc/completed/0002-done.md"], dir);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  await rm(dir, { recursive: true, force: true });
});

test("validate allows checklists in archived RFCs but rejects them in active RFCs", async () => {
  const dir = await makeFixture();
  const body = "# RFC 0003: X\n\n**Status:** Draft\n\n## Summary\n\nS.\n\n- [x] did a thing\n";
  await writeFile(path.join(dir, ".spec", "rfc", "0003-x.md"), body);
  await writeFile(path.join(dir, ".spec", "rfc", "completed", "0004-y.md"), body.replace("0003: X", "0004: Y"));

  const active = await run(["validate", ".spec/rfc/0003-x.md"], dir);
  assert.equal(active.ok, false);
  assert.ok(active.errors.some((e) => e.includes("checklist")));

  const archived = await run(["validate", ".spec/rfc/completed/0004-y.md"], dir);
  assert.equal(archived.ok, true, JSON.stringify(archived.errors));
  await rm(dir, { recursive: true, force: true });
});

test("deliver writes RFC file, ROADMAP row, and TASK_TRACKING line in one pass", async () => {
  const dir = await makeFixture();
  const result = await run(["deliver", "0002", "second-rfc", "Second RFC"], dir);
  assert.equal(result.ok, true);
  const rfc = await readFile(path.join(dir, ".spec", "rfc", "0002-second-rfc.md"), "utf8");
  assert.match(rfc, /\*\*Status:\*\* Draft/);
  const roadmap = await readFile(path.join(dir, ".spec", "ROADMAP.md"), "utf8");
  assert.match(roadmap, /0002/);
  const tasks = await readFile(path.join(dir, ".spec", "TASK_TRACKING.md"), "utf8");
  assert.match(tasks, /RFC 0002/);
  await rm(dir, { recursive: true, force: true });
});

test("advance then archive moves RFC to completed/ and sync-check stops flagging it active", async () => {
  const dir = await makeFixture();
  await run(["deliver", "0002", "second-rfc", "Second RFC"], dir);
  await run(["advance", "0002", "Implemented"], dir);
  const archived = await run(["archive", "0002"], dir);
  assert.equal(archived.ok, true);
  const sync = await run(["sync-check"], dir);
  assert.equal(sync.ok, true);
  assert.ok(!sync.activeIds.includes("0002"));
  await rm(dir, { recursive: true, force: true });
});

test("sync-check flags an RFC file with no ROADMAP index row", async () => {
  const dir = await makeFixture();
  await writeFile(
    path.join(dir, ".spec", "rfc", "0099-orphan.md"),
    "# RFC 0099: Orphan\n\n**Status:** Draft\n\n## Summary\n\nS.\n",
  );
  const result = await run(["sync-check"], dir);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("0099")));
  await rm(dir, { recursive: true, force: true });
});

test("deliver --umbrella writes Type marker, Children table, and ROADMAP (Umbrella) suffix", async () => {
  const dir = await makeFixture();
  const result = await run(["deliver", "0002", "theme", "Theme Work", "--umbrella"], dir);
  assert.equal(result.ok, true);
  assert.equal(result.role, "umbrella");
  const rfc = await readFile(path.join(dir, ".spec", "rfc", "0002-theme.md"), "utf8");
  assert.match(rfc, /\*\*Type:\*\* Umbrella/);
  assert.match(rfc, /## Children/);
  const roadmap = await readFile(path.join(dir, ".spec", "ROADMAP.md"), "utf8");
  assert.match(roadmap, /\(Umbrella\)/);
  const validated = await run(["validate", ".spec/rfc/0002-theme.md"], dir);
  assert.equal(validated.ok, true, JSON.stringify(validated.errors));
  assert.ok(validated.warnings.some((w) => w.includes("empty Children")));
  await rm(dir, { recursive: true, force: true });
});

test("deliver --parent links child both ways and validate accepts the pair", async () => {
  const dir = await makeFixture();
  await run(["deliver", "0002", "theme", "Theme Work", "--umbrella"], dir);
  const child = await run(["deliver", "0003", "one-fix", "One Fix", "--parent", "0002"], dir);
  assert.equal(child.ok, true);
  assert.equal(child.role, "child");
  assert.equal(child.parentId, "0002");

  const childBody = await readFile(path.join(dir, ".spec", "rfc", "0003-one-fix.md"), "utf8");
  assert.match(childBody, /\*\*Parent:\*\* \[0002\]/);
  const umbrella = await readFile(path.join(dir, ".spec", "rfc", "0002-theme.md"), "utf8");
  assert.match(umbrella, /\[0003\]\(/);

  const vChild = await run(["validate", ".spec/rfc/0003-one-fix.md"], dir);
  assert.equal(vChild.ok, true, JSON.stringify(vChild.errors));
  assert.equal(vChild.role, "child");
  const vParent = await run(["validate", ".spec/rfc/0002-theme.md"], dir);
  assert.equal(vParent.ok, true, JSON.stringify(vParent.errors));
  assert.equal(vParent.role, "umbrella");
  await rm(dir, { recursive: true, force: true });
});

test("deliver --parent rejects missing or non-umbrella parent", async () => {
  const dir = await makeFixture();
  const missing = await run(["deliver", "0002", "x", "X", "--parent", "0099"], dir);
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((e) => e.includes("0099")));

  await run(["deliver", "0002", "plain", "Plain"], dir);
  const notUmbrella = await run(["deliver", "0003", "y", "Y", "--parent", "0002"], dir);
  assert.equal(notUmbrella.ok, false);
  assert.ok(notUmbrella.errors.some((e) => /not marked Umbrella/i.test(e)));
  await rm(dir, { recursive: true, force: true });
});

test("validate errors when child Parent and umbrella Children disagree", async () => {
  const dir = await makeFixture();
  await run(["deliver", "0002", "theme", "Theme", "--umbrella"], dir);
  await run(["deliver", "0003", "one", "One", "--parent", "0002"], dir);
  // Break back-link: remove Parent from child
  const childPath = path.join(dir, ".spec", "rfc", "0003-one.md");
  const broken = (await readFile(childPath, "utf8")).replace(/\*\*Parent:\*\*[^\n]+\n\n/, "");
  await writeFile(childPath, broken, "utf8");
  const fromUmbrella = await run(["validate", ".spec/rfc/0002-theme.md"], dir);
  assert.equal(fromUmbrella.ok, false);
  assert.ok(fromUmbrella.errors.some((e) => /Parent is \(missing\)/.test(e)));
  await rm(dir, { recursive: true, force: true });
});

test("isUmbrella ignores prose that quotes **Type:** Umbrella outside the header", async () => {
  const dir = await makeFixture();
  await writeFile(
    path.join(dir, ".spec", "rfc", "0002-childish.md"),
    `# RFC 0002: Mentions umbrella syntax (child of 0001)

**Status:** Draft

**Parent:** [0001](0001-first.md)

## Summary

Documents how authors hand-edit \`**Type:** Umbrella\` in prose.

## Problem

P.

## Goals

G.

## Acceptance

A.
`,
  );
  // Parent 0001 is not umbrella and does not list 0002 — expect parent-link errors, NOT "both roles"
  const result = await run(["validate", ".spec/rfc/0002-childish.md"], dir);
  assert.ok(!result.errors.some((e) => /pick one role/i.test(e)), JSON.stringify(result.errors));
  assert.equal(result.role, "child");
  await rm(dir, { recursive: true, force: true });
});

test("advance does not corrupt ROADMAP title that contains a status word", async () => {
  const dir = await makeFixture();
  await run(["deliver", "0002", "draft-mode", "Draft Mode for Approved Content"], dir);
  const before = await readFile(path.join(dir, ".spec", "ROADMAP.md"), "utf8");
  assert.match(before, /Draft Mode for Approved Content/);
  assert.match(before, /\|\s*Draft\s*\|/);

  const advanced = await run(["advance", "0002", "Approved"], dir);
  assert.equal(advanced.ok, true);
  const after = await readFile(path.join(dir, ".spec", "ROADMAP.md"), "utf8");
  assert.match(after, /Draft Mode for Approved Content/);
  assert.doesNotMatch(after, /Approved Mode/);
  assert.match(after, /\|\s*0002\s*\|.*\|\s*Approved\s*\|/);
  await rm(dir, { recursive: true, force: true });
});

test("deliver sanitizes titles that would break markdown links or table rows", async () => {
  const dir = await makeFixture();
  const result = await run(
    ["deliver", "0002", "weird-title", "Break] link) and | pipe\nand newline"],
    dir,
  );
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const roadmap = await readFile(path.join(dir, ".spec", "ROADMAP.md"), "utf8");
  const dataRows = roadmap.split("\n").filter((l) => /^\|\s*0002\s*\|/.test(l));
  assert.equal(dataRows.length, 1, roadmap);
  assert.match(dataRows[0], /\|\s*0002\s*\|\s*\[[^\]]+\]\([^)]+\)\s*\|\s*Draft\s*\|/);
  assert.doesNotMatch(dataRows[0], /\]\s*link/);
  assert.doesNotMatch(roadmap, /\n\|[^\n]*\|[^\n]*\|[^\n]*\|\n\|[^\n]*pipe/);
  const rfc = await readFile(path.join(dir, ".spec", "rfc", "0002-weird-title.md"), "utf8");
  assert.doesNotMatch(rfc, /Break\]/);
  await rm(dir, { recursive: true, force: true });
});

test("validate status probe ignores status words in prose near the id", async () => {
  const dir = await makeFixture();
  // Fixture ROADMAP has prose; rewrite to mention Draft near id while Status column says Draft matching header
  await writeFile(
    path.join(dir, ".spec", "ROADMAP.md"),
    `# ROADMAP

Note: Draft proposals live below. See historical Approved work.

| RFC | Title | Status |
|-----|-------|--------|
| 0001 | [First](rfc/0001-first.md) | Draft |
`,
  );
  const result = await run(["validate", ".spec/rfc/0001-first.md"], dir);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(
    !result.warnings.some((w) => /status mismatch/i.test(w)),
    JSON.stringify(result.warnings),
  );
  await rm(dir, { recursive: true, force: true });
});
