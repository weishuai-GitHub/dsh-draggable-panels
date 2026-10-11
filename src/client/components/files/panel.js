import { createFilesStore } from "./store.js";
import { fileLanguage, highlightCode, renderMarkdown } from "./render.js";
import styles from "./styles.css";

import { createFileTabs } from "./tabs.js";
export function createFilesComponent(
  React,
  { ctx, atom, current, useCopy, useAtom, Icon },
) {
  const h = React.createElement;
  const { cacheFor, loadDirectory, previewFile, dispose } = createFilesStore(
    ctx,
    atom,
  );
  const navigation = new Map();
  const tabs = createFileTabs({
    atom,
    read: previewFile,
    register(doc) {
      return ctx.slots.inject("conversation.view", () =>
        ctx.slots.register(
          {
            name: "conversation.view",
            id: doc.id,
            order: 20,
            label: doc.path.split(/[/\\]/).pop(),
          },
          (props) => h(DocumentView, { ...props, doc }),
        ),
      );
    },
  });
  function openFile(_cache, sessionId, path) {
    const doc = tabs.open(sessionId, path);
    navigation.get(sessionId)?.(doc.id, "");
  }
  function SessionTabs(props) {
    const list = props.useSessions((s) => s);
    const sessionId = current(list)?.id;
    React.useLayoutEffect(() => tabs.selectSession(sessionId), [sessionId]);
    return null;
  }
  function DocumentView({ doc, sessionId, openView }) {
    const tt = useCopy();
    React.useEffect(() => {
      navigation.set(sessionId, openView);
      return () => {
        if (navigation.get(sessionId) === openView)
          navigation.delete(sessionId);
      };
    }, [sessionId, openView]);
    if (doc.sessionId !== sessionId) return null;
    return h(
      "section",
      { className: "dpd-file-main" },
      h("style", null, styles),
      h(
        "div",
        {
          className: "dpd-document-actions",
          role: "toolbar",
          "aria-label": doc.path,
        },
        h(
          "button",
          { type: "button", onClick: () => openView("chat", "") },
          tt("backToChat"),
        ),
        h(
          "button",
          {
            "aria-label": `${tt("close")} ${doc.path}`,
            onClick: () => {
              tabs.close(doc);
            },
          },
          tt("close"),
        ),
      ),
      h(FilePreview, { cache: doc.cache, sessionId, key: doc.id }),
    );
  }
  function FilePreview({ cache, sessionId }) {
    const { preview: p } = useAtom(cache);
    const tt = useCopy();
    const [source, setSource] = React.useState(false);
    React.useEffect(() => setSource(false), [p?.path]);
    const language = fileLanguage(p?.path);
    const html = React.useMemo(
      () =>
        language === "markdown" && !source
          ? renderMarkdown(p?.text || "")
          : highlightCode(p?.text || "", language),
      [p?.text, language, source],
    );
    if (!p) return null;
    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "dpd-filebar" },
        h("span", { className: "dpd-path", title: p.path }, p.path),
        language === "markdown"
          ? h(
              "button",
              { "aria-pressed": source, onClick: () => setSource(!source) },
              tt(source ? "rendered" : "source"),
            )
          : null,
        h(
          "button",
          {
            disabled: p.loading,
            onClick: () => previewFile(cache, sessionId, p.path),
          },
          tt("refresh"),
        ),
      ),
      h(
        "div",
        { className: "dpd-file-content", key: p.path },
        p.error
          ? h(
              "div",
              { className: "dpd-message dpd-error", role: "alert" },
              p.error,
              h("p", null, tt("fileLimit")),
            )
          : null,
        language === "markdown" && !source
          ? h("article", {
              className: "dpd-markdown",
              dangerouslySetInnerHTML: { __html: html },
            })
          : h(
              "pre",
              { className: "dpd-preview" },
              h("code", { dangerouslySetInnerHTML: { __html: html } }),
            ),
        p.loading
          ? h(
              "div",
              { className: "dpd-message", role: "status" },
              tt("loading"),
            )
          : !p.eof && !p.error
            ? h(
                "button",
                { onClick: () => previewFile(cache, sessionId, p.path, true) },
                tt("more"),
              )
            : null,
      ),
    );
  }
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
  function OpenFiles({ sessionId }) {
    const docs = useAtom(tabs.snapshot).filter(
      (doc) => doc.sessionId === sessionId,
    );
    const tt = useCopy();
    if (!docs.length) return null;
    return h(
      "div",
      { className: "dpd-open-files" },
      docs.map((doc) =>
        h(
          "div",
          { className: "dpd-open-file", key: doc.id },
          h("span", { title: doc.path }, doc.path.split(/[/\\]/).pop()),
          h(
            "button",
            {
              type: "button",
              title: `${tt("close")} ${doc.path}`,
              "aria-label": `${tt("close")} ${doc.path}`,
              onClick: () => tabs.close(doc),
            },
            "×",
          ),
        ),
      ),
    );
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
    }, [cache]);
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
                  directory ? toggle(child) : openFile(cache, sessionId, child),
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
    return h(
      React.Fragment,
      null,
      h(OpenFiles, { sessionId }),
      h(
        "div",
        { className: "dpd-filebar" },
        h("span", { className: "dpd-path", title: root }, root),
        h(
          "button",
          {
            title: tt("refresh"),
            "aria-label": tt("refresh"),
            onClick: () => {
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
            cache.set({
              ...cache.getSnapshot(),
              scroll: e.currentTarget.scrollTop,
            });
          },
        },
        level(root, 0),
      ),
    );
  }

  return {
    FilesPanel,
    SessionTabs,
    dispose() {
      tabs.dispose();
      navigation.clear();
      dispose();
    },
  };
}
