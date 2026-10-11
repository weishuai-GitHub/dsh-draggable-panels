import { createFilesComponent } from "./panel.js";

export function registerFiles(React, env, panels) {
  const { FilesPanel, SessionTabs, dispose } = createFilesComponent(React, env);
  function FileComponent(props) {
    const native = env.useAtom(env.nativeFiles.available);
    return React.createElement(
      native ? env.nativeFiles.LeftFiles : FilesPanel,
      props,
    );
  }
  function FallbackSessionTabs(props) {
    const native = env.useAtom(env.nativeFiles.available);
    return native ? null : React.createElement(SessionTabs, props);
  }
  env.ctx.slots.inject("shell.overlay", () =>
    env.ctx.slots.register(
      { name: "shell.overlay", id: "local-draggable-file-tabs" },
      FallbackSessionTabs,
    ),
  );
  env.ctx.effect(() => dispose, "file component resources");
  return panels.register(env.ctx, {
    id: "files",
    title: () => env.t("files"),
    icon: (props) => React.createElement(env.Icon, { ...props, kind: "files" }),
    component: FileComponent,
    defaultPlacement: { side: "right", order: 10, visible: true },
  });
}
