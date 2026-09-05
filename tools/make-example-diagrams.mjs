import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Generates the "conceptual example diagram" SVGs under `webpage/assets/`, in the exact
 * template the original eleven (`01_battle.svg`..`11_village.svg`) already use: a title bar,
 * a "what it shows"/"why it matters" pair, a row of module pills, three coloured category
 * boxes, and a five-step flow chain with three dashed call-outs from category to flow step.
 *
 * Written as a generator - not hand-drawn per file - for the same reason
 * `tools/make-example-assets.mjs` generates the tileset and sounds: a script keeps every
 * diagram visually identical without redrawing shared chrome by hand each time a twelfth,
 * thirteenth, ... example needs one. Run it directly (`node tools/make-example-diagrams.mjs`)
 * to (re)generate every diagram in `DIAGRAMS` below.
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(root, 'webpage', 'assets');

const FONT = 'Inter,Segoe UI,Arial,sans-serif';
const CATEGORY_COLORS = ['#4ea1ff', '#e53935', '#4caf50'];
const FLOW_COLOR = '#ff6659';

function escapeXml(text) {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function panel(x, y, width, height, accent) {
	return (
		`<g filter="url(#shadow)">\n` +
		`  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="#151922" stroke="#2a3240" stroke-width="2"/>\n` +
		`  <rect x="${x}" y="${y}" width="8" height="${height}" rx="4" fill="${accent}"/>\n` +
		`</g>\n`
	);
}

function text(x, y, fill, size, weight, anchor, content) {
	return `<text x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}"${weight ? ` font-weight="${weight}"` : ''}>${escapeXml(content)}</text>\n`;
}

/**
 * @param spec.title e.g. "hello world" - rendered as "MWG example — hello world"
 * @param spec.subtitle one line under the title
 * @param spec.shows up to 2 lines, "What this example shows"
 * @param spec.matters up to 2 lines, "Why it matters"
 * @param spec.modules module names as pills, e.g. ['core', 'render']
 * @param spec.categories exactly 3: {title, items: up to 3 short lines}
 * @param spec.flow exactly 5: short step titles, left to right
 * @param spec.callouts exactly 3 indices into `flow` (dashed arrow from category i to flow[callouts[i]])
 */
function renderDiagram(spec) {
	const parts = [];
	parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">`);
	parts.push(
		`<defs>\n` +
			`  <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">\n` +
			`    <path d="M0,0 L12,6 L0,12 z" fill="#596273"/>\n` +
			`  </marker>\n` +
			`  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">\n` +
			`    <feDropShadow dx="0" dy="5" stdDeviation="8" flood-color="#000000" flood-opacity="0.28"/>\n` +
			`  </filter>\n` +
			`</defs>`
	);
	parts.push(`<rect width="100%" height="100%" fill="#0b0d10"/>`);
	parts.push(`<rect x="0" y="0" width="100%" height="12" fill="#e53935"/>`);
	parts.push(text(70, 80, '#f3f4f6', 40, 700, 'start', `MWG example — ${spec.title}`));
	parts.push(text(70, 120, '#aab2bf', 20, null, 'start', spec.subtitle));

	// what it shows / why it matters
	const summaryBoxes = [
		{ x: 70, accent: '#4ea1ff', title: 'What this example shows', lines: spec.shows },
		{ x: 840, accent: '#e53935', title: 'Why it matters', lines: spec.matters },
	];
	for (const box of summaryBoxes) {
		parts.push(panel(box.x, 170, 690, 180, box.accent));
		parts.push(text(box.x + 24, 208, '#f3f4f6', 24, 700, 'start', box.title));
		box.lines.forEach((line, i) => parts.push(text(box.x + 24, 242 + i * 28, '#aab2bf', 17, null, 'start', line)));
	}

	// module pills
	parts.push(panel(70, 390, 1460, 100, '#b05cff'));
	parts.push(text(94, 428, '#f3f4f6', 24, 700, 'start', 'Main MWG modules'));
	parts.push(text(94, 462, '#aab2bf', 17, null, 'start', ''));
	spec.modules.forEach((name, i) => {
		const x = 130 + i * 145;
		parts.push(
			`<g>\n  <rect x="${x}" y="432" width="116" height="38" rx="19" fill="#261a2d" stroke="#5d4086"/>\n` +
				text(x + 58, 457, '#ead9ff', 15, 600, 'middle', name) +
				`</g>`
		);
	});

	// category boxes
	const categoryX = spec.categories.map((_, i) => 70 + i * 490);
	spec.categories.forEach((category, i) => {
		const x = categoryX[i];
		parts.push(panel(x, 550, 410, 240, CATEGORY_COLORS[i]));
		parts.push(text(x + 24, 588, '#f3f4f6', 24, 700, 'start', category.title));
		category.items.forEach((line, j) => parts.push(text(x + 24, 622 + j * 28, '#aab2bf', 17, null, 'start', line)));
	});

	// flow chain
	const flowX = spec.flow.map((_, i) => 70 + i * 290);
	spec.flow.forEach((step, i) => {
		const x = flowX[i];
		if (i > 0) {
			parts.push(`<line x1="${flowX[i - 1] + 180}" y1="855" x2="${x}" y2="855" stroke="#596273" stroke-width="3" marker-end="url(#arrow)"/>`);
		}
		parts.push(panel(x, 810, 180, 90, FLOW_COLOR));
		parts.push(text(x + 90, 848, '#f3f4f6', 19, 700, 'middle', step));
	});

	// dashed call-outs from each category down to its flow step
	spec.callouts.forEach((flowIndex, i) => {
		const x1 = categoryX[i] + 205;
		const x2 = flowX[flowIndex] + 90;
		parts.push(`<line x1="${x1}" y1="790" x2="${x2}" y2="810" stroke="#596273" stroke-width="3" marker-end="url(#arrow)" stroke-dasharray="10 10"/>`);
	});

	parts.push(text(1530, 964, '#667080', 14, null, 'end', 'Conceptual MWG example diagram'));
	parts.push(`</svg>`);
	return parts.join('\n');
}

const DIAGRAMS = {
	'12_audio': {
		title: 'audio',
		subtitle: "Music.playTracks and Sound's pooled one-shot effects",
		shows: ['Demonstrates a crossfading music playlist and a pooled', 'one-shot sound effect.'],
		matters: ['Shows both halves of mwg/audio side by side: a looping', 'playlist and one-shot effects.'],
		modules: ['audio'],
		categories: [
			{ title: 'Playlist', items: ['playTracks(paths)', 'onended advances', 'crossfade'] },
			{ title: 'Volume', items: ['Music.volume', 'update(dt) fades', 'stop(duration)'] },
			{ title: 'Sound effects', items: ['pooled instances', 'round-robin reuse', 'play()'] },
		],
		flow: ['Play playlist', 'Track ends', 'onended fires', 'Next track starts', 'Crossfade completes'],
		callouts: [0, 2, 4],
	},
	'13_event_system': {
		title: 'event system',
		subtitle: 'GameState, activePage and EventRunner, paired with Inventory',
		shows: ['Demonstrates switches/variables selecting an event page,', 'and a call command reaching Inventory.'],
		matters: ['The event model at the heart of village and dungeon,', 'isolated from a map or NPC sprite.'],
		modules: ['rpg', 'actors', 'ui'],
		categories: [
			{ title: 'GameState', items: ['switches', 'variables', 'conditions'] },
			{ title: 'Event flow', items: ['activePage()', 'EventRunner.run', 'call command'] },
			{ title: 'Inventory', items: ['Inventory.add', 'EquipmentSlots.equip', 'StatBlock updates'] },
		],
		flow: ['Button click', 'activePage()', 'EventRunner runs', 'call grants item', 'attack updates'],
		callouts: [0, 2, 4],
	},
	'14_headless': {
		title: 'headless simulation',
		subtitle: 'runScenario and advanceToInput, with no rendering at all',
		shows: ['Demonstrates replaying a finite command sequence and', 'driving automatic turns to the next input.'],
		matters: ['The one example that works identically with no page,', 'canvas, or Pixi around it.'],
		modules: ['simulation'],
		categories: [
			{ title: 'runScenario', items: ['state + commands', 'step(state, command)', 'ordered events'] },
			{ title: 'advanceToInput', items: ['scheduler.peek', 'needsInput(actor)', 'budgeted steps'] },
			{ title: 'No rendering', items: ['no canvas', 'no Pixi', 'same in a test or server'] },
		],
		flow: ['Commands queued', 'step() runs', 'Events collected', 'Scheduler advances', 'Input needed'],
		callouts: [0, 2, 4],
	},
	'15_hello_world': {
		title: 'hello world',
		subtitle: 'The smallest thing MWG can show: Game, Scene, update(dt)',
		shows: ['Demonstrates the Game/Scene lifecycle and a per-frame', 'update(dt) loop moving a sprite.'],
		matters: ['The starting point every other example builds on -', 'nothing here is specific to any genre.'],
		modules: ['core', 'render'],
		categories: [
			{ title: 'Game', items: ['canvas + app', 'frame loop', 'current Scene'] },
			{ title: 'Scene', items: ['create()', 'update(dt)', 'resize(w, h)'] },
			{ title: 'Rendering', items: ['Pixi stage', 'one sprite', 'position each frame'] },
		],
		flow: ['Game starts', 'Scene.create()', 'update(dt)', 'Sprite moves', 'Next frame'],
		callouts: [0, 2, 4],
	},
	'16_i18n': {
		title: 'i18n',
		subtitle: 'Catalog, t(), plurals, and right-to-left layout',
		shows: ['Demonstrates message lookup, {token} interpolation,', 'plural forms, and a right-to-left catalog.'],
		matters: ['Translation and layout direction without a full game', 'around it.'],
		modules: ['i18n', 'ui'],
		categories: [
			{ title: 'Catalog', items: ['setBase / setActive', 'messages by key', 'locale tag'] },
			{ title: 'Resolution', items: ['t(key, params)', 'Intl.PluralRules', '{token} interpolation'] },
			{ title: 'Layout', items: ['theme.direction', 'ltr / rtl', 'every widget reads it'] },
		],
		flow: ['Pick a locale', 'setActive(catalog)', 't() resolves', 'Plural picked', 'Direction flips'],
		callouts: [0, 2, 4],
	},
	'17_movement': {
		title: 'movement',
		subtitle: 'Grid movement, tile collision, and TileMap layers together',
		shows: ['Demonstrates Input actions, GridMover tweening, wall-tile', 'collision, and layered TileMap rendering.'],
		matters: ['The walk-around-a-map loop every RPG/roguelike example', 'builds on, without dialogue or combat.'],
		modules: ['core', 'render', 'rpg'],
		categories: [
			{ title: 'Tile map', items: ['ground layer', 'decoration layer', 'TileMap.cull'] },
			{ title: 'Movement', items: ['Input.onAction', 'GridMover.moveBy', 'collision check'] },
			{ title: 'Camera', items: ['follow player', 'zoom on wheel', 'bounds clamp'] },
		],
		flow: ['Input action', 'Collision check', 'GridMover moves', 'Camera follows', 'Cull + render'],
		callouts: [0, 2, 4],
	},
	'18_save_load': {
		title: 'save / load',
		subtitle: "core.SaveSystem's save/load/delete/list on its own",
		shows: ['Demonstrates saving state to a named slot, loading it', 'back, deleting it, and listing every slot.'],
		matters: ["The primitive dungeon's own permadeath policy builds", 'on, without that policy on top.'],
		modules: ['core'],
		categories: [
			{ title: 'Save', items: ['save(slot, state)', 'meta.preview', 'meta.version'] },
			{ title: 'Load', items: ['load(slot)', 'migrations run', 'returns null if empty'] },
			{ title: 'Manage', items: ['delete(slot)', 'list()', 'SaveStorage'] },
		],
		flow: ['Player acts', 'save(slot)', 'Storage write', 'load(slot)', 'State restored'],
		callouts: [0, 2, 4],
	},
	'19_world_transition': {
		title: 'world transition',
		subtitle: 'World<M> moving the player between two maps',
		shows: ['Demonstrates persistent vs. rebuilt maps, and crossing', 'a doorway between them.'],
		matters: ['The many-maps-in-one-world primitive every overworld/', 'town/dungeon-floor split builds on.'],
		modules: ['world', 'render', 'rpg'],
		categories: [
			{ title: 'World<M>', items: ['define(id, create)', 'enter(id, spawn)', 'current map'] },
			{ title: 'Persistence', items: ['persistent: true', 'persistent: false', 'state kept or reset'] },
			{ title: 'Crossing over', items: ['edge detected', 'enter() called', 'player repositioned'] },
		],
		flow: ['Walk to edge', 'crossOver()', 'world.enter()', 'Map swapped', 'Player placed'],
		callouts: [0, 2, 4],
	},
};

for (const [filename, spec] of Object.entries(DIAGRAMS)) {
	const svg = renderDiagram(spec);
	await writeFile(join(OUT, `${filename}.svg`), svg, 'utf8');
	console.log(`${filename}.svg`);
}
console.log(`\n${Object.keys(DIAGRAMS).length} diagrams written to webpage/assets/`);
