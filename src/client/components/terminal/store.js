import { createStore as defaultCreateStore } from "../../shared/store.js";

export const TERMINAL_STORAGE_KEY = "dsh.draggable-panels.terminals.v1";
const message = (error) => error?.message || String(error);
const validId = (value) =>
  typeof value === "string" && /^[\w-]{1,128}$/u.test(value);

/**
 * Plugin-lifetime terminal ownership, independent of panel/DOM/session visibility.
 * Only start() may request creation. restore() always supplies an existing Host ID.
 * close() explicitly ends the selected process; hiding must never call it.
 */
export function createTerminalStore({
  ctx,
  storage,
  uuid = () => globalThis.crypto.randomUUID(),
  createStore = defaultCreateStore,
}) {
  const atom = createStore({ sessions: {} });
  const sessions = new Map();
  const runId = uuid();
  let disposed = false;
  let restoring = true;
  let disposal;

  function publish(error) {
    if (disposed) return;
    atom.set({
      sessions: Object.fromEntries(
        [...sessions].map(([sessionId, session]) => [
          sessionId,
          {
            entries: [...session.records.values()].map(
              (record) => record.entry,
            ),
            selected: session.selected,
          },
        ]),
      ),
      ...(error ? { error: message(error) } : {}),
    });
  }

  function save() {
    // Do not partially overwrite dormant sessions while replaying saved entries.
    if (disposed || restoring) return;
    const saved = Object.fromEntries(
      [...sessions].map(([sessionId, session]) => [
        sessionId,
        {
          selected: session.selected,
          entries: [...session.records.values()].map(({ entry }) => ({
            sessionId,
            contentId: entry.contentId,
            terminalId: entry.terminalId,
            title: entry.title,
          })),
        },
      ]),
    );
    try {
      storage?.setItem(
        TERMINAL_STORAGE_KEY,
        JSON.stringify({ version: 1, sessions: saved }),
      );
    } catch (error) {
      publish(error);
    }
  }

  function sessionFor(sessionId) {
    if (typeof sessionId !== "string" || !sessionId)
      throw new Error("A terminal requires a session");
    if (!sessions.has(sessionId))
      sessions.set(sessionId, { records: new Map(), selected: null });
    return sessions.get(sessionId);
  }

  function establishHold(sessionId, record) {
    if (disposed || record.released || record.hold || !record.entry.state.info)
      return;
    try {
      const stream = ctx.remote.$stream({
        name: "Draggable panels terminal hold",
        open: (signal) =>
          ctx.remote.terminal.retain(sessionId, record.entry.model.id, signal),
        ended: () => new Error("Terminal hold ended"),
      });
      record.hold = stream;
      record.consuming = (async () => {
        try {
          for await (const item of stream) {
            if (disposed || record.released) return;
            item.accept();
          }
        } catch (error) {
          if (!disposed && !record.released) {
            record.entry = { ...record.entry, retainError: message(error) };
            publish(error);
          }
        }
      })();
    } catch (error) {
      record.entry = { ...record.entry, retainError: message(error) };
      publish(error);
    }
  }

  function add(sessionId, contentId, terminalId, title, shellPath) {
    if (disposed) throw new Error("Terminal store is disposed");
    const session = sessionFor(sessionId);
    const existing = [...session.records.values()].find(
      (record) =>
        record.entry.id === contentId ||
        (terminalId && record.entry.terminalId === terminalId),
    );
    if (existing) return existing.entry;
    // A new occurrence avoids the native service's cached disposed models on reload.
    const occurrenceKey = `draggable-panels:${runId}:${uuid()}`;
    const model = ctx.webTerminals.view(
      sessionId,
      occurrenceKey,
      contentId,
      terminalId,
      shellPath,
    );
    const record = {
      entry: {
        id: contentId,
        contentId,
        sessionId,
        occurrenceKey,
        terminalId: model.id,
        title: title || "Terminal",
        model,
        state: model.state.getSnapshot(),
      },
      released: false,
    };
    session.records.set(contentId, record);
    const update = () => {
      if (disposed || record.released) return;
      const state = model.state.getSnapshot();
      const nextTitle = state.title || state.info?.title || record.entry.title;
      const changedTitle = nextTitle !== record.entry.title;
      record.entry = { ...record.entry, state, title: nextTitle };
      establishHold(sessionId, record);
      publish();
      if (changedTitle) save();
    };
    record.unsubscribe = model.state.subscribe(update);
    session.selected = contentId;
    update();
    save();
    return record.entry;
  }

  async function release(record) {
    if (record.releasing) return record.releasing;
    record.released = true;
    record.unsubscribe?.();
    // Both disposers run even if one rejects; never terminate the Host process here.
    record.releasing = Promise.allSettled([
      Promise.resolve().then(() => record.hold?.dispose()),
      Promise.resolve().then(() => record.entry.model.dispose()),
    ]).then(async (results) => {
      await record.consuming;
      const failed = results.find((result) => result.status === "rejected");
      if (failed && !disposed) publish(failed.reason);
    });
    return record.releasing;
  }

  const api = {
    getSnapshot: atom.getSnapshot,
    subscribe: atom.subscribe,
    start(sessionId, shellPath) {
      return add(sessionId, uuid(), undefined, undefined, shellPath);
    },
    restore(sessionId, { terminalId, contentId = uuid(), title } = {}) {
      if (!validId(terminalId))
        throw new Error(
          "Restoring a terminal requires an existing terminal ID",
        );
      if (typeof contentId !== "string" || !contentId)
        throw new Error("Invalid terminal content ID");
      return add(sessionId, contentId, terminalId, title);
    },
    select(sessionId, id) {
      if (disposed) return false;
      const session = sessions.get(sessionId);
      if (!session?.records.has(id)) return false;
      if (session.selected === id) return true;
      session.selected = id;
      publish();
      save();
      return true;
    },
    async close(sessionId, id) {
      if (disposed) return false;
      const session = sessions.get(sessionId);
      const record = session?.records.get(id);
      if (!record) return false;
      if (record.closing) return record.closing;
      record.closing = (async () => {
        try {
          await record.entry.model.close();
        } catch (error) {
          publish(error);
          return false;
        }
        await release(record);
        session.records.delete(id);
        if (session.selected === id)
          session.selected = [...session.records.keys()].at(-1) || null;
        publish();
        save();
        return true;
      })();
      try {
        return await record.closing;
      } finally {
        record.closing = undefined;
      }
    },
    async list(sessionId) {
      if (disposed) return [];
      const result = await ctx.remote.terminal.list(sessionId);
      if (!result.ok) throw result.error;
      return result.value;
    },
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      disposal = Promise.all(
        [...sessions.values()].flatMap((session) =>
          [...session.records.values()].map(release),
        ),
      ).then(() => atom.clear?.());
      return disposal;
    },
  };

  // Restoring only validated, explicit IDs cannot silently create a replacement PTY.
  let saved;
  try {
    saved = JSON.parse(storage?.getItem(TERMINAL_STORAGE_KEY) || "null");
  } catch (error) {
    publish(error);
  }
  if (
    saved?.version === 1 &&
    saved.sessions &&
    typeof saved.sessions === "object"
  ) {
    for (const [sessionId, session] of Object.entries(saved.sessions)) {
      if (!sessionId || !Array.isArray(session?.entries)) continue;
      for (const entry of session.entries) {
        if (
          !validId(entry?.terminalId) ||
          typeof entry.contentId !== "string" ||
          !entry.contentId
        )
          continue;
        try {
          api.restore(sessionId, entry);
        } catch (error) {
          publish(error);
        }
      }
      if (session.selected) api.select(sessionId, session.selected);
    }
  }
  restoring = false;
  return api;
}
