/* Pure view derivation: no DOM, services or imports. Canonical paths are supplied by Host. */
export function createWorkspaceModel() {
  const FLAT_KEY = "$flat";
  function timestamp(value) {
    if (typeof value === "number")
      return Number.isFinite(value) ? value : -Infinity;
    if (typeof value === "string" && value.trim()) {
      const time = Date.parse(value);
      if (Number.isFinite(time)) return time;
    }
    return -Infinity;
  }
  function relativeTime(value, locale = "zh", now = Date.now()) {
    const at = timestamp(value);
    const current = timestamp(now);
    if (!Number.isFinite(at) || !Number.isFinite(current)) return "";
    const diff = Math.max(0, current - at);
    const zh = /^zh/i.test(String(locale));
    if (diff < 60000) return zh ? "刚刚" : "now";
    const unit =
      diff < 3600000
        ? [60000, "分钟", "min"]
        : diff < 86400000
          ? [3600000, "小时", "h"]
          : diff < 2592000000
            ? [86400000, "天", "d"]
            : diff < 31536000000
              ? [2592000000, "个月", "mo"]
              : [31536000000, "年", "y"];
    return `${Math.floor(diff / unit[0])}${zh ? unit[1] : unit[2]}`;
  }
  function pathIdentity(value) {
    if (typeof value !== "string" || !value) return null;
    const windows =
      /^[a-z]:[\\/]/i.test(value) ||
      /^\\\\/.test(value) ||
      /^\/\/[^/]/.test(value);
    let path = value.replace(/\\/g, "/");
    if (!windows && !path.startsWith("/")) return null;
    const prefix = path.startsWith("//") ? "//" : "";
    path = prefix + path.slice(prefix.length).replace(/\/{2,}/g, "/");
    path = path.replace(/\/+$/, "") || "/";
    return windows ? path.toLowerCase() : path;
  }
  function isAncestor(parent, child) {
    return (
      parent !== null &&
      child !== null &&
      parent !== child &&
      child.startsWith(parent === "/" ? "/" : `${parent}/`)
    );
  }
  function unique(ids) {
    return [...new Set((ids || []).filter((id) => typeof id === "string"))];
  }
  function statusFor(statuses, id) {
    return statuses instanceof Map ? statuses.get(id) : statuses?.[id];
  }
  function recency(ids, byId, field = "updatedAt") {
    return [...ids].sort((a, b) => {
      const aa = timestamp(byId[a]?.[field]);
      const bb = timestamp(byId[b]?.[field]);
      return aa === bb ? (a < b ? -1 : a > b ? 1 : 0) : aa > bb ? -1 : 1;
    });
  }
  function reconcileManual(ids, saved, byId, pinnedIds, archive) {
    if (!Array.isArray(saved)) return [...ids];
    const membership = new Set(ids);
    const ordered = unique(saved).filter((id) => membership.has(id));
    const included = new Set(ordered);
    const pins = unique(pinnedIds).filter(
      (id) =>
        membership.has(id) && !included.has(id) && !archive.has(id) && byId[id],
    );
    for (const id of pins) included.add(id);
    const missing = recency(
      ids.filter((id) => !included.has(id)),
      byId,
    );
    const ordinary = missing.filter((id) => !archive.has(id));
    const result = [
      ...pins,
      ...ordered,
      ...ordinary,
      ...missing.filter((id) => archive.has(id)),
    ];
    const pending = new Set(ordinary);
    const placeFork = (id) => {
      if (!pending.delete(id)) return;
      const parent = byId[id]?.parentId ?? byId[id]?.parentSessionId;
      if (!parent || parent === id || !result.includes(parent)) return;
      placeFork(parent);
      result.splice(result.indexOf(id), 1);
      result.splice(result.indexOf(parent), 0, id);
    };
    for (const id of [...ordinary].reverse()) placeFork(id);
    return result;
  }
  function buildView(input = {}) {
    const list = input.list || {};
    const byId = list.byId || {};
    const ws = input.ws || input.workspaces || {};
    const workspaces = Array.isArray(ws) ? ws : ws.items || [];
    const selectedId =
      input.selectedId ??
      Object.values(byId).find((row) => (row.retainedBy?.mainView || 0) > 0)
        ?.id;
    const archive = new Set(
      ws.archivedSessionIds || input.archivedSessionIds || [],
    );
    const pinnedIds = ws.pinnedSessionIds || input.pinnedSessionIds || [];
    const pins = new Set(pinnedIds);
    const archiveFilter =
      { hide: "default", all: "show", archived: "only" }[input.archiveFilter] ||
      input.archiveFilter ||
      "default";
    const groupBy =
      input.groupBy === "tree" || input.groupBy === "workspace-tree"
        ? "workspace-tree"
        : input.groupBy === "flat"
          ? "flat"
          : "workspace";
    const requestedOrder = input.orderBy || input.sortBy || "updated";
    const orderBy = ["manual", "created"].includes(requestedOrder)
      ? requestedOrder
      : "updated";
    const collapsed = input.collapsed || {};
    const limits = input.limits || {};
    const manualOrders = input.manualOrders || input.sessionOrders || {};
    const query = String(input.query || "")
      .trim()
      .toLocaleLowerCase();
    const statuses = input.statuses;
    const allIds = unique([...(list.ids || []), ...Object.keys(byId)]).filter(
      (id) => byId[id],
    );
    const visible = (row) =>
      row &&
      row.origin !== "subagent" &&
      (!row.blank || row.id === selectedId) &&
      (archiveFilter === "show" ||
        (archiveFilter === "only"
          ? archive.has(row.id)
          : !archive.has(row.id)));
    const project = (row) => {
      const status = statusFor(statuses, row.id);
      const children =
        list.projectionsBySession?.[row.id]?.values?.subagentCatalog || [];
      const childCount = children.reduce(
        (count, child) =>
          count +
          ((statusFor(statuses, child.id)?.running ??
            byId[child.id]?.running) === true
            ? 1
            : 0),
        0,
      );
      const pending =
        status?.pendingInteraction?.kind ??
        row.pendingInteraction?.kind ??
        row.pendingInteraction;
      return {
        ...row,
        running: status?.running ?? row.running ?? false,
        runningSubagentCount: Math.max(
          childCount,
          Number(row.runningSubagentCount) || 0,
        ),
        archived: archive.has(row.id),
        pinned: !archive.has(row.id) && pins.has(row.id),
        completed: status?.completionUnread === true || row.completed === true,
        pendingInteraction: ["approval", "plan-review", "question"].includes(
          pending,
        )
          ? pending
          : undefined,
      };
    };
    function members(ids, key) {
      const known = unique(ids).filter((id) => byId[id]);
      const saved =
        manualOrders[key] ??
        (key === FLAT_KEY
          ? manualOrders.flat
          : key === ""
            ? input.ungroupedOrder
            : undefined);
      const ordered =
        orderBy === "manual"
          ? reconcileManual(known, saved, byId, pinnedIds, archive)
          : recency(
              known,
              byId,
              orderBy === "created" ? "createdAt" : "updatedAt",
            );
      const rows = ordered
        .map((id) => byId[id])
        .filter(visible)
        .map(project);
      const rank = (row) => (row.blank ? 0 : row.pinned ? 1 : 2);
      return rows.sort((a, b) => rank(a) - rank(b));
    }
    function paginate(rows, key) {
      let limit =
        limits[key] ?? (key === FLAT_KEY ? limits.flat : undefined) ?? 5;
      limit =
        limit === Infinity
          ? Infinity
          : Number.isFinite(limit)
            ? Math.max(0, Math.floor(limit))
            : 5;
      let idle = 0;
      const shown = rows.filter(
        (row) =>
          row.blank ||
          row.running ||
          row.runningSubagentCount > 0 ||
          idle++ < limit,
      );
      return { rows: shown, hiddenCount: rows.length - shown.length, limit };
    }
    const flatAllRows = members(allIds, FLAT_KEY);
    const owners = new Map();
    for (const workspace of workspaces)
      for (const id of workspace.sessionIds || [])
        if (!owners.has(id)) owners.set(id, workspace);
    if (query) {
      // Native metadata search is flat, excludes provisional blanks, and caps at 20.
      const matched = flatAllRows.filter(
        (row) =>
          !row.blank &&
          `${row.title || ""} ${row.cwd || ""} ${owners.get(row.id)?.title || ""} ${owners.get(row.id)?.path || ""}`
            .toLocaleLowerCase()
            .includes(query),
      );
      const searchRows = matched.slice(0, 20);
      return {
        groups: [],
        rootKeys: [],
        renderItems: [],
        flatRows: searchRows,
        flatAllRows,
        searchRows,
        searchHasMore: matched.length > 20,
        isSearch: true,
        groupBy,
        orderBy,
      };
    }
    if (groupBy === "flat") {
      const page = paginate(flatAllRows, FLAT_KEY);
      const group = {
        key: FLAT_KEY,
        title: "",
        depth: 0,
        expanded: true,
        rows: page.rows,
        allRows: flatAllRows,
        hiddenCount: page.hiddenCount,
        totalCount: flatAllRows.length,
        hasChildren: false,
        childrenKeys: [],
        containsCurrent: flatAllRows.some((row) => row.id === selectedId),
        containsCurrentDescendant: false,
        limit: page.limit,
      };
      return {
        groups: [group],
        rootKeys: [FLAT_KEY],
        renderItems: [{ kind: "rows", group }],
        flatRows: page.rows,
        flatAllRows,
        searchRows: [],
        searchHasMore: false,
        isSearch: false,
        groupBy,
        orderBy,
      };
    }
    const nodes = workspaces.map((workspace) => {
      const allRows = members(
        workspace.sessionIds || [],
        workspace.workspaceId,
      );
      const expanded = !collapsed[workspace.workspaceId];
      const page = paginate(allRows, workspace.workspaceId);
      return {
        key: workspace.workspaceId,
        workspaceId: workspace.workspaceId,
        workspace,
        title: workspace.title || workspace.path || "",
        path: workspace.path,
        depth: 0,
        expanded,
        rows: expanded ? page.rows : [],
        allRows,
        hiddenCount: expanded ? page.hiddenCount : 0,
        totalCount: allRows.length,
        limit: page.limit,
        hasChildren: false,
        childrenKeys: [],
        containsCurrent: (workspace.sessionIds || []).includes(selectedId),
        containsCurrentDescendant: false,
      };
    });
    const nodesByKey = new Map(nodes.map((node) => [node.key, node]));
    const identities = new Map(
      nodes.map((node) => [node.key, pathIdentity(node.path)]),
    );
    if (groupBy === "workspace-tree")
      for (const node of nodes) {
        let parent;
        for (const candidate of nodes)
          if (
            isAncestor(
              identities.get(candidate.key),
              identities.get(node.key),
            ) &&
            (!parent ||
              identities.get(candidate.key).length >
                identities.get(parent.key).length)
          )
            parent = candidate;
        if (parent) {
          node.parentKey = parent.key;
          parent.childrenKeys.push(node.key);
          parent.hasChildren = true;
        }
      }
    const roots = nodes.filter((node) => node.parentKey === undefined);
    // Walk every branch, not Array.some short-circuit, so all descendant flags are computed.
    function mark(node) {
      let descendant = false;
      for (const key of node.childrenKeys) {
        const child = nodesByKey.get(key);
        mark(child);
        descendant ||= child.containsCurrent || child.containsCurrentDescendant;
      }
      node.containsCurrentDescendant = descendant;
    }
    for (const root of roots) mark(root);
    const useful = (node) =>
      archiveFilter !== "only" ||
      node.allRows.length > 0 ||
      node.childrenKeys.some((key) => useful(nodesByKey.get(key)));
    const groups = [];
    const renderItems = [];
    const rootKeys = [];
    function visit(node, depth) {
      if (!useful(node)) return;
      node.depth = depth;
      node.childrenKeys = node.childrenKeys.filter((key) =>
        useful(nodesByKey.get(key)),
      );
      node.hasChildren = node.childrenKeys.length > 0;
      groups.push(node);
      renderItems.push({ kind: "header", group: node });
      if (!node.expanded) return;
      for (const key of node.childrenKeys)
        visit(nodesByKey.get(key), depth + 1);
      renderItems.push({ kind: "rows", group: node });
    }
    for (const root of roots)
      if (useful(root)) {
        rootKeys.push(root.key);
        visit(root, 0);
      }
    const loose = members(
      allIds.filter((id) => !owners.has(id)),
      "",
    );
    if (loose.length) {
      const expanded = !collapsed[""];
      const page = paginate(loose, "");
      const group = {
        key: "",
        title: "",
        depth: 0,
        expanded,
        rows: expanded ? page.rows : [],
        allRows: loose,
        hiddenCount: expanded ? page.hiddenCount : 0,
        totalCount: loose.length,
        limit: page.limit,
        childrenKeys: [],
        hasChildren: false,
        containsCurrent: loose.some((row) => row.id === selectedId),
        containsCurrentDescendant: false,
      };
      groups.push(group);
      rootKeys.push("");
      renderItems.push({ kind: "header", group });
      if (expanded) renderItems.push({ kind: "rows", group });
    }
    return {
      groups,
      rootKeys,
      renderItems,
      flatRows: flatAllRows,
      flatAllRows,
      searchRows: [],
      searchHasMore: false,
      isSearch: false,
      groupBy,
      orderBy,
    };
  }
  return { buildView, relativeTime, pathIdentity, isAncestor };
}
