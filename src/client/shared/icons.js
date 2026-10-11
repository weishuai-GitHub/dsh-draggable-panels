/* Shared optical 20px line icons. No font glyphs or external UI modules. */
export function createIcons(React) {
  const h = React.createElement;
  const paths = {
    workspace: [
      "M5 3.5h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z",
      "M3 7.5h14M7.5 7.5v9",
    ],
    files: [
      "M2.5 7V5.5a2 2 0 0 1 2-2h3.1c.6 0 1.1.3 1.5.7l1.1 1.3H15.5a2 2 0 0 1 2 2V14.5a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2Z",
      "M2.5 7.5h15",
    ],
    folder: [
      "M2.5 6a2 2 0 0 1 2-2h3c.6 0 1.1.3 1.5.7l1.2 1.3h5.3a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2Z",
    ],
    folderOpen: [
      "M2.5 13.5V6a2 2 0 0 1 2-2h3c.6 0 1.1.3 1.5.7l1.2 1.3h5.3a2 2 0 0 1 2 2",
      "M5.5 9h11a1 1 0 0 1 1 1.3l-1.3 4.6a2 2 0 0 1-1.9 1.6H4.5a2 2 0 0 1-1.9-2.6l1-3.5A2 2 0 0 1 5.5 9Z",
    ],
    file: [
      "M5 2.5h6.5l4 4v10A1 1 0 0 1 14.5 17.5h-9a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z",
      "M11.5 2.5v4h4",
    ],
    session: [
      "M5 4h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8l-4 2v-3a2 2 0 0 1-1-1.75V6a2 2 0 0 1 2-2Z",
      "M6.5 8h7M6.5 11h4",
    ],
    terminal: ["m4 5 5 5-5 5", "M11 15h5"],
    plus: ["M10 4v12M4 10h12"],
    newSession: [
      "M4.5 15.5 2.8 17.2l.8-4.1A7 7 0 1 1 7 16.4",
      "M10 6.5v7M6.5 10h7",
    ],
    folderPlus: [
      "M10 4H7.5l-1-1H4.5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4",
      "M15 2v6M12 5h6",
    ],
    filter: [
      "M3 5h8M15 5h2M3 15h2M9 15h8",
      "M15 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0M9 15a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
    ],
    pin: ["m7 3 6 0-1 5 3 3v1H5v-1l3-3Z", "M10 12v5"],
    check: ["m4 10 4 4 8-8"],
    workspaceTree: ["M3 5h5l2 2h7v10H3Z", "M7 10v4M12 10v4"],
    list: ["M7 4h10M7 10h10M7 16h10M3 4h.01M3 10h.01M3 16h.01"],
    sort: ["m6 7 4-4 4 4M6 13l4 4 4-4"],
    clock: ["M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0", "M10 5v5l3 2"],
    archiveHidden: ["M4 3h13v4h-4M5 7v10h10v-3M3 3l14 14"],
    archiveOnly: [
      "M3 3h14v4H3Z",
      "M4 7v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7",
      "m7 11 2 2 4-4",
    ],
    rename: [
      "M8 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3",
      "m10 10 7-7M13.5 3H17v3.5",
    ],
    fork: [
      "M6 10 13.5 5M6 10l7.5 5",
      "M6 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0M17.5 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0M17.5 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
    ],
    more: ["M4 10h.01M10 10h.01M16 10h.01"],
    search: ["M13.5 13.5 17 17", "M14.5 8.5a6 6 0 1 1-12 0 6 6 0 0 1 12 0"],
    chevronRight: ["m7.5 5 5 5-5 5"],
    chevronDown: ["m5 7.5 5 5 5-5"],
    close: ["m5 5 10 10M15 5 5 15"],
    sidebar: [
      "M4 3.5h12a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15V5A1.5 1.5 0 0 1 4 3.5Z",
      "M12.5 3.5v13",
    ],
    archive: ["M3 3.5h14v4H3z", "M4.5 7.5v9h11v-9M8 10.5h4"],
    refresh: ["M16 7a6.5 6.5 0 1 0 .3 5", "M16.5 3.5V7h-3.5"],
    back: ["M16 10H4m5-5-5 5 5 5"],
  };
  function Icon({ kind = "workspace", size = 16, className, style }) {
    const common = {
      className,
      style: { flexShrink: 0, verticalAlign: "middle", ...style },
      width: size,
      height: size,
      viewBox: "0 0 20 20",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.4,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
      focusable: false,
    };
    if (kind === "grip")
      return h(
        "svg",
        { ...common, width: 10 },
        ...[5, 10, 15].flatMap((y) =>
          [7, 13].map((x) =>
            h("circle", {
              key: `${x}-${y}`,
              cx: x,
              cy: y,
              r: 1,
              fill: "currentColor",
              stroke: "none",
            }),
          ),
        ),
      );
    return h(
      "svg",
      common,
      ...(paths[kind] || paths.workspace).map((d, key) =>
        h("path", { key, d }),
      ),
    );
  }
  return Icon;
}
