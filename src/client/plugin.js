import { createStore } from "./shared/store.js";
import {
  readJSON,
  writeJSON,
  readLayout,
  readWorkspaceView,
  LAYOUT_KEY,
  VISIBILITY_KEY,
  VIEW_KEY,
} from "./shared/persistence.js";
import { createIcons } from "./shared/icons.js";
import { createComponentRegistry } from "./registry/component-registry.js";
import { createPanelService } from "./registry/panel-service.js";
import * as model from "./dock/model.js";
import { createPointerHelpers } from "./dock/pointer.js";
import { createDockComponents } from "./dock/components.js";
import { registerWorkspace } from "./components/workspace/index.js";
import { registerFiles } from "./components/files/index.js";
import { registerTerminal } from "./components/terminal/index.js";
import { registerSlots } from "./integration/slots.js";
import zh from "./locales/zh.json";
import en from "./locales/en.json";
import commonStyles from "./shared/styles.css";
import workspaceStyles from "./components/workspace/styles.css";
import dockStyles from "./dock/styles.css";
import filesStyles from "./components/files/styles.css";
import terminalStyles from "./components/terminal/styles.css";
import xtermStyles from "@xterm/xterm/css/xterm.css";

export function createPlugin(React) {
  return {
    inject: [
      "slots",
      "layout",
      "locale",
      "uiWorkspace",
      "workspaces",
      "sessions",
      "remote",
      "remote.workspaceFiles",
    ],
    apply(ctx) {
      const t = ctx.locale.bind("local.draggablePanels");
      ctx.effect(
        () => ctx.locale.register("local.draggablePanels", { zh, en }),
        "panel locale",
      );
      const registry = createComponentRegistry();
      const savedLayout = readLayout(localStorage);
      const layout = createStore(model.normalizeLayout(null, []));
      const nativeMode = createStore(false);
      // The recovery bar is dismissable; the sidebar footer toggle stays reachable.
      const nativeNotice = createStore(true);
      const rightShown = createStore(
        readJSON(localStorage, VISIBILITY_KEY, true) !== false,
      );
      const drag = createStore(null);
      const notice = createStore("");
      const workspaceView = createStore(readWorkspaceView(localStorage));
      const catalog = createStore(Object.freeze([]));
      const useAtom = (store) =>
        React.useSyncExternalStore(
          store.subscribe,
          store.getSnapshot,
          store.getSnapshot,
        );
      function useCopy() {
        React.useSyncExternalStore(
          (fn) => ctx.locale.subscribe(fn),
          () => ctx.locale.getSnapshot(),
          () => ctx.locale.getSnapshot(),
        );
        return t;
      }
      const Icon = createIcons(React);
      function titleOf(entry) {
        try {
          return String(
            typeof entry.title === "function" ? entry.title() : entry.title,
          );
        } catch {
          return entry.id;
        }
      }
      function refreshCatalog() {
        const state = layout.getSnapshot();
        catalog.set(
          Object.freeze(
            registry.getSnapshot().map((entry) =>
              Object.freeze({
                id: entry.id,
                title: titleOf(entry),
                side: state.left.includes(entry.id) ? "left" : "right",
                visible: !state.hidden.includes(entry.id),
              }),
            ),
          ),
        );
      }
      function commit(next) {
        layout.set(next);
        if (!writeJSON(localStorage, LAYOUT_KEY, next))
          notice.set(t("storage"));
      }
      function setRightShown(next) {
        rightShown.set(!!next);
        writeJSON(localStorage, VISIBILITY_KEY, !!next);
      }
      const recover = () => nativeMode.set(false);
      const toNative = () => {
        nativeNotice.set(true);
        nativeMode.set(true);
      };
      let revealLeft = () => {};
      function assertKnown(id) {
        if (!registry.getSnapshot().some((entry) => entry.id === id))
          throw new Error(`Unknown panel: ${id}`);
      }
      function show(id) {
        assertKnown(id);
        recover();
        commit(
          model.showPanel(layout.getSnapshot(), id, registry.getSnapshot()),
        );
        if (layout.getSnapshot().right.includes(id)) setRightShown(true);
        else revealLeft();
      }
      function hide(id) {
        assertKnown(id);
        commit(
          model.hidePanel(layout.getSnapshot(), id, registry.getSnapshot()),
        );
        if (drag.getSnapshot()?.id === id) drag.set(null);
      }
      function move(id, side, beforeId) {
        assertKnown(id);
        if (!["left", "right"].includes(side))
          throw new TypeError("Panel side must be left or right");
        commit(
          model.movePanel(
            layout.getSnapshot(),
            id,
            side,
            beforeId,
            registry.getSnapshot(),
          ),
        );
        if (side === "right") {
          recover();
          setRightShown(true);
        }
        drag.set(null);
      }
      const service = createPanelService({
        registry,
        show,
        hide,
        move: (id, placement) => move(id, placement?.side, placement?.beforeId),
        snapshot: catalog,
      });
      ctx.effect(() => layout.subscribe(refreshCatalog), "panel catalog");
      ctx.effect(
        () => ctx.locale.subscribe(refreshCatalog),
        "panel catalog locale",
      );
      ctx.effect(
        () =>
          workspaceView.subscribe(() => {
            const { groupBy, orderBy, archiveFilter, collapsed } =
              workspaceView.getSnapshot();
            writeJSON(localStorage, VIEW_KEY, {
              groupBy,
              orderBy,
              archiveFilter,
              collapsed,
            });
          }),
        "workspace preferences",
      );
      const env = {
        ctx,
        t,
        Icon,
        useAtom,
        useCopy,
        atom: createStore,
        workspaceView,
        notice,
        current: (list) =>
          Object.values(list.byId).find(
            (row) => (row.retainedBy?.mainView || 0) > 0,
          ),
        fail: (error) => error?.message || error?.code || String(error),
      };
      registerWorkspace(React, env, service);
      registerFiles(React, env, service);
      registerTerminal(React, env, service);
      commit(model.normalizeLayout(savedLayout, registry.getSnapshot()));
      ctx.effect(
        () =>
          registry.subscribe(() => {
            commit(
              model.reconcileLayout(
                layout.getSnapshot(),
                registry.getSnapshot(),
              ),
            );
            refreshCatalog();
          }),
        "component registry projection",
      );

      // Both built-ins and external components use the identical registration path.
      ctx.provide("draggablePanels", service);
      const components = createDockComponents(React, {
        ...env,
        css:
          commonStyles +
          workspaceStyles +
          filesStyles +
          dockStyles +
          xtermStyles +
          terminalStyles,
        registry,
        titleOf,
        layout,
        nativeMode,
        nativeNotice,
        rightShown,
        drag,
        commit,
        move,
        show,
        hide,
        recover,
        toNative,
        dismissNativeNotice: () => nativeNotice.set(false),
        setRightShown,
        reset: () => {
          commit(model.createDefaultLayout(registry.getSnapshot()));
          recover();
        },
        setLeftExpansion: (fn) => {
          revealLeft = fn || (() => {});
        },
        visibleIds: (state, side) =>
          model.visiblePanelIds(state, side, registry.getSnapshot()),
        selectPanel: (state, side, id) =>
          model.selectPanel(state, side, id, registry.getSnapshot()),
        ...createPointerHelpers(),
      });
      registerSlots(ctx, nativeMode, components);
      ctx.effect(
        () => () => {
          components.dispose();
          registry.dispose();
          for (const store of [
            layout,
            nativeMode,
            nativeNotice,
            rightShown,
            drag,
            notice,
            workspaceView,
            catalog,
          ])
            store.clear();
        },
        "panel resources",
      );
    },
  };
}
