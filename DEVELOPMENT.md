# Development guide

This is the maintainer-facing guide for `mwg`. It contains the repository workflow and
implementation constraints that are useful to contributors. The public API is documented
in [REFERENCE.md](REFERENCE.md), and the capability scope is documented in [README.md](README.md).

## Commands

```text
npm run check            # typecheck src, examples, tools and tests
npm run format           # format code with Prettier
npm run format:check     # verify formatting without writing
npm test                 # run the Node test suite
npm run coverage         # the same suite with Node's built-in coverage report
npm run coverage:check   # the same suite under a line/branch/function coverage floor
npm run build            # build the npm package and standalone global IIFE
npm run size:check       # fail if the global bundle or dist grew past its recorded budget
npm run size:update      # rewrite that budget after a deliberate growth
npm run audit            # fail on high or critical dependency advisories
npm run assets           # generate example tiles and sounds
npm run examples:build   # build every example page, not just the benchmarked ones
npm run visual:smoke     # screenshot one built example from file:// and check it rendered
npm run visual:smoke:ui  # build the interface example first, then smoke it
npm run package:smoke    # npm pack + install + open both published paths from file:// (run build first)
npm run stats:write      # regenerate PROJECT_STATS and the website statistics page
npm run stats:check      # verify the committed release statistics are reproducible
npm run motion:smoke     # open the interface example with reduced motion, and with it flipped at runtime
npm run benchmark:animation # CSS/SVG element animation vs Pixi sprites, measured (run build first)
npm run webpage:examples # rebuild playable example pages for the website
npm run webpage:docs     # rebuild the generated API documentation
```

Examples follow the same pattern:

```text
npm run example:<name>       # start its Vite development server
npm run example:<name>:build # build a self-contained page for file://
```

Formatting is Prettier over `src`, `tests`, `examples` and `tools` (`npm run format`,
checked in CI with `npm run format:check`; config in `.prettierrc.json`, generated output
and prose ignored in `.prettierignore`). There is no ESLint rule set on top: formatting keeps
diffs reviewable without a second list of opinions to maintain. The normal verification loop
is `npm run check`, `npm test`, `npm run build`, then opening a built example and looking at
it. Rendering and layout bugs are not visible to the typechecker, which is what the two
smokes and the every-example build are for. `npm run coverage` reuses the same suite with
Node's built-in `--experimental-test-coverage`, so coverage costs no dependency; use it in the
simplify pass to find untested branches and exports nothing imports any more, and
`npm run coverage:check` is the CI floor a little below the current numbers. Both commands
exclude `Game.ts`, `ColorTransformBatcher.ts`, `Minimap.ts`, `three-d/Vox.ts`,
`DialogueStage.ts`, `EventDialogue.ts`, and all of `two-d/ui/**`: their correctness is Pixi
rendering and layout, which a coverage percentage cannot see either way, so they are verified
by the visual smokes and by looking at a built example instead, and excluded here rather than
counted as untested against a bar they were never meant to clear. `npm run size:check` compares
the built global bundle and `dist` against the committed `tools/bundle-size.json` budget, so an
unexplained growth fails rather than ships.

## Architecture boundaries

- `core` is renderer-free and imports no other `mwg` module. It owns scene lifecycle,
  input, signals, saves, random streams and related game logic, deliberately alongside a
  handful of optional network-facing clients (`HttpTransport`, `TelemetryClient`, `NewsClient`,
  `FeedbackClient`, `SaveSyncClient`, `LockstepClient`): they belong here rather than a
  separate module because none of them may depend on a renderer either, and `core` is exactly
  "what needs no renderer", not "what every game must use". A game imports only the names it
  calls; nothing about placement here forces using all of them.
- `two-d` contains PixiJS rendering, UI and dialogue presentation.
- `three-d` contains the optional Babylon.js path, published at the `3d` subpath.
- `i18n`, `actors`, `world`, `battle`, `simulation`, `roguelike`, `board`, `audio`, `rpg`,
  `ai`, `mwl` and `assets/paths` are renderer-free.
- Pixi batcher and high-shader internals belong only in
  `src/two-d/render/ColorTransformBatcher.ts` (checked by `tests/renderer-isolation.test.ts`).
- Each source module has an `index.ts` barrel. The root `src/index.ts` defines the root
  package surface and the standalone `window.mw_games` build.

The renderer-isolation tests walk the real import graph. Keep the boundaries true in code,
not only in documentation.

## The `file://` requirement

Every shipped example must run by double-clicking a local HTML file, without a server:

- assets are compiled into data URIs by `tools/compile-resources.mjs`;
- the library global build is a classic IIFE rather than an ES module;
- `tools/emit-page.mjs` rewrites the Vite entry script and inlines compiled assets;
- relative TypeScript imports keep their `.ts` extension until the emit step rewrites them.

Do not replace this with a server-only solution for convenience.

### Build options

`emit-page.mjs` runs the pipeline above for every example, and exposes three independent
choices on top of it - multi-file vs. single-file, compression, and image format - each a flag,
none forced on the others (see `tools.md` for the full flag reference):

- **Multi-file (default) vs. single-file.** The default output is `dist/index.html` plus a
  handful of sibling `.js` files (the classic-script bundle, one or more compiled-asset
  scripts). `--single-file` additionally writes `dist/standalone.html`
  (`tools/single-file.mjs`): every one of those scripts inlined into that one file, with no
  sibling `.js` at all. Both outputs are written; single-file is additive, not a replacement,
  so pick whichever a given distribution channel needs (a bug report attachment, an itch.io
  upload, a USB stick) without re-running the build differently.
- **Compression, single-file only.** Inlined scripts are plain text by default. `--single-file-
  compress[=level]` gzips them (level 1-9, default 9); `--single-file-brotli[=quality]`
  compresses with brotli instead (quality 0-11, default 11), usually smaller. Either way the
  bytes are unpacked in the browser via `DecompressionStream`, not a shipped decoder, so
  compression adds nothing to the page itself - only a requirement that the browser opening it
  actually implements that `DecompressionStream` format. gzip is the broadly-supported choice;
  brotli's `DecompressionStream('br')` support varies enough across current browsers (verified
  directly, not assumed - see item 350 in `CLOSED.md`) that it is worth treating as an
  advanced option for a known target browser rather than a default for unknown players. A
  browser missing the requested format fails visibly with a clear error rather than hanging.
- **Image format.** `--to-webp` runs `tools/compile-resources.mjs`'s `toWebp` option over the
  example's own assets before they are inlined: `.png`/`.jpg`/`.jpeg` sources convert to WebP,
  lossless by default (`--webp-lossy[=quality]` opts into lossy re-encoding instead), and only
  when the result is actually smaller - never a silent quality trade a game did not ask for.
  Needs the optional `sharp` devDependency; a build that never passes `--to-webp` never needs
  it installed.

None of these change what a game calls to load an asset (`load('sprite.png')` keeps working
identically whether that path resolved to a PNG or a WebP `data:` URI) or how the page is
opened (`file://`, no server, either way).

## Release process

1. Update `package.json` and `src/version.ts` to the same version.
2. Add a dated Keep a Changelog entry describing what actually shipped, calling out anything
   experimental or deprecated in it: a new `@experimental` surface (README's API stability note)
   and every new `@deprecated` rename or removal.
3. Run `npm run check`, `npm test`, `npm run build`, `npm run stats:write`,
   `npm run stats:check`, and `npm publish --dry-run`.
4. Commit the release as one commit, using the existing `release: x.y.z, summary` style.
5. Push `main`, create the annotated `vX.Y.Z` tag, push the tag, and create the GitHub release:

   ```text
   git push origin main
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes
   ```

A major release (`x.0.0`) also takes its name from the alphabetical list in README's versioning
note (1.0 an A name, 2.0 a B name, and so on). None are chosen yet, so today this is a reminder
rather than a value to fill in; README is where a chosen name should be recorded.

The GitHub release triggers the npm publishing workflow. If npm staging is enabled, the
repository owner completes the final 2FA approval with `npm stage list` and
`npm stage approve <stage-id>`.

After any push, check the workflows **by commit**, with `npm run ci:status`: it waits for every run
of that sha and exits non-zero if one failed. Asking `gh run list --limit=1` instead is wrong in a
way that looks right, because right after a push it still answers about the previous commit, which
is how a commit once shipped here reported green while its CI had failed on `stats:check`. A failed
run of a commit that has since been fixed is worth leaving in history rather than rewriting: say so,
and check the tip.

## Website and tutorial verification

When the getting-started tutorial changes, test both documented paths from an empty
directory: an npm install using the package, and a no-install path using the standalone
`mw_games.global.js`. Both must reach a working `file://` page, not only a Vite dev server.
