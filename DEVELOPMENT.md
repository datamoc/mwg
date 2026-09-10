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
npm run build            # build the npm package and standalone global IIFE
npm run audit            # fail on high or critical dependency advisories
npm run assets           # generate example tiles and sounds
npm run visual:smoke     # screenshot one built example from file:// and check it rendered
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
it. Rendering and layout bugs are not visible to the typechecker. `npm run coverage` reuses
the same suite with Node's built-in `--experimental-test-coverage`, so coverage costs no
dependency; use it in the simplify pass to find untested branches and exports nothing imports
any more.

## Architecture boundaries

- `core` is renderer-free and imports no other `mwg` module. It owns scene lifecycle,
  input, signals, saves, random streams and related game logic.
- `two-d` contains PixiJS rendering, UI and dialogue presentation.
- `3d` contains the optional Babylon.js path.
- `i18n`, `actors`, `world`, `battle`, `simulation`, `roguelike`, `board`, `audio`, `rpg`,
  and `assets/paths` are renderer-free.
- Pixi batcher and high-shader internals belong only in
  `src/two-d/render/ColorTransformBatcher.ts`.
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

## Release process

1. Update `package.json` and `src/version.ts` to the same version.
2. Add a dated Keep a Changelog entry describing what actually shipped.
3. Run `npm run check`, `npm test`, `npm run build`, and `npm publish --dry-run`.
4. Commit the release as one commit, using the existing `release: x.y.z, summary` style.
5. Push `main`, create the annotated `vX.Y.Z` tag, push the tag, and create the GitHub release:

   ```text
   git push origin main
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes
   ```

The GitHub release triggers the npm publishing workflow. If npm staging is enabled, the
repository owner completes the final 2FA approval with `npm stage list` and
`npm stage approve <stage-id>`.

## Website and tutorial verification

When the getting-started tutorial changes, test both documented paths from an empty
directory: an npm install using the package, and a no-install path using the standalone
`mw_games.global.js`. Both must reach a working `file://` page, not only a Vite dev server.
