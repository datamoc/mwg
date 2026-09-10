# MWL content layout

This deliberately small example keeps authored content outside the TypeScript
engine code:

```sh
npm run mwl -- build examples/mwl-content/content -o examples/mwl-content/generated
```

The command reads the files recursively and emits `game-data.ts`, `i18n.json`,
and `assets.json`. The paths in `assets.json` are logical paths. The game's own
asset step decides how to resolve or package them.

The same layout works for a Wesnoth port whose input files are native `.cfg`:
that port uses its WML front end and adapter before invoking the MWL compiler.

This folder is also an executable end-to-end example. `main.ts` imports the
generated `game-data.ts`, renders its units, items, map and event, and exposes
the AI hook reference. Run `npm run example:mwl-content:build`, then open
`dist/index.html` directly. The page does not parse MWL at runtime.
