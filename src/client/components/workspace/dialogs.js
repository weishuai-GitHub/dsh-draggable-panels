export function createWorkspaceDialog(React, { useCopy, ctx, fail, actions }) {
  const h = React.createElement;
  function WorkspaceDialog({ request, close }) {
    const tt = useCopy();
    const root = React.useRef(null);
    const locked = React.useRef(false);
    const alive = React.useRef(true);
    const [value, setValue] = React.useState(
      request.kind === "rename"
        ? request.group.title || ""
        : request.kind === "sessionRename"
          ? request.session.title || ""
          : "",
    );
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    React.useLayoutEffect(() => {
      alive.current = true;
      root.current?.querySelector("input,button")?.focus();
      return () => {
        alive.current = false;
      };
    }, []);
    async function perform(operation, done) {
      if (locked.current) return;
      locked.current = true;
      setBusy(true);
      setError("");
      try {
        const result = await operation();
        if (alive.current) done?.(result);
      } catch (e) {
        if (alive.current && e?.name !== "AbortError")
          setError(e?.message?.startsWith("wk.") ? tt(e.message) : fail(e));
      } finally {
        locked.current = false;
        if (alive.current) setBusy(false);
      }
    }

    function keydown(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        if (!locked.current) close();
      }
      if (e.key === "Tab") {
        const nodes = [
          ...root.current.querySelectorAll(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ),
        ];
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!nodes.length) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && e.target === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && e.target === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    const title = tt(
      request.kind === "rename" || request.kind === "sessionRename"
        ? "wk.rename"
        : "wk.delete",
    );
    function submit(e) {
      e.preventDefault();
      perform(() => {
        if (
          request.kind === "rename" &&
          request.others.some(
            (other) =>
              other.workspaceId !== request.group.workspaceId &&
              other.title === value.trim(),
          )
        )
          throw new Error("wk.duplicate");
        return request.kind === "rename"
          ? actions.rename(request.group.workspaceId, value)
          : request.kind === "sessionRename"
            ? actions.renameSession(request.session.id, value)
            : actions.remove(request.group.workspaceId);
      }, close);
    }
    return h(
      "div",
      { className: "dpw-modal", onKeyDown: keydown },
      h(
        "form",
        {
          className: "dpw-dialog",
          ref: root,
          role: "dialog",
          "aria-modal": true,
          "aria-label": title,
          onSubmit: submit,
        },
        h("h3", null, title),
        request.kind === "delete"
          ? h(
              React.Fragment,
              null,
              h("p", null, request.group.title || request.group.path),
              h("p", null, tt("wk.removeNote")),
            )
          : h(
              "label",
              null,
              tt(
                request.kind === "sessionRename" ? "wk.sessionName" : "wk.name",
              ),
              h("input", {
                value,
                disabled: busy,
                required: true,
                onChange: (e) => setValue(e.target.value),
              }),
            ),
        error
          ? h("div", { className: "dpw-error", role: "alert" }, error)
          : null,
        h(
          "div",
          { className: "dpw-controls" },
          h(
            "button",
            { type: "button", disabled: busy, onClick: close },
            tt("wk.cancel"),
          ),
          h(
            "button",
            { type: "submit", disabled: busy },
            busy
              ? tt("wk.loading")
              : tt(
                  request.kind === "rename" || request.kind === "sessionRename"
                    ? "wk.save"
                    : "wk.confirm",
                ),
          ),
        ),
      ),
    );
  }

  return WorkspaceDialog;
}
