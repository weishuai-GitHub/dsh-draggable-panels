import { createNativeExplorer } from "./native-explorer.js";

const PANEL_PREFIX = "local.draggablePanels:panel:";
const LEGACY_KINDS = new Set([
  "local.draggablePanels:left-files",
  `${PANEL_PREFIX}panels`,
]);

/** Native file resources stay in the host. Trees are independent controlled
 * views, and each registered component gets its own native tab (no carriers). */
export function createNativeFiles(React, env) {
  const { ctx, atom, useAtom, t, notice, fail, current } = env;
  const h = React.createElement;
  const Explorer = createNativeExplorer(React, env);
  const available = atom(false);
  const runtime = atom(null);
  const requests = atom([]);
  const placement = atom(null);
  const revision = atom(0);
  const panels = new Map();
  let disposed = false;
  const report = (error) => notice.set(fail(error));
  const enqueue = (request) => {
    if (!disposed) requests.set([...requests.getSnapshot(), request]);
  };
  const openFiles = () => enqueue({ type: "files" });
  const setShown = (shown) => enqueue({ type: "shown", shown: !!shown });

  function registerPanel(live, entry) {
    if (entry.unregister) return;
    entry.unregister = live.service.registerTab({
      id: entry.kind,
      title: entry.title,
      hidden: true,
      single: true,
      component: (props) => h(entry.Component, props),
    });
  }
  function ensurePanel(id, title, Component) {
    let entry = panels.get(id);
    if (!entry) {
      entry = {
        kind: `${PANEL_PREFIX}${id}`,
        title,
        Component,
        unregister: null,
      };
      entry.dispose = () => {
        if (panels.get(id) !== entry) return;
        panels.delete(id);
        entry.unregister?.();
        entry.unregister = null;
      };
      panels.set(id, entry);
    } else {
      entry.title = title;
      entry.Component = Component;
    }
    const live = runtime.getSnapshot();
    if (live) registerPanel(live, entry);
    return entry;
  }
  function openPanel(id, title, Component) {
    const entry = ensurePanel(id, title, Component);
    enqueue({ type: "panel", id });
    return entry.dispose;
  }
  function setPlacement(spec) {
    for (const entry of spec.panels)
      ensurePanel(entry.id, entry.title, entry.Component);
    placement.set(spec);
  }

  const injection = ctx.inject(
    ["betterSidebar", "sidebarRight"],
    (injected) => {
      const service = injected.betterSidebar;
      const sidebar = injected.sidebarRight;
      if (!service?.getTab || !service?.registerTab || !sidebar?.mounted)
        return;
      const live = { service, sidebar };
      let active = true;
      const sync = () => {
        if (!active || disposed) return;
        available.set(
          typeof service.getTab("editor")?.component === "function",
        );
        revision.set(revision.getSnapshot() + 1);
      };
      injected.effect(() => {
        for (const entry of panels.values()) registerPanel(live, entry);
        runtime.set(live);
        const offs = [
          service.subscribe(sync),
          sidebar.mounted.subscribe(sync),
          sidebar.openTabs?.subscribe(sync),
        ];
        sync();
        return () => {
          active = false;
          offs.forEach((off) => off?.());
          for (const entry of panels.values()) {
            entry.unregister?.();
            entry.unregister = null;
          }
          if (runtime.getSnapshot() === live) {
            runtime.set(null);
            available.set(false);
          }
        };
      }, "native component registrations");
    },
  );

  function Bridge() {
    const live = useAtom(runtime);
    const ready = useAtom(available);
    const pending = useAtom(requests);
    const spec = useAtom(placement);
    const pulse = useAtom(revision);
    const previous = React.useRef(new Map());
    React.useEffect(() => {
      if (!ready || !live) return;
      const { sidebar } = live;
      const sessionId = sidebar.mounted.getSnapshot();
      if (!sessionId) return;
      const inventory = () =>
        (sidebar.openTabs?.getSnapshot() || []).filter(
          (tab) => tab.sessionId === sessionId,
        );
      const focusKind = (kind) => {
        const tab = inventory().find((tab) => tab.kind === kind);
        if (tab && sidebar.focus) sidebar.focus(tab.tabId);
        else sidebar.openTab(kind);
      };
      try {
        if (spec) {
          const wanted = new Set(
            spec.enabled
              ? spec.rightIds
                  .filter((id) => id !== "files")
                  .map((id) => `${PANEL_PREFIX}${id}`)
              : [],
          );
          if (spec.enabled && spec.filesRight) wanted.add("files");
          for (const tab of inventory()) {
            if (
              LEGACY_KINDS.has(tab.kind) ||
              (tab.kind.startsWith(PANEL_PREFIX) && !wanted.has(tab.kind)) ||
              (spec.enabled && !spec.filesRight && tab.kind === "files")
            ) {
              sidebar.close(tab.tabId);
            }
          }
          const old = previous.current.get(sessionId);
          const focused = sidebar.active?.()?.id;
          let added = false;
          for (const kind of wanted) {
            if (!old?.wanted.has(kind) || old.live !== live) {
              if (!inventory().some((tab) => tab.kind === kind)) {
                sidebar.openTab(kind);
                added = true;
              }
            }
          }
          previous.current.set(sessionId, { wanted, live });
          // Creating a newly visible component must not steal an open editor's focus.
          // Explicit show/move requests below choose the intended foreground tab.
          if (
            added &&
            focused &&
            inventory().some((tab) => tab.tabId === focused)
          )
            sidebar.focus?.(focused);
          // Once obsolete records have been closed it is safe to remove their types.
          const registered = new Set(spec.panels.map((entry) => entry.id));
          for (const [id, entry] of panels)
            if (!registered.has(id)) entry.dispose();
        }
        if (pending.length)
          requests.set(requests.getSnapshot().slice(pending.length));
        for (const request of pending) {
          if (request.type === "files") {
            if (!spec || !spec.enabled || spec.filesRight) focusKind("files");
          } else if (request.type === "panel") {
            const entry = panels.get(request.id);
            if (
              entry &&
              (!spec || (spec.enabled && spec.rightIds.includes(request.id)))
            )
              focusKind(entry.kind);
          } else if (sidebar.isExpanded() !== request.shown)
            sidebar.toggleExpanded();
        }
      } catch (error) {
        report(error);
      }
    }, [live, ready, pending, spec, pulse]);
    return null;
  }

  function LeftFiles(props) {
    const live = useAtom(runtime);
    const ready = useAtom(available);
    const list = props.useSessions((state) => state);
    const session = current(list);
    if (!ready || !live) return h("div", null, t("nativeFilesUnavailable"));
    if (!session?.cwd) return h("div", null, t("noRoot"));
    return h(
      "div",
      {
        "data-native-files-left": true,
        style: {
          height: "100%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        },
      },
      h(Explorer, {
        key: session.id,
        scope: { sessionId: session.id, cwd: session.cwd },
        service: live.service,
        visible: props.isActive !== false,
      }),
    );
  }
  ctx.effect(
    () => () => {
      disposed = true;
      requests.set([]);
      const cleanup = injection?.dispose?.();
      cleanup?.catch(report);
    },
    "native files bridge",
  );
  return {
    available,
    Bridge,
    LeftFiles,
    openFiles,
    openPanel,
    setPlacement,
    setShown,
  };
}
