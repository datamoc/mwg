import { writeFile, readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { panel, text, open, close, ACCENT, INK, DIM, LINE } from './diagram-chrome.mjs';

/**
 * Generates the four architecture diagrams (`0a`..`0d`) under `webpage/assets/`.
 *
 * These were hand-drawn SVG until 2026-09-06, and by then every one of them was wrong: the
 * framework diagram still showed `render`, `ui` and `stage` as top-level modules months after
 * they moved under `two-d`, and the RPG flow still showed `EventRunner` driving a
 * `WindowStack`/`MessageBox` after that coupling was replaced by an injected presenter.
 * Nothing catches a stale picture, which is the whole argument for generating them.
 *
 * `0c` goes further than a fixed spec: it reads the real module list out of `src/` and works
 * out for itself which modules reach PixiJS and which reach Babylon, using the same import
 * walk `tests/renderer-isolation.test.ts` enforces. A module added, moved or decoupled shows
 * up in the picture on the next run without anyone remembering to redraw it.
 *
 * Run with `node tools/make-architecture-diagrams.mjs`, or `npm run webpage:diagrams`.
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(root, 'src');
const OUT = join(root, 'webpage', 'assets');

// ---------------------------------------------------------------- source facts

/** every `.ts` file reachable by relative import from `entry` */
async function reachableFrom(entry) {
	const seen = new Set();
	const queue = [resolve(SRC, entry)];

	while (queue.length > 0) {
		const file = queue.pop();
		if (seen.has(file)) continue;
		seen.add(file);

		let source;
		try {
			source = await readFile(file, 'utf8');
		} catch {
			continue;
		}
		for (const match of source.matchAll(/(?:from|import)\s*['"](\.[^'"]+)['"]/g)) {
			queue.push(resolve(dirname(file), match[1]));
		}
	}
	return [...seen];
}

async function importsPackage(file, pkg) {
	try {
		const source = await readFile(file, 'utf8');
		//a type-only import is erased at runtime and costs a game nothing
		return new RegExp(`^\\s*import\\s+(?!type\\s)[^;]*from\\s*['"]${pkg}`, 'm').test(source);
	} catch {
		return false;
	}
}

/** which renderer, if any, each module's barrel actually pulls in */
async function moduleFacts() {
	const entries = await readdir(SRC, { withFileTypes: true });
	const modules = entries
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort();

	const facts = [];
	for (const name of modules) {
		const files = await reachableFrom(join(name, 'index.ts'));
		let renderer = null;
		for (const file of files) {
			if (await importsPackage(file, 'pixi\\.js')) renderer = 'pixi';
			else if (await importsPackage(file, '@babylonjs/')) renderer = renderer ?? 'babylon';
		}
		facts.push({ name, renderer, files: files.length });
	}
	return facts;
}

// ---------------------------------------------------------------- renderers

/**
 * Columns of grouped boxes: a heading per column, then a stack of labelled tiles.
 * @param spec.columns {title, note, accent, tiles: [{label, note}]}
 */
function renderColumns(spec) {
	const parts = open(spec.title, spec.subtitle);
	if (spec.lead) parts.push(text(70, 168, DIM, 18, null, 'start', spec.lead));

	const count = spec.columns.length;
	const gap = 24;
	const usable = 1460 - gap * (count - 1);
	const colWidth = Math.floor(usable / count);

	//a long column tightens its rows rather than running off the canvas: for `0c` the row
	//count comes from whatever modules `src/` actually holds, so it is not something this
	//file gets to assume
	const longest = Math.max(...spec.columns.map((column) => column.tiles.length));
	const pitch = longest > 6 ? 50 : 62;
	const tileHeight = pitch - 12;
	let bottom = 0;

	spec.columns.forEach((column, i) => {
		const x = 70 + i * (colWidth + gap);
		const height = 120 + column.tiles.length * pitch;
		bottom = Math.max(bottom, 210 + height);
		parts.push(panel(x, 210, colWidth, height, column.accent));
		parts.push(text(x + 24, 252, INK, 24, 700, 'start', column.title));
		parts.push(text(x + 24, 282, DIM, 16, null, 'start', column.note ?? ''));

		column.tiles.forEach((tile, j) => {
			const ty = 310 + j * pitch;
			parts.push(
				`<g>\n  <rect x="${x + 24}" y="${ty}" width="${colWidth - 48}" height="${tileHeight}" rx="10" fill="#1d222c" stroke="#333c4a"/>\n` +
					text(x + 40, ty + tileHeight / 2 + 1, INK, 17, 600, 'start', tile.label) +
					text(x + 40, ty + tileHeight - 7, '#7f8899', 13, null, 'start', tile.note ?? '') +
					`</g>`,
			);
		});
	});

	if (spec.footnote) parts.push(text(70, Math.min(940, bottom + 34), DIM, 17, null, 'start', spec.footnote));
	parts.push(...close(spec.note));
	return parts.join('\n');
}

/**
 * A staged left-to-right pipeline, with an optional labelled note under each stage.
 * @param spec.stages [{label, lines: []}]
 */
function renderPipeline(spec) {
	const parts = open(spec.title, spec.subtitle);
	if (spec.lead) parts.push(text(70, 168, DIM, 18, null, 'start', spec.lead));

	const count = spec.stages.length;
	const gap = 40;
	const usable = 1460 - gap * (count - 1);
	const boxWidth = Math.floor(usable / count);
	const top = 260;

	spec.stages.forEach((stage, i) => {
		const x = 70 + i * (boxWidth + gap);
		if (i > 0) {
			const prev = x - gap;
			parts.push(
				`<line x1="${prev + 6}" y1="${top + 90}" x2="${x - 8}" y2="${top + 90}" stroke="${LINE}" stroke-width="3" marker-end="url(#arrow)"/>`,
			);
		}
		parts.push(panel(x, top, boxWidth, 300, stage.accent ?? ACCENT.blue));
		parts.push(text(x + 24, top + 46, INK, 23, 700, 'start', stage.label));
		(stage.lines ?? []).forEach((line, j) =>
			parts.push(text(x + 24, top + 86 + j * 28, DIM, 16, null, 'start', line)),
		);
	});

	if (spec.footnote) parts.push(text(70, 700, DIM, 18, null, 'start', spec.footnote));
	if (spec.footnote2) parts.push(text(70, 732, DIM, 18, null, 'start', spec.footnote2));
	parts.push(...close(spec.note));
	return parts.join('\n');
}

// ---------------------------------------------------------------- the diagrams

async function frameworkArchitecture() {
	const facts = await moduleFacts();
	const by = (r) => facts.filter((f) => f.renderer === r);

	//the diagram names what a game imports, not what the folder is called on disk
	const PUBLIC = { 'three-d': '3d', 'two-d': 'two-d' };
	const tile = (f) => ({ label: PUBLIC[f.name] ?? f.name, note: `${f.files} files` });

	return renderColumns({
		title: 'MWG framework architecture',
		subtitle: 'Which modules reach a renderer, and which do not',
		lead: 'Generated from src/: every module below was classified by walking its real import graph.',
		columns: [
			{
				title: 'No renderer',
				note: 'usable from any renderer, or none',
				accent: ACCENT.green,
				tiles: by(null).map(tile),
			},
			{
				title: '2D, on PixiJS',
				note: 'mwg/two-d and what needs it',
				accent: ACCENT.blue,
				tiles: by('pixi').map(tile),
			},
			{
				title: '3D, on Babylon.js',
				note: 'optional; a 2D game never pays for it',
				accent: ACCENT.purple,
				tiles: by('babylon').map(tile),
			},
		],
		footnote:
			'mwg/core depends on no other module and no renderer, so a Babylon game uses its input, saves, RNG and scene stack unchanged.',
		note: 'Generated from src/ - MWG architecture',
	});
}

const ECOSYSTEM = {
	title: 'MWG in its ecosystem',
	subtitle: 'What a game built on MWG actually stands on',
	lead: 'MWG is a TypeScript framework: your game imports it, and it imports these.',
	columns: [
		{
			title: 'Your game',
			note: 'TypeScript or JavaScript',
			accent: ACCENT.red,
			tiles: [
				{ label: 'scenes and rules', note: 'what the game is' },
				{ label: 'art, audio, data', note: 'compiled in at build time' },
				{ label: 'its own numbers', note: 'MWG supplies shape, never values' },
			],
		},
		{
			title: 'MWG',
			note: 'MPL-2.0, redistributable',
			accent: ACCENT.green,
			tiles: [
				{ label: 'core', note: 'loop-adjacent lifecycle, input, saves, RNG' },
				{ label: 'gameplay modules', note: 'actors, roguelike, rpg, battle, board, world' },
				{ label: 'two-d / 3d', note: 'the rendering halves, chosen per game' },
			],
		},
		{
			title: 'Underneath',
			note: 'third-party runtimes',
			accent: ACCENT.blue,
			tiles: [
				{ label: 'PixiJS', note: 'the 2D renderer, via mwg/two-d' },
				{ label: 'Babylon.js', note: 'optional 3D, via mwg/3d' },
				{ label: 'rot.js', note: 'classic roguelike algorithms' },
			],
		},
	],
	footnote: 'Node and npm are developer tools here. Nothing from them is present when the game runs.',
	note: 'Conceptual MWG diagram',
};

const DEPLOYMENT = {
	title: 'Running and deploying an MWG game',
	subtitle: 'From source to a file a player double-clicks',
	lead: 'The target that shapes every build choice: a game you open from disk, with no server.',
	stages: [
		{
			label: 'Author',
			accent: ACCENT.red,
			lines: ['TypeScript, plus art', 'and audio on disk.', '', 'Maps and events are', 'data, not code.'],
		},
		{
			label: 'Build',
			accent: ACCENT.amber,
			lines: [
				'compile-resources turns',
				'every asset into a data:',
				'URI inside a plain script.',
				'',
				'The library emits a',
				'classic IIFE, not ESM.',
			],
		},
		{
			label: 'Artifact',
			accent: ACCENT.green,
			lines: [
				'One folder: index.html,',
				'game.js, asset scripts.',
				'',
				'No install step, no',
				'runtime to download.',
			],
		},
		{
			label: 'Run',
			accent: ACCENT.blue,
			lines: [
				'Opens from file://,',
				'a static host, Capacitor',
				'or a WebView2 desktop',
				'shell, unchanged.',
				'',
				'Draws through WebGL.',
			],
		},
	],
	footnote:
		'file:// blocks ES modules, fetch() and cross-origin images, which is why assets are compiled in and the bundle is a classic script.',
	footnote2: 'Everything after load is synchronous: game code never awaits an asset mid-scene.',
	note: 'Conceptual MWG diagram',
};

const RPG_FLOW = {
	title: 'RPG flow: state to active page to commands',
	subtitle: 'The event model at the heart of MWG’s RPG system',
	lead: 'A map event re-checks its pages rather than being told which one is live.',
	stages: [
		{
			label: 'GameState',
			accent: ACCENT.green,
			lines: ['switches: booleans', 'variables: numbers', '', 'e.g. metShopkeeper', 'is true'],
		},
		{
			label: 'MapEvent',
			accent: ACCENT.blue,
			lines: [
				'a position on the map',
				'and several EventPages',
				'',
				'conditions are checked',
				'against GameState;',
				'the last valid page wins',
			],
		},
		{
			label: 'Active EventPage',
			accent: ACCENT.amber,
			lines: ['a trigger: action,', 'autorun or touch', '', 'commands[] to run', 'once it fires'],
		},
		{
			label: 'EventRunner',
			accent: ACCENT.red,
			lines: [
				'say / ask / wait',
				'setSwitch / addVariable',
				'if / move / call',
				'',
				'writes back to GameState,',
				'closing the loop',
			],
		},
		{
			label: 'DialoguePresenter',
			accent: ACCENT.purple,
			lines: [
				'shows a line, resolves',
				'with what was chosen',
				'',
				'two-d/ui supplies a',
				'MessageBox one; a 3D',
				'game supplies its own',
			],
		},
	],
	footnote:
		'The presenter is injected, so mwg/rpg needs no renderer: the same event scripts run under a 2D game, a 3D game, or a headless test.',
	note: 'Conceptual MWG diagram',
};

async function main() {
	const written = [];
	const files = [
		['0a_mwg_ecosystem', renderColumns(ECOSYSTEM)],
		['0b_runtime_deployment', renderPipeline(DEPLOYMENT)],
		['0c_framework_architecture', await frameworkArchitecture()],
		['0d_rpg_event_flow', renderPipeline(RPG_FLOW)],
	];

	for (const [name, svg] of files) {
		await writeFile(join(OUT, `${name}.svg`), svg, 'utf8');
		written.push(`${name}.svg`);
		console.log(`${name}.svg`);
	}
	console.log(`\nwebpage/assets/ now holds ${written.length} regenerated architecture diagrams.`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
