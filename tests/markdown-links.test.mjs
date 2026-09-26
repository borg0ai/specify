import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  listBrokenRfcLinks,
  replaceLinksPointingAt,
  retargetRelativeLinks,
} from "../specify/scripts/lib/markdown-links.mjs";

test("retargetRelativeLinks keeps the same target after the file moves into completed/", () => {
  const text = "**Parent:** [0010](0010-theme.md#summary)\nSee [docs](https://example.com/a).";
  const oldDir = "/repo/.spec/rfc";
  const newDir = "/repo/.spec/rfc/completed";
  const updated = retargetRelativeLinks(text, oldDir, newDir);
  assert.match(updated, /\]\(\.\.\/0010-theme\.md#summary\)/);
  assert.match(updated, /https:\/\/example\.com\/a/);
});

test("replaceLinksPointingAt rewrites only the link that resolved to the moved file", () => {
  const linkingFile = "/repo/.spec/ROADMAP.md";
  const from = "/repo/.spec/rfc/0011-one.md";
  const dest = "/repo/.spec/rfc/completed/0011-one.md";
  const text = "See [0011](rfc/0011-one.md) and [0010](rfc/0010-theme.md).";
  const updated = replaceLinksPointingAt(text, linkingFile, from, dest);
  assert.match(updated, /rfc\/completed\/0011-one\.md/);
  assert.match(updated, /rfc\/0010-theme\.md/);
});

test("listBrokenRfcLinks reports a missing RFC file and ignores other links", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "specify-links-"));
  const roadmap = path.join(dir, "ROADMAP.md");
  await mkdir(path.join(dir, "rfc"), { recursive: true });
  await writeFile(path.join(dir, "rfc", "0001-ok.md"), "# ok\n");
  await writeFile(
    roadmap,
    "See [0001](rfc/0001-ok.md) and [0002](rfc/0002-missing.md) and [web](https://example.com).\n",
  );
  assert.deepEqual(listBrokenRfcLinks(await readFile(roadmap, "utf8"), roadmap), ["rfc/0002-missing.md"]);
  await rm(dir, { recursive: true, force: true });
});
