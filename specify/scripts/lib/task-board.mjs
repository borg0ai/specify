/** Section that holds open RFC checklist lines. */
const HEADING_ACTIVE = "## Active";

/** Section that holds fully checked RFC blocks. */
const HEADING_DONE = "## Done";

const TOP_LEVEL_CHECKBOX = /^- \[[ x]\]/;
const ANY_CHECKBOX = /^\s*- \[([ x])\]/;

/**
 * @param {string} id
 * @param {string} title
 * @param {string} indent
 * @returns {string}
 */
function formatTaskLine(id, title, indent) {
  return `${indent}- [ ] Implement RFC ${id}: ${title} (RFC ${id})`;
}

/**
 * @param {string} text
 * @returns {string}
 */
function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

/**
 * @param {string[]} lines
 * @param {string} heading
 * @returns {number}
 */
function findHeading(lines, heading) {
  return lines.findIndex((line) => line.trim() === heading);
}

/**
 * @param {string} line
 * @returns {string}
 */
function indentOf(line) {
  return line.match(/^(\s*)/)?.[1] ?? "";
}

/**
 * Insert `line` at the end of the section that starts at `headingIndex`.
 * @param {string[]} lines
 * @param {number} headingIndex
 * @param {string} line
 * @returns {string[]}
 */
function insertBeforeNextHeading(lines, headingIndex, line) {
  let end = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  let insertAt = end;
  while (insertAt > headingIndex + 1 && lines[insertAt - 1].trim() === "") insertAt -= 1;
  const next = [...lines];
  const addition = [line];
  if (end < lines.length) addition.push("");
  next.splice(insertAt, 0, ...addition);
  return next;
}

/**
 * Place a new open task in `## Active`, creating that section before `## Done` when needed.
 * @param {string} text
 * @param {string} line
 * @returns {string}
 */
function insertIntoActive(text, line) {
  const lines = text.split("\n");
  const activeAt = findHeading(lines, HEADING_ACTIVE);
  if (activeAt >= 0) {
    return ensureTrailingNewline(insertBeforeNextHeading(lines, activeAt, line).join("\n"));
  }
  const block = [HEADING_ACTIVE, "", line, ""];
  const doneAt = findHeading(lines, HEADING_DONE);
  if (doneAt >= 0) {
    lines.splice(doneAt, 0, ...block);
    return ensureTrailingNewline(lines.join("\n"));
  }
  const base = [...lines];
  while (base.length > 0 && base[base.length - 1] === "") base.pop();
  base.push("", ...block);
  return ensureTrailingNewline(base.join("\n"));
}

/**
 * Nest a child task under the parent RFC line. Returns null when the parent line is absent.
 * @param {string} text
 * @param {string} parentId
 * @param {string} id
 * @param {string} title
 * @returns {string | null}
 */
function nestUnderParent(text, parentId, id, title) {
  const lines = text.split("\n");
  const parentRe = new RegExp(`^\\s*- \\[[ x]\\].*\\bRFC ${parentId}\\b`);
  const parentIdx = lines.findIndex((line) => parentRe.test(line));
  if (parentIdx < 0) return null;
  const childLine = formatTaskLine(id, title, `${indentOf(lines[parentIdx])}  `);
  let insertAt = parentIdx + 1;
  const parentIndentLen = indentOf(lines[parentIdx]).length;
  while (insertAt < lines.length) {
    const line = lines[insertAt];
    if (line.trim() === "") {
      let look = insertAt + 1;
      while (look < lines.length && lines[look].trim() === "") look += 1;
      if (look >= lines.length || /^##\s+/.test(lines[look])) break;
      if (indentOf(lines[look]).length <= parentIndentLen && /^\s*- /.test(lines[look])) break;
      insertAt = look;
      continue;
    }
    if (/^##\s+/.test(line)) break;
    if (indentOf(line).length <= parentIndentLen) break;
    insertAt += 1;
  }
  lines.splice(insertAt, 0, childLine);
  return ensureTrailingNewline(lines.join("\n"));
}

/**
 * Append a task line, nesting it under `parentId` when that checklist line exists.
 * @param {string} tasksText
 * @param {{ id: string, title: string, parentId?: string | null }} task
 * @returns {string}
 */
export function insertTaskLine(tasksText, task) {
  const { id, title, parentId = null } = task;
  if (parentId) {
    const nested = nestUnderParent(tasksText, parentId, id, title);
    if (nested) return nested;
  }
  return insertIntoActive(tasksText, formatTaskLine(id, title, ""));
}

/**
 * @param {string[]} sectionLines
 * @returns {{ preamble: string[], blocks: string[][] }}
 */
function parseActiveBlocks(sectionLines) {
  /** @type {string[]} */
  const preamble = [];
  /** @type {string[][]} */
  const blocks = [];
  /** @type {string[]} */
  let current = [];
  const flush = () => {
    if (current.some((line) => line.trim() !== "")) blocks.push(current);
    current = [];
  };
  for (const line of sectionLines) {
    if (TOP_LEVEL_CHECKBOX.test(line)) {
      flush();
      current = [line];
      continue;
    }
    if (current.length === 0) {
      preamble.push(line);
      continue;
    }
    current.push(line);
  }
  flush();
  return { preamble, blocks };
}

/**
 * @param {string[]} block
 * @returns {boolean}
 */
function blockFullyChecked(block) {
  const boxes = block.filter((line) => ANY_CHECKBOX.test(line));
  return boxes.length > 0 && boxes.every((line) => /^\s*- \[x\]/.test(line));
}

/**
 * @param {string[]} block
 * @returns {string[]}
 */
function trimTrailingBlanks(block) {
  const next = [...block];
  while (next.length > 0 && next[next.length - 1].trim() === "") next.pop();
  return next;
}

/**
 * Move fully checked top-level blocks from `## Active` onto `## Done`.
 * @param {string} tasksText
 * @returns {string}
 */
function promoteCheckedBlocks(tasksText) {
  const lines = tasksText.split("\n");
  const activeAt = findHeading(lines, HEADING_ACTIVE);
  if (activeAt < 0) return tasksText;
  let activeEnd = lines.length;
  for (let i = activeAt + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      activeEnd = i;
      break;
    }
  }
  const { preamble, blocks } = parseActiveBlocks(lines.slice(activeAt + 1, activeEnd));
  const stay = blocks.filter((block) => !blockFullyChecked(block));
  const move = blocks.filter((block) => blockFullyChecked(block)).map(trimTrailingBlanks);
  if (move.length === 0) return tasksText;

  /** @type {string[]} */
  const activeBody = [...preamble];
  for (const block of stay) activeBody.push(...block);
  while (activeBody.length > 0 && activeBody[activeBody.length - 1].trim() === "") activeBody.pop();

  /** @type {string[]} */
  const before = lines.slice(0, activeAt);
  /** @type {string[]} */
  const after = lines.slice(activeEnd);
  /** @type {string[]} */
  let rebuilt = [...before];
  if (stay.length > 0 || preamble.some((line) => line.trim() !== "")) {
    rebuilt.push(HEADING_ACTIVE, ...activeBody, "");
  }
  rebuilt.push(...after);

  let doneAt = findHeading(rebuilt, HEADING_DONE);
  if (doneAt < 0) {
    while (rebuilt.length > 0 && rebuilt[rebuilt.length - 1] === "") rebuilt.pop();
    rebuilt.push("", HEADING_DONE, "");
    doneAt = findHeading(rebuilt, HEADING_DONE);
  }
  let doneEnd = rebuilt.length;
  for (let i = doneAt + 1; i < rebuilt.length; i += 1) {
    if (/^##\s+/.test(rebuilt[i])) {
      doneEnd = i;
      break;
    }
  }
  let insertAt = doneEnd;
  while (insertAt > doneAt + 1 && rebuilt[insertAt - 1].trim() === "") insertAt -= 1;
  const addition = [];
  for (const block of move) addition.push(...block, "");
  rebuilt.splice(insertAt, 0, ...addition);
  return ensureTrailingNewline(rebuilt.join("\n"));
}

/**
 * Check the checkbox for `id` and promote a fully checked `## Active` block to `## Done`.
 * @param {string} tasksText
 * @param {string} id
 * @returns {string}
 */
export function markTaskChecked(tasksText, id) {
  const idRe = new RegExp(`\\bRFC ${id}\\b`);
  const lines = tasksText.split("\n").map((line) => {
    if (!idRe.test(line)) return line;
    return line.replace(/^(\s*- )\[ \]/, "$1[x]");
  });
  return promoteCheckedBlocks(ensureTrailingNewline(lines.join("\n")));
}

/**
 * @param {string} tasksText
 * @param {{ id: string, archived: boolean }[]} entries
 * @returns {string[]}
 */
export function taskBoardErrors(tasksText, entries) {
  const lines = tasksText.split("\n");
  /** @type {string[]} */
  const errors = [];
  for (const { id, archived } of entries) {
    const re = new RegExp(`^\\s*- \\[([ x])\\].*\\bRFC ${id}\\b`);
    const hits = lines.map((line) => line.match(re)).filter((hit) => hit !== null);
    if (hits.length === 0) {
      errors.push(`RFC ${id} has no TASK_TRACKING.md checklist line`);
      continue;
    }
    if (archived && hits.some((hit) => hit[1] !== "x")) {
      errors.push(`RFC ${id} is archived but TASK_TRACKING.md still has an unchecked line`);
    }
  }
  return errors;
}
