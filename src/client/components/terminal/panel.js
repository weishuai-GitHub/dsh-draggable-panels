let screenModule;
export function createTerminalPanel(React, env, store) {
  const h = React.createElement;
  const { ctx, useCopy, useAtom, current, Icon, fail } = env;
  const themeSource = {
    getSnapshot: () => ctx.theme.getTheme(),
    subscribe: (fn) => ctx.on("theme/change", fn),
  };
  function ScreenLoader(props) {
    const [screen, setScreen] = React.useState(null);
    const [error, setError] = React.useState("");
    React.useEffect(() => {
      let mounted = true;
      screenModule ??= import("./screen.js");
      screenModule.then(
        (module) => {
          if (mounted) setScreen(() => module.createTerminalScreen(React));
        },
        (e) => {
          if (mounted) setError(fail(e));
        },
      );
      return () => {
        mounted = false;
      };
    }, []);
    if (error) return h("p", { className: "dpd-error", role: "alert" }, error);
    return screen
      ? h(screen, props)
      : h("p", { className: "dpd-message" }, props.loading);
  }
  function View({ entry, active }) {
    const tt = useCopy();
    const state = useAtom(entry.model.state);
    const theme = useAtom(themeSource);
    return h(
      "div",
      { className: "dpd-terminal-view" },
      state.error
        ? h(
            "div",
            { className: "dpd-terminal-status dpd-error", role: "alert" },
            state.error,
          )
        : null,
      state.info?.state === "exited"
        ? h(
            "div",
            { className: "dpd-terminal-status", role: "status" },
            `${tt("term.exited")} (${state.info.exitCode ?? "—"})`,
          )
        : null,
      !state.writable && state.phase === "connected"
        ? h(
            "div",
            { className: "dpd-terminal-status" },
            tt("term.readonly"),
            h(
              "button",
              { type: "button", onClick: () => entry.model.connect() },
              tt("term.control"),
            ),
          )
        : null,
      ["disconnected", "failed"].includes(state.phase)
        ? h(
            "div",
            { className: "dpd-terminal-status" },
            h(
              "button",
              { type: "button", onClick: () => entry.model.refresh() },
              tt("retry"),
            ),
          )
        : null,
      ["loading", "creating", "connecting"].includes(state.phase)
        ? h(
            "div",
            { className: "dpd-terminal-status", role: "status" },
            tt("term.loading"),
          )
        : null,
      h(ScreenLoader, {
        model: entry.model,
        active,
        theme,
        label: `${tt("terminal")}: ${state.title || entry.title}`,
        loading: tt("term.loading"),
      }),
    );
  }
  function SessionTerminal({ sessionId, cwd, active }) {
    const tt = useCopy();
    const snapshot = useAtom(store);
    const session = snapshot.sessions[sessionId];
    const entries = session?.entries || [];
    const [shells, setShells] = React.useState([]);
    const [shell, setShell] = React.useState("");
    const [error, setError] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    React.useEffect(() => {
      const controller = new AbortController();
      ctx.webTerminals.launchShells(sessionId, controller.signal).then(
        (value) => {
          if (!controller.signal.aborted) {
            setShells(value.shells);
            setShell(value.selectedShell || "");
          }
        },
        (e) => {
          if (!controller.signal.aborted) setError(fail(e));
        },
      );
      return () => controller.abort();
    }, [sessionId]);
    async function run(fn) {
      if (busy) return;
      setBusy(true);
      setError("");
      try {
        await fn();
      } catch (e) {
        setError(fail(e));
      } finally {
        setBusy(false);
      }
    }
    function start(path) {
      return run(() => {
        if (path) ctx.webTerminals.selectShell(path);
        store.start(sessionId, path || undefined);
      });
    }
    return h(
      "div",
      { className: "dpd-terminal" },
      h(
        "div",
        { className: "dpd-terminal-toolbar" },
        h(
          "div",
          {
            className: "dpd-terminal-tabs",
            role: "tablist",
            "aria-label": tt("terminal"),
          },
          entries.map((entry, index) => {
            const name = `${entry.state?.title || entry.title} ${index + 1}`;
            return h(
              "div",
              {
                key: entry.id,
                className: "dpd-terminal-tab",
                "data-selected": entry.id === session.selected ? "" : undefined,
              },
              h(
                "button",
                {
                  type: "button",
                  role: "tab",
                  "aria-selected": entry.id === session.selected,
                  onClick: () => store.select(sessionId, entry.id),
                  title: name,
                },
                h(Icon, { kind: "terminal", size: 14 }),
                name,
              ),
              h(
                "button",
                {
                  type: "button",
                  disabled: busy,
                  title: `${tt("term.end")}: ${name}`,
                  "aria-label": `${tt("term.end")}: ${name}`,
                  "data-terminal-close": entry.id,
                  onClick: () =>
                    run(async () => {
                      if ((await store.close(sessionId, entry.id)) === false)
                        throw new Error(tt("term.closeFailed"));
                    }),
                },
                h(Icon, { kind: "close", size: 14 }),
              ),
            );
          }),
        ),
        h(
          "details",
          {
            className: "dpd-terminal-launch",
            "data-empty": !entries.length ? "" : undefined,
            onKeyDown: (event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            },
            onBlur: (event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                event.currentTarget.open = false;
            },
          },
          h(
            "summary",
            {
              title: tt("term.new"),
              "aria-label": tt("term.new"),
              "aria-haspopup": "menu",
            },
            h(Icon, { kind: "plus", size: 16 }),
          ),
          h(
            "div",
            {
              className: "dpd-terminal-shell-menu",
              // Safari does not focus clicked buttons. Keep the summary focused
              // until click runs, otherwise details.onBlur hides the option first.
              onPointerDown: (event) => {
                if (event.button === 0) event.preventDefault();
              },
              role: "menu",
              "aria-label": tt("term.shell"),
            },
            h(
              "button",
              {
                type: "button",
                role: "menuitem",
                disabled: busy,
                onClick: (event) => {
                  event.currentTarget.closest("details").open = false;
                  return start(shell);
                },
              },
              tt("term.defaultShell"),
            ),
            shells.map((item) =>
              h(
                "button",
                {
                  type: "button",
                  key: item.path,
                  role: "menuitem",
                  disabled: busy,
                  "data-shell-path": item.path,
                  onClick: (event) => {
                    event.currentTarget.closest("details").open = false;
                    return start(item.path);
                  },
                },
                item.name,
              ),
            ),
          ),
        ),
      ),
      error || snapshot.error
        ? h(
            "p",
            { className: "dpd-error dpd-terminal-status", role: "alert" },
            error || snapshot.error,
          )
        : null,
      entries.length
        ? entries.map((entry) =>
            h(
              "div",
              {
                key: entry.id,
                className: "dpd-terminal-host",
                hidden: entry.id !== session.selected,
                style: {
                  display: entry.id === session.selected ? "flex" : "none",
                },
              },
              h(View, {
                entry,
                active: active && entry.id === session.selected,
              }),
            ),
          )
        : h(
            "div",
            { className: "dpd-terminal-empty" },
            h(Icon, { kind: "terminal", size: 32 }),
            h("p", null, tt("term.description")),
            h("small", null, cwd),
            h("small", null, tt("term.permissions")),
          ),
    );
  }
  return function TerminalPanel(props) {
    const list = props.useSessions((value) => value);
    const session = props.sessionId
      ? list.byId[props.sessionId]
      : current(list);
    const tt = useCopy();
    if (!session)
      return h("div", { className: "dpd-message" }, tt("term.noSession"));
    return h(SessionTerminal, {
      key: session.id,
      sessionId: session.id,
      cwd: session.cwd,
      active: props.isActive !== false,
    });
  };
}
