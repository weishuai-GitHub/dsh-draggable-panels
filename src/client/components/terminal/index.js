import { createTerminalStore } from "./store.js";
import { createTerminalPanel } from "./panel.js";

/** Terminal transport is optional: other components remain usable if unavailable. */
export function registerTerminal(React, env, panels) {
  env.ctx.inject(["webTerminals", "remote.terminal", "theme"], (ctx) => {
    const store = createTerminalStore({
      ctx,
      storage: localStorage,
      uuid: () => crypto.randomUUID(),
      createStore: env.atom,
    });
    ctx.effect(() => () => store.dispose(), "terminal component resources");
    panels.register(ctx, {
      id: "terminal",
      title: () => env.t("terminal"),
      icon: (props) =>
        React.createElement(env.Icon, { ...props, kind: "terminal" }),
      component: createTerminalPanel(React, { ...env, ctx }, store),
      defaultPlacement: { side: "right", order: 20, visible: true },
    });
  });
}
