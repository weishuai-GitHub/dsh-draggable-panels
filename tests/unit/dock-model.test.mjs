import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultLayout,
  normalizeLayout,
  reconcileLayout,
  restoreLayout,
  visiblePanelIds,
  movePanel,
  selectPanel,
  hidePanel,
  showPanel,
} from "../../src/client/dock/model.js";
import { createComponentRegistry } from "../../src/client/registry/component-registry.js";

const panel = (id, side = "left", order = 0, visible = true) => ({
  id,
  title: id,
  component() {},
  defaultPlacement: { side, order, visible },
});
const descriptors = [panel("workspaces"), panel("files", "right")];
const freeze = (layout) => {
  Object.freeze(layout.left);
  Object.freeze(layout.right);
  Object.freeze(layout.hidden);
  Object.freeze(layout.active);
  return Object.freeze(layout);
};
const assertActive = (layout, entries) => {
  for (const side of ["left", "right"]) {
    const visible = visiblePanelIds(layout, side, entries);
    assert.ok(
      layout.active[side] === null
        ? visible.length === 0
        : visible.includes(layout.active[side]),
    );
  }
};

test("empty defaults and arbitrary ordered descriptors without hardcoded panel IDs", () => {
  assert.deepEqual(createDefaultLayout(), {
    version: 2,
    left: [],
    right: [],
    hidden: [],
    active: { left: null, right: null },
  });
  const entries = [
    panel("z", "left", 20),
    panel("a", "left", -1),
    panel("hidden", "right", 0, false),
  ];
  const layout = createDefaultLayout(entries);
  assert.deepEqual(layout.left, ["a", "z"]);
  assert.deepEqual(layout.right, ["hidden"]);
  assert.deepEqual(layout.hidden, ["hidden"]);
  assert.deepEqual(layout.active, { left: "a", right: null });
  assert.deepEqual(restoreLayout(entries), layout);
  assert.notEqual(restoreLayout(entries), layout);
});

test("legacy migration keeps IDs, ordering, selections, and unknown extensions", () => {
  const saved = {
    version: 1,
    left: ["files", "extension", "workspaces"],
    right: [],
    active: { left: "files", right: null },
  };
  const layout = normalizeLayout(saved, descriptors);
  assert.deepEqual(layout.left, saved.left);
  assert.equal(layout.version, 2);
  assert.deepEqual(layout.active, saved.active);
  assert.deepEqual(layout.hidden, []);
  assert.notEqual(layout.left, saved.left);
  assert.deepEqual(
    normalizeLayout({ ...saved, version: undefined }, descriptors),
    layout,
  );
});

test("malformed saved fields sanitize individually rather than resetting valid unknown state", () => {
  const saved = {
    left: ["unknown", "", null, "files", "files"],
    right: ["files", "workspaces", 7],
    hidden: ["unknown", "unknown", "future", null],
    active: { left: "unknown", right: "files" },
  };
  const layout = normalizeLayout(saved, descriptors);
  assert.deepEqual(layout.left, ["unknown", "files"]);
  assert.deepEqual(layout.right, ["workspaces"]);
  assert.deepEqual(layout.hidden, ["unknown", "future"]);
  assert.deepEqual(layout.active, { left: "files", right: "workspaces" });
  for (const value of [null, false, 7, [], "broken"]) {
    assert.deepEqual(
      normalizeLayout(value, descriptors),
      createDefaultLayout(descriptors),
    );
  }
});

test("unregister/re-register and JSON reload preserve custom position and visibility preferences", () => {
  const registry = createComponentRegistry();
  descriptors.forEach((entry) => registry.register(entry));
  const extension = panel("extension", "right", 50, false);
  const handle = registry.register(extension);
  let layout = createDefaultLayout(registry.getSnapshot());
  layout = showPanel(layout, "extension", registry.getSnapshot());
  layout = movePanel(
    layout,
    "extension",
    "left",
    "workspaces",
    registry.getSnapshot(),
  );
  handle.dispose();
  layout = reconcileLayout(layout, registry.getSnapshot());
  assert.deepEqual(layout.left, ["extension", "workspaces"]);
  assert.deepEqual(layout.hidden, []);
  assert.equal(layout.active.left, "workspaces");
  layout = normalizeLayout(
    JSON.parse(JSON.stringify(layout)),
    registry.getSnapshot(),
  );
  registry.register(extension);
  layout = reconcileLayout(layout, registry.getSnapshot());
  assert.deepEqual(visiblePanelIds(layout, "left", registry.getSnapshot()), [
    "extension",
    "workspaces",
  ]);
  layout = hidePanel(layout, "extension", registry.getSnapshot());
  layout = reconcileLayout(layout, descriptors);
  layout = reconcileLayout(layout, registry.getSnapshot());
  assert.deepEqual(layout.left, ["extension", "workspaces"]);
  assert.deepEqual(layout.hidden, ["extension"]);
});

test("hide/show preserve positions, select visible fallbacks, and never activate absent panels", () => {
  const entries = [...descriptors, panel("other", "left", 1)];
  const original = freeze(createDefaultLayout(entries));
  let layout = hidePanel(original, "workspaces", entries);
  assert.deepEqual(layout.left, original.left);
  assert.equal(layout.active.left, "other");
  layout = hidePanel(layout, "other", entries);
  assert.equal(layout.active.left, null);
  assert.equal(selectPanel(layout, "left", "workspaces", entries), layout);
  layout = showPanel(layout, "workspaces", entries);
  assert.equal(layout.active.left, "workspaces");
  layout = reconcileLayout(layout, [entries[1]]);
  layout = showPanel(layout, "other", [entries[1]]);
  assert.equal(layout.active.left, null);
  assert.deepEqual(original.hidden, []);
  assertActive(layout, [entries[1]]);
});

test("cross-side moves select registered visible panels and repair source active", () => {
  const original = freeze(createDefaultLayout(descriptors));
  const layout = movePanel(
    original,
    "files",
    "left",
    "workspaces",
    descriptors,
  );
  assert.deepEqual(layout.left, ["files", "workspaces"]);
  assert.deepEqual(layout.right, []);
  assert.deepEqual(layout.active, { left: "files", right: null });
  assert.deepEqual(
    movePanel(layout, "files", "right", undefined, descriptors),
    original,
  );
  const reordered = movePanel(layout, "files", "left", undefined, descriptors);
  assert.deepEqual(reordered.left, ["workspaces", "files"]);
  assert.equal(reordered.active.left, "files");
  const hidden = hidePanel(layout, "files", descriptors);
  const hiddenMoved = movePanel(
    hidden,
    "files",
    "right",
    undefined,
    descriptors,
  );
  assert.deepEqual(hiddenMoved.hidden, ["files"]);
  assert.equal(hiddenMoved.active.right, null);
});

test("selection is pure; invalid requests and unchanged reconciliation preserve references", () => {
  const original = freeze(createDefaultLayout(descriptors));
  assert.equal(reconcileLayout(original, descriptors), original);
  assert.equal(
    selectPanel(original, "left", "workspaces", descriptors),
    original,
  );
  for (const [side, id] of [
    ["right", "workspaces"],
    ["middle", "files"],
    ["left", "unknown"],
  ]) {
    assert.equal(selectPanel(original, side, id, descriptors), original);
  }
  for (const [id, side, before] of [
    ["unknown", "left"],
    ["files", "middle"],
    ["files", "left", "unknown"],
    ["files", "right", "files"],
    ["workspaces", "left", null],
  ])
    assert.equal(movePanel(original, id, side, before, descriptors), original);
  assert.equal(hidePanel(original, "unknown", descriptors), original);
  assert.equal(showPanel(original, "unknown", descriptors), original);
  assert.equal(movePanel(null, "files", "left", undefined, descriptors), null);
  assert.equal(selectPanel(null, "left", "files", descriptors), null);
});

test("late registration honors defaults without reordering saved neighbors or resetting hidden unknown IDs", () => {
  const first = panel("first", "left", 0);
  const last = panel("last", "left", 30);
  const middle = panel("middle", "left", 10);
  const future = panel("future", "right", 0, true);
  const saved = normalizeLayout(
    { left: ["first", "unknown", "last"], right: [], hidden: ["future"] },
    [first, last],
  );
  const next = reconcileLayout(saved, [first, last, middle, future]);
  assert.deepEqual(next.left, ["first", "unknown", "middle", "last"]);
  assert.deepEqual(next.right, ["future"]);
  assert.deepEqual(next.hidden, ["future"]);
  assert.equal(next.active.right, null);
  assert.equal(reconcileLayout(next, [first, last, middle, future]), next);
});

test("arbitrary special IDs are safe and every operation maintains registered-visible active invariant", () => {
  const entries = [
    panel("__proto__"),
    panel("constructor", "right"),
    panel("插件", "left", 1),
  ];
  let layout = createDefaultLayout(entries);
  for (const entry of entries) {
    layout = hidePanel(layout, entry.id, entries);
    assertActive(layout, entries);
    layout = showPanel(layout, entry.id, entries);
    assertActive(layout, entries);
    layout = movePanel(layout, entry.id, "right", undefined, entries);
    assertActive(layout, entries);
  }
  layout = reconcileLayout(layout, []);
  assertActive(layout, []);
  assert.equal(layout.left.length + layout.right.length, entries.length);
});
