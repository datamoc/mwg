/**
 * One entry per built example. Shared between index.html (a card grid, no iframes - a phone
 * cannot afford twenty-one live WebGL contexts on one page) and view.html (exactly one
 * iframe at a time). No build step: plain data, opened straight from disk like the rest of
 * this site.
 *
 * `level` groups examples into the curriculum index.html renders as: 1 (Fundamentals, a
 * single concept in well under 100 lines), 2 (Framework systems, two or three concepts
 * together the way a real screen would), 3 (Complete reference games), and 'tech' (a
 * technical demo specific enough - a render technique, a headless-only module - that it does
 * not teach mwg's everyday shape the way the other three levels do). Array order is also
 * view.html's prev/next order, so it walks the curriculum in the same sequence.
 */
window.MWG_EXAMPLES = [
	// ---------------------------------------------------------------- Level 1: Fundamentals
	{
		id: 'hello-world',
		level: 1,
		diagram: '15_hello_world.svg',
		title: 'Hello, mwg',
		description: '<code>Game</code> &rarr; <code>Scene</code> &rarr; <code>update(dt)</code>, one sprite moving - the smallest thing mwg can show, in well under 100 lines.',
	},
	{
		id: 'loading',
		level: 1,
		diagram: '07_loading.svg',
		title: 'Loading lifecycle',
		description:
			'<code>core.LoadQueue</code> running named, weighted tasks - an asset load, a simulated world generation that fails once on purpose, an <code>assets.AssetStream</code> preload of a likely-next area - with <code>ui.LoadingScreen</code> showing truthful progress against it, including the failed state and its retry/cancel buttons.',
		controls: 'watch it fail once, then press Retry &nbsp;&middot;&nbsp; Cancel stops it mid-task',
	},
	{
		id: 'interface',
		level: 1,
		diagram: '06_interface.svg',
		title: 'Interface',
		description:
			'Windows that stack, with keyboard focus going to the top one only; a list with icons and disabled rows; a message box that reveals text a character at a time and ends on a choice.',
		controls:
			'<kbd>Tab</kbd> open the bag &nbsp;&middot;&nbsp; <kbd>Enter</kbd> talk to someone &nbsp;&middot;&nbsp; arrow keys navigate &nbsp;&middot;&nbsp; <kbd>Esc</kbd> close a window',
	},
	{
		id: 'movement',
		level: 1,
		diagram: '17_movement.svg',
		title: 'Movement',
		description: 'Grid movement and tile collision over two <code>TileMap</code> layers (a full ground layer, a sparse cosmetic decoration layer): <code>Input.onAction</code> + <code>GridMover</code> + a wall-tile collision rule, plus a zoomable, following camera and <code>TileMap.cull(camera)</code> called out on its own.',
		controls: 'arrow keys to move &nbsp;&middot;&nbsp; walk into the pillar or a wall on purpose &nbsp;&middot;&nbsp; Ctrl+wheel to zoom',
	},
	{
		id: 'save-load',
		level: 1,
		diagram: '18_save_load.svg',
		title: 'Save / load',
		description: '<code>core.SaveSystem</code>\'s <code>save</code>/<code>load</code>/<code>delete</code>/<code>list</code>, without dungeon\'s permadeath policy on top.',
	},
	{
		id: 'i18n',
		level: 1,
		diagram: '16_i18n.svg',
		title: 'i18n',
		description: '<code>Catalog</code>, <code>t()</code> interpolation, <code>Intl.PluralRules</code>-backed plurals, and <code>theme.direction</code> flipping to right-to-left.',
	},

	// ---------------------------------------------------------- Level 2: Framework systems
	{
		id: 'dialogue',
		level: 2,
		diagram: '04_dialogue.svg',
		title: 'Dialogue',
		description:
			'A conversation scene: a backdrop, Alice and Bob standing in front of it with expressions, whoever is speaking lit while the other is dimmed, and a branching choice. The whole scene is a list of data commands.',
		controls: '<kbd>Enter</kbd> / <kbd>Space</kbd> advance the conversation',
	},
	{
		id: 'village',
		level: 2,
		diagram: '11_village.svg',
		title: 'Village',
		description: 'A small RPG map with an NPC, branching conversation, game state, and an autorun cutscene.',
		controls: 'arrow keys to move &nbsp;&middot;&nbsp; <kbd>Enter</kbd> to talk to the shopkeeper',
	},
	{
		id: 'event-system',
		level: 2,
		diagram: '13_event_system.svg',
		title: 'Event system',
		description: '<code>GameState</code> + <code>activePage</code> + <code>EventRunner</code>, no map or NPC sprite - a button click stands in for "the player triggered this event". Talking enough times runs a <code>call</code> command that hands over a real item, straight into an <code>actors.Inventory</code> and equipped via <code>EquipmentSlots</code>, changing <code>attack</code> on screen.',
	},
	{
		id: 'world-transition',
		level: 2,
		diagram: '19_world_transition.svg',
		title: 'World transition',
		description: '<code>world.World&lt;M&gt;</code> moving the player between two maps - one persistent (the default, a coin stays collected), one rebuilt fresh every visit.',
		controls: 'arrow keys to move &nbsp;&middot;&nbsp; walk off the left/right edge to cross over',
	},
	{
		id: 'audio',
		level: 2,
		diagram: '12_audio.svg',
		title: 'Audio',
		description: '<code>audio.Music.playTracks</code> cycling three generated tracks with crossfade, and <code>audio.Sound</code>\'s pooled one-shot effects.',
	},
	{
		id: 'battle',
		level: 2,
		diagram: '01_battle.svg',
		title: 'Battle',
		description: 'A creature battle with type effectiveness, speed-ordered turns, damage, leveling, and evolution.',
	},
	{
		id: 'minigame',
		level: 2,
		diagram: '08_minigame.svg',
		title: 'Lockpick minigame',
		description:
			'A timing challenge layered over a room scene. It demonstrates scene stacking, suspension, and returning a result to the scene underneath.',
		controls: '<kbd>Enter</kbd> stop the needle &nbsp;&middot;&nbsp; <kbd>Esc</kbd> leave the minigame',
	},

	// ------------------------------------------------------- Level 3: Complete reference games
	{
		id: 'dungeon',
		level: 3,
		diagram: '05_dungeon.svg',
		title: 'Dungeon crawl',
		description:
			'A playable roguelike floor: generated rooms and corridors, three-state fog of war, bump-to-attack, monsters that give chase, stairs down. The full <code>roguelike</code> module working together with <code>render</code> and <code>ui</code>.',
		controls:
			'arrow keys or numpad move and bump to attack &nbsp;&middot;&nbsp; <kbd>5</kbd> / <kbd>.</kbd> wait &nbsp;&middot;&nbsp; <kbd>&gt;</kbd> descend on the stairs',
	},
	{
		id: 'chess',
		level: 3,
		diagram: '02_chess.svg',
		title: 'Chess',
		description:
			'Chess against a small deterministic alpha-beta computer player, with legal moves, check, checkmate, stalemate, castling, en passant, and promotion.',
		controls:
			'click a square, or hold an arrow key to move the cursor and <kbd>Enter</kbd> to select/move &nbsp;&middot;&nbsp; <kbd>Esc</kbd> reset',
	},
	{
		id: 'tower-defense',
		level: 3,
		diagram: '10_tower_defense.svg',
		title: 'Tower defense',
		description: 'A simple lane defense demo using timed waves, tower targeting, damage, rewards, and lives.',
	},

	// -------------------------------------------------------------------- Technical demos
	{
		id: 'colour-transform',
		level: 'tech',
		diagram: '03_colour_transform.svg',
		title: 'Colour transform',
		description:
			'4000 individually tinted sprites, each carrying the per-sprite <code>texel &times; M + A</code> transform that <a href="../index.html#demo">the landing page demo</a> shows in miniature; Pixi\'s own tint could not draw this scene.',
		buildNote: 'Blank? Build the examples first: <code>npm run webpage:examples</code> (see the repository\'s <code>webpage/TODO.md</code>).',
	},
	{
		id: 'three-d',
		level: 'tech',
		diagram: '09_3d.svg',
		title: 'Babylon.js 3D',
		description:
			'An optional WebGL scene with an orbit camera, square and hex terrain, elevation columns, a continuous heightmap hill, and continuously moving mesh and billboard characters.',
		controls: 'drag to orbit &nbsp;&middot;&nbsp; wheel to zoom',
	},
	{
		id: 'headless',
		level: 'tech',
		diagram: '14_headless.svg',
		title: 'Headless simulation',
		description: '<code>mwg/simulation</code>\'s <code>runScenario</code>/<code>advanceToInput</code>, with no rendering, map, or sprite at all - the one example that would work identically with no page around it.',
	},
];

window.MWG_EXAMPLE_LEVELS = {
	1: 'Level 1 - Fundamentals',
	2: 'Level 2 - Framework systems',
	3: 'Level 3 - Complete reference games',
	tech: 'Technical demos',
};
