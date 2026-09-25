# Roadmap

Each module ships in the order below - later ones build on the modules before them. Order
among what is still open is reevaluated periodically, not just appended to. Entries below
mention "the capability spec" and other [README.md](README.md) sections by name; that's
where those live.

The shipped, numbered build history (everything through item 371) has moved to
[CLOSED.md](CLOSED.md), so this file stays to what is actually open: new numbered items,
parked decisions, and the 1.0 exit checklist. Item numbers are never reassigned, so a new
item continues the sequence in CLOSED.md rather than restarting at 1.

Items 372-389 are open: the security review of 2026-09-25 (372-379), the consumer-side
SBOM it led to (380), and the repository-only tools worth shipping to a game (381-389). Before them, no numbered item was open: items 357 (the mobile consumer
recipe), 358 and 359 (the two the Pixel Dungeon study raised as P19 and P20), 360 (the renderer resolution bound),
361 (grid indexing, from the Wesnoth port's own MWG backlog), 362 (declarative MWL
cross-table reference checks, Pixel Dungeon study proposal P21), 363 (persisted player
settings: music/sfx levels, mute, zoom, bindings, and a game-defined custom bag), 364
(a ready-made settings screen over those values), 365 (auto-pause and auto-mute on
page hide), 366 (frame-time quality scaling over the static fit), 367 (audio ducking
for dialogue and menus), 368 (a discrete meter widget: hearts, stars, pips), 369
(skip animation work for off-screen sprites), 370 (the first-class autotile layer) and
371 (the simulation journal's plain-data contract, from a port's boss-fight crash) all
closed, and the shipped history continues in [CLOSED.md](CLOSED.md). What's left
before 1.0 is the exit checklist below.

### Open items

Security review, 2026-09-25. The framework already has real defences: `core/Sanitize.ts` (size
cap, control characters, `validateSchema`, `assertNoForbiddenKeys`) guards `importSlot`,
`NewsClient`, MWL saves and replays. `src/` holds no `innerHTML`, `eval` or `new Function`, and
text is drawn on the canvas. The Lua host strips `os`/`io`/`debug`/`package`/`require`/`load` and
limits instruction counts. Telemetry defaults to off, and publishing uses OIDC trusted
publishing. What these items fix is that the defences are opt-in and uneven. The design
constraint shared by 372-378 is **secure by default: a game that changes nothing gets the
protection**, and an opt-out is explicit and named. Ordered by risk, not by when they were
found.

376. [Medium] Fuzz the decoders inside `npm test`: seeded random and mutated inputs against
    `decodeMarshal`, `loadTiledMap`, the MWL grammar, save import, `deserializeReplay` and
    `parseTwee`, asserting only "a named `Error`, never a hang, a stack overflow or a
    non-`Error` throw". Seeded, so it stays deterministic and dependency-free.
377. [Low] Saves under `file://`: prefix keys with a game id and store a checksum beside each
    slot, so a write from another local page is detected and reported as "not this game's
    save" instead of being loaded. Robustness, not confidentiality (nothing protects local
    storage from someone at the keyboard), and README says so in one sentence: never put a
    secret in a save.
378. [Low] Telemetry output bounds: a length cap on string properties and an optional allowlist
    of property names, so a game cannot leak a file path or an email address by accident.
379. [Low] CI hardening: `permissions: contents: read` at the top of `ci.yml` and
    `benchmark-browser.yml` (they inherit the repository default today), actions pinned by
    commit SHA instead of tag, and Dependabot for both npm and Actions to keep those pins
    moving.
380. [Medium] A CycloneDX SBOM for a *consuming* project. Item 315's `tools/sbom.mjs` builds this
    repository's own SBOM and gates it in CI, but a game cannot use it: the tool is not in
    the package's `files` and has no `./tools/sbom` export, its `ROOT` is hard-coded, and
    `sbom.cdx.json` itself is not shipped. `npm sbom --sbom-format cyclonedx` already works in
    a game project (CycloneDX 1.5 from its lockfile), so the gap is narrower and more specific
    than "no SBOM". (a) Ship `sbom.cdx.json` in the package so a game's SBOM can reference the
    framework's own dependency tree. (b) Export `buildSbom` as `@datamoc/mw_games/tools/sbom`
    with a project root argument. (c) The real gap, which neither tool covers: an SBOM of the
    **shipped artifact** rather than of `node_modules`. A game is one tree-shaken IIFE in one
    HTML page, so the lockfile lists dev tooling (vite, TypeScript) that never ships and cannot
    list what was actually bundled. `emit-page` can write `<page>.cdx.json` from vite's module
    graph (the packages whose modules reached the bundle, with their versions and licences)
    plus the compiled assets as `data` components with their hashes.

Repository-only tools a game would use, reviewed 2026-09-25. The package already ships
`compile-resources`, `classic-html`, `single-file`, `compress-dist`, `webp-convert`,
`extract-html` and `mwl` under `tools/`. The pieces below were built for this repository's
own examples and CI, and solve problems every game built on the framework has too. The rule
for each: ship it only once it takes the consumer's project root as an argument, imports
from `dist/` rather than `src/*.ts`, and keeps any heavy dependency (Playwright, `ws`) an
optional peer, so shipping a tool never adds weight to a game that does not use it.
Deliberately not proposed: `api-report`, `project-stats`, `ci-status`, `roadmap-progress`,
the webpage and diagram builders, `package-smoke` and `npm-audit` (a workaround for this
repository's own npm policy), which describe this project rather than a game.

384. [Medium] Ship the translation editor `tools/i18n-edit.mjs`: split-screen terminal editor
    for `i18n` catalogs, JSON/FTL auto-detected, placeholder-drift warnings, and a `--check`
    mode a game's CI can run on every translation. It already has a `.d.mts`, but imports
    `../src/i18n/index.ts` and `../src/two-d/ui/markdown.ts`, which are not in the package, so
    it needs to import from `dist/` first. A game translated into several languages (right-to-left
    ones included, which `i18n.direction()` already supports) gains the most.
385. [Medium] Ship the reference lockstep server `tools/multiplayer-server.mjs`. Its own doc
    comment says "a game using this either runs it as-is or replaces it", but it is not in
    `files`, so a game cannot run it as-is. Ship as `@datamoc/mw_games/tools/multiplayer-server`
    with `ws` an optional peer; it should pick up 372's message validation and 375's transport
    rules at the same time, since a server is exactly where hostile input arrives.
386. [Low] A bundle-size budget for a game: `tools/bundle-size.mjs` gates this repository's
    own global build and `dist` tree against a committed baseline with a tolerance. Taking
    the files to measure and the baseline path as arguments turns it into a CI gate a game can
    reuse for its page size, which matters on mobile.
387. [Low] Frame-rate measurement for a game's page: `tools/benchmark-browser.mjs` (with
    `benchmark-history.mjs`) measures a built page's rendering and FPS in headless Chrome.
    Ship after 383, which it shares its Chrome lookup with.
388. [Low] A `@datamoc/mw_games/testing` subpath with the doubles the framework's own tests keep
    rewriting: `fakeAudio` is defined separately in six test files, next to `fakeFetch`/
    `fakeResponse`, `FakeSocket`, fake gamepads and an in-memory `SaveStorage`. Games test
    against the same injectable seams (`Sound.create`, `HttpTransport.fetch`,
    `LockstepClient.create`), and the repository's own tests lose the duplication. Stays
    dependency-free like the rest of the test path.
389. [Low] Two developer-side tools with narrower audiences. `extract-rgssad` (the vendored
    `rgssad-wasm` decoder, MIT) for someone porting a game whose archive they own; it adds the
    `.wasm` to the package, so perhaps a separate package. And the procedural placeholder
    generator `make-example-assets.mjs` (tileset and sounds with no licence history), useful
    for prototyping before real art exists, once it takes an output folder.

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
item through 371 is closed (see [CLOSED.md](CLOSED.md)); item 347 is external project work, not
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
      Re-decide on packed size, not file count. 2026-09-15: re-measured at 0.13.0, the decision
      unchanged - 574 of 1168 files, 22% of the gzipped bytes and 28% of the raw ones, so the
      share held while the package grew.)
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
      (`mwg-pixel-dungeon`) and the Wesnoth port. This
      is the one line here that is not a check to run in this repo - it depends on two other
      projects - and it earns its place in the 1.0 definition of done because finished games are
      what validate the framework, where the examples only exercise it. The current 0.x release
      is what the ports build against in the meantime. (2026-09-15: still open, and the premise
      this line was written on was wrong in one place and stale in another, both corrected here.
      The Wesnoth port is not `mwg-wesno`, which was never used: it is `mwg-wesnoth`, living
      inside a Wesnoth source checkout at `wesnoth-1.19.27/mwg/` - a real port with ~50 source
      files, 41 test files, its own ROADMAP/PORT_COVERAGE/FIDELITY documents and a `release`
      script, not the empty directory this line described. **Neither port claims to be
      complete:** both READMEs open their Status section with "In progress, not yet
      feature-complete", `mwg-pixel-dungeon` naming unported boss arena scripts and the absent
      ally-vs-monster combat system, `mwg-wesnoth` naming a "Playable reference slice" phase it
      has not reached. So the completeness half of this line is a statement about two projects
      that their own maintainers do not yet make, and no work in this repository can make it
      true - closing it means finishing those ports in their own repos, a season of work each,
      not a session here.
      What *is* this repository's half of the line - do both ports build and run against this
      release? - was tested rather than assumed, and holds. `mwg-pixel-dungeon` pins `^0.13.0`,
      with its own `mwg:check` reporting pin, install and published latest all at 0.13.0, its
      `test:mwg` passing 4/4 framework-compatibility checks, its vault/items/Lua verification
      suites passing, its `npm run build` producing a 27.9 MB page from `dist/`, and the built
      game played in a browser at a phone-sized viewport: Sewers level 1 rendering the real
      level, HUD, quickslots and its own localized message log. `mwg-wesnoth` was pinned at mwg
      **0.9.0** and had therefore never been tested against this release at all; with 0.13.0
      placed in its `node_modules` for both names it imports, `tsc --noEmit` passed, all 334
      tests passed, the full vite build succeeded (124 MB `dist/game.js`), and its own
      `npm run verify` booted the built page in headless Chrome from `file://` reporting
      `"ok": true` and `"errors": []`, with The Freelands loaded, six units on a 39x26 hex map
      with real terrain art and the objective on screen. Both ports were left exactly as found,
      including `mwg-wesnoth`'s pinned install restored after that test.
      One thing found along the way and worth someone's attention, since it is outside this
      repository: the Wesnoth port's git repository has **no commits at all** (`git log` reports
      no commits on `master`), so that work exists only as loose files on one disk.)

**Re-verified against the current tree, 2026-09-15** (0.13.0 plus this session's changes, not
the 0.7.6 the notes above were written against). Every check that can be run here was, and the
results are recorded in one place rather than scattered per line:

- `npm run check` clean, `npm test` 2267 passing, `npm run build` clean, `npm run audit`
  0 vulnerabilities.
- `npm run api:check` passes, after regenerating for the new `core` grid exports.
- `npm publish --dry-run`: 1168 files, 1.4 MB packed, 5.2 MB unpacked, and **no leakage** -
  `tools/docs`, `node_modules`, `desktop/`, `android/`, `examples/` and `notes/` all absent from
  the shipped list, with a sanity check on the same extraction confirming that the list itself
  was real. Worth stating because the first attempt at this check parsed the CLI's coloured
  output by column and produced a file list containing none of the files that must ship, which
  would have "passed" the leakage test for the wrong reason; the result above comes from
  `npm pack --dry-run --json` instead.
- The tutorial's install path, re-run through `npm run package:smoke`: `pageErrors: []`,
  `gameReady: true`, WebGL, 1280x720 canvas, and I looked at the screenshot it wrote rather
  than reading only its JSON. Both published-package paths (`npm` tarball and the standalone
  global) reached a working `file://` page. The registry path is still the published 0.13.0's,
  since this session's changes are not published.
- The peer-dependency contract: a bare `npm install` of the packed tarball, in a scratch
  directory with no parent install to shadow it, has **no `pixi.js`**, and
  `@datamoc/mw_games/core` imports and runs there with 71 exports, the new grid functions
  among them. The resolved path was printed to prove the local install answered, after an
  earlier run of this same check silently resolved a stale package in a parent directory.
- The browser smoke check (`npm run visual:smoke:ui`): `pageErrors: []`, `gameReady: true`, and
  the screenshot shows what the line above describes - the `motionDot` square, the
  frame-time readout beside its label, the deliberately un-carryable bag row - with nothing
  clipped and no text over text.
- `REFERENCE.md` and the generated documentation page are current, the former gaining the
  grid-indexing entry and `Game`'s resolution note this session.

**Reevaluated 2026-09-25** (0.16.0 plus item 371, unreleased). No numbered item is open, so
there is no order to change; the question was whether anything should be. The parked decisions
still hold as written: nothing since 2026-09-15 touched nested variable writing (320), external
migration (347), or created a game that needs a new reference pick (28/30) or board semantics
(41). Item 371 is the kind of finding the one open checklist line exists to produce: a port
reaching real content (a boss fight) found a framework contract nobody had stated, which no
example here exercised. That argues for leaving the ports' line as the gate rather than
declaring 1.0 on the in-repo checks alone. Performance: nothing shipped since 2026-09-15 adds
frame time on the render path, and 371 removed one journal copy per undo checkpoint. Re-run
here: `npm run check` clean, `npm test` 2360 passing, `npm run build` clean, `npm run audit` 0
vulnerabilities, `npm run api:check` passing, and `npm pack --dry-run --json` at 1192 files,
1.45 MB packed, 5.41 MB unpacked, with none of `tools/docs`, `node_modules`, `notes/`,
`examples/`, `android/` or `desktop/` in the list. `npm run package:smoke`: both
published-package paths reached a working `file://` page. `npm run visual:smoke:ui` (needed
here because the settings screen, 364, and the meter widget, 368, changed `two-d/ui` since the
last look): `pageErrors: []`, `gameReady: true`, WebGL, and the screenshot looked at, with
nothing clipped or off-screen and no text over text. Both needed `CHROME_PATH` pointed at a
Chromium then; item 383 made the Chrome lookup find Playwright's own browsers, so they no longer do.

What is deliberately *not* re-run: the full tutorial from a clean machine along each of its
three paths, since steps 01-10 are unchanged (only an optional step 11 was added, and its own
commands were verified on a real device); and the release itself, which needs the version bump
and the npm 2FA step, so it stays where the release process puts it.
