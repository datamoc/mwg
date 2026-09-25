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
| `mwl` | Compiles MWL content (`[game]`/`[scenario]`/`[side]`/`[unit]`/`[event]`/`[campaign]`) into a game-data module, an i18n catalog and an asset manifest | `npm run mwl -- build <contentDir> -o <outDir>`, or `node node_modules/@datamoc/mw_games/tools/mwl.mjs build <contentDir> -o <outDir>` from an install. It is a command line, not an importable module (it dispatches when loaded), so it has no package subpath; script against the typed library instead: `@datamoc/mw_games/mwl` |
| `extract-html` | Splits the resources embedded in an HTML file (scripts, CSS, images) back out into files | `npm run extract:html -- <page.html> -o <outDir>`, or `extractHtml` from `@datamoc/mw_games/tools/extract-html` |

## Shipping (`file://`)

| tool | what it does | run |
| --- | --- | --- |
| `compile-resources` | Turns an asset folder into `data:` URI scripts under `window.__MWG_ASSETS__`, grouped by top-level folder. `toWebp: true` converts `.png`/`.jpg`/`.jpeg` to WebP first (lossless by default, only kept when actually smaller, key unchanged) via the optional `sharp` devDependency, dynamically imported only when used (item 350) | called by the example builds; `node tools/compile-resources.mjs <asset folder> <output folder> [--to-webp] [--webp-lossy[=quality]]` |
| `webp-convert` | Converts one raster image buffer (PNG/JPEG) to WebP, lossless by default; the standalone half of `compile-resources`'s `toWebp` option (item 350) | `node tools/webp-convert.mjs <file.png\|file.jpg> [--lossy[=quality]]` |
| `emit-page` | Finishes a vite build so it opens from `file://` with no server: compiles the assets, rewrites the entry to a classic deferred script with the asset scripts before it, then optionally precompresses and writes a single-file variant (item 381) | `emitPage(options)` from `@datamoc/mw_games/tools/emit-page`, the `mwg-emit <folder> [--dist=] [--assets=]` command, or called by each `example:*:build` script here |
| `vite` | The Vite plugin a game uses instead of either: `mwgPage(options)` sets the `file://` build configuration (IIFE `game.js`, `base: './'`, `assets/` as the public folder) and runs `emitPage` when `vite build` finishes (item 381) | `plugins: [mwgPage()]` from `@datamoc/mw_games/tools/vite` |
| `classic-html` | Rewrites a bundler build's `<script type="module">` entry tag to a classic deferred script, the shipped, reusable half of what `emit-page` does for this repo's own examples (item 306) | `import { toClassicScript } from '@datamoc/mw_games/tools/classic-html'` in a game's own build script, or `node tools/classic-html.mjs dist/index.html` here |
| `compress-dist` | Writes `.gz`/`.br` siblings for large build outputs, into the folder it is handed, plus `.xz` where smaller behind the opt-in `xz` option (needs the system `xz` binary) | used by the packaging flow |
| `single-file` | Inlines every `<script src>` an `emit-page` output loads into one additional standalone HTML file, no sibling `.js` at all; `compress: true` compresses each script first (gzip by default, or `algorithm: 'brotli'`), unpacked at load through the browser's own `DecompressionStream` behind a splash screen. Brotli needs `DecompressionStream('br')`, unsupported in a directly-tested current Chrome (153) as of this writing - gzip is the broadly-supported default, brotli an advanced option that degrades to a clear, catchable error rather than hanging (items 349, 350) | `node tools/single-file.mjs <dist folder> [--compress[=level]] [--brotli[=quality]] [--no-splash] [--output name.html]`, `emit-page --single-file [--single-file-compress[=level]] [--single-file-brotli[=quality]]`, or `buildSingleFile` from `@datamoc/mw_games/tools/single-file`. `output` is a file name written inside `dist`, not a path: one with a separator is refused |

## Packaging as a native app

The packaging scaffolding is part of this repository, not of the published package. Its
`files` list ships `dist/`, the `tools/*.mjs` helpers (see the table above), the licence and the markdown
documents, and none of its packaging scripts (`desktop:*`, `mobile:*`, `cap:*`) do: they all
point into this checkout. A game that installs `@datamoc/mw_games` from the registry
therefore supplies its own native shell; the recipe for each target is below.

Build the game without `compress-dist`'s `.gz`/`.br` siblings for any native target: a
packaged app has no server to negotiate `Content-Encoding` with, so they are dead weight
(the opt-in `.xz` siblings are the same), and on Android the asset merge fails outright
(`Duplicate resources` from AAPT, which reads `game.js` and `game.js.gz` as colliding).

### Desktop (Windows, WebView2)

The reference host is `desktop/MwgDesktopHost` - two files, `MwgDesktopHost.csproj` and
`Program.cs`. Copy that one folder into your project and point it at the game's built
`dist/`:

```powershell
cp -r <a clone of mwg>/desktop/MwgDesktopHost ./desktop/MwgDesktopHost
dotnet run --project desktop/MwgDesktopHost -- dist/index.html
```

The argument is resolved against the directory the command runs from, so it can be relative;
with no argument the host loads this repository's own tower-defense example, which is what
`npm run desktop:run` does. It needs the .NET 8 SDK (`winget install Microsoft.DotNet.SDK.8`)
and the WebView2 Runtime, already present on current Windows.

The host serves the page through `CoreWebView2.SetVirtualHostNameToFolderMapping`, mapping
`https://mwg.local/` to the page's own folder rather than navigating to `file://`. That real
origin is what lets `assets.fetchWithByteProgress`, a `LockstepClient` WebSocket connection,
or any other genuine network call work inside the app; `file://` blocks all of them. A game
that needs none of that can use `desktop/webview2` instead, which opens the same built page
from `file://` and takes the same page argument.

`dotnet publish -c Release -r win-x64 --self-contained true` inside the host project produces
a distributable build.

### Mobile (Capacitor, Android)

`android/` and the `cap:*` scripts are this repository's own scaffold, so copy the shape of
them rather than the files: a game creates its own Capacitor project. Toolchain first, since
these are the two that stop a clean machine:

- **JDK 21** (`winget install EclipseAdoptium.Temurin.21.JDK`), with `JAVA_HOME` pointing at it.
  Capacitor's Android Gradle Plugin will not compile under JDK 17: `invalid source release: 21`.
- **Android SDK** with `platform-tools`, and either `ANDROID_HOME` set or an
  `android/local.properties` written by hand with `sdk.dir=C:/path/to/Android/Sdk`. Forward
  slashes work; backslashes have to be doubled, and a properties file with single backslashes
  silently loses every separator and fails much later as an unreadable path.

Then, from the game's own folder:

```powershell
npm install --save-dev @capacitor/cli @capacitor/core @capacitor/android
# capacitor.config.json: { "appId": "com.example.yourgame", "appName": "Your Game", "webDir": "dist" }
npx cap add android        # once: scaffolds android/
npx cap sync android       # after every web rebuild: copies dist/ into the project
cd android && ./gradlew assembleDebug      # gradlew.bat on Windows
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.example.yourgame/.MainActivity
```

`assembleDebug` produces an installable APK; a release build needs signing, which is yours to
arrange. `adb` comes with the SDK's `platform-tools`; an emulator is
`emulator -avd <name>`, and a cold boot takes a minute before `adb install` will accept it.

Three things about the generated project are worth knowing before the first bad build, all
three because `cap add android` writes them once and never revisits them:

- **Do not ship `.gz`/`.br` sidecars.** The asset merge fails outright:
  `mergeDebugAssets FAILED ... [public/game.js.gz]: Duplicate resources`, because AAPT reads
  `game.js` and `game.js.gz` as colliding. Build the web output without `compress-dist` for a
  packaged app anyway: there is no server to negotiate `Content-Encoding`.
- **`ignoreAssetsPattern`,** in `android/app/build.gradle`: the generated line ends `!*~`. Add
  `:!*.gz:!*.br` to it, which is what this repository's own `android/` carries. That is the
  second half of the same problem, and it is why MWG tracks `android/` in git at all - a fresh
  `cap add android` would lose it.
- **`versionCode`/`versionName`,** in the same file: written as `1` and `"1.0"` and never
  revised, so an app that ships twice without stamping them cannot be installed over itself
  (`INSTALL_FAILED_VERSION_DOWNGRADE`; Android refuses an update whose `versionCode` has not
  increased). Stamp both from the release that produced the build.

On some Windows hosts the Capacitor CLI itself refuses to start: Node 26 can return `ENOMEM`
from `os.userInfo()`, which Capacitor's terminal helper calls at load. The framework's own
`cap:cli` script works around it, and a game that hits it can too:

```js
// tools/capacitor-node-workaround.cjs, then: node --require ./tools/capacitor-node-workaround.cjs
// node_modules/@capacitor/cli/bin/capacitor add android
const os = require('node:os');
try {
	os.userInfo();
} catch (error) {
	if (error?.syscall !== 'uv_os_get_passwd') throw error;
	os.userInfo = () => ({
		uid: -1,
		gid: -1,
		username: process.env.USERNAME || 'unknown',
		homedir: process.env.USERPROFILE || process.cwd(),
		shell: process.env.COMSPEC || null,
	});
}
```

Verified end to end from a folder outside this repository, against the published package: a
game built with `tools/classic-html`'s `toClassicScript`, `cap add android`, `cap sync`, a real
`gradlew assembleDebug`, then installed and launched on a `Medium_Phone_API_35` emulator, where
the game rendered and its pixels were checked rather than assumed. The duplicate-resource
failure above and the `ignoreAssetsPattern` fix that clears it were both reproduced on that
same build.

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
