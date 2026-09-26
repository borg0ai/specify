import { test } from "node:test";
import assert from "node:assert/strict";
import { insertTaskLine, markTaskChecked, taskBoardErrors } from "../specify/scripts/lib/task-board.mjs";

test("insertTaskLine opens ## Active before ## Done and nests a child under its parent", () => {
  const start = "# Task Tracking\n\n## Done\n\n- [x] RFC 0001: First\n";
  const umbrella = insertTaskLine(start, { id: "0010", title: "Theme (Umbrella)", parentId: null });
  assert.match(umbrella, /## Active\n\n- \[ \] Implement RFC 0010:/);
  assert.match(umbrella, /## Active[\s\S]*## Done/);
  const child = insertTaskLine(umbrella, {
    id: "0011",
    title: "One (child of 0010)",
    parentId: "0010",
  });
  assert.match(child, /- \[ \] Implement RFC 0010:[\s\S]*\n  - \[ \] Implement RFC 0011:/);
});

test("markTaskChecked promotes the block only after every nested box is checked", () => {
  const open = `# Task Tracking

## Active

- [ ] Implement RFC 0010: Theme (RFC 0010)
  - [ ] Implement RFC 0011: One (RFC 0011)

## Done

- [x] RFC 0001: First
`;
  const childOnly = markTaskChecked(open, "0011");
  assert.match(childOnly, /## Active[\s\S]*- \[ \] Implement RFC 0010:[\s\S]*\n  - \[x\] Implement RFC 0011:/);
  assert.doesNotMatch(childOnly, /## Done[\s\S]*RFC 0011/);

  const both = markTaskChecked(childOnly, "0010");
  assert.match(both, /## Done[\s\S]*- \[x\] Implement RFC 0010:[\s\S]*\n  - \[x\] Implement RFC 0011:/);
  assert.doesNotMatch(both, /## Active/);
});

test("taskBoardErrors requires a line for every RFC and [x] once archived", () => {
  const text = "- [ ] RFC 0001: Open\n- [x] RFC 0002: Done\n";
  const errors = taskBoardErrors(text, [
    { id: "0001", archived: false },
    { id: "0002", archived: true },
    { id: "0003", archived: false },
    { id: "0001", archived: true },
  ]);
  assert.ok(errors.some((error) => error.includes("0003")));
  assert.ok(errors.some((error) => error.includes("0001") && error.includes("unchecked")));
  assert.ok(!errors.some((error) => error.includes("0002") && error.includes("unchecked")));
});
