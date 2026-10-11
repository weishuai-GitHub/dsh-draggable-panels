import test from "node:test";
import assert from "node:assert/strict";
import { createPanelService } from "../../src/client/registry/panel-service.js";
import { createComponentRegistry } from "../../src/client/registry/component-registry.js";
import { createStore } from "../../src/client/shared/store.js";

function owner() {
  const disposers = [];
  return {
    effect(setup) {
      const remove = setup();
      let active = true;
      const dispose = () => {
        if (active) {
          active = false;
          remove();
        }
      };
      disposers.push(dispose);
      return dispose;
    },
    unload() {
      for (const dispose of disposers.reverse()) dispose();
    },
  };
}
const descriptor = (id) => ({
  id,
  title: id,
  component() {},
  defaultPlacement: { side: "left", order: 0, visible: true },
});
function setup() {
  const registry = createComponentRegistry();
  return {
    registry,
    api: createPanelService({
      registry,
      show() {},
      hide() {},
      move() {},
      snapshot: createStore([]),
    }),
  };
}

test("consumer-owned registrations disappear on its unload, not unrelated consumers", () => {
  const { registry, api } = setup();
  const a = owner();
  const b = owner();
  const handle = api.forContext(a).register(descriptor("a"));
  api.register(b, descriptor("b"));
  assert.equal(typeof handle.dispose, "function");
  assert.equal(api.unregister, undefined);
  a.unload();
  assert.deepEqual(
    registry.getSnapshot().map((x) => x.id),
    ["b"],
  );
  handle.dispose();
  b.unload();
  assert.equal(registry.getSnapshot().length, 0);
});
test("old handle cannot remove later owner registration, including provider-first teardown", () => {
  const { registry, api } = setup();
  const a = owner();
  const old = api.register(a, descriptor("x"));
  old.dispose();
  const b = owner();
  api.register(b, descriptor("x"));
  a.unload();
  assert.equal(registry.getSnapshot().length, 1);
  registry.dispose();
  assert.doesNotThrow(() => b.unload());
});
test("missing owner and failed owner setup cannot leak registry entries", () => {
  const { registry, api } = setup();
  assert.throws(() => api.register(null, descriptor("x")), /Context/);
  assert.throws(
    () =>
      api.register(
        {
          effect() {
            throw new Error("inactive");
          },
        },
        descriptor("x"),
      ),
    /inactive/,
  );
  assert.equal(registry.getSnapshot().length, 0);
});
