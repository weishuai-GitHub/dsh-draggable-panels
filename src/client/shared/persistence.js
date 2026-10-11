export const LAYOUT_KEY = "local.draggable-panels.layout.v4";
export const LEGACY_LAYOUT_KEY = "local.draggable-panels.layout.v3";
export const VISIBILITY_KEY = "local.draggable-panels.right-visible.v3";
export const VIEW_KEY = "local.draggable-panels.workspace-view.v1";
export function readJSON(storage, key, fallback = null) {
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
export function writeJSON(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function readLayout(storage) {
  return readJSON(storage, LAYOUT_KEY, readJSON(storage, LEGACY_LAYOUT_KEY));
}
export function readWorkspaceView(storage) {
  const value = readJSON(storage, VIEW_KEY, {});
  const saved =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    query: "",
    scroll: 0,
    collapsed:
      saved.collapsed &&
      typeof saved.collapsed === "object" &&
      !Array.isArray(saved.collapsed)
        ? saved.collapsed
        : {},
    groupBy: ["workspace", "workspace-tree", "flat"].includes(saved.groupBy)
      ? saved.groupBy
      : "workspace",
    orderBy: saved.orderBy === "manual" ? "manual" : "updated",
    archiveFilter: ["default", "show", "only"].includes(saved.archiveFilter)
      ? saved.archiveFilter
      : "default",
  };
}
