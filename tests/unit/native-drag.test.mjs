import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../../src/client/shared/store.js";
import { createDragController } from "../../src/client/dock/drag-controller.js";
import { createPointerHelpers } from "../../src/client/dock/pointer.js";
import { registerSlots } from "../../src/client/integration/slots.js";

function pointerHarness() {
  const listeners = new Map();
  const previous = globalThis.window;
  globalThis.window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  const moves = [];
  const drag = createStore(null);
  const controller = createDragController({
    drag,
    layout: createStore({}),
    ...createPointerHelpers(),
    visibleIds: (_, side) => (side === "left" ? ["workspaces"] : ["files"]),
    move: (...args) => moves.push(args),
  });
  const node = (left, right) => ({
    getBoundingClientRect: () => ({ left, right, top: 0, bottom: 900 }),
  });
  const source = { setPointerCapture() {}, hasPointerCapture: () => false };
  const start = (id, side, x) =>
    controller.startDrag(
      {
        button: 0,
        isPrimary: true,
        pointerId: 1,
        clientX: x,
        clientY: 20,
        currentTarget: source,
      },
      id,
      side,
    );
  const event = (x) => ({ pointerId: 1, clientX: x, clientY: 300 });
  return {
    controller,
    drag,
    moves,
    node,
    start,
    move: (x) => listeners.get("pointermove")?.(event(x)),
    up: (x) => listeners.get("pointerup")?.(event(x)),
    cancel: () => listeners.get("pointercancel")?.(),
    close() {
      controller.dispose();
      globalThis.window = previous;
    },
  };
}

test("native right drop rail accepts left components without a mounted right Dock", () => {
  const h = pointerHarness();
  try {
    h.controller.frames.left = h.node(0, 280);
    const rail = h.node(900, 1200);
    h.start("workspaces", "left", 50);
    h.move(400); // Crossing the threshold mounts our rail.
    h.controller.revealRef(rail, null);
    h.move(1000);
    assert.deepEqual(h.drag.getSnapshot().target, { side: "right" });
    h.up(1000);
    assert.deepEqual(h.moves, [["workspaces", "right", undefined]]);
    assert.equal(h.drag.getSnapshot(), null);
  } finally {
    h.close();
  }
});

test("native title drags back left and cancelled or removed drop targets never move", () => {
  const h = pointerHarness();
  try {
    h.controller.frames.left = h.node(0, 280);
    h.start("files", "right", 950);
    h.move(100);
    h.up(100);
    assert.deepEqual(h.moves, [["files", "left", undefined]]);
    const rail = h.node(900, 1200);
    h.controller.revealRef(rail, null);
    h.start("workspaces", "left", 50);
    h.move(1000);
    h.cancel();
    h.up(1000);
    assert.equal(h.moves.length, 1);
    h.controller.revealRef(null, rail);
    h.start("workspaces", "left", 50);
    h.move(1000);
    h.up(1000);
    assert.equal(h.moves.length, 1);
  } finally {
    h.close();
  }
});

test("native title registrations track public type IDs, mode, and unload", () => {
  const mode = createStore(false),
    available = createStore(true);
  const types = createStore("provider:files");
  const active = new Map(),
    cleanups = [];
  const Title = () => null;
  const ctx = {
    sidebarRightTabs: {
      get: (kind) =>
        kind === "files" ? { id: types.getSnapshot() } : undefined,
      subscribe: types.subscribe,
    },
    inject: (_, fn) => fn(ctx),
    slots: {
      inject: (_, fn) => {
        const off = fn();
        cleanups.push(off);
        return off;
      },
      register: (opts, Component) => {
        const id = `${opts.name}:${opts.key || opts.id || "default"}`;
        active.set(id, { opts, Component });
        return () => active.delete(id);
      },
    },
  };
  registerSlots(ctx, mode, { NativeFileTitle: Title }, { available });
  const titles = () =>
    [...active.values()].filter((x) => x.Component === Title);
  assert.equal(titles()[0].opts.key, "provider:files");
  types.set("replacement:files");
  assert.equal(titles().length, 1);
  assert.equal(titles()[0].opts.key, "replacement:files");
  mode.set(true);
  assert.equal(titles().length, 0);
  mode.set(false);
  assert.equal(titles().length, 1);
  available.set(false);
  assert.equal(titles().length, 0);
  available.set(true);
  assert.equal(titles().length, 1);
  cleanups.reverse().forEach((off) => off?.());
  assert.equal(active.size, 0);
});
