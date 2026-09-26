import { existsSync } from "node:fs";
import path from "node:path";

/** Markdown inline link target, including optional title-less URLs. */
const MARKDOWN_LINK_PATTERN = /\]\(([^)]+)\)/g;

/** RFC body filename, optionally prefixed by a relative directory. */
const RFC_MARKDOWN_FILE = /(?:^|\/)[0-9]{4}-[a-z0-9-]+\.md$/;

const EXTERNAL_TARGET = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Split a markdown link target into a path and a `#fragment` suffix.
 * @param {string} target
 * @returns {{ pathname: string, hash: string }}
 */
export function splitLinkTarget(target) {
  const trimmed = target.trim();
  const hashAt = trimmed.indexOf("#");
  if (hashAt === -1) return { pathname: trimmed, hash: "" };
  return { pathname: trimmed.slice(0, hashAt), hash: trimmed.slice(hashAt) };
}

/**
 * @param {string} pathname
 * @returns {boolean}
 */
export function isExternalLink(pathname) {
  return pathname.length === 0 || EXTERNAL_TARGET.test(pathname);
}

/**
 * @param {string} relativePath
 * @returns {string}
 */
function toPosix(relativePath) {
  const posix = relativePath.split(path.sep).join("/");
  return posix.length === 0 ? "." : posix;
}

/**
 * Rewrite relative links in a file that moved from `oldDir` to `newDir`
 * so they still resolve to the same targets.
 * @param {string} text
 * @param {string} oldDir
 * @param {string} newDir
 * @returns {string}
 */
export function retargetRelativeLinks(text, oldDir, newDir) {
  return text.replace(MARKDOWN_LINK_PATTERN, (full, raw) => {
    const { pathname, hash } = splitLinkTarget(raw);
    if (isExternalLink(pathname)) return full;
    const absolute = path.resolve(oldDir, pathname);
    const rel = toPosix(path.relative(newDir, absolute));
    return `](${rel}${hash})`;
  });
}

/**
 * Point links that resolved at `fromAbs` toward `destAbs`, relative to `linkingFile`.
 * @param {string} text
 * @param {string} linkingFile
 * @param {string} fromAbs
 * @param {string} destAbs
 * @returns {string}
 */
export function replaceLinksPointingAt(text, linkingFile, fromAbs, destAbs) {
  const from = path.normalize(fromAbs);
  const linkDir = path.dirname(linkingFile);
  return text.replace(MARKDOWN_LINK_PATTERN, (full, raw) => {
    const { pathname, hash } = splitLinkTarget(raw);
    if (isExternalLink(pathname)) return full;
    const resolved = path.normalize(path.resolve(linkDir, pathname));
    if (resolved !== from) return full;
    const rel = toPosix(path.relative(linkDir, destAbs));
    return `](${rel}${hash})`;
  });
}

/**
 * RFC markdown links in `text` whose target does not exist relative to `fromFile`.
 * @param {string} text
 * @param {string} fromFile
 * @returns {string[]}
 */
export function listBrokenRfcLinks(text, fromFile) {
  const broken = [];
  const linkDir = path.dirname(fromFile);
  for (const match of text.matchAll(MARKDOWN_LINK_PATTERN)) {
    const { pathname } = splitLinkTarget(match[1]);
    if (isExternalLink(pathname) || !RFC_MARKDOWN_FILE.test(pathname)) continue;
    if (!existsSync(path.resolve(linkDir, pathname))) broken.push(pathname);
  }
  return broken;
}
