/**
 * Pure pointer helpers. All rectangles must belong to the plugin itself.
 * The helper factory has no React, DOM, subscriptions or side effects.
 */
export function createPointerHelpers() {
  function validPoint(point) {
    return (
      point !== null &&
      typeof point === "object" &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y)
    );
  }

  /** DOMRect edges are authoritative; width/height are accepted as a fallback. */
  function normalizeRect(rect) {
    if (
      rect === null ||
      typeof rect !== "object" ||
      !Number.isFinite(rect.left) ||
      !Number.isFinite(rect.top)
    )
      return null;
    const right =
      rect.right === undefined ? rect.left + rect.width : rect.right;
    const bottom =
      rect.bottom === undefined ? rect.top + rect.height : rect.bottom;
    if (
      !Number.isFinite(right) ||
      !Number.isFinite(bottom) ||
      right <= rect.left ||
      bottom <= rect.top
    )
      return null;
    return { left: rect.left, top: rect.top, right, bottom };
  }

  // Half-open rectangles give adjacent containers a single deterministic owner.
  function contains(point, rect) {
    return (
      point.x >= rect.left &&
      point.x < rect.right &&
      point.y >= rect.top &&
      point.y < rect.bottom
    );
  }

  /**
   * @param {{x:number,y:number}} point Current client coordinates.
   * @param {object} targets Own left/right containers and ordered tab rectangles.
   * @returns {{side:'left'|'right',beforeId?:string}|null}
   * A container-body hit appends. A tab's left half inserts before itself;
   * its midpoint/right half inserts before the next valid tab, or appends.
   * Invalid containers/tabs are ignored. Overlapping containers prefer left.
   */
  function hitTest(point, targets) {
    if (!validPoint(point) || targets === null || typeof targets !== "object")
      return null;
    for (const side of ["left", "right"]) {
      const target = targets[side];
      if (target === null || typeof target !== "object") continue;
      const rect = normalizeRect(target.rect);
      if (rect === null || !contains(point, rect)) continue;
      const tabs = [];
      const seen = new Set();
      if (Array.isArray(target.tabs)) {
        for (const tab of target.tabs) {
          if (
            tab === null ||
            typeof tab !== "object" ||
            typeof tab.id !== "string" ||
            tab.id.length === 0 ||
            seen.has(tab.id)
          )
            continue;
          const tabRect = normalizeRect(tab.rect);
          if (tabRect === null) continue;
          seen.add(tab.id);
          tabs.push({ id: tab.id, rect: tabRect });
        }
      }
      for (let index = 0; index < tabs.length; index += 1) {
        const tab = tabs[index];
        if (!contains(point, tab.rect)) continue;
        const midpoint = tab.rect.left / 2 + tab.rect.right / 2;
        const beforeId = point.x < midpoint ? tab.id : tabs[index + 1]?.id;
        return beforeId === undefined ? { side } : { side, beforeId };
      }
      return { side };
    }
    return null;
  }

  /** Start a drag only after moving strictly more than the threshold in px. */
  function dragDistanceExceeded(start, point, threshold = 5) {
    if (
      !validPoint(start) ||
      !validPoint(point) ||
      !Number.isFinite(threshold) ||
      threshold < 0
    )
      return false;
    return Math.hypot(point.x - start.x, point.y - start.y) > threshold;
  }

  return { hitTest, dragDistanceExceeded };
}

export const { hitTest, dragDistanceExceeded } = createPointerHelpers();
