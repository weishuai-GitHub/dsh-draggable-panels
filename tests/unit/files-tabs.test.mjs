import test from "node:test";
import assert from "node:assert/strict";
import { createFileTabs } from "../../src/client/components/files/tabs.js";
import { createStore } from "../../src/client/shared/store.js";
function setup() {
  const live = new Map();
  const reads = [];
  const tabs = createFileTabs({
    atom: createStore,
    read: (...args) => reads.push(args),
    register: (doc) => {
      live.set(doc.id, doc);
      return () => live.delete(doc.id);
    },
  });
  return { tabs, live, reads };
}
test("multiple files have independent caches and reopening reuses the same tab", () => {
  const { tabs, live, reads } = setup();
  const a = tabs.open("s", "/a.md");
  const b = tabs.open("s", "/b.json");
  assert.equal(live.size, 2);
  assert.notEqual(a.cache, b.cache);
  assert.equal(tabs.open("s", "/a.md"), a);
  assert.equal(reads.length, 2);
  a.cache.set({ preview: { text: "a" } });
  assert.equal(b.cache.getSnapshot().preview, null);
});
test("session switching only registers the active session's files", () => {
  const { tabs, live } = setup();
  const a = tabs.open("a", "/same.js");
  const b = tabs.open("b", "/same.js");
  assert.deepEqual([...live.keys()], [b.id]);
  tabs.selectSession("a");
  assert.deepEqual([...live.keys()], [a.id]);
  tabs.selectSession(undefined);
  assert.equal(live.size, 0);
});
test("close removes only one document, invalidates late reads and allows reopening", () => {
  const { tabs, live } = setup();
  const a = tabs.open("s", "/a.md");
  const b = tabs.open("s", "/b.js");
  a.cache.set({ preview: { token: {}, loading: true } });
  tabs.close(a);
  tabs.close(a);
  assert.deepEqual([...live.keys()], [b.id]);
  assert.equal(a.cache.getSnapshot().preview, null);
  assert.deepEqual(tabs.snapshot.getSnapshot(), [b]);
  assert.notEqual(tabs.open("s", "/a.md"), a);
  tabs.dispose();
  assert.equal(live.size, 0);
});
