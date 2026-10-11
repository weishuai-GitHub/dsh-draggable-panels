export function createWorkspaceMenu(
  React,
  { Icon, tt, actions, menu, state, callbacks },
) {
  const h = React.createElement;
  const { busy, groupBy, orderBy, filter, ws, archive, pins } = state;
  const { changeView, closeMenu, openDialog, run } = callbacks;
  const option = (key, action, disabled = false, selectedOption = undefined) =>
    h(
      "button",
      {
        key,
        type: "button",
        role: selectedOption !== undefined ? "menuitemradio" : "menuitem",
        "aria-checked": selectedOption,
        disabled: busy || disabled,
        onClick: () => {
          closeMenu(true);
          run(action);
        },
      },
      h(Icon, {
        kind: {
          "wk.workspace": "folder",
          "wk.workspace-tree": "workspaceTree",
          "wk.flat": "list",
          "wk.manual": "sort",
          "wk.updated": "clock",
          "wk.default": "archiveHidden",
          "wk.show": "session",
          "wk.only": "archiveOnly",
        }[key],
        size: 16,
      }),
      h("span", { className: "dpw-menu-text" }, tt(key)),
      h(
        "span",
        { className: "dpw-check", "aria-hidden": true },
        selectedOption ? h(Icon, { kind: "check", size: 16 }) : null,
      ),
    );
  let menuBody = null;
  if (menu?.kind === "view")
    menuBody = [
      h(
        "div",
        { key: "group-label", className: "dpw-menu-label" },
        tt("wk.groupBy"),
      ),
      ...["workspace", "workspace-tree", "flat"].map((value) =>
        option(
          `wk.${value}`,
          () => changeView({ groupBy: value }),
          false,
          groupBy === value,
        ),
      ),
      h(
        "div",
        { key: "order-label", className: "dpw-menu-label dpw-separator" },
        tt("wk.orderBy"),
      ),
      ...["manual", "updated"].map((value) =>
        option(
          `wk.${value}`,
          () => changeView({ orderBy: value }),
          false,
          orderBy === value,
        ),
      ),
      h(
        "div",
        { key: "filter-label", className: "dpw-menu-label dpw-separator" },
        tt("wk.filterBy"),
      ),
      ...["default", "show", "only"].map((value) =>
        option(
          `wk.${value}`,
          () => changeView({ archiveFilter: value }),
          false,
          filter === value,
        ),
      ),
    ];
  if (menu?.kind === "workspace")
    menuBody = [
      h(
        "button",
        {
          key: "rename",
          role: "menuitem",
          onClick: (e) =>
            openDialog(
              { kind: "rename", group: menu.group, others: ws.items },
              e,
            ),
        },
        tt("wk.rename"),
      ),
      h(
        "button",
        {
          key: "delete",
          role: "menuitem",
          onClick: (e) => openDialog({ kind: "delete", group: menu.group }, e),
        },
        tt("wk.delete"),
      ),
    ];
  if (menu?.kind === "session") {
    const { row } = menu;
    const archived = archive.has(row.id);
    const item = (key, icon, action) =>
      h(
        "button",
        {
          key,
          type: "button",
          role: "menuitem",
          disabled: busy,
          onClick: action,
        },
        h(Icon, { kind: icon, size: 16 }),
        h("span", { className: "dpw-menu-text" }, tt(key)),
      );
    menuBody = [
      !archived
        ? item(pins.has(row.id) ? "wk.unpin" : "wk.pin", "pin", () => {
            closeMenu(true);
            run(() => actions.pin(row.id, pins.has(row.id)));
          })
        : null,
      item("wk.rename", "rename", (e) =>
        openDialog({ kind: "sessionRename", session: row }, e),
      ),
      item("wk.fork", "fork", () => {
        closeMenu(true);
        run(() => actions.fork(row.id));
      }),
      item(archived ? "wk.restore" : "wk.archive", "archive", () => {
        closeMenu(true);
        run(() =>
          archived ? actions.restore(row.id) : actions.archive(row.id),
        );
      }),
    ];
  }
  return menuBody;
}
