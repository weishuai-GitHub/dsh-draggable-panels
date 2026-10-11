import { createWorkspaceComponents } from "./panel.js";
import { createWorkspaceModel } from "./model.js";
import { createWorkspaceSearchHook } from "./search.js";

export function registerWorkspace(React, env, panels) {
  const { WorkspacePanel } = createWorkspaceComponents(React, {
    ...env,
    model: createWorkspaceModel(),
    useContentSearch: createWorkspaceSearchHook(React, env.ctx),
  });
  return panels.register(env.ctx, {
    id: "workspaces",
    title: () => env.t("workspaces"),
    icon: (props) =>
      React.createElement(env.Icon, { ...props, kind: "workspace" }),
    component: WorkspacePanel,
    integratedHeader: true,
    defaultPlacement: { side: "left", order: 0, visible: true },
  });
}
