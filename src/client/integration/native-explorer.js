// TreePanel is the unmodified, MIT-licensed Better Sidebar 0.25.0 component.
// This adapter owns only controlled expansion and public runtime bindings.
import { TreePanel } from "dsh-better-sidebar/src/client/TreePanel.tsx";
import {
  attachLocale,
  attachBetterLocale,
} from "dsh-better-sidebar/src/client/locales.ts";
import { createOpenInApp } from "dsh-better-sidebar/src/client/open-in-app.ts";
import { referenceInChat } from "dsh-better-sidebar/src/client/reference-in-chat.ts";
import { api } from "dsh-better-sidebar/src/client/api.ts";
import {
  parseOpenWithConfig,
  resolveOpenWithTargets,
  openWithSshActive,
  openWithUrl,
} from "dsh-better-sidebar/src/client/open-with.ts";

const EMPTY = Object.freeze({});
const EMPTY_PATHS = Object.freeze([]);
const noopSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;

function optionalService(ctx, name) {
  try {
    return ctx?.get?.(name);
  } catch {
    return undefined;
  }
}

/**
 * @param {object} React The host's opaque React export (never a bundled copy).
 * @param {object} env Runtime {ctx,t,useAtom,atom}; the last three are accepted
 *   for consistency with other panel factories but TreePanel does not need them.
 *   Optional onPathRenamed(scope,oldPath,newPath), onPathDeleted(scope,path,isDir)
 *   and onToggleOpenWithPin(scope,id) bridge capabilities not publicly writable
 *   through BetterSidebarService. No synthetic SidebarStore is constructed.
 * @returns {Function} NativeExplorer({scope:{sessionId,cwd},service,visible=true})
 */
export function createNativeExplorer(React, env) {
  const { ctx } = env;
  const locale = optionalService(ctx, "locale");
  const betterLocale = optionalService(ctx, "betterLocale");
  attachLocale(locale);
  attachBetterLocale(betterLocale);
  const openInApp = createOpenInApp(ctx);
  // Expansion survives a scope switch, but never crosses session/cwd boundaries.
  // Search, selection, directory caches and uploads belong to the keyed subtree.
  const expansions = new Map();

  function ScopedExplorer({ scope, service, visible, scopeKey }) {
    const [expanded, setExpanded] = React.useState(
      () => expansions.get(scopeKey) ?? [],
    );
    const subscribe = React.useCallback(
      (notify) => service?.subscribeState?.(notify) ?? noopSubscribe(),
      [service],
    );
    const getPrefs = React.useCallback(
      () => service?.getSnapshot?.()?.prefs ?? EMPTY,
      [service],
    );
    const prefs = React.useSyncExternalStore(
      subscribe,
      getPrefs,
      emptySnapshot,
    );
    // Subscribe to native locale changes without modifying the registered namespace.
    const [, renderLocale] = React.useState(0);
    React.useEffect(() => {
      const rerender = () => renderLocale((value) => value + 1);
      const off = locale?.subscribe?.(rerender);
      const offBetter = betterLocale?.subscribe?.(rerender);
      return () => {
        off?.();
        offBetter?.();
      };
    }, []);
    const editor = prefs.pluginSettings?.editor ?? EMPTY;
    const config = React.useMemo(
      () => parseOpenWithConfig(editor.openWith),
      [editor],
    );
    const targets = React.useMemo(
      () => resolveOpenWithTargets(config),
      [config],
    );
    const onToggle = React.useCallback(
      (path) => {
        setExpanded((paths) => {
          const next = paths.includes(path)
            ? paths.filter((item) => item !== path)
            : [...paths, path];
          expansions.set(scopeKey, next);
          return next;
        });
      },
      [scopeKey],
    );
    const openFile = (path) => service.openFile(scope, path);
    const onOpenWith = async (id, path) => {
      const target = targets.find((item) => item.id === id);
      if (!target) return false;
      const url =
        target.kind === "reveal"
          ? undefined
          : openWithUrl(target, path, config);
      if (target.kind !== "reveal" && url === undefined) return false;
      try {
        await api.openExternal(
          target.kind === "reveal"
            ? { action: "reveal", path }
            : { action: "url", url },
        );
        return true;
      } catch {
        return false;
      }
    };
    // Bubble-phase shielding lets the original tree drop handler run first,
    // then stops OS file drops from also reaching the conversation composer.
    const shieldFiles = (event) => {
      if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    return React.createElement(
      "div",
      {
        className: "dsh-native-explorer",
        style: {
          display: "flex",
          flex: "1 1 auto",
          minWidth: 0,
          minHeight: 0,
          height: "100%",
          overflow: "hidden",
          position: "relative",
        },
        onDragOver: shieldFiles,
        onDrop: shieldFiles,
      },
      React.createElement(TreePanel, {
        sessionId: scope.sessionId,
        cwd: scope.cwd,
        expanded,
        revealed: EMPTY_PATHS,
        onToggle,
        onOpenFile: openFile,
        onOpenFileNewTab: openFile,
        onOpenFileSide:
          typeof service.openTab === "function"
            ? (path) =>
                service.openTab({ type: "editor", path, target: "side" }, scope)
            : undefined,
        onReferenceFile: (path, isDir) =>
          referenceInChat(ctx, scope.sessionId, path, isDir),
        exclude: prefs.explorerExclude,
        openInApp,
        openWithTargets: targets,
        openWithPinned: config.pinned,
        openWithSsh: openWithSshActive(config),
        openWithShowPluginTargets: editor.openWithPluginTargets === true,
        onOpenWith,
        onToggleOpenWithPin: env.onToggleOpenWithPin
          ? (id) => env.onToggleOpenWithPin(scope, id)
          : undefined,
        onPathRenamed: env.onPathRenamed
          ? (oldPath, newPath) => env.onPathRenamed(scope, oldPath, newPath)
          : undefined,
        onPathDeleted: env.onPathDeleted
          ? (path, isDir) => env.onPathDeleted(scope, path, isDir)
          : undefined,
        full: true,
        visible,
        service,
      }),
    );
  }

  return function NativeExplorer({ scope, service, visible = true }) {
    if (!scope?.sessionId || typeof service?.openFile !== "function")
      return null;
    const scopeKey = JSON.stringify([scope.sessionId, scope.cwd ?? null]);
    return React.createElement(ScopedExplorer, {
      key: scopeKey,
      scopeKey,
      scope,
      service,
      visible,
    });
  };
}
