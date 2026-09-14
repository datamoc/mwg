# Roadmap

Each module ships in the order below - later ones build on the modules before them. Order
among what is still open is reevaluated periodically, not just appended to. Entries below
mention "the capability spec" and other [README.md](README.md) sections by name; that's
where those live.

The shipped, numbered build history (everything through item 349) has moved to
[CLOSED.md](CLOSED.md), so this file stays to what is actually open: new numbered items,
parked decisions, and the 1.0 exit checklist. Item numbers are never reassigned, so a new
item continues the sequence in CLOSED.md rather than restarting at 1.

There is no open numbered item right now - the roadmap can legitimately reach zero, and did
before (see CLOSED.md's own note on 2026-09-11). What's left before 1.0 is the exit checklist
below.

### Parked decisions

Not open work, and not forgotten: these are decisions this project has deliberately
deferred, each with a note on what would un-park it. They stay out of the numbered list
until someone actually picks them up, because the list records shipped capabilities, not
standing intentions.

- **Item 320: port-owned nested variable writing.** The framework already exposes the shared
  resolver and `emit.setVariable`; fixing `command:set_variable_dynamic` belongs in the
  Wesnoth port, so it is not an MWG deliverable.

- **Item 347: external migration and release work.** Pixel Dungeon and Wesnoth migration,
  project-local CI budgets, and publication belong to those projects, so they are not MWG
  deliverables.

- **Items 28/30: the next reference pick.** Every genre the capability spec committed to
  is covered by the shipped `mwg/board` work (hex tactics, action points, cover,
  overwatch, shared turns, generic pieces). Picking another reference title is only worth
  doing when a game project actually needs a capability no current reference demands;
  the pick itself is a project decision, not framework work.
- **Item 41: board-game semantics beyond the generic piece.** `BoardGrid`/`BoardPiece`
  shipped the primitive shape. What "owned", "captured" and "promoted" should mean is
  tied to whichever board game item 30 eventually picks, so it un-parks together with 28/30.
- **The Wesnoth port's non-adoption review (2026-09-12).** The counterpart to the reports that
  became items 316-321 and 327: a walk of the surfaces MWG offers, naming the ones the port
  deliberately keeps local and why. Nothing in it is a request, and the reasons live here so a
  later session does not have to re-derive them from the port's own code.
  - **`~CHAN`/`~ROTATE` and terrain graphics: MWG's documented scope, not a defect.** `~ROTATE`
    here works on the source pixels (exact at 90-degree multiples), and `~CHAN` is a
    channel-source swap rather than Wesnoth's per-channel expressions - the gap item 255 already
    recorded as "parked if a port needs it". This port needs neither, and keeps its own.
  - **`parsePo`, and markup over its own rich-text pipeline.** The port parses `.po` itself and
    pre-substitutes dotted variables *before* rendering. The second half was real and shipped as item
    329; the first was recorded as item 328 in error, since `parsePo` had existed since item 250 -
    see that item's own note for what the mistaken recording cost. Nothing here waits on the
    framework any more.
  - **`assets.load`'s `optional`/`onMissing` does not fit this port's lookup.** Its own `texture()`
    try/catch with an `EMPTY` fallback already covers a missing frame, and it resolves over a
    data-URI map rather than the path aliases the loader walks.
  - **Generic or no call-site yet: `AttackPreview`/`UnitSelector`/`Whiteboard`/`StoryScreen`/
    `SpriteAttachment`/`LightningArc`/`Camera` rotation/`TerrainGraphicsLayer`/`Projectile`
    animation/`TabbedList`/`Slider`/`CampaignSave`/`EventPresentation`/`SyncGuard`/`SideTurns`/
    `MapFile`/`coneSector`.** The port keeps its Wesnoth-specific versions. `coneSector` is worth
    naming twice: it answers the *Pixel Dungeon* port's P13 (item 322), so this port having no
    call-site for it is the expected result of two ports asking for different things.

### 1.0 exit checklist

The definition of done for 1.0. Each line is a check to run, not a feature to build. Every numbered
item through 349 is closed (see [CLOSED.md](CLOSED.md)); item 347 is external project work, not
an MWG deliverable.
Items 339-340 were planning entries regrouped into 341-342 and 346, and items 338,
341-345 and 346 were implemented or verified against existing APIs. The
Wesnoth-port cluster (247 and up, 311-313 last, plus 314 found
reconciling it) included - all but item 320, which is the port's own side of a disagreement the
framework only invited (319 shipped the framework half), and the [Low] items the ports' reviews
surfaced (327, 329 and 330) are shipped rather than left open, so none of them is a framework
blocker: the
framework's 1.0 is what the ports build against, and both of them being complete is the line below
that says so rather than a numbered item of its own.

- [x] `npm run check`, `npm test`, `npm run build`, and `npm run audit` are all green on
      the release commit. (2026-09-11: green on the 0.7.6 release commit `98c64df`, whose own CI
      run passed all five jobs - 1501 tests, 0 vulnerabilities, clean build. Re-run on the 1.0
      release commit itself, which is the wording this line keeps.)
- [x] `npm run api:check` passes: the committed `API_REPORT.md` matches the built
      declarations exactly. (2026-09-11: passes, after regenerating for `Blob.spread`'s
      return value.)
- [x] `npm publish --dry-run` shows the intended package contents and no `tools/docs`
      leakage (the getting-started page's own hazard, re-checked each release).
      (2026-09-11: 975 files, 1.0 MB packed, 3.8 MB unpacked, and the listing holds no
      `tools/docs` and no `node_modules` entry.)
- [x] The npm package's map files are decided explicitly, not left to drift: `dist` ships a
      `.js.map` and a `.d.ts.map` beside most modules, a deliberate debuggability choice.
      (2026-09-11: **kept**, with the numbers re-measured - they are 482 of 965 files and
      24% of the gzipped bytes, not the "422 of 845, a much smaller share of the bytes" this
      line used to claim. Kept because what a player downloads is the 1.0 MB tarball, and the
      reader these serve is a consumer debugging a bundled game: the `.d.ts.map` is also what
      makes an editor's go-to-definition land in TypeScript instead of emitted JavaScript.
      Re-decide on packed size, not file count.)
- [x] The getting-started tutorial is followed from scratch, in an empty directory
      outside this repo, once for each documented path: `npm install @datamoc/mw_games
      pixi.js vite`, the `npm pack` + install-by-path `.tgz` fallback, and the no-install
      `mw_games.global.js` script tag. All three reach a working `file://` page.
      (2026-09-11: all three, each a WebGL, game-ready page with no page errors. The registry
      path in `C:\Users\miche\dev\_mwg-tutorial-registry`, against the published 0.7.4 and
      re-run against 0.7.6 once it landed; the `.tgz` and global paths through
      `npm run package:smoke`, whose scratch directory is outside the repo. `package:smoke` now
      names `pixi.js` in the consumer install, so it fails if the tutorial's install line ever
      stops being enough.)
- [x] `pixi.js` moves from `dependencies` to optional `peerDependencies` (item 175's
      decision) and the two npm paths above are re-verified under that new install
      contract before the move ships. (2026-09-11: moved, with `pixi.js` also in
      `devDependencies` so this repo still builds and tests, and the install line named in
      `README`, `REFERENCE.md` and the getting-started page. Re-verified twice: `package:smoke`
      installs the packed tarball plus `pixi.js` and reaches a working `file://` page, and once
      0.7.6 was on the registry the literal registry path was re-run against it - installing
      `@datamoc/mw_games@^0.7.6` alone leaves `node_modules/pixi.js` absent (checked directly),
      the published `dependencies` is `rot-js` only with `pixi.js` a peer `^8.20.1` marked
      `optional`, and `@datamoc/mw_games/core` imports and runs with no Pixi present. 0.7.4 had
      still listed `pixi.js` under `dependencies`, which is exactly why this belonged to 1.0.)
- [x] The public API gets a stability-marker contract: `@experimental` on anything not
      intended as 1.0-stable, called out in release notes, and a `DEPRECATED` convention, so
      1.0 is the last release where a rename or an unstable surface moves silently.
      (2026-09-11: the contract is written in README's API stability note and wired into
      DEVELOPMENT.md's release step 2. Nothing under `src/` carries `@experimental` today,
      which is the honest state rather than an omission: every shipped surface is intended
      stable, so the tag is there for what comes next. Held by review, not by a check.)
- [x] A browser smoke check opens one built example from `file://` and looks at it:
      `npm run visual:smoke:ui` runs the check and writes a screenshot, but a human still
      has to look at it - the class of layout bug 1.0 must not ship is invisible to every
      automated check above. (2026-09-11: looked at
      `benchmark-results/visual-smoke/examples-interface-dist-index.png`. No window off-screen
      or clipped, no text over text, canvas painted to all four edges. The three things the
      eye catches are the demo's own intended widgets, checked in the source rather than
      assumed: the blue square that reads as a detached checkbox is `motionDot`, the animated
      element the label beside it deliberately sits away from, the bare readout is the
      frame-time display, and the unindented bag row is the deliberately un-carryable entry.
      No framework layout defect to fix.)
- [x] CHANGELOG, REFERENCE.md and the website's documentation page are regenerated or
      updated for whatever changed since the last release. (2026-09-11: `npm run webpage:docs`
      regenerates REFERENCE.md and the documentation page, both current; REFERENCE.md gained
      the peer-dependency sentence. CHANGELOG carries a new `[Unreleased]` section covering
      the `Blob` hook and the pixi move, moved to the top where Keep a Changelog puts it, from
      the stale empty one that had been sitting between 0.7.2 and 0.7.1.)
- [ ] **Both reference ports are complete and playable end to end against this release**
      (requested directly, 2026-09-11): the Shattered Pixel Dungeon port
      (`mwg-pixel-dungeon`) and the Wesnoth port (`mwg-wesno`, an empty directory today). This
      is the one line here that is not a check to run in this repo - it depends on two other
      projects - and it earns its place in the 1.0 definition of done because finished games are
      what validate the framework, where the examples only exercise it. The current 0.x release
      is what the ports build against in the meantime.
