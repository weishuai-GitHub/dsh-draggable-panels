/** Preserve native surfaces when the enhanced file integration is available. */
export function registerSlots(ctx, nativeMode, components, nativeFiles) {
  function replace(name, Component, preserveNative = false) {
    ctx.slots.inject(name, () => {
      let remove;
      const sync = () => {
        if (
          nativeMode.getSnapshot() ||
          (preserveNative && nativeFiles?.available.getSnapshot())
        ) {
          remove?.();
          remove = undefined;
        } else if (!remove)
          remove = ctx.slots.register({ name, priority: -100 }, Component);
      };
      sync();
      const off = nativeMode.subscribe(sync);
      const offNative = nativeFiles?.available.subscribe(sync);
      return () => {
        off();
        offNative?.();
        remove?.();
      };
    });
  }
  replace("sidebar.workspaces", components.Left);
  replace("rightbar", components.Right, true);
  replace("conversation.session.header.corner", components.HeaderCorner, true);
  if (nativeFiles) {
    ctx.inject(["sidebarRightTabs"], (injected) => {
      injected.slots.inject("sidebar.right.pane.tab.title", () => {
        const titles = new Map();
        const sync = () => {
          const enabled =
            !nativeMode.getSnapshot() && nativeFiles.available.getSnapshot();
          const keys = new Set(
            enabled
              ? (
                  injected.sidebarRightTabs.entries?.() || [
                    injected.sidebarRightTabs.get("files"),
                  ]
                )
                  .filter(
                    (type) =>
                      type &&
                      (type.kind === "files" ||
                        type.id ===
                          injected.sidebarRightTabs.get("files")?.id ||
                        type.kind?.startsWith("local.draggablePanels:panel:")),
                  )
                  .map((type) => type.id)
              : [],
          );
          for (const [key, remove] of titles) {
            if (!keys.has(key)) {
              remove();
              titles.delete(key);
            }
          }
          for (const key of keys) {
            if (!titles.has(key))
              titles.set(
                key,
                injected.slots.register(
                  {
                    name: "sidebar.right.pane.tab.title",
                    key,
                    priority: -100,
                  },
                  components.NativeFileTitle,
                ),
              );
          }
        };
        const offs = [
          nativeMode,
          nativeFiles.available,
          injected.sidebarRightTabs,
        ].map((source) => source.subscribe(sync));
        sync();
        return () => {
          offs.forEach((off) => off());
          titles.forEach((remove) => remove());
        };
      });
    });
  }
  if (nativeFiles)
    ctx.slots.inject("sidebar.right.tab.menu.item", () =>
      ctx.slots.register(
        {
          name: "sidebar.right.tab.menu.item",
          id: "local-draggable-files-controls",
          order: 30,
        },
        components.NativeFileMenu,
      ),
    );
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
