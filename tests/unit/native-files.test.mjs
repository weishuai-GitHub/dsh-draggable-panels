import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createStore } from "../../src/client/shared/store.js";

// Stub only the independently tested tree adapter, never a native store/tab.
const source = (
  await readFile(
    new URL("../../src/client/integration/native-files.js", import.meta.url),
    "utf8",
  )
).replace(
  'import { createNativeExplorer } from "./native-explorer.js";',
  "const createNativeExplorer = () => function StandaloneExplorer() {};",
);
const { createNativeFiles } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const prefix = "local.draggablePanels:panel:";
const legacy = ["local.draggablePanels:left-files", `${prefix}panels`];
const Component = () => null;
const panel = (id) => ({ id, title: id, Component });
const spec = (rightIds = [], filesRight = false, enabled = true) => ({
  enabled,
  filesRight,
  rightIds,
  panels: [panel("terminal"), panel("workspaces")],
});

function harness() {
  const hooks = new Map();
  let cells, index, effects;
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useRef(initial) {
      return (cells[index++] ??= { current: initial });
    },
    useEffect(fn, deps) {
      const key = index++,
        old = cells[key];
      if (!old || deps.some((value, i) => !Object.is(value, old[i])))
        effects.push(fn);
      cells[key] = deps;
    },
  };
  const descriptors = new Map([["editor", { component: Component }]]);
  const listeners = new Set(),
    calls = [],
    cleanups = [],
    injectedCleanups = [];
  const mounted = createStore("session-a");
  let focused;
  const sidebar = {
    mounted,
    openTabs: createStore([]),
    expanded: false,
    openTab(kind) {
      calls.push(["openTab", kind]);
      const sessionId = mounted.getSnapshot();
      assert.ok(sessionId, "navigation requires a mounted session");
      let tab = this.openTabs
        .getSnapshot()
        .find((row) => row.sessionId === sessionId && row.kind === kind);
      if (!tab) {
        tab = { sessionId, kind, tabId: `tab:${kind}` };
        this.openTabs.set([...this.openTabs.getSnapshot(), tab]);
      }
      focused = tab.tabId;
    },
    close(tabId) {
      calls.push(["close", tabId]);
      this.openTabs.set(
        this.openTabs
          .getSnapshot()
          .filter(
            (tab) =>
              !(tab.sessionId === mounted.getSnapshot() && tab.tabId === tabId),
          ),
      );
      if (focused === tabId) focused = undefined;
    },
    focus(tabId) {
      focused = tabId;
      calls.push(["focus", tabId]);
    },
    active() {
      return focused ? { id: focused } : undefined;
    },
    isExpanded() {
      return this.expanded;
    },
    toggleExpanded() {
      this.expanded = !this.expanded;
      calls.push(["toggle"]);
    },
  };
  const service = {
    getTab: (id) => descriptors.get(id),
    registerTab(descriptor) {
      assert.equal(
        descriptors.has(descriptor.id),
        false,
        "no duplicate registrations",
      );
      descriptors.set(descriptor.id, descriptor);
      for (const fn of listeners) fn();
      return () => descriptors.delete(descriptor.id);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const context = {
    betterSidebar: service,
    sidebarRight: sidebar,
    effect(fn) {
      const off = fn();
      cleanups.push(off);
      return off;
    },
    inject(deps, fn) {
      assert.deepEqual(deps, ["betterSidebar", "sidebarRight"]);
      fn({
        ...this,
        effect(effect) {
          const off = effect();
          injectedCleanups.push(off);
          return off;
        },
      });
      return {
        dispose: async () => {
          for (const off of injectedCleanups.splice(0)) off?.();
        },
      };
    },
  };
  const notice = createStore("");
  const api = createNativeFiles(React, {
    ctx: context,
    atom: createStore,
    useAtom: (store) => store.getSnapshot(),
    t: (key) => key,
    notice,
    fail: (error) => error.message,
    current: (list) =>
      Object.values(list.byId).find((session) => session.active),
  });
  function render(Comp = api.Bridge, props = {}, runEffects = true) {
    cells = hooks.get(Comp) ?? [];
    hooks.set(Comp, cells);
    index = 0;
    effects = [];
    const result = Comp(props),
      pending = effects;
    if (runEffects) pending.forEach((fn) => fn());
    assert.equal(notice.getSnapshot(), "", "bridge reports no errors");
    return { result, flush: () => pending.forEach((fn) => fn()) };
  }
  function seed(kind, sessionId = "session-a", tabId = `tab:${kind}`) {
    sidebar.openTabs.set([
      ...sidebar.openTabs.getSnapshot(),
      { kind, sessionId, tabId },
    ]);
  }
  return {
    api,
    calls,
    descriptors,
    sidebar,
    mounted,
    render,
    seed,
    dispose: () =>
      cleanups
        .splice(0)
        .reverse()
        .forEach((off) => off?.()),
  };
}

test("navigation waits for Bridge and repeated panel opens focus its own native tab", () => {
  const { api, calls, descriptors, render } = harness();
  assert.equal(api.available.getSnapshot(), true);
  api.openFiles();
  const off = api.openPanel("terminal", "Terminal", Component);
  assert.equal(api.openPanel("terminal", "Terminal", Component), off);
  assert.deepEqual(calls, []);
  const commit = render(api.Bridge, {}, false);
  assert.deepEqual(calls, []);
  commit.flush();
  assert.deepEqual(calls, [
    ["openTab", "files"],
    ["openTab", `${prefix}terminal`],
    ["focus", `tab:${prefix}terminal`],
  ]);
  off();
  off();
  assert.equal(descriptors.has(`${prefix}terminal`), false);
});

test("each right component owns a native tab and no carrier/container is registered", () => {
  const { api, render, calls, descriptors } = harness();
  api.setPlacement(spec(["terminal", "workspaces"]));
  render();
  assert.deepEqual(calls, [
    ["openTab", `${prefix}terminal`],
    ["openTab", `${prefix}workspaces`],
  ]);
  assert.deepEqual(
    [...descriptors.keys()].sort(),
    ["editor", `${prefix}terminal`, `${prefix}workspaces`].sort(),
  );
  for (const kind of legacy) assert.equal(descriptors.has(kind), false);
  const props = { visible: false, scope: { sessionId: "session-a" } };
  const body = descriptors.get(`${prefix}terminal`).component(props);
  assert.equal(body.type, Component);
  assert.equal(body.props, props);
});

test("moving files both ways closes the actual files page and preserves editor resources", () => {
  const { api, render, seed, sidebar, calls } = harness();
  seed("editor", "session-a", "resource-editor");
  api.setPlacement(spec(["files"], true));
  render();
  assert.ok(sidebar.openTabs.getSnapshot().some((tab) => tab.kind === "files"));
  api.setPlacement(spec());
  api.openFiles();
  render();
  assert.ok(calls.some(([op, id]) => op === "close" && id === "tab:files"));
  assert.deepEqual(
    sidebar.openTabs.getSnapshot().map((tab) => tab.kind),
    ["editor"],
  );
  api.setPlacement(spec(["files"], true));
  render();
  assert.equal(
    calls.filter(([op, kind]) => op === "openTab" && kind === "files").length,
    2,
  );
});

test("migration closes files and both legacy kinds only in the current session", () => {
  const { api, render, seed, sidebar, calls, mounted } = harness();
  for (const sessionId of ["session-a", "session-b"]) {
    for (const kind of ["files", ...legacy, "editor"]) seed(kind, sessionId);
  }
  api.setPlacement(spec());
  render();
  assert.equal(calls.filter(([op]) => op === "close").length, 3);
  assert.deepEqual(
    sidebar.openTabs
      .getSnapshot()
      .filter((tab) => tab.sessionId === "session-a")
      .map((tab) => tab.kind),
    ["editor"],
  );
  assert.equal(
    sidebar.openTabs
      .getSnapshot()
      .filter((tab) => tab.sessionId === "session-b").length,
    4,
  );
  mounted.set("session-b");
  render();
  assert.equal(calls.filter(([op]) => op === "close").length, 6);
  assert.deepEqual(
    sidebar.openTabs.getSnapshot().map((tab) => tab.kind),
    ["editor", "editor"],
  );
});

test("panels move both ways without nested tabs and user-close is respected", () => {
  const { api, render, sidebar, calls } = harness();
  api.setPlacement(spec(["terminal"]));
  render();
  sidebar.close(`tab:${prefix}terminal`);
  render();
  api.setPlacement(spec(["terminal"]));
  render();
  assert.equal(
    calls.filter(([op]) => op === "openTab").length,
    1,
    "inventory churn must not reopen user-closed tabs",
  );
  api.setPlacement(spec([]));
  render();
  api.setPlacement(spec(["terminal"]));
  render();
  assert.equal(calls.filter(([op]) => op === "openTab").length, 2);
  api.setPlacement(spec([]));
  render();
  assert.deepEqual(sidebar.openTabs.getSnapshot(), []);
});

test("existing tabs are reused across panes and original editor focus is restored", () => {
  const { api, seed, sidebar, calls, render } = harness();
  seed(`${prefix}terminal`, "session-a", "other-pane-terminal");
  seed("editor", "session-a", "editor-focus");
  sidebar.focus("editor-focus");
  calls.length = 0;
  api.setPlacement(spec(["terminal", "workspaces"]));
  render();
  assert.deepEqual(calls, [
    ["openTab", `${prefix}workspaces`],
    ["focus", "editor-focus"],
  ]);
  api.openPanel("terminal", "Terminal", Component);
  render();
  assert.deepEqual(calls.at(-1), ["focus", "other-pane-terminal"]);
});

test("a newly visited session opens desired panels without duplicating earlier sessions", () => {
  const { api, render, mounted, calls } = harness();
  api.setPlacement(spec(["terminal"]));
  render();
  mounted.set("session-b");
  render();
  mounted.set("session-a");
  render();
  assert.equal(calls.filter(([op]) => op === "openTab").length, 2);
});

test("no session retains queued requests until a mounted session arrives", () => {
  const { api, mounted, render, calls } = harness();
  mounted.set(undefined);
  api.openFiles();
  render();
  assert.deepEqual(calls, []);
  mounted.set("session-b");
  render();
  assert.deepEqual(calls, [["openTab", "files"]]);
});

test("native mode protects the files page but retires plugin panel tabs", () => {
  const { api, render, seed, sidebar } = harness();
  seed("files");
  seed(`${prefix}terminal`);
  api.setPlacement(spec([], false, false));
  render();
  assert.deepEqual(
    sidebar.openTabs.getSnapshot().map((tab) => tab.kind),
    ["files"],
  );
});

test("LeftFiles renders a standalone tree with session identity and visibility, never a portal", () => {
  const { api, render, descriptors, calls } = harness();
  const props = {
    isActive: false,
    useSessions: (select) =>
      select({
        byId: { a: { id: "session-a", cwd: "/project", active: true } },
      }),
  };
  const result = render(api.LeftFiles, props).result;
  assert.equal(result.props["data-native-files-left"], true);
  const tree = result.children[0];
  assert.equal(tree.type.name, "StandaloneExplorer");
  assert.deepEqual(tree.props.scope, {
    sessionId: "session-a",
    cwd: "/project",
  });
  assert.equal(tree.props.visible, false);
  assert.equal(tree.props.key, "session-a");
  assert.equal("store" in tree.props, false);
  assert.equal("tab" in tree.props, false);
  assert.deepEqual([...descriptors.keys()], ["editor"]);
  assert.deepEqual(calls, []);
});

test("setShown is idempotent and disposal removes registrations and stops commands", () => {
  const { api, render, calls, sidebar, descriptors, dispose } = harness();
  api.setShown(true);
  api.setShown(true);
  render();
  assert.equal(sidebar.expanded, true);
  assert.deepEqual(calls, [["toggle"]]);
  api.setShown(false);
  render();
  assert.equal(sidebar.expanded, false);
  api.openPanel("terminal", "Terminal", Component);
  render();
  dispose();
  assert.equal(api.available.getSnapshot(), false);
  assert.deepEqual([...descriptors.keys()], ["editor"]);
  const count = calls.length;
  api.openFiles();
  api.setShown(true);
  render();
  assert.equal(calls.length, count);
});
