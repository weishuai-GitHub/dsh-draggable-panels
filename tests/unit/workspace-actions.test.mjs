import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceActions } from "../../src/client/integration/workspace-api.js";
import { createWorkspaceComponents } from "../../src/client/components/workspace/panel.js";
import { readFileSync } from "node:fs";
const zh = JSON.parse(
  readFileSync(new URL("../../src/client/locales/zh.json", import.meta.url)),
);
const en = JSON.parse(
  readFileSync(new URL("../../src/client/locales/en.json", import.meta.url)),
);
const css = readFileSync(
  new URL("../../src/client/components/workspace/styles.css", import.meta.url),
  "utf8",
);
function fake() {
  const calls = [];
  const record =
    (method, value) =>
    async (...args) => {
      calls.push([method, ...args]);
      return value;
    };
  const ctx = {
    workspaces: {
      create: record("create", { workspaceId: "w1" }),
      rename: record("rename"),
      delete: record("delete"),
      insertSessionBefore: record("reorder"),
    },
    uiWorkspace: {
      startSession: record("startSession"),
      openWorkspace: record("openWorkspace"),
      archiveSession: record("archive"),
      unarchiveSession: record("restore"),
      forkSession: record("fork", "child"),
      pinSession: record("pin"),
      unpinSession: record("unpin"),
    },
    sessions: {
      using: async (id, options, operation) => {
        calls.push(["using", id, options]);
        return operation({
          binding: {
            session: { rename: record("session.rename", { ok: true }) },
          },
        });
      },
    },
  };
  return { ctx, calls, actions: createWorkspaceActions(ctx) };
}
test("create registers one absolute directory then opens returned workspace", async () => {
  const { actions, calls } = fake();
  await actions.create(" /work/project ");
  assert.deepEqual(calls, [
    ["create", { path: "/work/project" }],
    ["openWorkspace", "w1"],
  ]);
});
test("relative, empty and home shorthand paths never reach Host create", async () => {
  const { actions, calls } = fake();
  for (const path of ["", "relative", "~/project"])
    await assert.rejects(actions.create(path), /wk.absolute/);
  assert.deepEqual(calls, []);
  assert.equal(actions.absolute("C:\\Projects\\Test"), true);
  assert.equal(actions.absolute("\\\\host\\share"), true);
});
test("create failure does not navigate or swallow rejection", async () => {
  const { ctx, actions, calls } = fake();
  ctx.workspaces.create = async () => {
    throw new Error("permission denied");
  };
  await assert.rejects(actions.create("/work"), /permission denied/);
  assert.deepEqual(calls, []);
});
test("same in-flight create shares Promise and cannot double-register", async () => {
  const { ctx, actions, calls } = fake();
  let release;
  ctx.workspaces.create = (...args) => {
    calls.push(["create", ...args]);
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const a = actions.create("/work");
  const b = actions.create("/other");
  assert.equal(a, b);
  await Promise.resolve();
  release({ workspaceId: "w2" });
  await a;
  assert.deepEqual(calls, [
    ["create", { path: "/work" }],
    ["openWorkspace", "w2"],
  ]);
});
test("workspace deletion ONLY unregisters and never deletes files or sessions", async () => {
  const { actions, calls } = fake();
  await actions.remove("w1");
  assert.deepEqual(calls, [["delete", "w1"]]);
});
test("workspace rename trims and rejects empty name before Host call", async () => {
  const { actions, calls } = fake();
  await actions.rename("w1", " My project ");
  await assert.rejects(actions.rename("w1", "  "), /wk.required/);
  assert.deepEqual(calls, [["rename", "w1", "My project"]]);
});
test("archive uses plain refusal-safe call, never asks to stop running work", async () => {
  const { ctx, actions, calls } = fake();
  ctx.uiWorkspace.archiveSession = async (...args) => {
    calls.push(["archive", ...args]);
    throw new Error("running work");
  };
  await assert.rejects(actions.archive("s1"), /running work/);
  assert.deepEqual(calls, [["archive", "s1"]]);
});
test("failed operations release lock for explicit retry", async () => {
  const { ctx, actions, calls } = fake();
  let attempts = 0;
  ctx.workspaces.delete = async (id) => {
    calls.push(["delete", id]);
    if (++attempts === 1) throw new Error("temporary");
  };
  await assert.rejects(actions.remove("w1"), /temporary/);
  await actions.remove("w1");
  assert.equal(calls.length, 2);
});
test("fork does not navigate; restore does not restart work", async () => {
  const { actions, calls } = fake();
  await actions.fork("s1");
  await actions.restore("s1");
  assert.deepEqual(calls, [
    ["fork", "s1"],
    ["restore", "s1"],
  ]);
});
test("same-group reordering forwards identity without replacing hidden sequence", async () => {
  const { actions, calls } = fake();
  await actions.reorder("w1", "s1", "s2");
  await actions.reorder("w1", "s1");
  assert.deepEqual(calls, [
    ["reorder", "w1", "s1", "s2"],
    ["reorder", "w1", "s1", undefined],
  ]);
});
test("pin and unpin use verified navigation operations", async () => {
  const { actions, calls } = fake();
  await actions.pin("s1", false);
  await actions.pin("s1", true);
  assert.deepEqual(calls, [
    ["pin", "s1"],
    ["unpin", "s1"],
  ]);
});
test("rename uses bounded workspaceOperation reference and propagates refusal", async () => {
  const { ctx, actions, calls } = fake();
  await actions.renameSession("s1", " New name ");
  assert.deepEqual(calls, [
    ["using", "s1", { source: "workspaceOperation" }],
    ["session.rename", "New name"],
  ]);
  ctx.sessions.using = async () => ({
    ok: false,
    error: { message: "readonly" },
  });
  await assert.rejects(actions.renameSession("s1", "Title"), /readonly/);
});
test("subagents and non-selected blanks stay hidden in all archive filters", () => {
  const { actions } = fake();
  const archive = new Set(["a"]);
  for (const filter of ["hide", "all", "archived"]) {
    assert.equal(
      actions.visible({ id: "a", origin: "subagent" }, "a", archive, filter),
      false,
    );
    assert.equal(
      actions.visible({ id: "a", blank: true }, "other", archive, filter),
      false,
    );
  }
  assert.equal(actions.visible({ id: "b", blank: true }, "b", archive), true);
  assert.equal(actions.visible({ id: "a" }, "b", archive), false);
  assert.equal(actions.visible({ id: "a" }, "b", archive, "archived"), true);
  assert.equal(actions.visible({ id: "a" }, "b", archive, "all"), true);
  assert.equal(actions.visible({ id: "b" }, "b", archive, "archived"), false);
});
test("component factory exposes matching locale dictionaries without accessing DOM", () => {
  const { ctx } = fake();
  const result = createWorkspaceComponents({ createElement() {} }, { ctx });
  assert.equal(typeof result.WorkspacePanel, "function");
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  assert.ok(Object.keys(zh).some((key) => key.startsWith("wk.")));
  assert.match(css, /--dsw-alias/);
});

test("group new-session uses native startSession with explicit workspace identity", async () => {
  const { actions, calls } = fake();
  await actions.newSession("chosen-workspace");
  assert.deepEqual(calls, [["startSession", "chosen-workspace"]]);
  assert.throws(() => actions.newSession(undefined), /workspace identity/);
  assert.throws(() => actions.newSession(""), /workspace identity/);
  assert.equal(calls.length, 1);
});

test("add workspace picks native directory then registers and opens it", async () => {
  const { ctx, actions, calls } = fake();
  ctx.uiWorkspace.pickDirectory = async () => {
    calls.push(["pickDirectory"]);
    return "/chosen/project";
  };
  await actions.pickAndCreate();
  assert.deepEqual(calls, [
    ["pickDirectory"],
    ["create", { path: "/chosen/project" }],
    ["openWorkspace", "w1"],
  ]);
});
test("cancel native picker does not register or navigate", async () => {
  const { ctx, actions, calls } = fake();
  ctx.uiWorkspace.pickDirectory = async () => null;
  assert.equal(await actions.pickAndCreate(), null);
  assert.deepEqual(calls, []);
});
test("native picker failure propagates without invoking unsupported browse", async () => {
  const { ctx, actions, calls } = fake();
  ctx.uiWorkspace.pickDirectory = async () => {
    throw new Error("picker unavailable");
  };
  await assert.rejects(actions.pickAndCreate(), /picker unavailable/);
  assert.deepEqual(calls, []);
});
test("repeated add clicks share a single in-flight native picker", async () => {
  const { ctx, actions, calls } = fake();
  let release;
  let count = 0;
  ctx.uiWorkspace.pickDirectory = () => {
    count++;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const first = actions.pickAndCreate();
  const second = actions.pickAndCreate();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(count, 1);
  release("/chosen/project");
  await first;
  assert.deepEqual(calls, [
    ["create", { path: "/chosen/project" }],
    ["openWorkspace", "w1"],
  ]);
});
