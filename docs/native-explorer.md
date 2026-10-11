# Standalone native explorer

## API

```js
import { createNativeExplorer } from "../src/client/integration/native-explorer.js";
const NativeExplorer = createNativeExplorer(React, { ctx, t, useAtom, atom });
// React is the host module loader's React, not another installed React.
React.createElement(NativeExplorer, {
  scope: { sessionId, cwd },
  service: ctx.betterSidebar,
  visible: true,
});
```

The adapter directly renders the exported controlled `TreePanel` from the exact
`dsh-better-sidebar@0.25.0` development dependency. It never creates a sidebar
store, registers an explorer tab, changes `editorExplorer`, moves DOM nodes,
mounts an `EditorHost`, or creates a native carrier. Upstream's own context-menu
portals remain intact; they are menus, not explorer mounting infrastructure.

The unmodified tree retains its toolbar, 300ms debounced name search, sorting,
Git status, compact directory chains, lazy levels, directory watcher, refresh,
selection, uploads, download/archive actions and context menus. Native host
primitives and the live service provide icons. Its HTTP/WebSocket API bindings
retain upstream's page-base/reverse-proxy and desktop transport resolution.
The installed Better Sidebar host must still provide its `/sidebar/*` routes.

File clicks and explicit new-tab actions use `service.openFile(scope, path)`.
Side opens use `service.openTab({type:'editor', path, target:'side'}, scope)`.
The service chooses native resource tabs and claiming file viewers; the adapter
neither opens pathless tabs nor changes file-opening preferences.

Expansion is keyed by session ID **and** cwd and lasts for the factory lifetime.
Scope changes remount the upstream tree so search, selection and directory caches
cannot leak between workspaces. Search text resets on a scope change (it is not
persisted). Pass `visible=false` while parked to stop native tree Git polling.

## Runtime bindings and boundaries

- `ctx` is the real client context. Native locale attaches through `ctx.get('locale')`
  and is subscribed without re-registering Better Sidebar's namespace. Optional
  `betterLocale` supports upstream override dictionaries (including Japanese).
- `t`, `useAtom`, and `atom` are accepted for factory consistency but not needed by
  this controlled tree.
- `service.getSnapshot()` and `subscribeState()` read live exclusion patterns and
  editor open-with settings. No writable store is fabricated.
- References call upstream `referenceInChat`: workspace membership and scoped
  conversation services determine the correct structured reference. Missing
  services degrade exactly as upstream does, to a logged no-op.
- Native open-in-app uses upstream `createOpenInApp(ctx)`; declare `remote` and
  `remote.session` injection when the host offers them. Missing capability hides
  native application controls. Plugin open-with targets retain upstream API URLs.
- Optional `env.onToggleOpenWithPin(scope, targetId)` supplies pin persistence. The
  public 0.25.0 service has no settings-write API, so without this callback existing
  pins are read but pin changes are unavailable. No private store is reconstructed.
- Optional `env.onPathRenamed(scope, oldPath, newPath)` and
  `env.onPathDeleted(scope, path, isDir)` can reconcile resources via a future
  supported host API. Without them filesystem mutations still work, but existing
  resource tabs are not retargeted or closed. Upstream's store-bound helpers do not
  enumerate native resource tabs, and a separately bundled dirty-draft registry
  would miss their unsaved changes; silently force-closing tabs would be unsafe.
- Upload lifecycle is upstream's lifecycle: changing scope does not invent an
  automatic cancel policy. Finish/cancel an upload before navigating away when
  its progress needs to remain visible.

## Build and attribution

The source import uses upstream's explicit `./src/*` package export, not the
profile installation. The lockfile pins version 0.25.0. The build verifies this
version, compiles `.module.css` with esbuild local CSS class maps, and embeds the
result in one replaceable style element. React, React DOM, and DSH primitives
remain external host modules. JSX uses the host's direct React object; the two
react-icons default React imports are rebound in-memory to direct `require` to
avoid enumerating DSH's opaque exports. No installed source is rewritten.

Better Sidebar: https://github.com/omdsh-dev/DSH-better-sidebar

Copyright (c) 2026 dsh-external. Licensed under MIT. The build copies the complete
upstream notice to `dist/BETTER-SIDEBAR-LICENSE`, included in distributable packages.

`tests/unit/native-explorer.test.mjs` covers public routing, no mount-time tab
creation, session/cwd isolation, drop shielding, reference/open-with bindings,
source pinning, CSS inclusion and absence of bundled/interoperated React.
The generated-factory integration smoke test also rejects React enumeration.
These are contract/build tests, not a real-browser interaction or layout test.
