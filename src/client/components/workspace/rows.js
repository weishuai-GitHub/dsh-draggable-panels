export function createWorkspaceRows(
  React,
  { Icon, tt, actions, workspaceView, groupMap, timeLabel, state, callbacks },
) {
  const h = React.createElement;
  const {
    archive,
    pins,
    activePanel,
    selected,
    menu,
    busy,
    ws,
    query,
    view,
    groupBy,
    filter,
  } = state;
  const { openSession, openMenu, run, changeView, setSearchOpen } = callbacks;
  function sessionRow(row, group, rows) {
    const archived = archive.has(row.id);
    const title = row.blank ? tt("wk.blank") : row.title || tt("wk.untitled");
    return h(
      "div",
      {
        key: row.id,
        className: "dpw-row",
        style: { "--dpw-depth": group.depth || 0 },
        "data-selected": !activePanel && selected === row.id ? "" : undefined,
        "data-menu-open":
          menu?.kind === "session" && menu.row.id === row.id ? "" : undefined,
        "data-archived": archived ? "" : undefined,
      },
      h(
        "button",
        {
          className: "dpw-open",
          title: archived ? tt("wk.archivedNote") : title,
          "aria-disabled": archived,
          onClick: () => openSession(row),
        },
        h(
          "span",
          {
            className: "dpw-status",
            "data-running": row.running && !archived ? "" : undefined,
            title: row.running && !archived ? tt("wk.running") : undefined,
          },
          row.running && !archived
            ? h("span", {
                className: "dpw-running-dot",
                "aria-label": tt("wk.running"),
              })
            : pins.has(row.id) && !archived
              ? h(Icon, { kind: "pin", size: 12 })
              : null,
        ),
        h("span", { className: "dpw-session-title" }, title),
      ),
      !row.blank
        ? h(
            "span",
            { className: "dpw-time", title: row.updatedAt || "" },
            timeLabel(row),
          )
        : null,
      !row.blank
        ? h(
            "span",
            { className: "dpw-session-actions" },
            h(
              "button",
              {
                className: "dpw-more",
                title: tt("wk.menu"),
                "aria-label": `${title}: ${tt("wk.menu")}`,
                "aria-haspopup": "menu",
                "aria-expanded":
                  menu?.kind === "session" && menu.row.id === row.id,
                onClick: (e) => openMenu("session", e, { row, group, rows }),
              },
              h(Icon, { kind: "more", size: 16 }),
            ),
            h(
              "button",
              {
                className: "dpw-more",
                title: tt(archived ? "wk.restore" : "wk.archive"),
                "aria-label": tt(archived ? "wk.restore" : "wk.archive"),
                disabled: busy,
                onClick: () =>
                  run(() =>
                    archived
                      ? actions.restore(row.id)
                      : actions.archive(row.id),
                  ),
              },
              h(Icon, { kind: "archive", size: 16 }),
            ),
            !archived
              ? h(
                  "button",
                  {
                    className: "dpw-more",
                    title: tt(pins.has(row.id) ? "wk.unpin" : "wk.pin"),
                    "aria-label": tt(pins.has(row.id) ? "wk.unpin" : "wk.pin"),
                    disabled: busy,
                    onClick: () =>
                      run(() => actions.pin(row.id, pins.has(row.id))),
                  },
                  h(Icon, { kind: "pin", size: 16 }),
                )
              : null,
          )
        : null,
    );
  }
  function renderGroup(group) {
    const workspace =
      group.workspace ||
      (group.workspaceId
        ? ws.items.find((item) => item.workspaceId === group.workspaceId)
        : null);
    const key = group.key ?? group.workspaceId ?? "";
    const rows = group.rows || [];
    const collapsed = !query && !!view.collapsed?.[key];
    const isCurrent =
      group.containsCurrent ||
      group.containsCurrentDescendant ||
      workspace?.sessionIds.includes(selected);
    const toggle = () =>
      changeView({
        collapsed: {
          ...workspaceView.getSnapshot().collapsed,
          [key]: !collapsed,
        },
        limits: { ...workspaceView.getSnapshot().limits, [key]: 5 },
      });
    const storedTitle = workspace?.title || group.title;
    const title = workspace
      ? storedTitle === "default-workspace"
        ? tt("wk.defaultName")
        : storedTitle
      : tt("wk.ungrouped");
    return h(
      "section",
      { key, className: "dpw-section" },
      groupBy !== "flat" && !query
        ? h(
            "div",
            {
              className: "dpw-group",
              style: { "--dpw-depth": group.depth || 0 },
              "data-current": isCurrent ? "" : undefined,
              "data-menu-open":
                menu?.kind === "workspace" &&
                menu.group.workspaceId === workspace?.workspaceId
                  ? ""
                  : undefined,
            },
            h(
              "button",
              {
                className: "dpw-group-open",
                title: workspace?.path || title,
                "aria-expanded": !collapsed,
                onClick: toggle,
              },
              h(
                "span",
                { className: "dpw-folder-seat" },
                h(Icon, {
                  kind: "folderOpen",
                  size: 16,
                  className: "dpw-folder-symbol",
                }),
                h(Icon, {
                  kind: collapsed ? "chevronRight" : "chevronDown",
                  size: 14,
                  className: "dpw-folder-chevron",
                }),
              ),
              h("span", { className: "dpw-group-title" }, title),
            ),
            workspace
              ? h(
                  "span",
                  { className: "dpw-group-actions" },
                  h(
                    "button",
                    {
                      className: "dpw-more",
                      title: tt("wk.menu"),
                      "aria-label": `${title}: ${tt("wk.menu")}`,
                      "aria-haspopup": "menu",
                      "aria-expanded":
                        menu?.kind === "workspace" &&
                        menu.group.workspaceId === workspace.workspaceId,
                      onClick: (e) =>
                        openMenu("workspace", e, { group: workspace }),
                    },
                    h(Icon, { kind: "more", size: 16 }),
                  ),
                  // Scope the accessible name: desktop shell captures generic New session labels and creates an ungrouped session before React sees the click.
                  h(
                    "button",
                    {
                      type: "button",
                      className: "dpw-more",
                      title: tt("wk.newSession"),
                      "aria-label": `${title}: ${tt("wk.newSession")}`,
                      disabled: busy,
                      onClick: () =>
                        run(() => {
                          changeView({
                            query: "",
                            archiveFilter:
                              filter === "only" ? "default" : filter,
                            collapsed: {
                              ...workspaceView.getSnapshot().collapsed,
                              [key]: false,
                            },
                            limits: {
                              ...workspaceView.getSnapshot().limits,
                              [key]: 5,
                            },
                          });
                          setSearchOpen(false);
                          return actions.newSession(workspace.workspaceId);
                        }),
                    },
                    h(Icon, { kind: "newSession", size: 16 }),
                  ),
                )
              : null,
          )
        : null,
      !collapsed || query || groupBy === "flat"
        ? h(
            React.Fragment,
            null,
            ...(groupBy === "workspace-tree"
              ? (group.childrenKeys || [])
                  .map((key) => groupMap.get(key))
                  .filter(Boolean)
                  .map(renderGroup)
              : []),
            rows.map((row) => sessionRow(row, group, group.allRows || rows)),
          )
        : null,
      !collapsed && group.hiddenCount > 0
        ? h(
            "button",
            {
              className: "dpw-overflow",
              onClick: () =>
                changeView({
                  limits: {
                    ...workspaceView.getSnapshot().limits,
                    [key]: (view.limits?.[key] || 5) + 5,
                  },
                }),
            },
            tt("wk.moreRows"),
          )
        : null,
    );
  }
  return { sessionRow, renderGroup };
}
