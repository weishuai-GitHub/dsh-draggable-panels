import test from "node:test";
import assert from "node:assert/strict";
import {
  createPointerHelpers,
  hitTest,
  dragDistanceExceeded,
} from "../../src/client/dock/pointer.js";

const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
function targets() {
  return {
    left: {
      rect: rect(0, 0, 200, 400),
      tabs: [
        { id: "workspaces", rect: rect(0, 0, 100, 40) },
        { id: "files", rect: rect(100, 0, 200, 40) },
      ],
    },
    right: {
      rect: rect(400, 0, 600, 400),
      tabs: [{ id: "files", rect: rect(400, 0, 500, 40) }],
    },
  };
}

test("body hits both side containers and appends", () => {
  assert.deepEqual(hitTest({ x: 20, y: 100 }, targets()), { side: "left" });
  assert.deepEqual(hitTest({ x: 550, y: 300 }, targets()), { side: "right" });
});
test("left tab half inserts before itself and right half before next ordered tab", () => {
  assert.deepEqual(hitTest({ x: 49, y: 10 }, targets()), {
    side: "left",
    beforeId: "workspaces",
  });
  assert.deepEqual(hitTest({ x: 50, y: 10 }, targets()), {
    side: "left",
    beforeId: "files",
  });
  assert.deepEqual(hitTest({ x: 99, y: 10 }, targets()), {
    side: "left",
    beforeId: "files",
  });
  assert.deepEqual(hitTest({ x: 100, y: 10 }, targets()), {
    side: "left",
    beforeId: "files",
  });
  assert.deepEqual(hitTest({ x: 150, y: 10 }, targets()), { side: "left" });
});
test("right tab halves and last-tab append", () => {
  assert.deepEqual(hitTest({ x: 400, y: 0 }, targets()), {
    side: "right",
    beforeId: "files",
  });
  assert.deepEqual(hitTest({ x: 450, y: 10 }, targets()), { side: "right" });
});
test("empty container and tab-strip gaps append", () => {
  const t = targets();
  t.left.tabs = [];
  assert.deepEqual(hitTest({ x: 10, y: 10 }, t), { side: "left" });
  assert.deepEqual(hitTest({ x: 550, y: 10 }, t), { side: "right" });
  assert.deepEqual(hitTest({ x: 10, y: 40 }, targets()), { side: "left" });
});
test("outside points never target a tab or other DOM region", () => {
  for (const point of [
    { x: -1, y: 0 },
    { x: 200, y: 20 },
    { x: 300, y: 200 },
    { x: 600, y: 0 },
    { x: 20, y: 400 },
    { x: 20, y: -1 },
  ]) {
    assert.equal(hitTest(point, targets()), null);
  }
  assert.equal(
    hitTest(
      { x: 20, y: 20 },
      {
        right: {
          rect: rect(400, 0, 600, 400),
          tabs: [{ id: "foreign", rect: rect(0, 0, 100, 40) }],
        },
      },
    ),
    null,
  );
});
test("shared edges have exactly one owner and overlaps prefer left", () => {
  const adjacent = {
    left: { rect: rect(0, 0, 100, 100) },
    right: { rect: rect(100, 0, 200, 100) },
  };
  assert.deepEqual(hitTest({ x: 100, y: 50 }, adjacent), { side: "right" });
  const overlap = {
    left: { rect: rect(0, 0, 200, 100) },
    right: { rect: rect(100, 0, 200, 100) },
  };
  assert.deepEqual(hitTest({ x: 150, y: 50 }, overlap), { side: "left" });
});
test("points and target structures require finite numeric coordinates", () => {
  for (const point of [
    null,
    undefined,
    {},
    { x: "1", y: 1 },
    { x: NaN, y: 0 },
    { x: 1, y: Infinity },
    { x: -Infinity, y: 1 },
  ]) {
    assert.equal(hitTest(point, targets()), null);
  }
  for (const value of [
    null,
    undefined,
    1,
    {},
    { left: null },
    { left: { rect: null } },
  ]) {
    assert.equal(hitTest({ x: 1, y: 1 }, value), null);
  }
});
test("invalid, inverted and zero-size rectangles are ignored", () => {
  for (const value of [
    rect(0, 0, 0, 100),
    rect(0, 100, 100, 0),
    rect(0, 0, NaN, 100),
    rect(0, 0, 100, Infinity),
    { left: 0, top: 0 },
    { left: 0, top: 0, width: -10, height: 20 },
  ]) {
    assert.equal(hitTest({ x: 1, y: 1 }, { left: { rect: value } }), null);
  }
  assert.deepEqual(
    hitTest(
      { x: 450, y: 100 },
      { left: { rect: rect(0, 0, 0, 0) }, right: targets().right },
    ),
    { side: "right" },
  );
});
test("width/height rectangle fallback accepts own bounding boxes", () => {
  assert.deepEqual(
    hitTest(
      { x: 15, y: 25 },
      { left: { rect: { left: 10, top: 20, width: 30, height: 40 } } },
    ),
    { side: "left" },
  );
});
test("invalid and duplicate tabs are ignored without mutating inputs", () => {
  const t = targets();
  t.left.tabs.splice(
    1,
    0,
    { id: "bad", rect: rect(0, 0, 0, 40) },
    null,
    { id: "", rect: rect(100, 0, 120, 40) },
    { id: "workspaces", rect: rect(100, 0, 120, 40) },
  );
  const before = structuredClone(t);
  assert.deepEqual(hitTest({ x: 60, y: 10 }, t), {
    side: "left",
    beforeId: "files",
  });
  assert.deepEqual(t, before);
});
test("distance threshold is Euclidean and strictly exceeded", () => {
  const start = { x: 10, y: 20 };
  assert.equal(dragDistanceExceeded(start, start), false);
  assert.equal(dragDistanceExceeded(start, { x: 13, y: 24 }), false);
  assert.equal(dragDistanceExceeded(start, { x: 13, y: 24.1 }), true);
  assert.equal(dragDistanceExceeded(start, { x: 16, y: 20 }), true);
  assert.equal(dragDistanceExceeded(start, { x: 9, y: 19 }, 1), true);
  assert.equal(dragDistanceExceeded(start, { x: 10.1, y: 20 }, 0), true);
  assert.equal(dragDistanceExceeded(start, start, 0), false);
});
test("invalid start, point and threshold do not begin dragging", () => {
  const point = { x: 10, y: 10 };
  for (const threshold of [-1, Infinity, NaN, null, "5"])
    assert.equal(dragDistanceExceeded({ x: 0, y: 0 }, point, threshold), false);
  assert.equal(dragDistanceExceeded(null, point), false);
  assert.equal(dragDistanceExceeded(point, { x: Infinity, y: 0 }), false);
});
test("factory exposes equivalent isolated helpers", () => {
  const helpers = createPointerHelpers();
  assert.deepEqual(
    helpers.hitTest({ x: 1, y: 1 }, targets()),
    hitTest({ x: 1, y: 1 }, targets()),
  );
  assert.equal(
    helpers.dragDistanceExceeded({ x: 0, y: 0 }, { x: 6, y: 0 }),
    true,
  );
});
