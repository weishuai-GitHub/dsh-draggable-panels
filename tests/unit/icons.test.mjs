import test from "node:test";
import assert from "node:assert/strict";
import { createIcons } from "../../src/client/shared/icons.js";
const React = {
  createElement: (tag, props, ...children) => ({ tag, props, children }),
};
const Icon = createIcons(React);
test("icons share optical size, stroke, theme color and accessibility", () => {
  for (const kind of [
    "workspace",
    "files",
    "folder",
    "folderOpen",
    "file",
    "session",
    "plus",
    "more",
    "search",
    "chevronRight",
    "chevronDown",
    "close",
    "sidebar",
    "archive",
    "refresh",
    "back",
    "grip",
  ]) {
    const icon = Icon({ kind });
    assert.equal(icon.tag, "svg");
    assert.equal(icon.props.viewBox, "0 0 20 20");
    assert.equal(icon.props.stroke, "currentColor");
    assert.equal(icon.props["aria-hidden"], true);
    assert.equal(icon.props.focusable, false);
    assert.ok(icon.children.length > 0);
  }
});
test("workspace, files and directories have distinct silhouettes", () => {
  const shapes = ["workspace", "files", "folder", "folderOpen", "file"].map(
    (kind) => JSON.stringify(Icon({ kind }).children),
  );
  assert.equal(new Set(shapes).size, shapes.length);
});
