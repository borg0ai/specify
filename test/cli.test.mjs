import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const execFileP = promisify(execFile);
const CLI = path.join(import.meta.dirname, "..", "bin", "specify.mjs");

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
  await writeFile(path.join(dir, "ROADMAP.md"), "# ROADMAP\n\nSee [0001](.spec/rfc/0001-first.md).\n");
  await writeFile(path.join(dir, "TASK_TRACKING.md"), "# TASK_TRACKING\n");
  await writeFile(
    path.join(dir, ".spec", "rfc", "0001-first.md"),
    "# RFC 0001: First\n\n**Status:** Draft\n\n## Summary\n\nTest.\n",
  );
  return dir;
}

test("init finds mixed root+.spec layout and computes next id", async () => {
  const dir = await makeFixture();
  const result = await run(["init"], dir);
  assert.equal(result.ok, true);
  assert.deepEqual(result.existingIds, ["0001"]);
  assert.equal(result.nextId, "0002");
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
  const roadmap = await readFile(path.join(dir, "ROADMAP.md"), "utf8");
  assert.match(roadmap, /0002/);
  const tasks = await readFile(path.join(dir, "TASK_TRACKING.md"), "utf8");
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
