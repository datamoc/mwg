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
| `mwl` | Compiles MWL content (`[game]`/`[scenario]`/`[side]`/`[unit]`/`[event]`/`[campaign]`) into a game-data module, an i18n catalog and an asset manifest | `npm run mwl -- build <contentDir> -o <outDir>` |
| `extract-html` | Splits the resources embedded in an HTML file (scripts, CSS, images) back out into files | `npm run extract:html -- <page.html> -o <outDir>` |

## Shipping (`file://`)

| tool | what it does | run |
| --- | --- | --- |
| `compile-resources` | Turns an asset folder into `data:` URI scripts under `window.__MWG_ASSETS__`, grouped by top-level folder. `toWebp: true` converts `.png`/`.jpg`/`.jpeg` to WebP first (lossless by default, only kept when actually smaller, key unchanged) via the optional `sharp` devDependency, dynamically imported only when used (item 350) | called by the example builds; `node tools/compile-resources.mjs <asset folder> <output folder> [--to-webp] [--webp-lossy[=quality]]` |
| `webp-convert` | Converts one raster image buffer (PNG/JPEG) to WebP, lossless by default; the standalone half of `compile-resources`'s `toWebp` option (item 350) | `node tools/webp-convert.mjs <file.png\|file.jpg> [--lossy[=quality]]` |
| `emit-page` | Rewrites an example's vite build (classic script tag, inlined assets) so it opens from `file://` with no server | called by each `example:*:build` script |
| `classic-html` | Rewrites a bundler build's `<script type="module">` entry tag to a classic deferred script, the shipped, reusable half of what `emit-page` does for this repo's own examples (item 306) | `node -e "..."` calling `toClassicScript` from a game's own build script, or `node tools/classic-html.mjs dist/index.html` directly |
| `compress-dist` | Writes `.gz`/`.br` siblings for large build outputs | used by the packaging flow |
| `single-file` | Inlines every `<script src>` an `emit-page` output loads into one additional standalone HTML file, no sibling `.js` at all; `compress: true` compresses each script first (gzip by default, or `algorithm: 'brotli'`), unpacked at load through the browser's own `DecompressionStream` behind a splash screen. Brotli needs `DecompressionStream('br')`, unsupported in a directly-tested current Chrome (153) as of this writing - gzip is the broadly-supported default, brotli an advanced option that degrades to a clear, catchable error rather than hanging (items 349, 350) | `node tools/single-file.mjs <dist folder> [--compress[=level]] [--brotli[=quality]] [--no-splash] [--output name.html]`, or `emit-page --single-file [--single-file-compress[=level]] [--single-file-brotli[=quality]]` |

## Verification and benchmarks

| tool | what it does | run |
| --- | --- | --- |
| `benchmark-browser` | Builds an example and measures rendering/FPS in headless Chrome | `npm run benchmark:browser` |
| `benchmark-simulation` | Headless throughput for `mwg/simulation` (no frame, canvas, or Pixi involved) | `npm run benchmark:simulation` |
| `benchmark-animation` | CSS/SVG element animation vs Pixi sprites vs both, at increasing counts, sampling rAF intervals in headless Chrome. A measurement, not a gate | `npm run benchmark:animation` |
| `graphics-capabilities` | Probes the host's WebGL capabilities headless | `npm run graphics:capabilities` |
| `visual-smoke` | Opens one built example from `file://` in headless Chrome, fails on a page error or a blank canvas, and writes a screenshot. Runs per pull request in CI | `npm run visual:smoke:ui` |
| `package-smoke` | `npm pack`, installs the tarball outside the repo, builds the tutorial's tiny game and opens both that and the standalone global from `file://` | `npm run package:smoke` |
| `motion-smoke` | Opens the interface example three ways (no preference, an emulated `prefers-reduced-motion: reduce`, and a flip while the page is open) and asserts the demo's own state: the preference arrives, stops the motion, and is seen when it changes | `npm run motion:smoke` |
| `build-all-examples` | Runs every `example:*:build` script, so a vite/emit-page regression in any example is caught, not just the benchmarked ones | `npm run examples:build` |
| `bundle-size` | Compares the global bundle and `dist` against the committed `tools/bundle-size.json` budget; `--update` rewrites it | `npm run size:check` |

## Project chores

| tool | what it does | run |
| --- | --- | --- |
| `roadmap-progress` | Reports CLOSED.md + ROADMAP.md completion: numbered items in batches of 25, plus the 1.0 exit checklist on its own row (checks to run, not capabilities, so they stay out of the numbered totals), optionally in a browser | `npm run roadmap:progress` |
| `build-webpage-examples` / `build-webpage-docs` | Generate the live examples and Documentation page under `webpage/` (`REFERENCE.md` guide + TypeDoc under `documentation/api/`) | `npm run webpage:examples`, `npm run webpage:docs` |
| `make-example-diagrams` / `make-architecture-diagrams` | Rebuild the generated diagrams under `webpage/assets` (never hand-drawn) | `npm run webpage:diagrams` |
| `api-report` | Regenerates `API_REPORT.md` from the built declarations; `--check` compares instead. A CI gate | `npm run api:report`, `npm run api:check` |
| `project-stats` | Writes `PROJECT_STATS.json`/`PROJECT_STATS.md` and the website statistics page; `--check` compares. A CI gate | `npm run stats:write`, `npm run stats:check` |
| `ci-status` | Waits for every workflow run of `HEAD` and fails if any of them did | `npm run ci:status` |
| `npm-audit` | Dependency audit that fails for high or critical advisories | `npm run audit` |
| `sbom` | Builds the committed CycloneDX 1.6 SBOM (`sbom.cdx.json`) from `package.json` and `package-lock.json` alone, with no network or added dependency. Its `serialNumber` is a version-5 UUID over the document's own content and it carries no timestamp, so the file stays reproducible; `--check` compares instead. A CI gate | `npm run sbom`, `npm run sbom:check` |
