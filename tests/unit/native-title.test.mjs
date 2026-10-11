import test from "node:test";
import assert from "node:assert/strict";
import { createDockComponents } from "../../src/client/dock/components.js";
import { createStore } from "../../src/client/shared/store.js";
import { createPointerHelpers } from "../../src/client/dock/pointer.js";

test("native title delegates sorting to host while grip owns cross-sidebar drag", () => {
  const previous = globalThis.window;
  const listeners = new Map();
  globalThis.window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  const React = {
    Component: class {},
    createElement: (type, props, ...children) => ({ type, props, children }),
    useRef: (current) => ({ current }),
    useCallback: (fn) => fn,
  };
  const components = createDockComponents(React, {
    atom: createStore,
    useAtom: (source) => source.getSnapshot(),
    useCopy: () => (key) => key,
    registry: createStore([{ id: "files" }]),
    layout: createStore({ left: [], right: ["files"] }),
    drag: createStore(null),
    visibleIds: (state, side) => state[side],
    ...createPointerHelpers(),
    move() {},
  });
  let stopped = 0,
    prevented = 0,
    captured = false;
  const node = {
    setPointerCapture() {
      captured = true;
    },
    hasPointerCapture: () => captured,
    releasePointerCapture() {
      captured = false;
    },
    getBoundingClientRect: () => ({
      left: 900,
      right: 980,
      top: 0,
      bottom: 40,
    }),
  };
  const event = {
    currentTarget: node,
    button: 0,
    isPrimary: true,
    pointerId: 2,
    clientX: 930,
    clientY: 20,
    stopPropagation: () => stopped++,
    preventDefault: () => prevented++,
  };
  try {
    const title = components.NativeFileTitle({
      useTabInfo: () => ({ tab: { title: "Files" } }),
    });
    title.props.ref(node);
    assert.equal(
      title.props.onPointerDown,
      undefined,
      "title must bubble pointerdown to native sorter",
    );
    assert.equal(
      title.props.onDragStart,
      undefined,
      "title must not cancel native dragstart",
    );
    const grip = title.children[0];
    assert.equal(grip.props["data-dpd-native-cross-side-grip"], "files");
    grip.props.onClick(event);
    assert.equal(
      stopped,
      0,
      "ordinary click must still activate the native tab",
    );
    grip.props.onPointerDown(event);
    assert.equal(
      stopped,
      1,
      "do not also start the ancestor native docking drag",
    );
    assert.equal(captured, true);
    listeners.get("pointermove")({ ...event, clientX: 600 });
    listeners.get("pointerup")({ ...event, clientX: 600 });
    assert.equal(captured, false);
    assert.equal(listeners.size, 0);
    grip.props.onClick(event);
    assert.equal(stopped, 2);
    assert.equal(prevented, 1);
    grip.props.onClick(event);
    assert.equal(stopped, 2, "subsequent ordinary click is not swallowed");
    title.props.ref(null);
  } finally {
    components.dispose();
    globalThis.window = previous;
  }
});
