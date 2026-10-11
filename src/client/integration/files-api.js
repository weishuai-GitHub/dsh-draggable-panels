/** File operations remain scoped to the owning Session and cancellable. */
export function createFilesApi(ctx) {
  return {
    list: (sessionId, path, signal) =>
      ctx.remote.workspaceFiles.list(sessionId, path, signal),
    read: (sessionId, path, options, signal) =>
      ctx.remote.workspaceFiles.read(sessionId, path, options, signal),
  };
}
