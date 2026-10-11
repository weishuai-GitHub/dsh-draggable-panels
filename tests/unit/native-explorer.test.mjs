import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../../src/client/integration/native-explorer.js", import.meta.url),
  "utf8",
);
// Stub only upstream boundaries; exercise the real adapter, including its
// scope keys, controlled expansion, public service calls and visibility.
const instrumented = source.replace(
  /import\s+[\s\S]*?from\s+"dsh-better-sidebar[^"\n]+";/g,
  "",
);
const prelude = `
export const calls = [];
const TreePanel = Symbol('actual controlled tree');
const attachLocale = value => calls.push(['locale', value]);
const attachBetterLocale = value => calls.push(['betterLocale', value]);
const createOpenInApp = ctx => ({ ctx });
const referenceInChat = (...args) => calls.push(['reference', ...args]);
const parseOpenWithConfig = value => value ?? {pinned: []};
const resolveOpenWithTargets = () => [{id:'reveal', kind:'reveal'}];
const openWithSshActive = () => false;
const openWithUrl = () => undefined;
const api = {openExternal: async value => calls.push(['external', value])};
`;
const { createNativeExplorer, calls } = await import(
  `data:text/javascript;base64,${Buffer.from(prelude + instrumented).toString("base64")}`
);

function setup() {
  let cells = [],
    cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) {
      const index = cursor++;
      if (!(index in cells))
        cells[index] = typeof initial === "function" ? initial() : initial;
      return [
        cells[index],
        (next) => {
          cells[index] = typeof next === "function" ? next(cells[index]) : next;
        },
      ];
    },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useEffect() {},
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
  };
  const opened = [];
  const prefs = { explorerExclude: ["node_modules"], pluginSettings: {} };
  const service = {
    openFile: (...args) => opened.push(["file", ...args]),
    openTab: (...args) => opened.push(["tab", ...args]),
    getSnapshot: () => ({ prefs }),
    subscribeState: () => () => {},
  };
  const locale = {};
  const ctx = { get: (name) => (name === "locale" ? locale : undefined) };
  const NativeExplorer = createNativeExplorer(React, { ctx });
  let lastKey;
  function render(scope, visible = true) {
    const element = NativeExplorer({ scope, service, visible });
    if (element.props.key !== lastKey) cells = [];
    lastKey = element.props.key;
    cursor = 0;
    const wrapper = element.type(element.props);
    return { wrapper, tree: wrapper.children[0], key: lastKey };
  }
  return { render, service, opened, ctx, prefs, NativeExplorer };
}

test("direct native tree opens only explicit resources via public service", () => {
  const { render, opened, ctx, prefs } = setup();
  const scope = { sessionId: "one", cwd: "/work" };
  const { tree } = render(scope, false);
  assert.equal(opened.length, 0, "mount must not create any tab");
  assert.equal(tree.props.full, true);
  assert.equal(tree.props.visible, false);
  assert.equal(tree.props.exclude, prefs.explorerExclude);
  tree.props.onOpenFile("/work/a.js");
  tree.props.onOpenFileNewTab("/work/b.js");
  tree.props.onOpenFileSide("/work/c.js");
  assert.deepEqual(opened, [
    ["file", scope, "/work/a.js"],
    ["file", scope, "/work/b.js"],
    ["tab", { type: "editor", path: "/work/c.js", target: "side" }, scope],
  ]);
  tree.props.onReferenceFile("/work/docs", true);
  assert.deepEqual(calls.at(-1), ["reference", ctx, "one", "/work/docs", true]);
  assert.equal(
    tree.props.onPathDeleted,
    undefined,
    "never close dirty native tabs using a duplicate store",
  );
});

test("session and cwd keys isolate expansion and remount upstream search state", () => {
  const { render } = setup();
  const a = { sessionId: "a", cwd: "/work" };
  const b = { sessionId: "b", cwd: "/work" };
  const first = render(a);
  first.tree.props.onToggle("/work/src");
  assert.deepEqual(render(a).tree.props.expanded, ["/work/src"]);
  const second = render(b);
  assert.notEqual(second.key, first.key);
  assert.deepEqual(second.tree.props.expanded, []);
  assert.deepEqual(render({ ...a, cwd: "/other" }).tree.props.expanded, []);
  assert.deepEqual(render(a).tree.props.expanded, ["/work/src"]);
});

test("file drops are shielded after native tree handlers, plugin targets remain usable", async () => {
  const { render } = setup();
  const { wrapper, tree } = render({ sessionId: "a", cwd: "/work" });
  const seen = [];
  wrapper.props.onDrop({
    dataTransfer: { types: ["Files"] },
    preventDefault: () => seen.push("prevent"),
    stopPropagation: () => seen.push("stop"),
  });
  assert.deepEqual(seen, ["prevent", "stop"]);
  assert.equal(await tree.props.onOpenWith("reveal", "/work/a"), true);
  assert.deepEqual(calls.at(-1), [
    "external",
    { action: "reveal", path: "/work/a" },
  ]);
  assert.equal(await tree.props.onOpenWith("unknown", "/work/a"), false);
});

test("pinned source and production artifact include native CSS but no React copy", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  );
  assert.equal(pkg.devDependencies["dsh-better-sidebar"], "0.25.0");
  assert.match(source, /dsh-better-sidebar\/src\/client\/TreePanel\.tsx/);
  assert.doesNotMatch(
    source,
    /createPortal|createSidebarStore|registerTab|editorExplorer\s*:/,
  );
  const bundle = await readFile(
    new URL("../../dist/client.js", import.meta.url),
    "utf8",
  );
  assert.match(bundle, /function TreePanel\(/);
  assert.match(bundle, /dsh-draggable-panels-native-explorer-css/);
  assert.match(bundle, /sidebar_editorTreePanelFull/);
  assert.doesNotMatch(bundle, /__toESM\(require\("react"\)/);
  assert.doesNotMatch(bundle, /node_modules\/react\/|react\/jsx-runtime/);
  assert.match(
    await readFile(
      new URL("../../dist/BETTER-SIDEBAR-LICENSE", import.meta.url),
      "utf8",
    ),
    /MIT License/,
  );
});
