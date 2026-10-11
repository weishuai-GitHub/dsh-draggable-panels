import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceModel } from "../../src/client/components/workspace/model.js";
const { buildView, relativeTime, pathIdentity, isAncestor } =
  createWorkspaceModel();
const row = (id, extra = {}) => ({
  id,
  title: id,
  updatedAt: 1,
  running: false,
  blank: false,
  ...extra,
});
const listOf = (...rows) => ({
  ids: rows.map((r) => r.id),
  byId: Object.fromEntries(rows.map((r) => [r.id, r])),
});
const workspace = (id, path, sessionIds = []) => ({
  workspaceId: id,
  title: id,
  path,
  sessionIds,
});
const ids = (rows) => rows.map((r) => r.id);

test("updated sorts by exact updatedAt newest first, then stable identity", () => {
  const view = buildView({
    list: listOf(
      row("z", { updatedAt: 3 }),
      row("a", { updatedAt: 3 }),
      row("old"),
      row("bad", { updatedAt: NaN }),
    ),
    groupBy: "flat",
  });
  assert.deepEqual(ids(view.flatRows), ["a", "z", "old", "bad"]);
});
test("created only uses actual createdAt and does not invent it from updatedAt", () => {
  const view = buildView({
    list: listOf(
      row("a", { updatedAt: 100 }),
      row("b", { createdAt: 2 }),
      row("c", { createdAt: 3 }),
    ),
    groupBy: "flat",
    sortBy: "created",
  });
  assert.deepEqual(ids(view.flatRows), ["c", "b", "a"]);
});
test("current blank leads active pins and ordinary rows; archives are not pinned", () => {
  const list = listOf(
    row("ordinary", { updatedAt: 100 }),
    row("pin"),
    row("archived", { updatedAt: 50 }),
    row("blank", { blank: true }),
    row("hiddenBlank", { blank: true }),
    row("child", { origin: "subagent" }),
  );
  const view = buildView({
    list,
    ws: {
      pinnedSessionIds: ["pin", "archived"],
      archivedSessionIds: ["archived"],
    },
    selectedId: "blank",
    archiveFilter: "show",
    groupBy: "flat",
  });
  assert.deepEqual(ids(view.flatRows), [
    "blank",
    "pin",
    "ordinary",
    "archived",
  ]);
  assert.equal(view.flatRows[3].pinned, false);
});
test("archive aliases are equivalent and archived-only suppresses empty groups", () => {
  const input = {
    list: listOf(row("a"), row("b")),
    ws: {
      items: [workspace("wa", "/a", ["a"]), workspace("wb", "/b", ["b"])],
      archivedSessionIds: ["a"],
    },
  };
  assert.deepEqual(
    buildView({ ...input, archiveFilter: "hide" }),
    buildView({ ...input, archiveFilter: "default" }),
  );
  assert.deepEqual(
    buildView({ ...input, archiveFilter: "all" }),
    buildView({ ...input, archiveFilter: "show" }),
  );
  assert.deepEqual(
    buildView({ ...input, archiveFilter: "only" }).groups.map((g) => g.key),
    ["wa"],
  );
});
test("canonical tree chooses nearest registered parent not text-prefix sibling", () => {
  const ws = {
    items: [
      workspace("deep", "/project/a/deep"),
      workspace("root", "/project"),
      workspace("sibling", "/projects"),
      workspace("a", "/project/a"),
    ],
  };
  const view = buildView({ ws, groupBy: "workspace-tree" });
  assert.deepEqual(
    view.groups.map((g) => [g.key, g.depth]),
    [
      ["root", 0],
      ["a", 1],
      ["deep", 2],
      ["sibling", 0],
    ],
  );
  assert.equal(view.groups.find((g) => g.key === "deep").parentKey, "a");
});
test("Windows drive and UNC identities are case-insensitive with segment boundaries", () => {
  assert.equal(pathIdentity("C:\\Work\\One\\"), "c:/work/one");
  assert.equal(
    pathIdentity("\\\\SERVER\\Share\\Project"),
    "//server/share/project",
  );
  assert.equal(
    isAncestor(pathIdentity("C:\\Work"), pathIdentity("c:/work/project")),
    true,
  );
  assert.equal(
    isAncestor(pathIdentity("C:\\Work"), pathIdentity("c:/worker")),
    false,
  );
  assert.equal(
    isAncestor(pathIdentity("/Work"), pathIdentity("/work/project")),
    false,
  );
  assert.equal(isAncestor(pathIdentity("/"), pathIdentity("/work")), true);
});
test("tree preserves child-before-own-session rendering and collapse hides descendants", () => {
  const input = {
    list: listOf(row("p"), row("c")),
    ws: {
      items: [
        workspace("parent", "/p", ["p"]),
        workspace("child", "/p/c", ["c"]),
      ],
    },
    groupBy: "tree",
    selectedId: "c",
  };
  const view = buildView(input);
  assert.deepEqual(
    view.renderItems.map((i) => `${i.kind}:${i.group.key}`),
    ["header:parent", "header:child", "rows:child", "rows:parent"],
  );
  assert.equal(view.groups[0].containsCurrentDescendant, true);
  const closed = buildView({ ...input, collapsed: { parent: true } });
  assert.deepEqual(
    closed.groups.map((g) => g.key),
    ["parent"],
  );
  assert.deepEqual(closed.groups[0].rows, []);
});
test("only-archive tree retains ancestor header for matching descendants", () => {
  const view = buildView({
    list: listOf(row("a")),
    ws: {
      items: [workspace("parent", "/p"), workspace("child", "/p/c", ["a"])],
      archivedSessionIds: ["a"],
    },
    groupBy: "tree",
    archiveFilter: "only",
  });
  assert.deepEqual(
    view.groups.map((g) => g.key),
    ["parent", "child"],
  );
});
test("five idle quota excludes current blank, running parent and running descendants", () => {
  const rows = Array.from({ length: 8 }, (_, i) =>
    row(`i${i}`, { updatedAt: 20 - i }),
  );
  rows.push(
    row("run", { running: true }),
    row("parent"),
    row("child", { origin: "subagent", running: true }),
    row("blank", { blank: true }),
  );
  const list = listOf(...rows);
  list.projectionsBySession = {
    parent: { values: { subagentCatalog: [{ id: "child" }] } },
  };
  const input = {
    list,
    selectedId: "blank",
    ws: {
      items: [
        workspace(
          "w",
          "/w",
          rows.map((r) => r.id),
        ),
      ],
    },
  };
  const group = buildView(input).groups[0];
  assert.equal(group.rows.length, 8);
  assert.equal(group.hiddenCount, 3);
  assert.ok(
    group.rows.some((r) => r.id === "parent" && r.runningSubagentCount === 1),
  );
  assert.equal(
    buildView({ ...input, limits: { w: 10 } }).groups[0].hiddenCount,
    0,
  );
  assert.equal(
    buildView({ ...input, limits: { w: Infinity } }).groups[0].rows.length,
    11,
  );
});
test("status source overrides own running and exposes pending/completed metadata", () => {
  const view = buildView({
    list: listOf(row("a", { running: true })),
    groupBy: "flat",
    statuses: new Map([
      [
        "a",
        {
          running: false,
          completionUnread: true,
          pendingInteraction: { kind: "approval" },
        },
      ],
    ]),
  });
  assert.equal(view.flatRows[0].running, false);
  assert.equal(view.flatRows[0].completed, true);
  assert.equal(view.flatRows[0].pendingInteraction, "approval");
});
test("search is flat case-insensitive metadata, excludes blanks and caps at twenty", () => {
  const rows = Array.from({ length: 25 }, (_, i) =>
    row(`s${i}`, { title: "Session", cwd: "/Host/Project", updatedAt: i }),
  );
  rows.push(row("blank", { blank: true, title: "Project" }));
  const view = buildView({
    list: listOf(...rows),
    selectedId: "blank",
    query: "PROJECT",
    groupBy: "tree",
  });
  assert.equal(view.isSearch, true);
  assert.equal(view.groups.length, 0);
  assert.equal(view.searchRows.length, 20);
  assert.equal(view.searchHasMore, true);
  assert.ok(!ids(view.searchRows).includes("blank"));
});
test("workspace title search matches its session membership", () => {
  const view = buildView({
    list: listOf(row("a")),
    ws: { items: [workspace("Custom Name", "/folder", ["a"])] },
    query: "custom",
  });
  assert.deepEqual(ids(view.searchRows), ["a"]);
});
test("manual sequence keeps hidden archives and reconciles new forks before sources", () => {
  const list = listOf(
    row("source"),
    row("archive"),
    row("fork", { parentId: "source", updatedAt: 2 }),
    row("pin"),
  );
  const base = {
    list,
    groupBy: "flat",
    orderBy: "manual",
    manualOrders: { $flat: ["source", "archive"] },
    ws: { archivedSessionIds: ["archive"], pinnedSessionIds: ["pin"] },
  };
  assert.deepEqual(ids(buildView(base).flatRows), ["pin", "fork", "source"]);
  assert.deepEqual(ids(buildView({ ...base, archiveFilter: "all" }).flatRows), [
    "pin",
    "fork",
    "source",
    "archive",
  ]);
});
test("grouped manual falls back to provided account order without saved order", () => {
  const list = listOf(row("a", { updatedAt: 100 }), row("b"));
  assert.deepEqual(
    ids(
      buildView({
        list,
        ws: { items: [workspace("w", "/w", ["b", "a"])] },
        orderBy: "manual",
      }).groups[0].rows,
    ),
    ["b", "a"],
  );
});
test("ungrouped ownership does not depend on collapsed, missing or filtered members", () => {
  const view = buildView({
    list: listOf(row("a"), row("b")),
    ws: { items: [workspace("w", "/w", ["a", "unknown"])] },
    collapsed: { w: true },
  });
  assert.deepEqual(
    view.groups.map((g) => g.key),
    ["w", ""],
  );
  assert.deepEqual(ids(view.groups[1].rows), ["b"]);
});
test("input snapshots and saved orders are never mutated", () => {
  const input = {
    list: listOf(row("a"), row("b")),
    ws: { items: [workspace("w", "/w", ["b", "a"])] },
    manualOrders: { w: ["b", "a"] },
    orderBy: "manual",
  };
  const before = JSON.stringify(input);
  buildView(input);
  assert.equal(JSON.stringify(input), before);
});
test("relative time matches native compact buckets and tolerates invalid/future timestamps", () => {
  const now = 400 * 86400000;
  assert.equal(relativeTime(now, "zh", now), "刚刚");
  assert.equal(relativeTime(now - 5 * 60000, "en", now), "5min");
  assert.equal(relativeTime(now - 3 * 3600000, "zh-CN", now), "3小时");
  assert.equal(relativeTime(now - 2 * 86400000, "en", now), "2d");
  assert.equal(relativeTime(now - 90 * 86400000, "en", now), "3mo");
  assert.equal(relativeTime(now - 365 * 86400000, "en", now), "1y");
  assert.equal(relativeTime(now + 1, "en", now), "now");
  for (const value of [undefined, null, NaN, Infinity, "not a time", ""])
    assert.equal(relativeTime(value, "en", now), "");
});
