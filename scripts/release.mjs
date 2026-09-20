#!/usr/bin/env node
// Bump package.json version, commit, tag, and push. Usage:
//   node scripts/release.mjs <patch|minor|major|X.Y.Z> [--no-push]
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileP = promisify(execFile);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

async function sh(cmd, args) {
  const { stdout } = await execFileP(cmd, args, { cwd: root });
  return stdout.trim();
}

function bump(version, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [major, minor, patch] = version.split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump kind "${kind}" — use patch, minor, major, or an explicit X.Y.Z`);
}

async function main() {
  const [kind, ...flags] = process.argv.slice(2);
  const push = !flags.includes("--no-push");
  if (!kind) {
    console.error("Usage: node scripts/release.mjs <patch|minor|major|X.Y.Z> [--no-push]");
    process.exit(1);
  }

  const status = await sh("git", ["status", "--porcelain"]);
  if (status) {
    console.error("Working tree not clean. Commit or stash changes before releasing:\n" + status);
    process.exit(1);
  }

  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  const nextVersion = bump(pkg.version, kind);
  if (nextVersion === pkg.version) {
    console.error(`Version is already ${pkg.version}`);
    process.exit(1);
  }
  pkg.version = nextVersion;
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

  const tag = `v${nextVersion}`;
  await sh("git", ["add", "package.json"]);
  await sh("git", ["commit", "-m", `chore(release): ${tag}`]);
  await sh("git", ["tag", "-a", tag, "-m", tag]);

  console.log(`Bumped ${pkg.name} to ${nextVersion}, committed, tagged ${tag}.`);

  if (push) {
    await sh("git", ["push"]);
    await sh("git", ["push", "origin", tag]);
    console.log(`Pushed commit and tag ${tag} to origin.`);
  } else {
    console.log("Skipped push (--no-push). Run `git push && git push origin " + tag + "` when ready.");
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
