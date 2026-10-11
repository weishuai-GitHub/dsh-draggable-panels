export function createAnchoredMenu(React) {
  const h = React.createElement;
  function AnchoredMenu({ menu, close, children }) {
    const root = React.useRef(null);
    const [position, setPosition] = React.useState({
      left: menu.rect.left - 4,
      top: menu.rect.bottom + 4,
    });
    React.useLayoutEffect(() => {
      const node = root.current;
      if (!node) return;
      const own = node.getBoundingClientRect();
      setPosition({
        left: Math.max(
          8,
          Math.min(
            menu.kind === "view"
              ? menu.rect.right - own.width
              : menu.rect.left - 4,
            window.innerWidth - own.width - 8,
          ),
        ),
        top: Math.max(
          8,
          menu.rect.bottom + own.height + 4 > window.innerHeight
            ? menu.rect.top - own.height - 4
            : menu.rect.bottom + 4,
        ),
      });
      if (menu.keyboard) node.querySelector("button:not(:disabled)")?.focus();
      const outside = (e) => {
        if (!node.contains(e.target) && !menu.anchor?.contains(e.target))
          close(false);
      };
      const resize = () => close(false);
      window.addEventListener("pointerdown", outside, true);
      window.addEventListener("resize", resize);
      return () => {
        window.removeEventListener("pointerdown", outside, true);
        window.removeEventListener("resize", resize);
      };
    }, []);
    function keydown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      }
      if (e.key === "Tab") close(false);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const items = [
          ...root.current.querySelectorAll("button:not(:disabled)"),
        ];
        const index = items.indexOf(e.target);
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : (index + (e.key === "ArrowUp" ? -1 : 1) + items.length) %
                items.length;
        items[next]?.focus();
      }
    }
    return h(
      "div",
      {
        className: `dpw-popover${menu.kind === "view" ? " dpw-view-menu" : ""}`,
        ref: root,
        role: "menu",
        style: position,
        onKeyDown: keydown,
      },
      children,
    );
  }

  return AnchoredMenu;
}
