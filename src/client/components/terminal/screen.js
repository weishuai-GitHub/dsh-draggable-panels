import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

/** Own emulator DOM only. Unmount detaches output, never closes the Host PTY. */
export function createTerminalScreen(React) {
  const h = React.createElement;
  return function TerminalScreen({ model, active, label, theme }) {
    const state = React.useSyncExternalStore(
      model.state.subscribe,
      model.state.getSnapshot,
      model.state.getSnapshot,
    );
    const root = React.useRef(null);
    const screen = React.useRef(null);
    const current = React.useRef({ active, state });
    current.current = { active, state };
    React.useLayoutEffect(() => {
      const node = root.current;
      const terminal = new Terminal({
        fontSize: 13,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        cursorBlink: true,
        minimumContrastRatio: 4.5,
        scrollback: state.environment?.scrollback ?? 1000,
        disableStdin: true,
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(node);
      let disposed = false;
      let revision = 0;
      function measure() {
        const { active, state } = current.current;
        if (
          !active ||
          !state.writable ||
          !node.clientWidth ||
          !node.clientHeight
        )
          return;
        const dimensions = fit.proposeDimensions();
        if (!dimensions) return;
        const cols = Math.max(
          2,
          Math.min(dimensions.cols, state.environment?.maxCols ?? 500),
        );
        const rows = Math.max(
          1,
          Math.min(dimensions.rows, state.environment?.maxRows ?? 200),
        );
        terminal.resize(cols, rows);
        model.resize(cols, rows);
      }
      function paint() {
        const value = model.state.getSnapshot();
        terminal.options.disableStdin = !value.writable;
        const render = value.render;
        if (render && render.revision > revision) {
          revision = render.revision;
          if (render.frame.type === "snapshot") {
            terminal.reset();
            terminal.resize(render.frame.info.cols, render.frame.info.rows);
          }
          terminal.write(
            render.frame.type === "snapshot"
              ? render.frame.screen
              : render.frame.data,
            () => {
              if (!disposed) {
                model.acknowledge(render.revision);
                measure();
              }
            },
          );
        }
      }
      function colors() {
        const style = getComputedStyle(node);
        terminal.options.theme = {
          background: style.backgroundColor,
          foreground: style.color,
          cursor: style.color,
          selectionBackground:
            style.getPropertyValue("--dsw-alias-bg-layer-2").trim() ||
            style.backgroundColor,
        };
      }
      const data = terminal.onData((value) => model.write(value));
      const observe = new ResizeObserver(measure);
      observe.observe(node);
      const off = model.state.subscribe(paint);
      screen.current = { terminal, measure, colors };
      colors();
      const detach = model.mount();
      paint();
      return () => {
        disposed = true;
        off();
        detach();
        observe.disconnect();
        data.dispose();
        terminal.dispose();
        screen.current = null;
      };
    }, [model]);
    React.useLayoutEffect(() => {
      screen.current?.colors();
    }, [theme, model]);
    React.useLayoutEffect(() => {
      screen.current?.measure();
      if (active && state.writable) screen.current?.terminal.focus();
    }, [active, state.writable, model]);
    React.useEffect(() => {
      screen.current?.terminal.textarea?.setAttribute("aria-label", label);
    }, [label, model]);
    return h("div", { className: "dpd-terminal-screen", ref: root });
  };
}
