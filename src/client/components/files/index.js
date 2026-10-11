import { createFilesComponent } from "./panel.js";

export function registerFiles(React, env, panels) {
  const { FilesPanel, dispose } = createFilesComponent(React, env);
  env.ctx.effect(() => dispose, "file component resources");
  return panels.register(env.ctx, {
    id: "files",
    title: () => env.t("files"),
    icon: (props) => React.createElement(env.Icon, { ...props, kind: "files" }),
    component: FilesPanel,
    defaultPlacement: { side: "right", order: 10, visible: true },
  });
}
