# Website TODO

## Done

- Landing page (`index.html`) with the live multiply/add colour-transform demo,
  the capability-spec table, the `file://` table, and the roadmap.
- **Getting started**: a full step-by-step tutorial (skeleton page through a
  finished ~60-line scene: floor, movable character, following camera, a hit
  flash, a status label, and the `file://` build step).
- **Documentation**: generated from the source's own doc comments with
  TypeDoc, reskinned to match the site (`webpage/assets/typedoc-theme.css`,
  favicon wired in). Covers every shipped module automatically: nothing to
  keep in sync by hand, and it stays accurate as the API grows.
- **Examples**: eleven example builds (colour-transform, interface, dialogue,
  dungeon, village, battle, minigame, chess, tower defense, 3D, loading
  lifecycle). `index.html` lists them as cards with no live iframe - eleven
  simultaneous WebGL contexts is more than a phone (and plenty of laptops)
  can hold at once - and each one actually plays on its own `view.html?ex=<id>`
  page, one iframe at a time, with prev/next links to the next example and
  an "open full screen" link straight to the built game.
- **FAQ**: 8 real questions (status, editor, licensing/provenance, the
  `file://` build requirement, i18n status, Node-as-dev-tool, what it's built
  on).
- **Deployed**: live at https://datamoc.github.io/mwg/ via
  `.github/workflows/deploy-pages.yml`, which builds the examples and
  TypeDoc reference and deploys `webpage/` on every push to `main`.
- **Social previews**: `og:`/`twitter:` meta tags on the four hand-authored
  pages (overview, getting-started, examples, FAQ), pointing at
  `webpage/assets/og-image.png` (1080x567, see "Regenerating the OG image"
  below for why not the canonical 1200x630).

This is at least the scope of the reference site this was benchmarked
against (rastating's pixel.js docs: overview, 2 examples, getting-started,
one API page per class, 6 FAQ entries). mwg's version has 4 examples, a
generated (so exhaustive and always current) API reference, and 8 FAQ
entries.

## Generated content, not committed

`webpage/examples/{colour-transform,interface,dialogue,dungeon,village,battle,minigame,chess,tower-defense,three-d}/` and
`webpage/documentation/` are **build output**, gitignored (the former the
same way `examples/*/dist` already is). Regenerate both with:

```
npm run webpage:examples
npm run webpage:docs
```

before viewing the site or deploying it. `webpage/examples/index.html`,
`view.html`, and `examples-data.js` (the one place each example's title,
description, and controls are written down - both pages read it, so there
is nowhere for the two to drift apart) are hand-authored and tracked
normally; nothing under `webpage/documentation/` is hand-authored any more,
see "Why TypeDoc needs its own TypeScript" below before touching it.

### Why TypeDoc needs its own TypeScript

`npm run webpage:docs` runs `tools/build-webpage-docs.mjs`, which installs
and runs TypeDoc from an **isolated nested npm project at `tools/docs/`**,
not from the root `node_modules`. Reason: TypeDoc's analysis needs the
classic TypeScript compiler API (`ts.createProgram`, `ts.SyntaxKind`, the
checker), and `typescript@7`'s package (pinned at the project root) no
longer exposes that API through its main entry point; it ships a new native
compiler with a different surface instead (`require('typescript')` there
gives you only `{ version, versionMajorMinor }`). `tools/docs/package.json`
pins `typescript@6.0.3` purely so TypeDoc has a compatible checker to parse
the (perfectly ordinary) source with; this never touches the root
project's own `build`/`check`/`test` scripts, which keep using the real
typescript@7. Revisit this once TypeDoc (stable or its `1.0.0-dev.*` line,
both tried and both currently crash the same way) ships real typescript@7
support, and the nested project can go away.

### Regenerating the OG image

`webpage/assets/og-image.html` is authored at the canonical size, 1200x630
(`.card`), but the browser available when it was first captured couldn't
open a viewport wider than ~1080px (a portrait-capped mobile viewport). So
`og-image.png` was captured at 1080x567 instead (same 1.91:1 ratio, just
smaller) via a `capture-1080` class the file already has toggled at
runtime (`document.body.classList.add('capture-1080')`), which shrinks the
canvas and scales `.card` down to fit, then crops that exact region. If a
proper 1200-wide viewport is available later, just screenshot the page
without that class for the full-resolution version.

## Still open

- [ ] Revisit the roadmap list in `index.html` whenever the real API changes;
      it's kept in sync by hand, not generated (unlike the Documentation
      page now).
- [ ] The Battle for Wesnoth was added as a 6th reference (README.md,
      capability spec, roadmap, FAQ) and hexagonal tile maps are now a
      documented, planned capability, but nothing was implemented. When
      `mwg/render`'s hex tile map and `mwg/roguelike`'s hex FOV/pathfinding
      actually ship, add them to the Documentation page and flip the
      roadmap item from "planned" to "shipped".
