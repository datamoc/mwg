# Tools

Developer-side scripts in `tools/`. Nothing here reaches the player: these author
content, verify it, or package it, and the shipped game is still a folder that opens
by double-clicking. Run from the repo root.

## Content and authoring

| tool | what it does | run |
| --- | --- | --- |
| `i18n-edit` | Split-screen terminal editor for `mwg/i18n` catalogs: reference language left, translation right, either side any language, per-string sound cues, JSON/FTL auto-detected, with a `--check` mode for CI. Panes preview markdown as bold/italic and flag placeholder drift (`{dmg:03d}` dropped or reshaped); `v` toggles raw source, `Ctrl+P` previews the row's cue through the OS player (`MWG_SFX_PLAYER` overrides) | `npm run i18n:edit -- <base> <target>` |
| `make-example-assets` | Generates `examples/assets` (tileset, sounds). Borrowed art stays out for licence reasons, so this draws everything | `npm run assets` |
| `extract-rgssad` | Decrypts an RPG Maker XP/VX archive to plain files (vendored decoder, developer-side only) | `npm run extract:rgssad -- <archive.rgssad> <outDir>` |
| `multiplayer-server` | Reference lockstep server for `core.LockstepClient` | `npm run multiplayer:server` |

## Shipping (`file://`)

| tool | what it does | run |
| --- | --- | --- |
| `compile-resources` | Turns an asset folder into `data:` URI scripts under `window.__MWG_ASSETS__`, grouped by top-level folder | called by the example builds |
| `emit-page` | Rewrites an example's vite build (classic script tag, inlined assets) so it opens from `file://` with no server | called by each `example:*:build` script |
| `compress-dist` | Writes `.gz`/`.br` siblings for large build outputs | used by the packaging flow |

## Verification and benchmarks

| tool | what it does | run |
| --- | --- | --- |
| `benchmark-browser` | Builds an example and measures rendering/FPS in headless Chrome | `npm run benchmark:browser` |
| `benchmark-simulation` | Headless throughput for `mwg/simulation` (no frame, canvas, or Pixi involved) | `npm run benchmark:simulation` |
| `graphics-capabilities` | Probes the host's WebGL capabilities headless | `npm run graphics:capabilities` |

## Project chores

| tool | what it does | run |
| --- | --- | --- |
| `roadmap-progress` | Reports ROADMAP.md completion, optionally in a browser | `npm run roadmap:progress` |
| `build-webpage-examples` / `build-webpage-docs` | Generate the live examples and API reference under `webpage/` | `npm run webpage:examples`, `npm run webpage:docs` |
| `make-example-diagrams` / `make-architecture-diagrams` | Rebuild the generated diagrams under `webpage/assets` (never hand-drawn) | `npm run webpage:diagrams` |
