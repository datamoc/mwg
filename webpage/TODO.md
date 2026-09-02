# Website TODO

## Done

- Landing page (`index.html`) with the live multiply/add colour-transform demo,
  the capability-spec table, the `file://` table, and the roadmap.
- **Getting started**: a full step-by-step tutorial (skeleton page through a
  finished ~60-line scene: floor, movable character, following camera, a hit
  flash, a status label, and the `file://` build step).
- **Documentation**: generated from the source's own doc comments with
  TypeDoc, reskinned to match the site (`webpage/assets/typedoc-theme.css`,
  favicon wired in). Covers every shipped module automatically — nothing to
  keep in sync by hand, and it stays accurate as the API grows.
- **Examples**: all four example builds (colour-transform, interface,
  dialogue, dungeon) embedded live in iframes, each with a "open full screen"
  link and its controls.
- **FAQ**: 8 real questions (status, editor, licensing/provenance, the
  `file://` build requirement, i18n status, Node-as-dev-tool, what it's built
  on).

This is at least the scope of the reference site this was benchmarked
against (rastating's pixel.js docs: overview, 2 examples, getting-started,
one API page per class, 6 FAQ entries) — mwg's version has 4 examples, a
generated (so exhaustive and always current) API reference, and 8 FAQ
entries.

## Generated content — not committed

`webpage/examples/{colour-transform,interface,dialogue,dungeon}/` and
`webpage/documentation/` are **build output**, gitignored (the former the
same way `examples/*/dist` already is). Regenerate both with:

```
npm run webpage:examples
npm run webpage:docs
```

before viewing the site or deploying it. `webpage/examples/index.html` (the
page around the iframes) is hand-authored and tracked normally; nothing
under `webpage/documentation/` is hand-authored any more — see "Why TypeDoc
needs its own TypeScript" below before touching it.

### Why TypeDoc needs its own TypeScript

`npm run webpage:docs` runs `tools/build-webpage-docs.mjs`, which installs
and runs TypeDoc from an **isolated nested npm project at `tools/docs/`**,
not from the root `node_modules`. Reason: TypeDoc's analysis needs the
classic TypeScript compiler API (`ts.createProgram`, `ts.SyntaxKind`, the
checker), and `typescript@7`'s package — pinned at the project root — no
longer exposes that API through its main entry point; it ships a new native
compiler with a different surface instead (`require('typescript')` there
gives you only `{ version, versionMajorMinor }`). `tools/docs/package.json`
pins `typescript@6.0.3` purely so TypeDoc has a compatible checker to parse
the (perfectly ordinary) source with — this never touches the root
project's own `build`/`check`/`test` scripts, which keep using the real
typescript@7. Revisit this once TypeDoc (stable or its `1.0.0-dev.*` line,
both tried and both currently crash the same way) ships real typescript@7
support, and the nested project can go away.

## Still open

- [ ] GitHub Pages deployment workflow (approved — repo doesn't exist on
      GitHub yet, no remote configured). Needs to run `npm run assets`,
      `npm run webpage:examples` and `npm run webpage:docs` before
      publishing, then deploy the `webpage/` directory.
- [ ] `og:`/`twitter:` meta tags (approved). `webpage/assets/og-image.html` is
      a self-contained 1200x630 source card (logo + wordmark + tagline) ready
      to screenshot into `webpage/assets/og-image.png` — not yet rendered or
      wired into the pages' `<head>`s. Use a placeholder URL until the repo
      exists on GitHub (see below), then the user will announce it — no need
      to rush the meta tags live before that.
- [ ] Revisit the roadmap list in `index.html` whenever the real API changes
      — it's kept in sync by hand, not generated (unlike the Documentation
      page now).
- [ ] The Battle for Wesnoth was added as a 6th reference (README.md,
      capability spec, roadmap, FAQ) and hexagonal tile maps are now a
      documented, planned capability — but nothing was implemented. When
      `mwg/render`'s hex tile map and `mwg/roguelike`'s hex FOV/pathfinding
      actually ship, add them to the Documentation page and flip the
      roadmap item from "planned" to "shipped".
