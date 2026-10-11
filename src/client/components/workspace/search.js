/* Cancellable native full-text search. The controller has no DOM dependency. */
export function createWorkspaceSearch(
  search,
  changed,
  timers = { set: setTimeout, clear: clearTimeout },
) {
  let generation = 0,
    timer,
    controller,
    disposed = false;
  let state = { items: [], loading: false, error: null, hasMore: false };
  function publish(next) {
    if (!disposed) {
      state = next;
      changed(next);
    }
  }
  function update(value) {
    const token = ++generation;
    if (timer !== undefined) timers.clear(timer);
    timer = undefined;
    controller?.abort();
    controller = undefined;
    const query = String(value || "").trim();
    publish({ items: [], loading: !!query, error: null, hasMore: false });
    if (!query || disposed) return;
    timer = timers.set(async () => {
      timer = undefined;
      const c = new AbortController();
      controller = c;
      try {
        const result = await search(query, c.signal);
        if (disposed || token !== generation || c.signal.aborted) return;
        if (!result.ok) {
          publish({
            items: [],
            loading: false,
            error: result.error,
            hasMore: false,
          });
          return;
        }
        publish({
          items: result.value.items,
          hasMore: result.value.hasMore,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (!disposed && token === generation && !c.signal.aborted)
          publish({ items: [], loading: false, error, hasMore: false });
      }
    }, 250);
  }
  return {
    update,
    getSnapshot: () => state,
    dispose() {
      disposed = true;
      ++generation;
      if (timer !== undefined) timers.clear(timer);
      controller?.abort();
    },
  };
}
export function createWorkspaceSearchHook(React, ctx) {
  return function useContentSearch(query) {
    const [state, setState] = React.useState({
      items: [],
      loading: false,
      error: null,
      hasMore: false,
    });
    React.useEffect(() => {
      const search = createWorkspaceSearch(
        (text, signal) => ctx.sessions.search(text, signal),
        setState,
      );
      search.update(query);
      return () => search.dispose();
    }, [query]);
    return state;
  };
}
