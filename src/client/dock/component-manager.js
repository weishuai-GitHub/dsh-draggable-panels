export function createComponentManager(
  React,
  { env, useCopy, useAtom, layout, manager, panelIcon, show, Icon },
) {
  const h = React.createElement;
  function Manager() {
    const tt = useCopy();
    const entries = useAtom(env.registry);
    const value = useAtom(layout);
    const root = React.useRef(null);
    React.useEffect(() => {
      const previous = document.activeElement;
      root.current?.querySelector("button")?.focus();
      return () => {
        if (previous?.isConnected) previous.focus();
      };
    }, []);
    function keys(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        manager.set(false);
      }
      if (e.key === "Tab") {
        const nodes = [
          ...root.current.querySelectorAll(
            "button:not(:disabled), input:not(:disabled)",
          ),
        ];
        const index = nodes.indexOf(e.target);
        if (
          (!e.shiftKey && index === nodes.length - 1) ||
          (e.shiftKey && index <= 0)
        ) {
          e.preventDefault();
          nodes[e.shiftKey ? nodes.length - 1 : 0]?.focus();
        }
      }
    }
    return h(
      "div",
      {
        className: "dpd-manager-backdrop",
        onKeyDown: keys,
        onPointerDown: (e) => {
          if (e.target === e.currentTarget) manager.set(false);
        },
      },
      h(
        "section",
        {
          className: "dpd-manager",
          role: "dialog",
          "aria-modal": true,
          "aria-label": tt("manageComponents"),
          ref: root,
        },
        h(
          "header",
          null,
          h("strong", null, tt("manageComponents")),
          h(
            "button",
            {
              type: "button",
              onClick: () => manager.set(false),
              "aria-label": tt("close"),
            },
            h(Icon, { kind: "close" }),
          ),
        ),
        entries.map((entry) =>
          h(
            "label",
            { key: entry.id, className: "dpd-manager-row" },
            h("input", {
              type: "checkbox",
              checked: !value.hidden.includes(entry.id),
              "aria-label": env.titleOf(entry),
              "data-panel-id": entry.id,
              onChange: (event) => {
                if (event.target.checked) show(entry.id);
                else env.hide(entry.id);
              },
            }),
            panelIcon(entry),
            h("span", null, env.titleOf(entry)),
          ),
        ),
        !entries.length ? h("p", null, tt("noComponents")) : null,
      ),
    );
  }
  return Manager;
}
