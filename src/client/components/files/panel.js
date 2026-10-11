import { createFilesStore } from "./store.js";
export function createFilesComponent(
  React,
  { ctx, atom, current, useCopy, useAtom, Icon },
) {
  const h = React.createElement;
  const { cacheFor, loadDirectory, previewFile, dispose } = createFilesStore(
    ctx,
    atom,
  );
  function FilesPanel(props) {
    const list = props.useSessions((s) => s);
    const session = props.sessionId
      ? list.byId[props.sessionId]
      : current(list);
    const tt = useCopy();
    if (!session?.cwd)
      return h("div", { className: "dpd-message" }, tt("noRoot"));
    return h(FileTree, {
      key: `${session.id}\n${session.cwd}`,
      sessionId: session.id,
      root: session.cwd,
      cache: cacheFor(session.id, session.cwd),
    });
  }
  function FileTree({ sessionId, root, cache }) {
    const tt = useCopy();
    const state = useAtom(cache);
    const scrollRef = React.useRef(null);
    React.useEffect(() => {
      if (!cache.getSnapshot().levels[root])
        loadDirectory(cache, sessionId, root);
    }, [cache, sessionId, root]);
    React.useLayoutEffect(() => {
      if (scrollRef.current)
        scrollRef.current.scrollTop = cache.getSnapshot().scroll;
    }, [cache, !!state.preview]);
    function toggle(path) {
      const v = cache.getSnapshot();
      const open = !v.expanded[path];
      cache.set({ ...v, expanded: { ...v.expanded, [path]: open } });
      if (open) loadDirectory(cache, sessionId, path);
    }
    function level(path, depth) {
      const data = state.levels[path];
      if (!data || (data.loading && !data.entries))
        return h("div", { className: "dpd-message", key: path }, tt("loading"));
      if (data.error)
        return h(
          "div",
          { className: "dpd-message dpd-error", key: path },
          data.error,
          h(
            "button",
            { onClick: () => loadDirectory(cache, sessionId, path) },
            tt("retry"),
          ),
        );
      const entries = [...(data.entries || [])].sort(
        (a, b) =>
          (a.type === "directory" ? 0 : 1) - (b.type === "directory" ? 0 : 1) ||
          a.name.localeCompare(b.name, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
      );
      return h(
        React.Fragment,
        { key: path },
        entries.map((e) => {
          const child = `${path.replace(/[/\\]+$/, "")}/${e.name}`;
          const directory = e.type === "directory";
          return h(
            React.Fragment,
            { key: child },
            h(
              "button",
              {
                className: "dpd-entry",
                style: { paddingInlineStart: `${8 + depth * 14}px` },
                disabled: e.type === "other",
                title: child,
                "aria-expanded": directory
                  ? !!state.expanded[child]
                  : undefined,
                onClick: () =>
                  directory
                    ? toggle(child)
                    : previewFile(cache, sessionId, child),
              },
              h(Icon, {
                kind: directory
                  ? state.expanded[child]
                    ? "chevronDown"
                    : "chevronRight"
                  : "file",
                size: directory ? 11 : 15,
              }),
              directory
                ? h(Icon, {
                    kind: state.expanded[child] ? "folderOpen" : "folder",
                    size: 15,
                  })
                : null,
              h("span", null, e.name),
            ),
            directory && state.expanded[child] ? level(child, depth + 1) : null,
          );
        }),
        !entries.length && !data.loading
          ? h("div", { className: "dpd-message" }, tt("emptyDir"))
          : null,
        data.truncated
          ? h("div", { className: "dpd-message" }, tt("truncated"))
          : null,
      );
    }
    const p = state.preview;
    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "dpd-filebar" },
        p
          ? h(
              "button",
              {
                title: tt("back"),
                "aria-label": tt("back"),
                onClick: () =>
                  cache.set({ ...cache.getSnapshot(), preview: null }),
              },
              h(Icon, { kind: "back" }),
            )
          : null,
        h(
          "span",
          { className: "dpd-path", title: p?.path || root },
          p?.path || root,
        ),
        h(
          "button",
          {
            title: tt("refresh"),
            "aria-label": tt("refresh"),
            onClick: () => {
              if (p) previewFile(cache, sessionId, p.path);
              else
                for (const path of Object.keys(state.expanded).filter(
                  (x) => state.expanded[x],
                ))
                  loadDirectory(cache, sessionId, path);
            },
          },
          h(Icon, { kind: "refresh" }),
        ),
      ),
      h(
        "div",
        {
          className: "dpd-scroll",
          ref: scrollRef,
          onScroll: (e) => {
            if (!p)
              cache.set({
                ...cache.getSnapshot(),
                scroll: e.currentTarget.scrollTop,
              });
          },
        },
        p
          ? h(
              React.Fragment,
              null,
              p.error
                ? h(
                    "div",
                    { className: "dpd-message dpd-error" },
                    p.error,
                    h("p", null, tt("fileLimit")),
                  )
                : null,
              h("pre", { className: "dpd-preview" }, p.text || ""),
              p.loading
                ? h("div", { className: "dpd-message" }, tt("loading"))
                : !p.eof && !p.error
                  ? h(
                      "button",
                      {
                        onClick: () =>
                          previewFile(cache, sessionId, p.path, true),
                      },
                      tt("more"),
                    )
                  : null,
            )
          : level(root, 0),
      ),
    );
  }

  return { FilesPanel, dispose };
}
