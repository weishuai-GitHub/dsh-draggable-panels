import test from "node:test";
import assert from "node:assert/strict";
import {
  readLayout,
  readWorkspaceView,
  writeJSON,
  LAYOUT_KEY,
  LEGACY_LAYOUT_KEY,
  VIEW_KEY,
} from "../../src/client/shared/persistence.js";
import { normalizeLayout } from "../../src/client/dock/model.js";
const descriptor = (id) => ({
  id,
  title: id,
  component() {},
  defaultPlacement: { side: "left", visible: true },
});
test("legacy positions and active built-in selection migrate without deleting old storage", () => {
  const saved = {
    left: ["files", "workspaces", "absent.extension"],
    right: [],
    active: { left: "files", right: null },
  };
  const values = new Map([[LEGACY_LAYOUT_KEY, JSON.stringify(saved)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const next = normalizeLayout(readLayout(storage), [
    descriptor("workspaces"),
    descriptor("files"),
  ]);
  assert.equal(next.active.left, "files");
  assert.deepEqual(next.left, saved.left);
  assert.equal(writeJSON(storage, LAYOUT_KEY, next), true);
  assert.equal(values.get(LEGACY_LAYOUT_KEY), JSON.stringify(saved));
  assert.deepEqual(readLayout(storage), next);
});
test("corrupt persistence and unavailable storage do not break initialization", () => {
  const storage = {
    getItem: () => "{bad",
    setItem() {
      throw new Error("quota");
    },
  };
  assert.equal(readLayout(storage), null);
  assert.equal(writeJSON(storage, LAYOUT_KEY, {}), false);
  assert.equal(readWorkspaceView(storage).groupBy, "workspace");
  assert.equal(
    readWorkspaceView({
      getItem: (key) =>
        key === VIEW_KEY ? '{"groupBy":"workspace-tree","collapsed":[]}' : null,
    }).groupBy,
    "workspace-tree",
  );
  assert.deepEqual(
    readWorkspaceView({ getItem: () => '{"collapsed":[]}' }).collapsed,
    {},
  );
});
