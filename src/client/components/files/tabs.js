// Per-session documents own independent read state. Only the current session's
// documents contribute native Conversation tabs; no host DOM or stores are touched.
export function createFileTabs({ atom, register, read }) {
  const documents = new Map();
  const snapshot = atom([]);
  const publish = () => snapshot.set([...documents.values()]);
  let currentSession;
  let sequence = 0;
  function sync() {
    for (const doc of documents.values()) {
      if (doc.sessionId === currentSession && !doc.remove)
        doc.remove = register(doc);
      else if (doc.sessionId !== currentSession && doc.remove) {
        doc.remove();
        doc.remove = null;
      }
    }
  }
  return {
    snapshot,
    selectSession(sessionId) {
      currentSession = sessionId;
      sync();
    },
    open(sessionId, path) {
      const key = JSON.stringify([sessionId, path]);
      let doc = documents.get(key);
      if (!doc) {
        doc = {
          key,
          id: `local.draggablePanels.file.${++sequence}`,
          sessionId,
          path,
          cache: atom({ preview: null }),
          remove: null,
        };
        documents.set(key, doc);
        publish();
        read(doc.cache, sessionId, path);
      }
      currentSession = sessionId;
      sync();
      return doc;
    },
    close(doc) {
      if (documents.get(doc.key) !== doc) return;
      documents.delete(doc.key);
      publish();
      doc.remove?.();
      // Invalidate pending reads before clearing listeners.
      doc.cache.set({ preview: null });
      doc.cache.clear();
    },
    dispose() {
      for (const doc of documents.values()) {
        doc.remove?.();
        doc.cache.set({ preview: null });
        doc.cache.clear();
      }
      documents.clear();
      snapshot.clear();
    },
  };
}
