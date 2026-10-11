import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

// Executes the actual generated factory, not source-pattern matching. This is a
// contract/render smoke test, not a browser interaction or layout test.
test("generated bundle mounts both docks and workspace controls without missing symbols", async () => {
  const registrations = new Map();
  const dictionaries = {};
  const cleanups = [];
  let terminalRegistration;
  class Component {
    constructor(props) {
      this.props = props;
      this.state = {};
    }
    setState(next) {
      this.state = { ...this.state, ...next };
    }
  }
  const React = {
    Component,
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    Fragment: "fragment",
    useSyncExternalStore: (_subscribe, get) => get(),
    useState: (initial) => [
      typeof initial === "function" ? initial() : initial,
      () => {},
    ],
    useRef: (current) => ({ current }),
    useCallback: (fn) => fn,
    useEffect: () => {},
    useLayoutEffect: () => {},
  };
  let plugin;
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load: ({ id, factory }) => {
          assert.equal(id, "dsh-draggable-panels");
          plugin = factory((name) => {
            assert.equal(name, "react");
            return React;
          });
        },
      },
      removeEventListener() {},
    },
    localStorage: { getItem: () => null, setItem() {} },
    AbortController,
    crypto: { randomUUID },
    console,
  };
  vm.runInNewContext(
    await readFile(new URL("../../dist/client.js", import.meta.url), "utf8"),
    sandbox,
  );
  const ctx = {
    inject: (deps, fn) => {
      if (deps.includes("webTerminals")) terminalRegistration = fn;
      if (
        deps.some(
          (dep) =>
            dep.split(".").reduce((value, key) => value?.[key], ctx) ===
            undefined,
        )
      )
        return () => {};
      const remove = fn(ctx);
      if (typeof remove === "function") cleanups.push(remove);
    },
    effect: (fn) => {
      const dispose = fn();
      let active = true;
      const cleanup = () => {
        if (active) {
          active = false;
          dispose?.();
        }
      };
      cleanups.push(cleanup);
      return cleanup;
    },
    provide: (key, value) => {
      ctx[key] = value;
      const cleanup = () => {
        delete ctx[key];
      };
      cleanups.push(cleanup);
      return cleanup;
    },
    locale: {
      register: (_ns, dicts) => {
        Object.assign(dictionaries, dicts.zh);
        return () => {};
      },
      bind: () => (key) => dictionaries[key] || key,
      subscribe: () => () => {},
      getSnapshot: () => "zh",
    },
    slots: {
      inject: (_name, fn) => {
        const cleanup = fn();
        if (typeof cleanup === "function") cleanups.push(cleanup);
      },
      register: ({ name }, Component) => {
        registrations.set(name, Component);
        return () => registrations.delete(name);
      },
    },
    cordisInspect: { register: () => () => {} },
    workspaces: {},
    uiWorkspace: {},
    sessions: {},
    remote: {},
    layout: {},
  };
  plugin.apply(ctx);
  assert.ok(plugin.inject.includes("workspaces"));
  assert.ok(plugin.inject.includes("sessions"));
  const sample = {
    id: "session",
    title: "Sample session",
    cwd: "/sample",
    origin: "user",
    retainedBy: { mainView: 1 },
  };
  const props = {
    wide: true,
    expandSidebar() {},
    viewportWidth: 1400,
    canShow: true,
    width: 320,
    useSessions: (selector) =>
      selector({ phase: "ready", ids: ["session"], byId: { session: sample } }),
    useWorkspaces: (selector) =>
      selector({
        phase: "ready",
        state: "idle",
        error: null,
        items: [
          {
            workspaceId: "workspace",
            title: "Sample workspace",
            path: "/sample",
            sessionIds: ["session"],
          },
        ],
        archivedSessionIds: [],
        pinnedSessionIds: [],
      }),
    usePanelInfo: (selector) => selector({ activePanelId: null }),
  };
  const rendered = [];
  function render(node) {
    if (node == null || typeof node === "boolean") return "";
    if (Array.isArray(node)) return node.map(render).join(" ");
    if (typeof node !== "object") return String(node);
    if (typeof node.type === "function") {
      if (node.type.prototype instanceof Component) {
        const instance = new node.type(node.props);
        try {
          return render(instance.render());
        } catch (error) {
          instance.state = node.type.getDerivedStateFromError(error);
          return render(instance.render());
        }
      }
      return render(node.type(node.props));
    }
    rendered.push(node);
    return render(node.props.children);
  }
  const left = render(
    React.createElement(registrations.get("sidebar.workspaces"), props),
  );
  assert.match(left, /工作区/);
  assert.match(left, /Sample workspace/);
  assert.match(left, /Sample session/);
  assert.doesNotMatch(left, /wk\.[a-zA-Z]/);
  assert.equal(
    rendered.filter((node) => node.props.className === "dpw-header").length,
    1,
  );
  assert.equal(
    rendered.filter((node) => node.props.className === "dpd-strip").length,
    0,
  );
  assert.equal(
    rendered.filter((node) => node.props.className === "dpd-bottom").length,
    0,
  );
  assert.equal(
    rendered.filter((node) => node.type === "input" || node.type === "select")
      .length,
    0,
  );
  for (const label of ["搜索会话或工作区", "视图选项", "添加工作区"])
    assert.ok(
      rendered.some(
        (node) => node.type === "button" && node.props["aria-label"] === label,
      ),
    );
  const header = rendered.find(
    (node) => node.props.id === "dpd-tab-workspaces",
  );
  assert.equal(typeof header.props.onPointerDown, "function");
  assert.ok(rendered.some((node) => node.props.className === "dpw-time"));

  render(React.createElement(registrations.get("rightbar"), props));
  render(React.createElement(registrations.get("shell.overlay"), props));
  assert.equal(ctx.draggablePanels.version, 1);
  const externalCleanups = [];
  const consumer = {
    effect(fn) {
      const remove = fn();
      let done = false;
      const cleanup = () => {
        if (!done) {
          done = true;
          remove();
        }
      };
      externalCleanups.push(cleanup);
      return cleanup;
    },
  };
  const definition = {
    id: "example.notes",
    title: "External notes",
    component: () => React.createElement("div", null, "External content"),
    defaultPlacement: { side: "right", order: 20, visible: true },
  };
  const registration = ctx.draggablePanels.register(consumer, definition);
  assert.equal(typeof registration.dispose, "function");
  assert.match(
    render(React.createElement(registrations.get("rightbar"), props)),
    /External content/,
  );
  ctx.draggablePanels.move("example.notes", {
    side: "left",
    beforeId: "workspaces",
  });
  assert.match(
    render(React.createElement(registrations.get("sidebar.workspaces"), props)),
    /External content/,
  );
  ctx.draggablePanels.hide("example.notes");
  assert.doesNotMatch(
    render(React.createElement(registrations.get("sidebar.workspaces"), props)),
    /External content/,
  );
  registration.dispose();
  registration.dispose();
  assert.equal(
    ctx.draggablePanels.getSnapshot().some((row) => row.id === "example.notes"),
    false,
  );
  ctx.draggablePanels.register(consumer, definition);
  assert.equal(
    ctx.draggablePanels.getSnapshot().find((row) => row.id === "example.notes")
      .visible,
    false,
  );
  ctx.draggablePanels.show("example.notes");
  assert.match(
    render(React.createElement(registrations.get("sidebar.workspaces"), props)),
    /External content/,
  );
  // Right click is attached only to the header, and actually hides the component.
  rendered.length = 0;
  render(React.createElement(registrations.get("sidebar.workspaces"), props));
  const tab = rendered.find(
    (node) => node.props.id === "dpd-tab-example.notes",
  );
  tab.props.onContextMenu({
    type: "contextmenu",
    clientX: 10,
    clientY: 20,
    detail: 1,
    currentTarget: {},
    preventDefault() {},
    stopPropagation() {},
  });
  rendered.length = 0;
  render(React.createElement(registrations.get("shell.overlay"), props));
  const hide = rendered.find((node) => node.props.role === "menuitem");
  assert.ok(hide);
  hide.props.onClick();
  assert.equal(
    ctx.draggablePanels.getSnapshot().find((row) => row.id === "example.notes")
      .visible,
    false,
  );
  ctx.draggablePanels.hide("workspaces");
  ctx.draggablePanels.hide("files");
  assert.match(
    render(React.createElement(registrations.get("sidebar.workspaces"), props)),
    /拖到这里停靠/,
  );
  rendered.length = 0;
  render(
    React.createElement(registrations.get("sidebar.footer.action"), {
      wide: false,
    }),
  );
  const manager = rendered.find(
    (node) => node.props["aria-label"] === "组件管理",
  );
  assert.ok(manager);
  manager.props.onClick();
  assert.match(
    render(React.createElement(registrations.get("shell.overlay"), props)),
    /External notes/,
  );
  rendered.length = 0;
  render(
    React.createElement(
      registrations.get("conversation.session.header.corner"),
      props,
    ),
  );
  assert.equal(
    rendered.some((node) => node.props["aria-label"] === "组件管理"),
    false,
    "no duplicate control in conversation header while right dock is open",
  );
  rendered.length = 0;
  render(React.createElement(registrations.get("rightbar"), props));
  const dockManager = rendered.find((node) =>
    node.props.className?.includes("dpd-dock-component-picker"),
  );
  assert.ok(
    dockManager,
    "right dock retains management even with all components hidden",
  );
  assert.equal(
    dockManager.props.children.some((child) => typeof child === "string"),
    false,
    "manager is icon-only",
  );
  rendered
    .find((node) => node.props.className?.includes("dpd-strip-close"))
    .props.onClick();
  rendered.length = 0;
  render(
    React.createElement(
      registrations.get("conversation.session.header.corner"),
      props,
    ),
  );
  const headerManager = rendered.find(
    (node) => node.props["aria-label"] === "组件管理",
  );
  assert.ok(
    headerManager,
    "header recovery remains reachable with every panel hidden",
  );
  headerManager.props.onClick();
  rendered.length = 0;
  render(React.createElement(registrations.get("shell.overlay"), props));
  const filesCheckbox = rendered.find(
    (node) => node.type === "input" && node.props["data-panel-id"] === "files",
  );
  assert.ok(filesCheckbox);
  assert.equal(filesCheckbox.props.checked, false);
  filesCheckbox.props.onChange({ target: { checked: true } });
  assert.equal(
    ctx.draggablePanels.getSnapshot().find((row) => row.id === "files").visible,
    true,
  );
  rendered.length = 0;
  render(React.createElement(registrations.get("shell.overlay"), props));
  assert.equal(
    rendered.find((node) => node.props["data-panel-id"] === "files").props
      .checked,
    true,
  );
  filesCheckbox.props.onChange({ target: { checked: false } });
  assert.equal(
    ctx.draggablePanels.getSnapshot().find((row) => row.id === "files").visible,
    false,
  );
  for (const cleanup of externalCleanups.reverse()) cleanup();
  assert.equal(
    ctx.draggablePanels.getSnapshot().some((row) => row.id === "example.notes"),
    false,
  );
  assert.ok(
    terminalRegistration,
    "terminal registers only when its optional services exist",
  );
  ctx.webTerminals = {
    view() {
      throw new Error("rendering must not allocate a shell");
    },
    launchShells: async () => ({ shells: [] }),
  };
  ctx.remote.terminal = {};
  ctx.theme = { getTheme: () => ({ revision: 1 }) };
  ctx.on = () => () => {};
  terminalRegistration(ctx);
  assert.ok(
    ctx.draggablePanels.getSnapshot().some((row) => row.id === "terminal"),
  );
  ctx.draggablePanels.move("terminal", { side: "left" });
  rendered.length = 0;
  assert.match(
    render(React.createElement(registrations.get("sidebar.workspaces"), props)),
    /在会话工作区运行命令/,
  );
  assert.ok(
    rendered.some((node) => node.props.className === "dpd-terminal-empty"),
  );
  ctx.draggablePanels.hide("terminal");
  assert.equal(
    ctx.draggablePanels.getSnapshot().find((row) => row.id === "terminal")
      .visible,
    false,
  );
  ctx.draggablePanels.show("terminal");
  assert.equal(
    ctx.draggablePanels.getSnapshot().find((row) => row.id === "terminal")
      .visible,
    true,
  );
  // Dismissing the recovery notice never removes the way back to the dock layout.
  rendered.length = 0;
  render(
    React.createElement(registrations.get("sidebar.footer.action"), {
      wide: true,
    }),
  );
  rendered
    .find((node) => node.props["aria-label"] === "使用原生布局")
    .props.onClick();
  rendered.length = 0;
  assert.match(
    render(React.createElement(registrations.get("shell.overlay"), props)),
    /原生布局已恢复/,
  );
  const dismiss = rendered.find(
    (node) => node.props["data-native-notice-close"] !== undefined,
  );
  assert.ok(dismiss, "recovery bar exposes its own dismiss control");
  assert.equal(dismiss.props["aria-label"], "关闭提示");
  assert.equal(
    dismiss.props.children.some((child) => typeof child === "string"),
    false,
    "dismiss is icon-only",
  );
  dismiss.props.onClick();
  rendered.length = 0;
  assert.doesNotMatch(
    render(React.createElement(registrations.get("shell.overlay"), props)),
    /原生布局已恢复/,
  );
  rendered.length = 0;
  render(
    React.createElement(registrations.get("sidebar.footer.action"), {
      wide: true,
    }),
  );
  const back = rendered.find(
    (node) => node.props["aria-label"] === "返回拖拽布局",
  );
  assert.ok(back, "a dismissed notice leaves the footer switch reachable");
  back.props.onClick();
  rendered.length = 0;
  assert.doesNotMatch(
    render(React.createElement(registrations.get("shell.overlay"), props)),
    /原生布局已恢复/,
  );
  render(
    React.createElement(registrations.get("sidebar.footer.action"), {
      wide: true,
    }),
  );
  rendered
    .find((node) => node.props["aria-label"] === "使用原生布局")
    .props.onClick();
  rendered.length = 0;
  assert.match(
    render(React.createElement(registrations.get("shell.overlay"), props)),
    /原生布局已恢复/,
    "returning to the native layout shows the notice again",
  );
  for (const cleanup of cleanups.reverse()) cleanup();
});
