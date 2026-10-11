/* Standalone factories: no Harness imports; all writes use injected services. */
export function createWorkspaceActions(ctx, report = () => {}) {
  const pending = new Map();
  function run(key, operation) {
    if (pending.has(key)) return pending.get(key);
    const promise = Promise.resolve()
      .then(operation)
      .finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }
  function absolute(path) {
    return (
      typeof path === "string" &&
      (/^\//.test(path) ||
        /^[a-z]:[\\/]/i.test(path) ||
        /^\\\\[^\\]+\\[^\\]+/.test(path))
    );
  }
  function visible(row, selectedId, archived, filter = "hide") {
    if (
      !row ||
      row.origin === "subagent" ||
      (row.blank && row.id !== selectedId)
    )
      return false;
    return (
      filter === "all" ||
      (filter === "archived" ? archived.has(row.id) : !archived.has(row.id))
    );
  }
  function create(path) {
    return run("create", async () => {
      const value = path.trim();
      if (!absolute(value)) throw new Error("wk.absolute");
      const workspace = await ctx.workspaces.create({ path: value });
      await ctx.uiWorkspace.openWorkspace(workspace.workspaceId);
      return workspace;
    });
  }
  return {
    run,
    absolute,
    visible,
    newSession(workspaceId) {
      if (typeof workspaceId !== "string" || !workspaceId)
        throw new Error("A workspace identity is required");
      report({ action: "newSession", workspaceId, at: Date.now() });
      return ctx.uiWorkspace.startSession(workspaceId);
    },
    create,
    pickAndCreate() {
      return run("pick-create", async () => {
        const path = await ctx.uiWorkspace.pickDirectory();
        return path === null ? null : create(path);
      });
    },
    rename(id, title) {
      return run(`workspace:${id}`, () => {
        if (!title.trim()) throw new Error("wk.required");
        return ctx.workspaces.rename(id, title.trim());
      });
    },
    remove(id) {
      return run(`workspace:${id}`, () => ctx.workspaces.delete(id));
    },
    archive(id) {
      return run(`session:${id}`, () => ctx.uiWorkspace.archiveSession(id));
    },
    restore(id) {
      return run(`session:${id}`, () => ctx.uiWorkspace.unarchiveSession(id));
    },
    pin(id, pinned) {
      return run(`session:${id}`, () =>
        pinned
          ? ctx.uiWorkspace.unpinSession(id)
          : ctx.uiWorkspace.pinSession(id),
      );
    },
    renameSession(id, title) {
      return run(`session:${id}`, async () => {
        if (!title.trim()) throw new Error("wk.required");
        const result = await ctx.sessions.using(
          id,
          { source: "workspaceOperation" },
          (reference) => reference.binding.session.rename(title.trim()),
        );
        if (!result.ok)
          throw new Error(
            result.error?.message || result.error?.code || "Rename failed",
          );
        return result;
      });
    },
    fork(id) {
      return run(`session:${id}`, () => ctx.uiWorkspace.forkSession(id));
    },
    reorder(workspaceId, id, beforeId) {
      return run(`order:${workspaceId}`, () =>
        ctx.workspaces.insertSessionBefore(workspaceId, id, beforeId),
      );
    },
  };
}
