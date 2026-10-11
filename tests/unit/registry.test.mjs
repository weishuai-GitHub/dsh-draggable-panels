import test from "node:test";
import assert from "node:assert/strict";
import { createComponentRegistry } from "../../src/client/registry/component-registry.js";

const descriptor = (id = "extension") => ({
  id,
  title: "Extension",
  component() {},
  defaultPlacement: { side: "left", order: 10, visible: true },
});

test("snapshots are stable, copied, and deeply frozen at owned object boundaries", () => {
  const registry = createComponentRegistry();
  const empty = registry.getSnapshot();
  assert.equal(empty, registry.getSnapshot());
  assert.ok(Object.isFrozen(empty));
  const value = descriptor();
  registry.register(value);
  const snapshot = registry.getSnapshot();
  assert.notEqual(snapshot, empty);
  assert.equal(snapshot, registry.getSnapshot());
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot[0]));
  assert.ok(Object.isFrozen(snapshot[0].defaultPlacement));
  value.id = "changed";
  value.defaultPlacement.side = "right";
  assert.equal(snapshot[0].id, "extension");
  assert.equal(snapshot[0].defaultPlacement.side, "left");
  assert.throws(() => snapshot.push(descriptor()), TypeError);
});

test("duplicates throw without notifications or snapshot change; disposer is exact and idempotent", () => {
  const registry = createComponentRegistry();
  let notifications = 0;
  registry.subscribe(() => notifications++);
  const first = registry.register(descriptor());
  const oldSnapshot = registry.getSnapshot();
  assert.throws(() => registry.register(descriptor()), /Duplicate/);
  assert.equal(registry.getSnapshot(), oldSnapshot);
  first.dispose();
  first.dispose();
  const replacement = registry.register(descriptor());
  assert.notEqual(registry.getSnapshot()[0], oldSnapshot[0]);
  first.dispose();
  assert.equal(registry.getSnapshot().length, 1);
  assert.equal(notifications, 3);
  replacement.dispose();
  assert.equal(notifications, 4);
});

test("subscriptions and full disposal are independent and idempotent", () => {
  const registry = createComponentRegistry();
  let notifications = 0;
  const listener = () => notifications++;
  const stop = registry.subscribe(listener);
  registry.subscribe(listener);
  const handle = registry.register(descriptor());
  assert.equal(notifications, 2);
  stop();
  stop();
  registry.dispose();
  const snapshot = registry.getSnapshot();
  assert.deepEqual(snapshot, []);
  assert.equal(notifications, 3);
  registry.dispose();
  handle.dispose();
  assert.equal(registry.getSnapshot(), snapshot);
  assert.equal(notifications, 3);
  assert.throws(() => registry.register(descriptor()), /disposed/);
  registry.subscribe(listener)();
  assert.throws(() => registry.subscribe(null), TypeError);
});

test("descriptor validation rejects invalid fields without publishing", () => {
  const registry = createComponentRegistry();
  const initial = registry.getSnapshot();
  const invalid = [
    null,
    [],
    {},
    ...[
      { id: "" },
      { id: " " },
      { id: 3 },
      { title: null },
      { component: {} },
      { icon: {} },
      { integratedHeader: "yes" },
      { defaultPlacement: { side: "top", order: 1, visible: true } },
      { defaultPlacement: { side: "left", order: Infinity, visible: true } },
      { defaultPlacement: { side: "right", order: NaN, visible: true } },
      { defaultPlacement: { side: "left", order: 1, visible: 1 } },
    ].map((patch) => ({ ...descriptor(), ...patch })),
  ];
  for (const value of invalid)
    assert.throws(() => registry.register(value), TypeError);
  assert.equal(registry.getSnapshot(), initial);
});

test("opaque title callbacks, class components, icons, and arbitrary IDs work", () => {
  const registry = createComponentRegistry();
  class Panel {}
  const title = () => {
    throw new Error("must not be invoked");
  };
  for (const id of ["__proto__", "constructor", "插件:one"]) {
    registry.register({
      ...descriptor(id),
      title,
      component: Panel,
      icon: Panel,
      integratedHeader: true,
    });
  }
  assert.equal(registry.getSnapshot().length, 3);
  assert.equal(registry.getSnapshot()[0].title, title);
  assert.equal(registry.getSnapshot()[0].component, Panel);
});
