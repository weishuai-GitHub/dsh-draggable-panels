import { createDragController } from "./drag-controller.js";
import { createComponentManager } from "./component-manager.js";
import { createPanelBoundary } from "../shared/error-boundary.js";
import { createAnchoredMenu } from "../shared/anchored-menu.js";
/* Two plugin-owned docking surfaces; never read another plugin's DOM. */
export function createDockComponents(React, env) {
  const h = React.createElement;
  const {
    ctx,
    t,
    css,
    useAtom,
    useCopy,
    layout,
    nativeMode,
    nativeNotice,
    rightShown,
    drag,
    notice,
    commit,
    move,
    recover,
    toNative,
    dismissNativeNotice,
    reset,
    hitTest,
    dragDistanceExceeded,
  } = env;
  let leftExpansion;
  const controller = createDragController({
    ...env,
    expandLeft: () => leftExpansion?.(),
  });
  const {
    frames,
    tabs,
    suppressClicks,
    startDrag,
    clearSession,
    revealRef,
    getActive,
  } = controller;
  const Icon = env.Icon;
  const Boundary = createPanelBoundary(React);
  const AnchoredMenu = createAnchoredMenu(React);
  const hostProps = env.atom(null);
  const popup = env.atom(null);
  const manager = env.atom(false);
  const identities = new WeakMap();
  let nextIdentity = 0;
  const identity = (entry) => {
    if (!identities.has(entry)) identities.set(entry, ++nextIdentity);
    return identities.get(entry);
  };
  const find = (id) =>
    env.registry.getSnapshot().find((entry) => entry.id === id);
  const title = (id) => {
    const entry = find(id);
    return entry ? env.titleOf(entry) : id;
  };
  function panelIcon(entry, size = 16) {
    const fallback = h(Icon, { kind: "workspace", size });
    return entry?.icon
      ? h(Boundary, { key: identity(entry), fallback }, h(entry.icon, { size }))
      : fallback;
  }
  function openMenu(e, id) {
    e.preventDefault();
    e.stopPropagation();
    const anchor = e.currentTarget;
    const rect =
      e.type === "contextmenu"
        ? {
            left: e.clientX,
            right: e.clientX,
            top: e.clientY,
            bottom: e.clientY,
          }
        : anchor.getBoundingClientRect();
    popup.set({ kind: "panel", id, anchor, rect, keyboard: e.detail === 0 });
  }
  function show(id) {
    env.show(id);
    if (layout.getSnapshot().left.includes(id)) leftExpansion?.();
  }
  function Dock({ side, collapsed = false, nativeDock = false, ...props }) {
    const tt = useCopy();
    const value = useAtom(layout);
    const entries = useAtom(env.registry);
    const dragging = useAtom(drag);
    const error = useAtom(notice);
    const ids = env
      .visibleIds(value, side)
      .filter((id) => !nativeDock || id !== "files");
    const selected = ids.includes(value.active[side])
      ? value.active[side]
      : ids[0];
    const over = dragging?.target?.side === side;
    const entry = entries.find((item) => item.id === selected);
    const integrated = ids.length === 1 && entry?.integratedHeader;
    const headerProps = (id) => ({
      id: `dpd-tab-${id}`,
      ref: (node) => {
        if (node) tabs[side].set(id, node);
        else tabs[side].delete(id);
      },
      onPointerDown: (e) => startDrag(e, id, side),
      onContextMenu: (e) => openMenu(e, id),
      title: tt("drag"),
      tabIndex: 0,
      style: { cursor: "grab", touchAction: "none", userSelect: "none" },
      onKeyDown: (e) => {
        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
          e.preventDefault();
          openMenu(e, id);
        }
        if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          e.preventDefault();
          const dest = e.key === "ArrowLeft" ? "left" : "right";
          if (dest === "left") leftExpansion?.();
          move(id, dest);
        }
      },
    });
    const controls = h(
      React.Fragment,
      null,
      selected
        ? h(
            "button",
            {
              type: "button",
              className: "dpd-icon-button",
              title: tt("componentOptions"),
              "aria-label": `${title(selected)}: ${tt("componentOptions")}`,
              "aria-haspopup": "menu",
              onClick: (e) => openMenu(e, selected),
            },
            h(Icon, { kind: "more", size: 15 }),
          )
        : null,
      side === "right"
        ? h(
            "button",
            {
              type: "button",
              className: "dpd-icon-button dpd-dock-component-picker",
              title: tt("manageComponents"),
              "aria-label": tt("manageComponents"),
              "aria-haspopup": "dialog",
              onClick: () => manager.set(true),
            },
            h(Icon, { kind: "list", size: 15 }),
          )
        : null,
      side === "right"
        ? h(
            "button",
            {
              type: "button",
              className: "dpd-icon-button dpd-strip-close",
              title: tt("rightClose"),
              "aria-label": tt("rightClose"),
              onClick: () => env.setRightShown(false),
            },
            h(Icon, { kind: "sidebar", size: 15 }),
          )
        : null,
    );
    const frameRef = React.useCallback(
      (node) => {
        frames[side] = node;
      },
      [side],
    );
    React.useEffect(
      () => () => {
        if (getActive()?.side === side) clearSession();
      },
      [side],
    );
    if (collapsed)
      return h(
        "div",
        {
          className: "dpd-root dpd-rail",
          ref: frameRef,
          "data-over": over ? "" : undefined,
        },
        h(
          "button",
          {
            type: "button",
            className: "dpd-icon-button",
            title: tt("manageComponents"),
            "aria-label": tt("manageComponents"),
            onClick: () => manager.set(true),
          },
          h(Icon, { kind: "list" }),
        ),
      );
    return h(
      "section",
      {
        className: "dpd-root",
        ref: frameRef,
        "aria-label": tt(side),
        "data-over": over ? "" : undefined,
        "data-dragging": dragging ? "" : undefined,
      },
      !integrated
        ? h(
            "div",
            { className: "dpd-strip", role: "tablist", "aria-label": tt(side) },
            ids.map((id, index) =>
              h(
                "button",
                {
                  ...headerProps(id),
                  type: "button",
                  className: "dpd-tab",
                  key: id,
                  role: "tab",
                  "aria-selected": selected === id,
                  "aria-controls": `dpd-panel-${id}`,
                  tabIndex: selected === id ? 0 : -1,
                  "data-insert":
                    over && dragging.target.beforeId === id ? "" : undefined,
                  onClick: (e) => {
                    if (suppressClicks.has(e.currentTarget)) {
                      suppressClicks.delete(e.currentTarget);
                      return;
                    }
                    commit(env.selectPanel(layout.getSnapshot(), side, id));
                  },
                  onKeyDown: (e) => {
                    if (
                      e.altKey ||
                      e.key === "ContextMenu" ||
                      (e.shiftKey && e.key === "F10")
                    )
                      return headerProps(id).onKeyDown(e);
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                    ) {
                      e.preventDefault();
                      const next =
                        e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? ids.length - 1
                            : (index +
                                (e.key === "ArrowLeft" ? -1 : 1) +
                                ids.length) %
                              ids.length;
                      commit(
                        env.selectPanel(layout.getSnapshot(), side, ids[next]),
                      );
                      tabs[side].get(ids[next])?.focus();
                    }
                  },
                },
                h(Icon, { kind: "grip", size: 14 }),
                panelIcon(find(id), 15),
                h("span", null, title(id)),
              ),
            ),
            controls,
          )
        : null,
      h(
        "div",
        { className: "dpd-body" },
        ids.length
          ? ids.map((id) => {
              const definition = entries.find((item) => item.id === id);
              return h(
                "div",
                {
                  key: `${id}:${identity(definition)}`,
                  id: `dpd-panel-${id}`,
                  role: "tabpanel",
                  "aria-labelledby": `dpd-tab-${id}`,
                  hidden: id !== selected,
                  className: "dpd-body",
                  style: { display: id === selected ? "flex" : "none" },
                },
                h(
                  Boundary,
                  {
                    message: `${title(id)}: ${tt("componentError")}`,
                    retry: tt("retry"),
                  },
                  h(definition.component, {
                    ...props,
                    panelId: id,
                    side,
                    isActive: id === selected,
                    dockHeaderProps: integrated ? headerProps(id) : undefined,
                    dockCloseControl: integrated ? controls : null,
                  }),
                ),
              );
            })
          : h("div", { className: "dpd-empty" }, tt("drop")),
      ),
      error
        ? h(
            "div",
            { className: "dpd-message dpd-error", role: "status" },
            error,
            h(
              "button",
              { onClick: () => notice.set(""), "aria-label": tt("rightClose") },
              "×",
            ),
          )
        : null,
      over ? h("div", { className: "dpd-dropveil" }, tt("drop")) : null,
    );
  }
  function Left(props) {
    React.useLayoutEffect(() => {
      hostProps.set(props);
    }, [props]);
    React.useLayoutEffect(() => {
      leftExpansion = props.expandSidebar;
      env.setLeftExpansion(leftExpansion);
      return () => {
        if (leftExpansion === props.expandSidebar) {
          leftExpansion = undefined;
          env.setLeftExpansion(null);
        }
      };
    }, [props.expandSidebar]);
    return h(Dock, { ...props, side: "left", collapsed: !props.wide });
  }
  function Right(props) {
    const shown = useAtom(rightShown);
    const activePanel = props.usePanelInfo((s) => s.activePanelId);
    const visible = shown && !activePanel;
    const fullscreen = props.viewportWidth < 768 || !props.canShow;
    React.useLayoutEffect(() => {
      if (visible) ctx.layout.openRightbar(!fullscreen, fullscreen);
      else ctx.layout.closeRightbar();
      return () => ctx.layout.closeRightbar();
    }, [visible, fullscreen]);
    if (!visible) return null;
    return h(
      "div",
      {
        className: fullscreen ? "dpd-full-right" : "dpd-wide-right",
        style: fullscreen ? undefined : { width: props.width || 320 },
      },
      h(Dock, { ...props, side: "right" }),
    );
  }
  // One native tab per component. Never put another tab strip inside it.
  const nativePanels = new Map();
  function NativePanel(id) {
    if (!nativePanels.has(id))
      nativePanels.set(id, function NativePanelBody(props) {
        const shared = useAtom(hostProps);
        const entries = useAtom(env.registry);
        const definition = entries.find((entry) => entry.id === id);
        if (!shared || !definition) return null;
        return h(
          "section",
          { className: "dpd-root", "data-dpd-native-panel": id },
          h(
            Boundary,
            {
              message: `${title(id)}: ${t("componentError")}`,
              retry: t("retry"),
            },
            h(definition.component, {
              ...shared,
              ...props,
              panelId: id,
              side: "right",
              isActive: props.visible !== false,
            }),
          ),
        );
      });
    return nativePanels.get(id);
  }
  function nativePanelId(kind) {
    return kind?.startsWith("local.draggablePanels:panel:")
      ? kind.slice("local.draggablePanels:panel:".length)
      : "files";
  }
  // These are our own title nodes and drop surfaces. Never inspect or replace
  // the native rightbar body just to discover its geometry.
  function NativeFileTitle({ useTabInfo }) {
    const tt = useCopy();
    const { tab } = useTabInfo();
    const id = nativePanelId(tab.kind);
    const state = useAtom(layout);
    const ref = React.useRef(null);
    const setRef = React.useCallback((node) => {
      revealRef(node, ref.current);
      ref.current = node;
    }, []);
    return h(
      "span",
      {
        ref: setRef,
        className: "dpd-native-file-title",
        "data-dpd-native-files-drag": id === "files" ? "" : undefined,
        "data-dpd-native-panel-drag": id,
        title: tt("nativeSort"),
      },
      h(
        "span",
        {
          className: "dpd-native-drag-grip",
          "data-dpd-native-cross-side-grip": id,
          title: tt("crossSideDrag"),
          onPointerDown: (e) => {
            if (e.button !== 0 || !e.isPrimary) return;
            // Only the grip owns cross-sidebar moves. The remaining title bubbles
            // to the native docking kit, which owns actual tab order/persistence.
            e.stopPropagation();
            startDrag(e, id, state.left.includes(id) ? "left" : "right");
          },
          onDragStart: (e) => e.preventDefault(),
          onClick: (e) => {
            if (suppressClicks.has(e.currentTarget)) {
              suppressClicks.delete(e.currentTarget);
              e.preventDefault();
              e.stopPropagation();
            }
          },
        },
        h(Icon, { kind: "grip", size: 14 }),
      ),
      panelIcon(find(id), 15),
      tab.title || title(id),
    );
  }
  function NativeDropRail() {
    const tt = useCopy();
    const mode = useAtom(nativeMode);
    const enabled = useAtom(env.nativeFiles.available);
    const dragging = useAtom(drag);
    const ref = React.useRef(null);
    const setRef = React.useCallback((node) => {
      revealRef(node, ref.current);
      ref.current = node;
    }, []);
    if (mode || !enabled || !dragging) return null;
    return h(
      "div",
      {
        ref: setRef,
        className: "dpd-native-drop-rail",
        "data-dpd-drop-right": "",
        "data-over": dragging.target?.side === "right" ? "" : undefined,
        "aria-hidden": true,
      },
      tt("dropRight"),
    );
  }
  function NativeFileMenu({ tab, dismiss }) {
    const tt = useCopy();
    const mode = useAtom(nativeMode);
    const enabled = useAtom(env.nativeFiles.available);
    if (
      mode ||
      !enabled ||
      !(
        tab.kind === "files" ||
        tab.kind?.startsWith("local.draggablePanels:panel:")
      )
    )
      return null;
    const id = nativePanelId(tab.kind);
    return h(
      React.Fragment,
      null,
      h(
        "button",
        {
          type: "button",
          role: "menuitem",
          onClick: () => {
            move(id, "left");
            show(id);
            dismiss();
          },
        },
        tt("moveLeft"),
      ),
      h(
        "button",
        {
          type: "button",
          role: "menuitem",
          onClick: () => {
            move(id, "right");
            show(id);
            dismiss();
          },
        },
        tt("moveRight"),
      ),
      h(
        "button",
        {
          type: "button",
          role: "menuitem",
          onClick: () => {
            manager.set(true);
            dismiss();
          },
        },
        tt("manageComponents"),
      ),
    );
  }
  function HeaderCorner() {
    const tt = useCopy();
    const shown = useAtom(rightShown);
    const dragging = useAtom(drag);
    const ref = React.useRef(null);
    const setRef = React.useCallback((node) => {
      revealRef(node, ref.current);
      ref.current = node;
    }, []);
    if (shown) return null;
    return h(
      "div",
      { className: "dpd-header-controls" },
      h(
        "button",
        {
          type: "button",
          className: "dpd-icon-button dpd-header-toggle",
          title: tt("manageComponents"),
          "aria-label": tt("manageComponents"),
          "aria-haspopup": "dialog",
          onClick: () => manager.set(true),
        },
        h(Icon, { kind: "list", size: 15 }),
      ),
      !shown
        ? h(
            "button",
            {
              ref: setRef,
              className: "dpd-icon-button dpd-header-toggle",
              title: tt("rightOpen"),
              "aria-label": tt("rightOpen"),
              "aria-expanded": false,
              style:
                dragging?.target?.side === "right"
                  ? { outline: "2px solid var(--dsw-alias-brand-primary)" }
                  : undefined,
              onClick: () => env.setRightShown(true),
            },
            h(Icon, { kind: "sidebar", size: 15 }),
          )
        : null,
    );
  }
  function Tools({ wide }) {
    const tt = useCopy();
    const mode = useAtom(nativeMode);
    const nativeFilesEnabled = env.nativeFiles
      ? useAtom(env.nativeFiles.available)
      : false;
    const panelLayout = useAtom(layout);
    const shown = useAtom(rightShown);
    const dragging = useAtom(drag);
    const ref = React.useRef(null);
    const setRef = React.useCallback((node) => {
      revealRef(node, ref.current);
      ref.current = node;
    }, []);
    return h(
      "div",
      { className: "dpd-tools", "data-rail": !wide ? "" : undefined },
      nativeFilesEnabled && !mode
        ? h(
            "button",
            {
              type: "button",
              className: "dpd-icon-button",
              title: tt("nativeFilesDrag"),
              "aria-label": tt("nativeFilesDrag"),
              style: { cursor: "grab", touchAction: "none" },
              onPointerDown: (e) =>
                startDrag(
                  e,
                  "files",
                  panelLayout.left.includes("files") ? "left" : "right",
                ),
              onClick: (e) => {
                if (suppressClicks.has(e.currentTarget)) {
                  suppressClicks.delete(e.currentTarget);
                  return;
                }
                show("files");
              },
              onContextMenu: (e) => openMenu(e, "files"),
              onKeyDown: (e) => {
                if (e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
                  e.preventDefault();
                  move("files", e.key === "ArrowLeft" ? "left" : "right");
                  show("files");
                }
              },
            },
            h(Icon, { kind: "files" }),
          )
        : null,
      h(
        "button",
        {
          type: "button",
          className: "dpd-icon-button",
          title: tt("manageComponents"),
          "aria-label": tt("manageComponents"),
          onClick: () => manager.set(true),
        },
        h(Icon, { kind: "list" }),
      ),
      h(
        "button",
        {
          className: "dpd-icon-button",
          title: tt("reset"),
          "aria-label": tt("reset"),
          onClick: reset,
        },
        "↺",
      ),
      h(
        "button",
        {
          className: "dpd-icon-button",
          title: mode ? tt("resume") : tt("native"),
          "aria-label": mode ? tt("resume") : tt("native"),
          onClick: () => {
            if (mode) recover();
            else toNative();
          },
        },
        mode ? "▦" : "⇄",
      ),
      !mode
        ? h(
            "button",
            {
              ref: setRef,
              className: "dpd-icon-button",
              title: shown ? tt("rightClose") : tt("rightOpen"),
              "aria-label": shown ? tt("rightClose") : tt("rightOpen"),
              "aria-expanded": shown,
              style:
                dragging?.target?.side === "right"
                  ? { outline: "2px solid var(--dsw-alias-brand-primary)" }
                  : undefined,
              onClick: () => env.setRightShown(!shown),
            },
            h(Icon, { kind: "sidebar" }),
          )
        : null,
    );
  }
  const Manager = createComponentManager(React, {
    env,
    useCopy,
    useAtom,
    layout,
    manager,
    panelIcon,
    show,
    Icon,
  });
  function Overlay() {
    const tt = useCopy();
    const mode = useAtom(nativeMode);
    const noticeShown = useAtom(nativeNotice);
    const dragging = useAtom(drag);
    const menu = useAtom(popup);
    const managing = useAtom(manager);
    useAtom(env.registry);
    return h(
      React.Fragment,
      null,
      h("style", null, css),
      env.nativeFiles ? h(env.nativeFiles.Bridge) : null,
      env.nativeFiles ? h(NativeDropRail) : null,
      mode && noticeShown
        ? h(
            "div",
            { className: "dpd-recover" },
            h("span", null, tt("nativeNote")),
            h("button", { onClick: recover }, tt("resume")),
            h(
              "button",
              { onClick: () => manager.set(true) },
              tt("manageComponents"),
            ),
            h(
              "button",
              {
                type: "button",
                className: "dpd-recover-close",
                title: tt("nativeNoteClose"),
                "aria-label": tt("nativeNoteClose"),
                "data-native-notice-close": "",
                onClick: dismissNativeNotice,
              },
              h(Icon, { kind: "close", size: 15 }),
            ),
          )
        : null,
      dragging && find(dragging.id)
        ? h(
            "div",
            {
              className: "dpd-drag-ghost",
              style: {
                left: dragging.point.x + 12,
                top: dragging.point.y + 12,
              },
            },
            panelIcon(find(dragging.id)),
            title(dragging.id),
            dragging.target ? ` → ${tt(dragging.target.side)}` : "",
          )
        : null,
      menu && find(menu.id)
        ? h(
            "div",
            { className: "dpd-root dpw-native dpd-context-surface" },
            h(
              AnchoredMenu,
              {
                menu,
                close: (focus) => {
                  popup.set(null);
                  if (focus && menu.anchor?.isConnected) menu.anchor.focus();
                },
              },
              h(
                "button",
                {
                  type: "button",
                  role: "menuitem",
                  onClick: () => {
                    env.hide(menu.id);
                    popup.set(null);
                  },
                },
                tt("hideComponent"),
              ),
            ),
          )
        : null,
      managing ? h(Manager) : null,
    );
  }
  const off = env.registry.subscribe(() => {
    if (getActive() && !find(getActive().id)) clearSession();
    if (popup.getSnapshot() && !find(popup.getSnapshot().id)) popup.set(null);
  });
  function dispose() {
    off();
    controller.dispose();
    hostProps.clear();
    popup.clear();
    manager.clear();
  }
  return {
    Left,
    Right,
    NativePanel,
    NativeFileMenu,
    NativeFileTitle,
    HeaderCorner,
    Tools,
    Overlay,
    dispose,
  };
}
