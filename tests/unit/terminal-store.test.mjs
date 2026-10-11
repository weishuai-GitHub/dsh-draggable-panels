import test from "node:test";
import assert from "node:assert/strict";
import {
  createTerminalStore,
  TERMINAL_STORAGE_KEY,
} from "../../src/client/components/terminal/store.js";
import { createStore } from "../../src/client/shared/store.js";

function fixture({ saved, ready = true } = {}) {
  let serial = 0;
  const views = [];
  const streams = [];
  const retains = [];
  const values = new Map(
    saved ? [[TERMINAL_STORAGE_KEY, JSON.stringify(saved)]] : [],
  );
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  const ctx = {
    webTerminals: {
      retainTabs() {
        throw new Error("Must not replace native sidebar ownership");
      },
      close() {
        throw new Error("Must use model.close after confirmation");
      },
      view(sessionId, occurrenceKey, contentId, terminalId, shellPath) {
        const id = terminalId || `terminal-${++serial}`;
        const model = {
          id,
          state: createStore(
            ready
              ? { info: { id, title: "Shell" }, title: "Shell" }
              : { phase: "loading" },
          ),
          closes: 0,
          disposes: 0,
          async close() {
            this.closes++;
            if (this.closeError) throw this.closeError;
            if (this.closeGate) await this.closeGate;
          },
          async dispose() {
            this.disposes++;
          },
        };
        views.push({
          sessionId,
          occurrenceKey,
          contentId,
          terminalId,
          shellPath,
          model,
        });
        return model;
      },
    },
    remote: {
      terminal: {
        retain(sessionId, id, signal) {
          retains.push({ sessionId, id, signal });
          return (async function* () {
            yield { ok: true };
          })();
        },
        async list() {
          return { ok: true, value: [{ id: "recoverable" }] };
        },
      },
      $stream(options) {
        const controller = new AbortController();
        let finish;
        const ended = new Promise((resolve) => {
          finish = resolve;
        });
        const stream = {
          options,
          accepts: 0,
          disposes: 0,
          async *[Symbol.asyncIterator]() {
            for await (const value of options.open(controller.signal)) {
              yield {
                value,
                signal: controller.signal,
                accept: () => stream.accepts++,
              };
            }
            await ended;
          },
          async dispose() {
            this.disposes++;
            controller.abort();
            finish();
          },
        };
        streams.push(stream);
        return stream;
      },
    },
  };
  return {
    ctx,
    storage,
    values,
    views,
    streams,
    retains,
    make: () =>
      createTerminalStore({
        ctx,
        storage,
        uuid: () => `uuid-${++serial}`,
        createStore,
      }),
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("construction, snapshots, subscriptions, selection and listing never allocate", async () => {
  const f = fixture();
  const store = f.make();
  const snapshot = store.getSnapshot();
  assert.equal(snapshot, store.getSnapshot());
  const unsubscribe = store.subscribe(() => {});
  assert.equal(store.select("s1", "missing"), false);
  assert.deepEqual(await store.list("s1"), [{ id: "recoverable" }]);
  unsubscribe();
  await store.dispose();
  assert.equal(f.views.length, 0);
  assert.equal(f.streams.length, 0);
});

test("explicit starts own acknowledged holds unaffected by hiding or session selection", async () => {
  const f = fixture();
  const store = f.make();
  const first = store.start("s1", "/bin/zsh");
  const second = store.start("s1");
  store.start("s2");
  assert.equal(f.views[0].shellPath, "/bin/zsh");
  assert.equal(f.views[0].terminalId, undefined);
  assert.equal(store.getSnapshot().sessions.s1.selected, second.id);
  const unsubscribe = store.subscribe(() => {});
  unsubscribe(); // UI hiding is just unsubscription, not process ownership.
  store.select("s1", first.id);
  await flush();
  assert.equal(f.streams.length, 3);
  assert.equal(f.retains.length, 3);
  assert.ok(
    f.streams.every((stream) => stream.accepts === 1 && stream.disposes === 0),
  );
  assert.ok(
    f.views.every(({ model }) => model.closes === 0 && model.disposes === 0),
  );
  await store.dispose();
  assert.ok(f.streams.every((stream) => stream.disposes === 1));
  assert.ok(f.retains.every(({ signal }) => signal.aborted));
  assert.ok(
    f.views.every(({ model }) => model.closes === 0 && model.disposes === 1),
  );
});

test("hold starts only when model info exists; state subscription saves metadata", async () => {
  const f = fixture({ ready: false });
  const store = f.make();
  const entry = store.start("s1");
  assert.equal(f.streams.length, 0);
  entry.model.state.set({
    info: { id: entry.terminalId, title: "Renamed" },
    title: "Renamed",
  });
  await flush();
  assert.equal(f.streams.length, 1);
  assert.equal(store.getSnapshot().sessions.s1.entries[0].title, "Renamed");
  const saved = JSON.parse(f.values.get(TERMINAL_STORAGE_KEY));
  assert.deepEqual(saved.sessions.s1.entries[0], {
    sessionId: "s1",
    contentId: entry.contentId,
    terminalId: entry.terminalId,
    title: "Renamed",
  });
  assert.equal(saved.sessions.s1.entries[0].model, undefined);
  await store.dispose();
  entry.model.state.set({ title: "After disposal" });
  assert.equal(store.getSnapshot().sessions.s1.entries[0].title, "Renamed");
});

test("reload restores only explicit IDs and uses fresh occurrence keys", async () => {
  const f = fixture();
  const original = f.make();
  const entry = original.start("s1");
  const occurrence = f.views[0].occurrenceKey;
  await original.dispose();
  const restored = f.make();
  assert.equal(f.views.length, 2);
  assert.equal(f.views[1].terminalId, entry.terminalId);
  assert.equal(f.views[1].contentId, entry.contentId);
  assert.notEqual(f.views[1].occurrenceKey, occurrence);
  assert.equal(restored.getSnapshot().sessions.s1.selected, entry.id);
  assert.throws(() => restored.restore("s1", {}), /existing terminal ID/);
  assert.equal(f.views.length, 2);
  await restored.dispose();
});

test("malformed saved entries never invoke view without an existing ID", async () => {
  const f = fixture({
    saved: {
      version: 1,
      sessions: {
        s1: {
          entries: [
            { contentId: "missing-id" },
            { contentId: "invalid-id", terminalId: "../../bad" },
            {
              contentId: "valid",
              terminalId: "host-existing",
              title: "Existing",
            },
          ],
        },
      },
    },
  });
  const store = f.make();
  assert.equal(f.views.length, 1);
  assert.equal(f.views[0].terminalId, "host-existing");
  assert.equal(
    store.restore("s1", { terminalId: "host-existing", contentId: "other" }).id,
    "valid",
  );
  assert.equal(f.views.length, 1);
  await store.dispose();
});

test("explicit close awaits success before releasing, removing and persisting", async () => {
  const f = fixture();
  const store = f.make();
  const entry = store.start("s1");
  let complete;
  entry.model.closeGate = new Promise((resolve) => {
    complete = resolve;
  });
  const closing = store.close("s1", entry.id);
  assert.equal(store.getSnapshot().sessions.s1.entries.length, 1);
  assert.equal(entry.model.disposes, 0);
  assert.equal(f.streams[0].disposes, 0);
  complete();
  assert.equal(await closing, true);
  assert.equal(entry.model.closes, 1);
  assert.equal(entry.model.disposes, 1);
  assert.equal(f.streams[0].disposes, 1);
  assert.deepEqual(store.getSnapshot().sessions.s1, {
    entries: [],
    selected: null,
  });
  assert.deepEqual(
    JSON.parse(f.values.get(TERMINAL_STORAGE_KEY)).sessions.s1.entries,
    [],
  );
  await store.dispose();
  assert.equal(entry.model.disposes, 1);
});

test("close refusal preserves entry, selection, persistence and hold, and allows retry", async () => {
  const f = fixture();
  const store = f.make();
  const entry = store.start("s1");
  const saved = f.values.get(TERMINAL_STORAGE_KEY);
  entry.model.closeError = new Error("Host refused");
  assert.equal(await store.close("s1", entry.id), false);
  assert.equal(store.getSnapshot().error, "Host refused");
  assert.equal(store.getSnapshot().sessions.s1.entries[0].id, entry.id);
  assert.equal(store.getSnapshot().sessions.s1.selected, entry.id);
  assert.equal(f.values.get(TERMINAL_STORAGE_KEY), saved);
  assert.equal(f.streams[0].disposes, 0);
  assert.equal(entry.model.disposes, 0);
  entry.model.closeError = null;
  assert.equal(await store.close("s1", entry.id), true);
  await store.dispose();
});

test("hold rejection and disposal rejection are handled, unload never closes", async () => {
  const f = fixture();
  f.ctx.remote.terminal.retain = async function* () {
    throw new Error("Hold unavailable");
  };
  const store = f.make();
  const entry = store.start("s1");
  await flush();
  assert.equal(
    store.getSnapshot().sessions.s1.entries[0].retainError,
    "Hold unavailable",
  );
  entry.model.dispose = async () => {
    entry.model.disposes++;
    throw new Error("Detach failed");
  };
  const disposing = store.dispose();
  assert.equal(store.dispose(), disposing);
  await disposing;
  assert.equal(entry.model.closes, 0);
  assert.equal(entry.model.disposes, 1);
  assert.equal(f.streams[0].disposes, 1);
  assert.throws(() => store.start("s1"), /disposed/);
});

test("unload during allocation cancels subscription without opening a late hold", async () => {
  const f = fixture({ ready: false });
  const store = f.make();
  const entry = store.start("s1");
  await store.dispose();
  entry.model.state.set({ info: { id: entry.terminalId } });
  await flush();
  assert.equal(f.streams.length, 0);
  assert.equal(entry.model.disposes, 1);
  assert.equal(entry.model.closes, 0);
});

test("saved restoration does not partially overwrite other session records", async () => {
  const f = fixture({
    saved: {
      version: 1,
      sessions: {
        s1: {
          entries: [{ contentId: "content-1", terminalId: "terminal-1" }],
          selected: "content-1",
        },
        s2: {
          entries: [{ contentId: "content-2", terminalId: "terminal-2" }],
          selected: "content-2",
        },
      },
    },
  });
  let writes = 0;
  const setItem = f.storage.setItem;
  f.storage.setItem = (...args) => {
    writes++;
    setItem(...args);
  };
  const store = f.make();
  assert.equal(writes, 0);
  assert.equal(f.views.length, 2);
  assert.equal(store.getSnapshot().sessions.s1.selected, "content-1");
  assert.equal(store.getSnapshot().sessions.s2.selected, "content-2");
  await store.dispose();
});
