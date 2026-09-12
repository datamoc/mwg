import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { publicPathMap } from './helpers/publicPaths.ts';

/**
 * A genuinely external consumer, not the in-repo examples: those import `mwg` by relative
 * `../../src/...` path, which proves nothing about what a real install looks like. This
 * fixture only ever names `@datamoc/mw_games/...` specifiers - the same public paths
 * `api-examples.test.ts` already type-checks `@example` fences against - and its own source
 * is scanned for `pixi.js`/`@pixi/*`/`@babylonjs/*` to confirm the doc's acceptance criterion
 * literally: "a non-trivial 2D game can depend on `@datamoc/mw_games` alone, without
 * installing or importing PixiJS directly."
 */
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const CONSUMER_GAME = `
import { Game, Scene2D } from '@datamoc/mw_games/two-d';
import { TintedSprite, SpriteSheet, type Container2D, type TextureRegion } from '@datamoc/mw_games/two-d/render';
import { NinePatch } from '@datamoc/mw_games/two-d/ui';
import { EntityRegistry, PresentationQueue, Generator, type EntityId } from '@datamoc/mw_games/core';
import { SimulationRuntime, Scheduler, type SimulationRuntimeRule, type Actor } from '@datamoc/mw_games/simulation';

interface Monster extends Actor { id: EntityId; hp: number }
type State = { monster: Monster };
type Event = { type: 'hit'; amount: number };

const rule: SimulationRuntimeRule<State, 'attack', Event, Monster> = (state, _command, { random }) => {
	const amount = random.int(3) + 1;
	const monster = { ...state.monster, hp: state.monster.hp - amount };
	return { state: { monster }, events: [{ type: 'hit', amount }], status: monster.hp <= 0 ? 'finished' : 'ready' };
};

class GameScene extends Scene2D {
	private layer: Container2D = this.stage;
	private registry = new EntityRegistry<Monster>();
	private presentation = new PresentationQueue<Event>({ play: () => 0.2 });

	override create(): void {
		const sheet = SpriteSheet.grid('tiles.png', 16);
		const region: TextureRegion = sheet.region(0);
		const sprite = new TintedSprite(region.texture);
		this.layer.addChild(sprite);

		const panel = new NinePatch(region.texture, { border: 4 });
		this.layer.addChild(panel);

		const scheduler = new Scheduler<Monster>();
		const monster = { id: this.registry.add({ id: '', hp: 5 }), hp: 5 };
		scheduler.add(monster);

		const runtime = new SimulationRuntime<State, 'attack', Event, Monster>({
			state: { monster },
			scheduler,
			random: new Generator(),
			rule,
			actorId: (m) => this.registry.idOf(m) ?? m.id,
		});
		this.presentation.enqueue(runtime.dispatch('attack').events);
	}
}

new Game({ extensions: [] }).start(GameScene);
`;

test('a minimal 2D game compiling only against @datamoc/mw_games public paths never names pixi.js/@babylonjs', () => {
	assert.doesNotMatch(
		CONSUMER_GAME,
		/['"](pixi\.js|@pixi\/|@babylonjs\/)/,
		'the fixture itself must not import a renderer directly',
	);

	const scratchRoot = join(ROOT, '.example-check');
	mkdirSync(scratchRoot, { recursive: true });
	const dir = mkdtempSync(join(scratchRoot, 'consumer-'));
	try {
		const file = join(dir, 'game.ts');
		writeFileSync(file, CONSUMER_GAME, 'utf8');

		const tsconfig = {
			compilerOptions: {
				module: 'esnext',
				moduleResolution: 'bundler',
				target: 'es2022',
				lib: ['es2022', 'dom'],
				strict: true,
				skipLibCheck: true,
				noEmit: true,
				types: [],
				allowImportingTsExtensions: true,
				paths: Object.fromEntries(
					Object.entries(publicPathMap()).map(([specifier, path]) => [specifier, [path]]),
				),
			},
			include: [file],
		};
		const tsconfigPath = join(dir, 'tsconfig.json');
		writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf8');

		try {
			execFileSync('npx', ['tsc', '--noEmit', '-p', tsconfigPath], { cwd: ROOT, stdio: 'pipe', shell: true });
		} catch (error) {
			const output = (error as { stdout?: Buffer }).stdout?.toString() ?? String(error);
			assert.fail(
				`the minimal consumer game fails to compile against @datamoc/mw_games's public paths:\n${output}`,
			);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
