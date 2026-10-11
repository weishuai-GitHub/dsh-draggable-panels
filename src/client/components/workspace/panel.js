import { createWorkspaceRows } from "./rows.js";
import { createWorkspaceMenu } from "./menus.js";
import { createWorkspaceActions } from "../../integration/workspace-api.js";
import { createAnchoredMenu } from "../../shared/anchored-menu.js";
import { createWorkspaceDialog } from "./dialogs.js";
export function createWorkspaceComponents(React, env) {
  const h = React.createElement;
  const { ctx, useCopy, useAtom, workspaceView, current, notice, fail, Icon } =
    env;
  const actions = createWorkspaceActions(ctx, env.reportAction);
  const AnchoredMenu = createAnchoredMenu(React);
  const WorkspaceDialog = createWorkspaceDialog(React, { ...env, actions });
  function WorkspacePanel({ dockHeaderProps, dockCloseControl, ...props }) {
    const tt = useCopy();
    const list = props.useSessions((s) => s);
    const ws = props.useWorkspaces((s) => s);
    const activePanel = props.usePanelInfo((s) => s.activePanelId);
    const view = useAtom(workspaceView);
    const selected = current(list)?.id;
    const [dialog, setDialog] = React.useState(null);
    const [menu, setMenu] = React.useState(null);
    const [busy, setBusy] = React.useState(false);
    const [searchOpen, setSearchOpen] = React.useState(!!view.query);
    const guard = React.useRef(false);
    const scroll = React.useRef(null);
    const returnFocus = React.useRef(null);
    const alive = React.useRef(true);
    const searchRef = React.useRef(null);
    React.useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
      };
    }, []);
    React.useLayoutEffect(() => {
      if (scroll.current)
        scroll.current.scrollTop = workspaceView.getSnapshot().scroll || 0;
    }, []);
    React.useLayoutEffect(() => {
      if (searchOpen) searchRef.current?.focus();
    }, [searchOpen]);
    function closeMenu(focus = false) {
      if (focus && menu?.anchor?.isConnected) menu.anchor.focus();
      setMenu(null);
    }
    function openMenu(kind, event, payload = {}) {
      const anchor = event.currentTarget;
      if (menu?.anchor === anchor) {
        closeMenu();
        return;
      }
      setMenu({
        kind,
        anchor,
        rect: anchor.getBoundingClientRect(),
        keyboard: event.detail === 0,
        ...payload,
      });
    }
    function openDialog(next, event) {
      returnFocus.current = menu?.anchor || event?.currentTarget;
      setMenu(null);
      setDialog(next);
    }
    function closeDialog() {
      setDialog(null);
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      else scroll.current?.focus();
    }
    async function run(operation, done) {
      if (guard.current) return;
      guard.current = true;
      setBusy(true);
      try {
        const result = await operation();
        if (alive.current) done?.(result);
      } catch (error) {
        notice.set(
          error?.message?.startsWith("wk.") ? tt(error.message) : fail(error),
        );
      } finally {
        guard.current = false;
        if (alive.current) setBusy(false);
      }
    }
    const pins = new Set(ws.pinnedSessionIds || []);
    const archive = new Set(ws.archivedSessionIds || []);
    const filter =
      { hide: "default", all: "show", archived: "only" }[view.archiveFilter] ||
      view.archiveFilter ||
      "default";
    const groupBy = view.groupBy || "workspace";
    const orderBy = view.orderBy || "updated";
    const query = (view.query || "").trim();
    const changeView = (next) =>
      workspaceView.set({ ...workspaceView.getSnapshot(), ...next });
    const result = env.model.buildView({
      list,
      ws,
      selectedId: selected,
      query,
      archiveFilter: filter,
      groupBy,
      sortBy: orderBy,
      orderBy,
      collapsed: view.collapsed || {},
      limits: view.limits || {},
    });
    const contentSearch = env.useContentSearch
      ? env.useContentSearch(query)
      : { items: [], loading: false, error: null, hasMore: false };
    const groups = result.groups;
    React.useEffect(() => {
      env.reportView?.({
        selectedId: selected ?? null,
        selectedCwd: list.byId[selected]?.cwd ?? null,
        groups: groups.map((g) => ({
          key: g.key,
          workspaceId: g.workspaceId ?? null,
          members: (g.allRows || []).map((r) => r.id),
        })),
      });
    }, [selected, list, ws]);
    const groupMap = new Map(groups.map((group) => [group.key, group]));
    const searchRows = [...(result.searchRows || [])];
    const snippets = new Map();
    const searchSeen = new Set(searchRows.map((row) => row.id));
    for (const match of contentSearch.items || []) {
      const row = list.byId[match.sessionId];
      if (
        !row ||
        row.blank ||
        row.origin === "subagent" ||
        (filter === "default" && archive.has(row.id)) ||
        (filter === "only" && !archive.has(row.id))
      )
        continue;
      snippets.set(row.id, match.snippet);
      if (!searchSeen.has(row.id)) {
        searchSeen.add(row.id);
        searchRows.push(row);
      }
    }
    const displayedSearch = searchRows.slice(0, 20);
    const rank = (row) =>
      row?.blank && row.id === selected
        ? 0
        : row && pins.has(row.id) && !archive.has(row.id)
          ? 1
          : 2;
    const locale = ctx.locale.getSnapshot();
    function timeLabel(row) {
      return env.model.relativeTime(
        row.updatedAt,
        typeof locale === "string"
          ? locale
          : locale?.locale || locale?.id || "zh",
      );
    }
    function openSession(row) {
      if (archive.has(row.id)) {
        notice.set(tt("wk.archivedNote"));
        return;
      }
      run(
        () => ctx.uiWorkspace.openSession(row.id),
        () => {
          if (!query) return;
          // Recompute without search so canonical model keys and ancestors, rather
          // than guessed path prefixes, govern restored expansion.
          const restored = env.model.buildView({
            list,
            ws,
            selectedId: row.id,
            query: "",
            archiveFilter: filter,
            groupBy,
            orderBy,
            collapsed: {},
            limits: view.limits || {},
          });
          const collapsed = { ...workspaceView.getSnapshot().collapsed };
          const map = new Map(
            restored.groups.map((group) => [group.key, group]),
          );
          for (const group of restored.groups) {
            if (
              !group.containsCurrent &&
              !(group.allRows || group.rows || []).some(
                (item) => item.id === row.id,
              )
            )
              continue;
            let target = group;
            const seen = new Set();
            while (target && !seen.has(target.key)) {
              seen.add(target.key);
              collapsed[target.key] = false;
              target =
                target.parentKey == null ? null : map.get(target.parentKey);
            }
          }
          changeView({ query: "", collapsed });
          setSearchOpen(false);
        },
      );
    }
    const { sessionRow, renderGroup } = createWorkspaceRows(React, {
      Icon,
      tt,
      actions,
      workspaceView,
      groupMap,
      timeLabel,
      state: {
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
      },
      callbacks: { openSession, openMenu, run, changeView, setSearchOpen },
    });
    const menuBody = createWorkspaceMenu(React, {
      Icon,
      tt,
      actions,
      menu,
      state: { busy, groupBy, orderBy, filter, ws, archive, pins },
      callbacks: { changeView, closeMenu, openDialog, run },
    });
    return h(
      "div",
      { className: "dpd-workspaces dpw-native" },
      h(
        "div",
        { className: "dpw-header" },
        searchOpen
          ? h(
              "div",
              { className: "dpw-search-box" },
              h(Icon, { kind: "search", size: 16 }),
              h("input", {
                ref: searchRef,
                type: "search",
                value: view.query || "",
                placeholder: tt("wk.search"),
                "aria-label": tt("wk.search"),
                onChange: (e) => changeView({ query: e.target.value }),
                onKeyDown: (e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    changeView({ query: "" });
                    setSearchOpen(false);
                  }
                },
              }),
              h(
                "button",
                {
                  className: "dpw-header-button",
                  title: tt("wk.closeSearch"),
                  "aria-label": tt("wk.closeSearch"),
                  onClick: () => {
                    changeView({ query: "" });
                    setSearchOpen(false);
                  },
                },
                h(Icon, { kind: "close", size: 14 }),
              ),
            )
          : h(
              React.Fragment,
              null,
              h(
                "span",
                {
                  ...dockHeaderProps,
                  className: `dpw-heading${dockHeaderProps ? " dpw-drag-heading" : ""}`,
                  title: dockHeaderProps?.title,
                },
                dockHeaderProps
                  ? h(Icon, {
                      kind: "grip",
                      size: 16,
                      className: "dpw-title-grip",
                    })
                  : null,
                tt(groupBy === "flat" ? "wk.sessions" : "wk.heading"),
              ),
              h(
                "span",
                { className: "dpw-header-actions" },
                h(
                  "button",
                  {
                    className: "dpw-header-button",
                    title: tt("wk.search"),
                    "aria-label": tt("wk.search"),
                    onClick: () => setSearchOpen(true),
                  },
                  h(Icon, { kind: "search", size: 16 }),
                ),
                h(
                  "button",
                  {
                    className: "dpw-header-button",
                    title: tt("wk.view"),
                    "aria-label": tt("wk.view"),
                    "aria-haspopup": "menu",
                    "aria-expanded": menu?.kind === "view",
                    onClick: (e) => openMenu("view", e),
                  },
                  h(Icon, { kind: "filter", size: 16 }),
                ),
                h(
                  "button",
                  {
                    className: "dpw-header-button",
                    title: tt("wk.add"),
                    "aria-label": tt("wk.add"),
                    type: "button",
                    disabled: busy,
                    onClick: () =>
                      run(
                        () => actions.pickAndCreate(),
                        (workspace) => {
                          if (!workspace) return;
                          changeView({
                            query: "",
                            archiveFilter:
                              filter === "only" ? "default" : filter,
                            collapsed: {
                              ...workspaceView.getSnapshot().collapsed,
                              [workspace.workspaceId]: false,
                            },
                          });
                          setSearchOpen(false);
                        },
                      ),
                  },
                  h(Icon, { kind: "folderPlus", size: 16 }),
                ),
              ),
            ),
        dockCloseControl,
      ),
      h(
        "div",
        {
          className: "dpd-scroll",
          ref: scroll,
          tabIndex: -1,
          onScroll: (e) => {
            changeView({ scroll: e.currentTarget.scrollTop });
            if (menu) closeMenu(false);
          },
        },
        ws.error || list.error
          ? h(
              "div",
              { className: "dpw-error", role: "alert" },
              fail(ws.error || list.error),
            )
          : ws.phase === "pending" || list.phase === "pending"
            ? h("div", { className: "dpd-message" }, tt("wk.loading"))
            : null,
        result.isSearch || query
          ? displayedSearch.map((row) =>
              h(
                "div",
                { key: row.id },
                sessionRow(row, { key: "search", depth: 0 }, displayedSearch),
                snippets.get(row.id)
                  ? h("div", { className: "dpw-snippet" }, snippets.get(row.id))
                  : null,
              ),
            )
          : groupBy === "flat"
            ? (result.flatRows || []).map((row) =>
                sessionRow(
                  row,
                  { key: "flat", depth: 0 },
                  result.flatRows || [],
                ),
              )
            : groups
                .filter(
                  (group) => groupBy !== "workspace-tree" || !group.parentKey,
                )
                .map(renderGroup),
        !query && groupBy === "flat" && groups[0]?.hiddenCount > 0
          ? h(
              "button",
              {
                className: "dpw-overflow",
                onClick: () => {
                  const key = groups[0].key ?? "flat";
                  changeView({
                    limits: {
                      ...workspaceView.getSnapshot().limits,
                      [key]: (view.limits?.[key] || 5) + 5,
                    },
                  });
                },
              },
              tt("wk.moreRows"),
            )
          : null,
        query && contentSearch.loading
          ? h("div", { className: "dpw-search-status" }, tt("wk.loading"))
          : null,
        query && contentSearch.error
          ? h(
              "div",
              { className: "dpw-error", role: "status" },
              fail(contentSearch.error),
            )
          : null,
        query &&
          (result.searchHasMore ||
            contentSearch.hasMore ||
            searchRows.length > 20)
          ? h("div", { className: "dpw-search-status" }, tt("wk.searchLimit"))
          : null,
        !(query
          ? displayedSearch.length
          : groupBy === "flat"
            ? result.flatRows?.length
            : groups.length) && list.phase === "ready"
          ? h(
              "div",
              { className: "dpd-message" },
              tt(filter === "only" ? "wk.emptyArchive" : "wk.empty"),
            )
          : null,
      ),
      menu
        ? h(
            AnchoredMenu,
            {
              key: `${menu.kind}:${menu.row?.id || menu.group?.workspaceId || ""}`,
              menu,
              close: closeMenu,
            },
            menuBody,
          )
        : null,
      dialog
        ? h(WorkspaceDialog, {
            key: `${dialog.kind}:${dialog.group?.workspaceId || dialog.session?.id || ""}`,
            request: dialog,
            close: closeDialog,
          })
        : null,
    );
  }
  return { WorkspacePanel };
}
