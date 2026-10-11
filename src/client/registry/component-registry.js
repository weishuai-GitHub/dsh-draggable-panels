/** Pure component registry. No React or runtime dependency is required. */
function validateDescriptor(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Component descriptor must be an object");
  }
  const { id, title, component, icon, defaultPlacement, integratedHeader } =
    value;
  if (typeof id !== "string" || !id.trim())
    throw new TypeError("Component id must be a non-empty string");
  if (typeof title !== "string" && typeof title !== "function")
    throw new TypeError("Component title must be a string or function");
  // Class components are functions too; never instantiate or call user components here.
  if (typeof component !== "function")
    throw new TypeError("Component must be a function or class");
  if (icon !== undefined && typeof icon !== "function")
    throw new TypeError("Component icon must be a function or class");
  if (
    !defaultPlacement ||
    typeof defaultPlacement !== "object" ||
    !["left", "right"].includes(defaultPlacement.side) ||
    !Number.isFinite(defaultPlacement.order) ||
    typeof defaultPlacement.visible !== "boolean"
  ) {
    throw new TypeError(
      "defaultPlacement requires side (left/right), finite order, and boolean visible",
    );
  }
  if (integratedHeader !== undefined && typeof integratedHeader !== "boolean") {
    throw new TypeError("integratedHeader must be a boolean");
  }
  return Object.freeze({
    id,
    title,
    component,
    ...(icon === undefined ? {} : { icon }),
    defaultPlacement: Object.freeze({
      side: defaultPlacement.side,
      order: defaultPlacement.order,
      visible: defaultPlacement.visible,
    }),
    ...(integratedHeader === undefined ? {} : { integratedHeader }),
  });
}

/**
 * register(descriptor) -> { dispose() }; duplicate IDs throw, including identical values.
 * getSnapshot() -> immutable descriptor array in registration order. Its identity changes
 * only on membership changes, making subscribe/getSnapshot useSyncExternalStore-ready.
 * dispose() permanently closes this registry; outstanding handles remain safe to dispose.
 * Descriptors are copied/frozen; function references remain opaque and are not frozen.
 */
export function createComponentRegistry() {
  const entries = new Map();
  const listeners = new Set();
  let snapshot = Object.freeze([]);
  let closed = false;
  function publish() {
    snapshot = Object.freeze([...entries.values()]);
    for (const listener of [...listeners]) listener();
  }
  const getSnapshot = () => snapshot;
  const subscribe = (listener) => {
    if (typeof listener !== "function")
      throw new TypeError("Subscriber must be a function");
    if (closed) return () => {};
    // Each subscription is independent, even if the callback is shared.
    const entry = () => listener();
    listeners.add(entry);
    return () => {
      listeners.delete(entry);
    };
  };
  function register(value) {
    if (closed) throw new Error("Component registry is disposed");
    const descriptor = validateDescriptor(value);
    if (entries.has(descriptor.id))
      throw new Error(`Duplicate component id: ${descriptor.id}`);
    entries.set(descriptor.id, descriptor);
    publish();
    let disposed = false;
    return Object.freeze({
      dispose() {
        if (disposed) return;
        disposed = true;
        if (entries.get(descriptor.id) !== descriptor) return;
        entries.delete(descriptor.id);
        publish();
      },
    });
  }
  function dispose() {
    if (closed) return;
    closed = true;
    try {
      if (entries.size) {
        entries.clear();
        publish();
      }
    } finally {
      listeners.clear();
    }
  }
  return Object.freeze({ register, getSnapshot, subscribe, dispose });
}
