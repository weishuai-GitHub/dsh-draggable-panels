/**
 * Pure, JSON-persistable dock model; no registry singleton or browser dependencies.
 * V2: { version: 2, left: string[], right: string[], hidden: string[],
 *       active: { left: string|null, right: string|null } }.
 * Side arrays retain hidden AND unregistered IDs in their saved order. `hidden` is
 * an explicit preference, not a list of missing extensions. Rendering must use
 * visiblePanelIds(), not raw side arrays. Legacy V1/unversioned layouts migrate
 * without renaming workspaces/files or discarding extension IDs.
 * Pass registry.getSnapshot() as the final descriptors argument to every operation.
 * Functions never mutate inputs. Reconcile and invalid/no-op actions preserve the
 * input reference when already normalized. normalizeLayout always returns a copy.
 */
const SIDES = ["left", "right"];
const isId = (id) => typeof id === "string" && id.trim().length > 0;
const isSide = (side) => SIDES.includes(side);
const uniqueIds = (value) =>
  Array.isArray(value) ? [...new Set(value.filter(isId))] : [];
const descriptorMap = (descriptors) =>
  new Map(descriptors.map((entry) => [entry.id, entry]));
const isLayout = (layout) =>
  layout?.version === 2 &&
  Array.isArray(layout.left) &&
  Array.isArray(layout.right) &&
  Array.isArray(layout.hidden) &&
  layout.active &&
  typeof layout.active === "object";

/** Visible and currently registered IDs, in persisted dock order. */
export function visiblePanelIds(layout, side, descriptors = []) {
  if (!isSide(side) || !Array.isArray(layout?.[side])) return [];
  const registered = descriptorMap(descriptors);
  const hidden = new Set(layout.hidden ?? []);
  return layout[side].filter((id) => registered.has(id) && !hidden.has(id));
}

function repairActive(layout, descriptors) {
  for (const side of SIDES) {
    const visible = visiblePanelIds(layout, side, descriptors);
    if (!visible.includes(layout.active[side]))
      layout.active[side] = visible[0] ?? null;
  }
  return layout;
}

/** Sanitize/migrate saved data, preserve unknown IDs, and add only new registrations. */
export function normalizeLayout(value, descriptors = []) {
  const saved =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const left = uniqueIds(saved.left);
  const seen = new Set(left);
  const right = uniqueIds(saved.right).filter((id) => !seen.has(id));
  right.forEach((id) => seen.add(id));
  const layout = {
    version: 2,
    left,
    right,
    hidden: uniqueIds(saved.hidden),
    active: {
      left: saved.active?.left ?? null,
      right: saved.active?.right ?? null,
    },
  };
  const registered = descriptorMap(descriptors);
  const ordered = [...descriptors].sort(
    (a, b) => a.defaultPlacement.order - b.defaultPlacement.order,
  );
  for (const descriptor of ordered) {
    if (seen.has(descriptor.id)) continue;
    seen.add(descriptor.id);
    const { side, order, visible } = descriptor.defaultPlacement;
    // Existing relative order is never changed. New registrations use their
    // default order relative to registered neighbors; unknown neighbors survive.
    const before = layout[side].findIndex((id) => {
      const peer = registered.get(id);
      return (
        peer?.defaultPlacement.side === side &&
        peer.defaultPlacement.order > order
      );
    });
    layout[side].splice(
      before < 0 ? layout[side].length : before,
      0,
      descriptor.id,
    );
    if (!visible && !layout.hidden.includes(descriptor.id))
      layout.hidden.push(descriptor.id);
  }
  return repairActive(layout, descriptors);
}

function equalLayout(a, b) {
  return (
    isLayout(a) &&
    SIDES.every(
      (side) =>
        a.active[side] === b.active[side] &&
        a[side].length === b[side].length &&
        a[side].every((id, i) => id === b[side][i]),
    ) &&
    a.hidden.length === b.hidden.length &&
    a.hidden.every((id, i) => id === b.hidden[i])
  );
}
const preserveReference = (original, next) =>
  equalLayout(original, next) ? original : next;

/** Invoke after every registry membership change, including unregister. */
export function reconcileLayout(layout, descriptors = []) {
  return preserveReference(layout, normalizeLayout(layout, descriptors));
}
export function createDefaultLayout(descriptors = []) {
  return normalizeLayout(null, descriptors);
}
export function restoreLayout(descriptors = []) {
  return createDefaultLayout(descriptors);
}

/** Move an existing saved ID, optionally before an ID on the destination side.
 * Moving does not unhide a panel; cross-side visible registered moves select it.
 * Unknown IDs can be repositioned without losing their saved visibility preference.
 */
export function movePanel(layout, id, side, beforeId, descriptors = []) {
  if (!isLayout(layout) || !isSide(side) || beforeId === id) return layout;
  const source = SIDES.find((key) => layout[key].includes(id));
  if (!source || (beforeId !== undefined && !layout[side].includes(beforeId)))
    return layout;
  const next = normalizeLayout(layout, descriptors);
  next[source] = next[source].filter((entry) => entry !== id);
  const index =
    beforeId === undefined ? next[side].length : next[side].indexOf(beforeId);
  next[side].splice(index, 0, id);
  if (source !== side && visiblePanelIds(next, side, descriptors).includes(id))
    next.active[side] = id;
  return preserveReference(layout, repairActive(next, descriptors));
}

/** Selection rejects hidden, absent, and wrong-side IDs. */
export function selectPanel(layout, side, id, descriptors = []) {
  if (
    !isLayout(layout) ||
    !visiblePanelIds(layout, side, descriptors).includes(id)
  )
    return layout;
  const next = normalizeLayout(layout, descriptors);
  next.active[side] = id;
  return preserveReference(layout, next);
}

/** Hide retains the ID's exact position and selects the first visible fallback. */
export function hidePanel(layout, id, descriptors = []) {
  if (!isLayout(layout) || !SIDES.some((side) => layout[side].includes(id)))
    return layout;
  const next = normalizeLayout(layout, descriptors);
  if (!next.hidden.includes(id)) next.hidden.push(id);
  return preserveReference(layout, repairActive(next, descriptors));
}

/** Show restores its saved position and selects it if currently registered. */
export function showPanel(layout, id, descriptors = []) {
  if (!isLayout(layout) || !SIDES.some((side) => layout[side].includes(id)))
    return layout;
  const next = normalizeLayout(layout, descriptors);
  next.hidden = next.hidden.filter((entry) => entry !== id);
  const side = SIDES.find((key) => next[key].includes(id));
  if (visiblePanelIds(next, side, descriptors).includes(id))
    next.active[side] = id;
  return preserveReference(layout, repairActive(next, descriptors));
}
