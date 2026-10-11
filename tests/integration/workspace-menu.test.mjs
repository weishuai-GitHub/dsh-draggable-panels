import { readFileSync } from "node:fs";
const zh = JSON.parse(
  readFileSync(new URL("../../src/client/locales/zh.json", import.meta.url)),
);
import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceComponents } from "../../src/client/components/workspace/panel.js";
import { createWorkspaceModel } from "../../src/client/components/workspace/model.js";
import { createIcons } from "../../src/client/shared/icons.js";

test("default workspace label and session menu match native order and inline actions", async () => {
  const calls = [];
  const views = [];
  const row = {
    id: "s",
    title: "Session",
    updatedAt: Date.now(),
    retainedBy: { mainView: 1 },
  };
  const group = {
    workspaceId: "w",
    title: "default-workspace",
    path: "/workspace",
    sessionIds: ["s"],
  };
  const menu = {
    kind: "session",
    row,
    group,
    rows: [row],
    rect: { left: 100, right: 124, bottom: 100 },
    anchor: null,
  };
  let stateIndex = 0;
  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    Fragment: "fragment",
    useRef: (current) => ({ current }),
    useState: (initial) => [
      stateIndex++ === 1
        ? menu
        : typeof initial === "function"
          ? initial()
          : initial,
      () => {},
    ],
    useEffect() {},
    useLayoutEffect() {},
  };
  let dict;
  const env = {
    ctx: {
      locale: { getSnapshot: () => "zh" },
      workspaces: {},
      uiWorkspace: {
        startSession: (...args) => calls.push(args),
        pickDirectory: () => {
          calls.push(["pickDirectory"]);
          return Promise.resolve(null);
        },
      },
    },
    useCopy: () => (key) => dict[key] || key,
    useAtom: (store) => store.getSnapshot(),
    workspaceView: {
      set: (view) => views.push(view),
      getSnapshot: () => ({ query: "", collapsed: {} }),
    },
    current: () => row,
    notice: { set() {} },
    fail: String,
    Icon: createIcons(React),
    model: createWorkspaceModel(),
  };
  const components = createWorkspaceComponents(React, env);
  dict = zh;
  const nodes = [];
  function render(node) {
    if (node == null || typeof node === "boolean") return "";
    if (Array.isArray(node)) return node.map(render).join("");
    if (typeof node !== "object") return String(node);
    if (typeof node.type === "function") return render(node.type(node.props));
    nodes.push(node);
    return render(node.props.children);
  }
  const text = render(
    React.createElement(components.WorkspacePanel, {
      useSessions: (f) => f({ ids: ["s"], byId: { s: row }, phase: "ready" }),
      useWorkspaces: (f) =>
        f({
          items: [group],
          archivedSessionIds: [],
          pinnedSessionIds: [],
          phase: "ready",
        }),
      usePanelInfo: (f) => f({ activePanelId: null }),
    }),
  );
  assert.match(text, /默认工作区/);
  assert.doesNotMatch(text, /default-workspace/);
  const items = nodes.filter((node) => node.props.role === "menuitem");
  assert.equal(items.length, 4);
  const labels = items.map((node) =>
    node.props.children
      .find((child) => child?.props?.className === "dpw-menu-text")
      .props.children.join(""),
  );
  assert.deepEqual(labels, ["置顶会话", "重命名", "分叉会话", "归档会话"]);
  for (const item of items)
    assert.equal(typeof item.props.children[0].type, "function");
  assert.ok(
    nodes.some((node) => node.props.className === "dpw-session-actions"),
  );
  assert.ok(nodes.some((node) => node.props["aria-label"] === "归档会话"));
  assert.ok(nodes.some((node) => node.props["aria-label"] === "置顶会话"));
  assert.doesNotMatch(text, /上移|下移/);
  const create = nodes.find(
    (node) => node.props["aria-label"] === "默认工作区: 新建会话",
  );
  assert.ok(create);
  // dsh-tauri-ui's document capture handler intercepts these exact generic labels
  // and calls its ungrouped-session operation before the React handler can run.
  const shellIntercepts = (label) =>
    ["新建会话", "New session"].includes(label);
  assert.equal(shellIntercepts("新建会话"), true);
  assert.equal(shellIntercepts(create.props["aria-label"]), false);
  await create.props.onClick();
  assert.deepEqual(calls, [["w"]]);
  assert.equal(views.at(-1).collapsed.w, false);
  await nodes
    .find((node) => node.props["aria-label"] === "添加工作区")
    .props.onClick();
  assert.deepEqual(calls, [["w"], ["pickDirectory"]]);
});

test("view options have native icon-label-check order, work, and preserve title drag grip", async () => {
  let index = 0;
  let view = {
    query: "",
    collapsed: {},
    groupBy: "workspace",
    orderBy: "updated",
    archiveFilter: "default",
  };
  let dict;
  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    Fragment: "fragment",
    useRef: (current) => ({ current }),
    useState: (initial) => [
      index++ === 1
        ? { kind: "view", rect: { left: 220, right: 248, bottom: 36 } }
        : typeof initial === "function"
          ? initial()
          : initial,
      () => {},
    ],
    useEffect() {},
    useLayoutEffect() {},
  };
  const components = createWorkspaceComponents(React, {
    ctx: { locale: { getSnapshot: () => "zh" } },
    useCopy: () => (key) => dict[key],
    useAtom: (store) => store.getSnapshot(),
    workspaceView: {
      getSnapshot: () => view,
      set: (next) => {
        view = next;
      },
    },
    current: () => null,
    notice: {
      set: (e) => {
        throw new Error(e);
      },
    },
    fail: String,
    Icon: createIcons(React),
    model: createWorkspaceModel(),
  });
  dict = zh;
  const nodes = [];
  const drag = () => {};
  function render(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(render);
    if (typeof node.type === "function") return render(node.type(node.props));
    nodes.push(node);
    render(node.props.children);
  }
  render(
    React.createElement(components.WorkspacePanel, {
      dockHeaderProps: { onPointerDown: drag },
      useSessions: (f) => f({ phase: "ready", ids: [], byId: {} }),
      useWorkspaces: (f) => f({ phase: "ready", items: [] }),
      usePanelInfo: (f) => f({ activePanelId: null }),
    }),
  );
  const items = nodes.filter((node) => node.props.role === "menuitemradio");
  assert.equal(items.length, 8);
  assert.equal(items.filter((node) => node.props["aria-checked"]).length, 3);
  const expected = [
    ["groupBy", "workspace"],
    ["groupBy", "workspace-tree"],
    ["groupBy", "flat"],
    ["orderBy", "manual"],
    ["orderBy", "updated"],
    ["archiveFilter", "default"],
    ["archiveFilter", "show"],
    ["archiveFilter", "only"],
  ];
  for (let i = 0; i < items.length; i++) {
    assert.equal(typeof items[i].props.children[0].type, "function");
    assert.equal(items[i].props.children[1].props.className, "dpw-menu-text");
    assert.equal(items[i].props.children[2].props.className, "dpw-check");
    items[i].props.onClick();
    await Promise.resolve();
    assert.equal(view[expected[i][0]], expected[i][1]);
  }
  assert.equal(dict["wk.show"], "全部对话（显示已归档）");
  assert.ok(
    nodes.some((node) => node.props.className === "dpw-popover dpw-view-menu"),
  );
  assert.ok(nodes.some((node) => node.props.onPointerDown === drag));
  const grip = nodes.find((node) => node.props.className === "dpw-title-grip");
  assert.equal(
    grip.props.children.filter((node) => node.type === "circle").length,
    6,
  );
});
