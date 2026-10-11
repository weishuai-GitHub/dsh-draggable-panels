import test from "node:test";
import assert from "node:assert/strict";
import { createFilesStore } from "../../src/client/components/files/store.js";
import { createStore } from "../../src/client/shared/store.js";
test("file preview paging preserves blank line boundaries and request scope", async () => {
  const calls = [];
  let page = 0;
  const files = createFilesStore(
    {
      remote: {
        workspaceFiles: {
          async read(...args) {
            calls.push(args);
            page++;
            return {
              ok: true,
              value: {
                text: page === 1 ? "" : "next",
                lines: 1,
                offset: page,
                eof: page === 2,
              },
            };
          },
        },
      },
    },
    createStore,
  );
  const cache = files.cacheFor("session", "/root");
  await files.previewFile(cache, "session", "/root/a");
  await files.previewFile(cache, "session", "/root/a", true);
  assert.equal(cache.getSnapshot().preview.text, "\nnext");
  assert.equal(calls[1][0], "session");
  assert.equal(calls[1][2].offset, 2);
  files.dispose();
});
test("disposing file component aborts requests and ignores late results", async () => {
  let resolve;
  let signal;
  const files = createFilesStore(
    {
      remote: {
        workspaceFiles: {
          list(_id, _path, s) {
            signal = s;
            return new Promise((done) => {
              resolve = done;
            });
          },
        },
      },
    },
    createStore,
  );
  const cache = files.cacheFor("s", "/root");
  const pending = files.loadDirectory(cache, "s", "/root");
  files.dispose();
  assert.equal(signal.aborted, true);
  resolve({ ok: true, value: { entries: [{ name: "late" }] } });
  await pending;
  assert.equal(cache.getSnapshot().levels["/root"].entries, undefined);
});
