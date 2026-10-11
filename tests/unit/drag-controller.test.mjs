import test from "node:test";
import assert from "node:assert/strict";
import { createDragController } from "../../src/client/dock/drag-controller.js";
import { createStore } from "../../src/client/shared/store.js";
import { createPointerHelpers } from "../../src/client/dock/pointer.js";

test("hiding the dragged component releases capture and every pointer listener", () => {
  const original = globalThis.window;
  const listeners = new Map();
  let captured = false;
  const moves = [];
  globalThis.window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  const layout = createStore({ visible: true });
  const drag = createStore(null);
  const controller = createDragController({
    drag,
    layout,
    ...createPointerHelpers(),
    move: (...args) => moves.push(args),
    visibleIds: (state, side) =>
      state.visible && side === "left" ? ["external.any"] : [],
  });
  const element = {
    setPointerCapture() {
      captured = true;
    },
    hasPointerCapture: () => captured,
    releasePointerCapture() {
      captured = false;
    },
  };
  try {
    controller.startDrag(
      {
        button: 0,
        isPrimary: true,
        pointerId: 7,
        clientX: 10,
        clientY: 10,
        currentTarget: element,
      },
      "external.any",
      "left",
    );
    assert.equal(listeners.size, 5);
    assert.equal(captured, true);
    listeners.get("pointermove")({ pointerId: 7, clientX: 30, clientY: 10 });
    assert.equal(drag.getSnapshot().id, "external.any");
    layout.set({ visible: false });
    assert.equal(controller.getActive(), null);
    assert.equal(drag.getSnapshot(), null);
    assert.equal(listeners.size, 0);
    assert.equal(captured, false);
    assert.deepEqual(moves, []);
    controller.dispose();
    controller.dispose();
  } finally {
    controller.dispose();
    globalThis.window = original;
  }
});
