import { build } from "esbuild";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const { name } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const upstream = JSON.parse(
  await readFile(
    new URL("../node_modules/dsh-better-sidebar/package.json", import.meta.url),
    "utf8",
  ),
);
if (upstream.version !== "0.25.0")
  throw new Error("Native explorer requires dsh-better-sidebar exactly 0.25.0");
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/client/index.js"],
  outfile: "dist/client.js",
  bundle: true,
  write: false,
  platform: "browser",
  format: "cjs",
  target: "es2022",
  // All host primitives and React are resolved by the native module loader.
  external: ["react", "react-dom", "@deepseek-ai/dsh-client-ui-primitives"],
  // Existing plugin styles are strings; upstream CSS modules need real local
  // class maps. Inline the generated stylesheet below: no second asset fetch.
  loader: { ".css": "text", ".module.css": "local-css" },
  // react-icons uses a default React import. Esbuild's CJS interop enumerates
  // that object, which DSH's opaque module export rejects. Bind it directly;
  // this changes import plumbing only, not upstream icon/component behavior.
  plugins: [
    {
      name: "opaque-host-react",
      setup(build) {
        build.onLoad(
          { filter: /react-icons[/\\\\]lib[/\\\\].*\.mjs$/ },
          async ({ path }) => ({
            contents: (await readFile(path, "utf8")).replace(
              'import React from "react";',
              'const React = require("react");',
            ),
            loader: "js",
          }),
        );
      },
    },
  ],
  jsx: "transform",
  jsxFactory: "__dshReact.createElement",
  jsxFragment: "__dshReact.Fragment",
});
const js = result.outputFiles.find((file) => file.path.endsWith(".js"));
const css =
  result.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
const prefix = `// Generated. Edit src/, never dist/.\nwindow.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory(require) {\nconst module = { exports: {} }; const exports = module.exports;\nconst __dshReact = require("react");\n`;
const style = css
  ? `if (typeof document !== "undefined") {\nconst id = "dsh-draggable-panels-native-explorer-css";\nlet sheet = document.getElementById(id);\nif (!sheet) { sheet = document.createElement("style"); sheet.id = id; document.head.appendChild(sheet); }\nsheet.textContent = ${JSON.stringify(css)};\n}\n`
  : "";
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../dist/client.js", import.meta.url),
  prefix + style + js.text + "\nreturn module.exports.default;\n} });\n",
);
await mkdir(new URL("../dist/locale/", import.meta.url), { recursive: true });
await copyFile(
  new URL("../src/host/index.js", import.meta.url),
  new URL("../dist/index.js", import.meta.url),
);
for (const lang of ["zh", "en"])
  await copyFile(
    new URL(`../src/client/locales/${lang}.json`, import.meta.url),
    new URL(`../dist/locale/${lang}.json`, import.meta.url),
  );
// The upstream source and CSS are bundled, so ship its complete MIT notice.
await copyFile(
  new URL("../node_modules/dsh-better-sidebar/LICENSE", import.meta.url),
  new URL("../dist/BETTER-SIDEBAR-LICENSE", import.meta.url),
);
console.log("Built dist/client.js and dist/index.js");

// Live Host metadata may still point at the pre-0.6 root entry until restart.
await copyFile(
  new URL("../dist/client.js", import.meta.url),
  new URL("../client.js", import.meta.url),
);
