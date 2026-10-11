import { createFilesApi } from "../../integration/files-api.js";
export function createFilesStore(ctx, atom) {
  const api = createFilesApi(ctx);
  const files = new Map();
  const controllers = new Set();
  let disposed = false;
  function cacheFor(sessionId, root) {
    const key = `${sessionId}\n${root}`;
    if (!files.has(key))
      files.set(
        key,
        atom({
          expanded: { [root]: true },
          levels: {},
          scroll: 0,
          preview: null,
        }),
      );
    return files.get(key);
  }
  function fail(error) {
    return error?.message || error?.code || String(error);
  }
  function controller() {
    const value = new AbortController();
    controllers.add(value);
    return value;
  }
  async function loadDirectory(cache, sessionId, path) {
    const c = controller();
    const old = cache.getSnapshot();
    const token = {};
    cache.set({
      ...old,
      levels: {
        ...old.levels,
        [path]: { ...old.levels[path], loading: true, token, error: null },
      },
    });
    try {
      const result = await api.list(sessionId, path, c.signal);
      if (
        disposed ||
        c.signal.aborted ||
        cache.getSnapshot().levels[path]?.token !== token
      )
        return;
      const value = cache.getSnapshot();
      cache.set({
        ...value,
        levels: {
          ...value.levels,
          [path]: result.ok
            ? {
                entries: result.value.entries,
                truncated: result.value.truncated,
                loading: false,
              }
            : { loading: false, error: fail(result.error) },
        },
      });
    } catch (error) {
      if (
        !disposed &&
        !c.signal.aborted &&
        cache.getSnapshot().levels[path]?.token === token
      ) {
        const value = cache.getSnapshot();
        cache.set({
          ...value,
          levels: {
            ...value.levels,
            [path]: { error: fail(error), loading: false },
          },
        });
      }
    } finally {
      controllers.delete(c);
    }
  }
  async function previewFile(cache, sessionId, path, append = false) {
    const previous = cache.getSnapshot().preview;
    const c = controller();
    const token = {};
    const offset = append && previous?.path === path ? previous.nextOffset : 1;
    const oldText = append && previous?.path === path ? previous.text : "";
    const priorLines =
      append && previous?.path === path ? previous.totalLines || 0 : 0;
    cache.set({
      ...cache.getSnapshot(),
      preview: { path, text: oldText, loading: true, token },
    });
    try {
      const result = await api.read(
        sessionId,
        path,
        { offset, limit: 300 },
        c.signal,
      );
      if (
        disposed ||
        c.signal.aborted ||
        cache.getSnapshot().preview?.token !== token
      )
        return;
      const next = result.ok
        ? {
            path,
            text:
              oldText +
              (priorLines > 0 && result.value.lines > 0 ? "\n" : "") +
              result.value.text,
            totalLines: priorLines + result.value.lines,
            eof: result.value.eof,
            nextOffset: result.value.offset + result.value.lines,
            loading: false,
          }
        : { path, text: oldText, error: fail(result.error), loading: false };
      cache.set({ ...cache.getSnapshot(), preview: next });
    } catch (error) {
      if (!disposed && cache.getSnapshot().preview?.token === token)
        cache.set({
          ...cache.getSnapshot(),
          preview: { path, text: oldText, error: fail(error), loading: false },
        });
    } finally {
      controllers.delete(c);
    }
  }
  return {
    cacheFor,
    loadDirectory,
    previewFile,
    dispose() {
      disposed = true;
      for (const controller of controllers) controller.abort();
      controllers.clear();
      files.clear();
    },
  };
}
