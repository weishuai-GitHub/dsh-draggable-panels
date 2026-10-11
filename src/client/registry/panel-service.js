/** Public API: the registering plugin's Context owns every contribution. */
export function createPanelService({ registry, show, hide, move, snapshot }) {
  function register(owner, descriptor) {
    if (!owner || typeof owner.effect !== "function")
      throw new TypeError(
        "register(ctx, descriptor) requires the registering plugin Context",
      );
    const dispose = owner.effect(
      () => {
        const registration = registry.register(descriptor);
        return () => registration.dispose();
      },
      `draggablePanels:${descriptor?.id || "invalid"}`,
    );
    return Object.freeze({ dispose });
  }
  return Object.freeze({
    version: 1,
    register,
    show,
    hide,
    move,
    getSnapshot: snapshot.getSnapshot,
    subscribe: snapshot.subscribe,
    forContext(owner) {
      if (!owner || typeof owner.effect !== "function")
        throw new TypeError("A plugin Context is required");
      return Object.freeze({
        register: (descriptor) => register(owner, descriptor),
        show,
        hide,
        move,
        getSnapshot: snapshot.getSnapshot,
        subscribe: snapshot.subscribe,
      });
    },
  });
}
