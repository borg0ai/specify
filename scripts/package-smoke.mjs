#!/usr/bin/env node
// Validate the specify/ payload directory is what actually gets installed by
// `npx skills add` — no dev tooling, no node_modules, and the CLI runs.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const skillRoot = path.join(repoRoot, "specify");
const cli = path.join(skillRoot, "bin", "specify.mjs");

function requireAbsent(relative) {
  if (fs.existsSync(path.join(skillRoot, relative))) {
    throw new Error(`packaged skill must not contain ${relative}`);
  }
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      [`specify ${args.join(" ")} failed with ${result.status}`, result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n")
    );
  }
  return result.stdout;
}

try {
  if (!fs.existsSync(cli)) throw new Error(`packaged CLI not found at ${cli}`);
  requireAbsent("node_modules");
  requireAbsent("test");
  requireAbsent("tests");
  requireAbsent("package-lock.json");
  requireAbsent("scripts");

  const pkg = JSON.parse(fs.readFileSync(path.join(skillRoot, "package.json"), "utf8"));
  const release = JSON.parse(fs.readFileSync(path.join(skillRoot, "skill-release.json"), "utf8"));
  if (release.version !== pkg.version) {
    throw new Error(
      `skill-release.json version (${release.version}) does not match package.json version (${pkg.version})`
    );
  }
  if (release.channel !== "stable" && release.channel !== "development") {
    throw new Error(`skill-release.json channel must be 'stable' or 'development', got '${release.channel}'`);
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "specify-package-smoke-"));

  const initOut = run(["init", "--root", scratch, "--json"]);
  const init = JSON.parse(initOut);
  if (!init.ok) throw new Error(`init failed on a fresh scratch tree: ${initOut}`);
  if (!init.scaffolded) throw new Error(`init did not scaffold a fresh .spec/ tree: ${initOut}`);
  if (init.nextId !== "0001") throw new Error(`expected nextId 0001, got ${init.nextId}`);

  run(["deliver", "0001", "smoke-test", "Smoke Test", "--root", scratch]);
  const rfcPath = path.join(scratch, ".spec", "rfc", "0001-smoke-test.md");
  if (!fs.existsSync(rfcPath)) throw new Error(`deliver did not create ${rfcPath}`);

  const validateOut = run(["validate", rfcPath, "--json"]);
  const validated = JSON.parse(validateOut);
  if (!validated.ok || validated.errors.length) {
    throw new Error(`validate reported errors on freshly delivered RFC: ${validateOut}`);
  }

  fs.rmSync(scratch, { recursive: true, force: true });
  console.log("package-smoke OK: specify/ installs clean and its CLI works standalone.");
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
