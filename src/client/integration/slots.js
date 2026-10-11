/** Keep native occupants registered and only shadow them while dock mode is on. */
export function registerSlots(ctx, nativeMode, components) {
  function replace(name, Component) {
    ctx.slots.inject(name, () => {
      let remove;
      const sync = () => {
        if (nativeMode.getSnapshot()) {
          remove?.();
          remove = undefined;
        } else if (!remove)
          remove = ctx.slots.register({ name, priority: -100 }, Component);
      };
      sync();
      const off = nativeMode.subscribe(sync);
      return () => {
        off();
        remove?.();
      };
    });
  }
  replace("sidebar.workspaces", components.Left);
  replace("rightbar", components.Right);
  replace("conversation.session.header.corner", components.HeaderCorner);
  ctx.slots.inject("sidebar.footer.action", () =>
    ctx.slots.register(
      {
        name: "sidebar.footer.action",
        id: "local-draggable-panels-controls",
        order: 30,
      },
      components.Tools,
    ),
  );
  ctx.slots.inject("shell.overlay", () =>
    ctx.slots.register(
      { name: "shell.overlay", id: "local-draggable-panels-style", order: 30 },
      components.Overlay,
    ),
  );
}
