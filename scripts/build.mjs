import { build } from "esbuild";
import { mkdir, copyFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const { name } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
await build({
  absWorkingDir: root,
  entryPoints: ["src/client/index.js"],
  outfile: "dist/client.js",
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: "es2022",
  external: ["react"],
  loader: { ".css": "text" },
  banner: {
    js: `// Generated. Edit src/, never dist/.\nwindow.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory(require) {\nconst module = { exports: {} }; const exports = module.exports;`,
  },
  footer: { js: "return module.exports.default;\n} });" },
});
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
console.log("Built dist/client.js and dist/index.js");

// Live Host metadata may still point at the pre-0.6 root entry until restart.
await copyFile(
  new URL("../dist/client.js", import.meta.url),
  new URL("../client.js", import.meta.url),
);
