import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceSearch } from "../../src/client/components/workspace/search.js";
function harness(search) {
  const jobs = new Map();
  let next = 0;
  const changes = [];
  const controller = createWorkspaceSearch(
    search,
    (state) => changes.push(state),
    {
      set(fn, delay) {
        assert.equal(delay, 250);
        jobs.set(++next, fn);
        return next;
      },
      clear(id) {
        jobs.delete(id);
      },
    },
  );
  return {
    controller,
    changes,
    jobs,
    run() {
      const [id, fn] = jobs.entries().next().value;
      jobs.delete(id);
      return fn();
    },
  };
}
test("debounces native search and propagates snippets and hasMore", async () => {
  const calls = [];
  const h = harness(async (text) => {
    calls.push(text);
    return {
      ok: true,
      value: {
        items: [{ sessionId: "s", snippet: "body match" }],
        hasMore: true,
      },
    };
  });
  h.controller.update("old");
  h.controller.update(" new ");
  assert.equal(h.jobs.size, 1);
  await h.run();
  assert.deepEqual(calls, ["new"]);
  assert.equal(h.controller.getSnapshot().items[0].snippet, "body match");
  assert.equal(h.controller.getSnapshot().hasMore, true);
});
test("supersession aborts old work and late responses cannot replace new results", async () => {
  const pending = [];
  const h = harness(
    (text, signal) =>
      new Promise((resolve) => pending.push({ text, signal, resolve })),
  );
  h.controller.update("old");
  const old = h.run();
  h.controller.update("new");
  const latest = h.run();
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve({
    ok: true,
    value: { items: [{ sessionId: "new" }], hasMore: false },
  });
  await latest;
  pending[0].resolve({
    ok: true,
    value: { items: [{ sessionId: "old" }], hasMore: false },
  });
  await old;
  assert.equal(h.controller.getSnapshot().items[0].sessionId, "new");
});
test("empty query and disposal cancel scheduled requests", () => {
  const h = harness(() => {
    throw new Error("must not run");
  });
  h.controller.update("x");
  h.controller.update("");
  assert.equal(h.jobs.size, 0);
  assert.equal(h.controller.getSnapshot().loading, false);
  h.controller.update("y");
  h.controller.dispose();
  assert.equal(h.jobs.size, 0);
});
test("business errors and exceptions remain explicit and permit retry", async () => {
  let attempt = 0;
  const h = harness(async () => {
    if (++attempt === 1) return { ok: false, error: { message: "offline" } };
    throw new Error("transport");
  });
  h.controller.update("x");
  await h.run();
  assert.equal(h.controller.getSnapshot().error.message, "offline");
  h.controller.update("x");
  await h.run();
  assert.equal(h.controller.getSnapshot().error.message, "transport");
});
