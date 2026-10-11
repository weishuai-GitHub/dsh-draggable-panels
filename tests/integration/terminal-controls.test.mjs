import test from "node:test";
import assert from "node:assert/strict";
import { createTerminalPanel } from "../../src/client/components/terminal/panel.js";

test("trailing plus offers shell creation; every tab closes directly by its own identity", async () => {
  const values = [];
  let cursor = 0;
  const closed = [];
  const started = [];
  const selectedShells = [];
  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [
        values[index],
        (value) => {
          values[index] = value;
        },
      ];
    },
    useEffect() {},
  };
  const snapshot = {
    sessions: {
      s: {
        entries: ["first", "middle", "last"].map((id) => ({
          id,
          title: "zsh",
          state: {},
          model: {},
        })),
        selected: "last",
      },
    },
  };
  const store = {
    getSnapshot: () => snapshot,
    close: async (sessionId, id) => {
      closed.push([sessionId, id]);
      snapshot.sessions.s.entries = snapshot.sessions.s.entries.filter(
        (entry) => entry.id !== id,
      );
      return true;
    },
    select() {},
    start: (...args) => started.push(args),
  };
  const Panel = createTerminalPanel(
    React,
    {
      ctx: {
        theme: {},
        webTerminals: { selectShell: (path) => selectedShells.push(path) },
      },
      useCopy: () => (key) => key,
      useAtom: (atom) => atom.getSnapshot(),
      current: (list) => list.byId.s,
      Icon() {},
      fail: (error) => error.message,
    },
    store,
  );
  const root = Panel({
    useSessions: (select) =>
      select({ byId: { s: { id: "s", cwd: "/workspace" } } }),
  });
  function render() {
    cursor = 0;
    return root.type(root.props);
  }
  function nodes(value) {
    if (!value || typeof value !== "object") return [];
    return [
      value,
      ...(value.props?.children || []).flat(Infinity).flatMap(nodes),
    ];
  }
  let rendered = nodes(render());
  const toolbar = rendered.find(
    (node) => node.props?.className === "dpd-terminal-toolbar",
  );
  assert.equal(toolbar.props.children[0].props.role, "tablist");
  assert.equal(
    toolbar.props.children[1].type,
    "details",
    "plus follows the open terminals",
  );
  assert.equal(
    rendered.some((node) => node.type === "select"),
    false,
  );
  assert.equal(
    rendered.some((node) => node.props?.role === "alertdialog"),
    false,
  );
  const summary = rendered.find((node) => node.type === "summary");
  assert.equal(summary.props["aria-label"], "term.new");
  assert.deepEqual(started, [], "opening shell menu does not create a process");
  values[0] = [
    { path: "/bin/zsh", name: "zsh" },
    { path: "/bin/bash", name: "bash" },
  ];
  rendered = nodes(render());
  const details = { open: true };
  let prevented = false;
  rendered
    .find((node) => node.props?.className === "dpd-terminal-shell-menu")
    .props.onPointerDown({
      button: 0,
      preventDefault() {
        prevented = true;
      },
    });
  assert.equal(
    prevented,
    true,
    "Safari pointer focus must not blur and hide the option before click",
  );
  await rendered
    .find((node) => node.props?.["data-shell-path"] === "/bin/zsh")
    .props.onClick({ currentTarget: { closest: () => details } });
  assert.deepEqual(started, [["s", "/bin/zsh"]]);
  assert.deepEqual(selectedShells, ["/bin/zsh"]);
  assert.equal(details.open, false);
  assert.equal(
    rendered.some((node) => node.props?.title === "term.recover"),
    false,
  );
  assert.equal(
    rendered.filter((node) => node.props?.["data-terminal-close"]).length,
    3,
  );
  await rendered
    .find((node) => node.props?.["data-terminal-close"] === "first")
    .props.onClick();
  assert.deepEqual(closed, [["s", "first"]]);
  assert.equal(
    snapshot.sessions.s.selected,
    "last",
    "closing a background terminal does not target the last or selected terminal",
  );
  rendered = nodes(render());
  await rendered
    .find((node) => node.props?.["data-terminal-close"] === "middle")
    .props.onClick();
  assert.deepEqual(closed, [
    ["s", "first"],
    ["s", "middle"],
  ]);
});
