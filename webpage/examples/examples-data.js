/**
 * One entry per built example. Shared between index.html (a card grid, no iframes - a phone
 * cannot afford eleven live WebGL contexts on one page) and view.html (exactly one iframe at
 * a time). No build step: plain data, opened straight from disk like the rest of this site.
 */
window.MWG_EXAMPLES = [
	{
		id: 'three-d',
		title: 'Babylon.js 3D',
		description:
			'An optional WebGL scene with an orbit camera, square and hex terrain, elevation columns, a continuous heightmap hill, and continuously moving mesh and billboard characters.',
		controls: 'drag to orbit &nbsp;&middot;&nbsp; wheel to zoom',
	},
	{
		id: 'chess',
		title: 'Chess',
		description:
			'Chess against a small deterministic alpha-beta computer player, with legal moves, check, checkmate, stalemate, castling, en passant, and promotion.',
		controls:
			'click a square, or hold an arrow key to move the cursor and <kbd>Enter</kbd> to select/move &nbsp;&middot;&nbsp; <kbd>Esc</kbd> reset',
	},
	{
		id: 'minigame',
		title: 'Lockpick minigame',
		description:
			'A timing challenge layered over a room scene. It demonstrates scene stacking, suspension, and returning a result to the scene underneath.',
		controls: '<kbd>Enter</kbd> stop the needle &nbsp;&middot;&nbsp; <kbd>Esc</kbd> leave the minigame',
	},
	{
		id: 'village',
		title: 'Village',
		description: 'A small RPG map with an NPC, branching conversation, game state, and an autorun cutscene.',
	},
	{
		id: 'battle',
		title: 'Battle',
		description: 'A creature battle with type effectiveness, speed-ordered turns, damage, leveling, and evolution.',
	},
	{
		id: 'tower-defense',
		title: 'Tower defense',
		description: 'A simple lane defense demo using timed waves, tower targeting, damage, rewards, and lives.',
	},
	{
		id: 'colour-transform',
		title: 'Colour transform',
		description:
			'4000 individually tinted sprites, each carrying the per-sprite <code>texel &times; M + A</code> transform that <a href="../index.html#demo">the landing page demo</a> shows in miniature; Pixi\'s own tint could not draw this scene.',
		buildNote: 'Blank? Build the examples first: <code>npm run webpage:examples</code> (see the repository\'s <code>webpage/TODO.md</code>).',
	},
	{
		id: 'interface',
		title: 'Interface',
		description:
			'Windows that stack, with keyboard focus going to the top one only; a list with icons and disabled rows; a message box that reveals text a character at a time and ends on a choice.',
		controls:
			'<kbd>Tab</kbd> open the bag &nbsp;&middot;&nbsp; <kbd>Enter</kbd> talk to someone &nbsp;&middot;&nbsp; arrow keys navigate &nbsp;&middot;&nbsp; <kbd>Esc</kbd> close a window',
	},
	{
		id: 'dialogue',
		title: 'Dialogue',
		description:
			'A conversation scene: a backdrop, Alice and Bob standing in front of it with expressions, whoever is speaking lit while the other is dimmed, and a branching choice. The whole scene is a list of data commands.',
		controls: '<kbd>Enter</kbd> / <kbd>Space</kbd> advance the conversation',
	},
	{
		id: 'dungeon',
		title: 'Dungeon crawl',
		description:
			'A playable roguelike floor: generated rooms and corridors, three-state fog of war, bump-to-attack, monsters that give chase, stairs down. The full <code>roguelike</code> module working together with <code>render</code> and <code>ui</code>.',
		controls:
			'arrow keys or numpad move and bump to attack &nbsp;&middot;&nbsp; <kbd>5</kbd> / <kbd>.</kbd> wait &nbsp;&middot;&nbsp; <kbd>&gt;</kbd> descend on the stairs',
	},
	{
		id: 'loading',
		title: 'Loading lifecycle',
		description:
			'<code>core.LoadQueue</code> running named, weighted tasks - an asset load, a simulated world generation that fails once on purpose, an <code>assets.AssetStream</code> preload of a likely-next area - with <code>ui.LoadingScreen</code> showing truthful progress against it, including the failed state and its retry/cancel buttons.',
		controls: 'watch it fail once, then press Retry &nbsp;&middot;&nbsp; Cancel stops it mid-task',
	},
];
