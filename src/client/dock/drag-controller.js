export function createDragController(env) {
  const { drag, layout, move, hitTest, dragDistanceExceeded } = env;
  const frames = { left: null, right: null };
  const tabs = { left: new Map(), right: new Map() };
  const revealNodes = new Set();
  const suppressClicks = new WeakSet();
  let session = null;
  function geometry() {
    const targets = {};
    for (const side of ["left", "right"]) {
      const node = frames[side];
      if (node)
        targets[side] = {
          rect: node.getBoundingClientRect(),
          tabs: env.visibleIds(layout.getSnapshot(), side).map((id) => ({
            id,
            rect: tabs[side].get(id)?.getBoundingClientRect(),
          })),
        };
    }
    return targets;
  }
  function targetAt(point) {
    const target = hitTest(point, geometry());
    if (target) return target;
    for (const node of revealNodes) {
      const r = node.getBoundingClientRect();
      if (
        point.x >= r.left &&
        point.x < r.right &&
        point.y >= r.top &&
        point.y < r.bottom
      )
        return { side: "right" };
    }
    return null;
  }
  function clearSession() {
    const previous = session;
    session = null;
    window.removeEventListener("pointermove", pointerMove, true);
    window.removeEventListener("pointerup", pointerUp, true);
    window.removeEventListener("pointercancel", pointerCancel, true);
    window.removeEventListener("keydown", escapeDrag, true);
    window.removeEventListener("blur", pointerCancel);
    if (previous)
      try {
        if (previous.element.hasPointerCapture(previous.pointerId))
          previous.element.releasePointerCapture(previous.pointerId);
      } catch {}
    drag.set(null);
  }
  function pointerMove(e) {
    if (!session || e.pointerId !== session.pointerId) return;
    const point = { x: e.clientX, y: e.clientY };
    if (!session.started && !dragDistanceExceeded(session.start, point)) return;
    session.started = true;
    if (e.cancelable) e.preventDefault();
    drag.set({ id: session.id, point, target: targetAt(point) });
  }
  function pointerUp(e) {
    if (!session || e.pointerId !== session.pointerId) return;
    const pending = session;
    const target = pending.started
      ? targetAt({ x: e.clientX, y: e.clientY })
      : null;
    if (pending.started) {
      suppressClicks.add(pending.element);
      if (e.cancelable) e.preventDefault();
    }
    clearSession();
    if (target) {
      if (target.side === "left") env.expandLeft?.();
      move(pending.id, target.side, target.beforeId);
    }
  }
  function pointerCancel() {
    clearSession();
  }
  function escapeDrag(e) {
    if (e.key === "Escape" && session) {
      e.preventDefault();
      clearSession();
    }
  }
  function startDrag(e, id, side) {
    if (e.button !== 0 || !e.isPrimary) return;
    clearSession();
    session = {
      id,
      side,
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      element: e.currentTarget,
      started: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    window.addEventListener("pointermove", pointerMove, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerup", pointerUp, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointercancel", pointerCancel, true);
    window.addEventListener("keydown", escapeDrag, true);
    window.addEventListener("blur", pointerCancel);
  }
  function revealRef(node, previous) {
    if (previous) revealNodes.delete(previous);
    if (node) revealNodes.add(node);
  }
  const offLayout = layout.subscribe(() => {
    if (
      session &&
      !["left", "right"].some((side) =>
        env.visibleIds(layout.getSnapshot(), side).includes(session.id),
      )
    )
      clearSession();
  });
  return {
    frames,
    tabs,
    suppressClicks,
    startDrag,
    clearSession,
    revealRef,
    getActive: () => session,
    dispose() {
      offLayout();
      clearSession();
      frames.left = null;
      frames.right = null;
      tabs.left.clear();
      tabs.right.clear();
      revealNodes.clear();
    },
  };
}
