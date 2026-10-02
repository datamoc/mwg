import test from 'node:test';
import assert from 'node:assert/strict';
import { Generator } from '../src/core/Random.ts';
import { NeuralPolicy } from '../src/ai/index.ts';
import type { NeuralModel } from '../src/ai/index.ts';
import { createMazeGame, expertScores } from '../examples/pacman/game.ts';
import { MazeControllers } from '../examples/pacman/controllers.ts';
import model from '../examples/pacman/generated/model.json' with { type: 'json' };

test('maze corridors are connected and every collectible is reachable', () => {
	const game = createMazeGame();
	const state = game.initial();
	assert.equal(game.distances([state.player]).size, game.floors.size);
	assert.equal(state.dots.length, game.floors.size - 1);
	assert.equal(new Set(state.dots).size, state.dots.length);
	for (const square of [...state.dots, ...state.powers]) assert.ok(game.floors.has(square));
	assert.deepEqual(game.initial(new Generator(395)), game.initial(new Generator(395)));
});

test('maze movement keeps its heading when a requested turn is blocked', () => {
	const game = createMazeGame();
	const state = game.initial();
	state.player = 17 * game.width + 8;
	game.rule(state, { player: 0, ghosts: [] }, new Generator(0));
	assert.equal(state.player, 17 * game.width + 7);
	assert.equal(state.direction, 3);
	assert.equal(state.score, 10);
	assert.equal(game.neighbour(state.player, 7), state.player);
});

test('power dots make colliding ghosts edible and sleeping ghosts cannot cause damage', () => {
	const game = createMazeGame();
	const state = game.initial();
	state.player = game.width + 2;
	state.ghosts[0].square = game.width + 1;
	const result = game.rule(state, { player: 3, ghosts: [] }, new Generator(0));
	assert.deepEqual(result.events, ['dot', 'power', 'ghost']);
	assert.equal(state.score, 250);
	assert.equal(state.powered, 60);
	assert.equal(state.lives, 3);
	assert.equal(state.ghosts[0].square, state.ghosts[0].home);
	assert.equal(state.ghosts[0].sleep, 12);
	state.powered = 0;
	state.ghosts[0].square = state.player;
	game.rule(state, { player: 0, ghosts: [] }, new Generator(0));
	assert.equal(state.lives, 3);
	assert.equal(state.ghosts[0].sleep, 11);
});

test('crossing a ghost costs one life, resets actors and preserves collected dots', () => {
	const game = createMazeGame();
	const state = game.initial();
	state.player = 17 * game.width + 8;
	state.tick = 1;
	for (const ghost of state.ghosts) ghost.square = state.player - 1;
	const result = game.rule(state, { player: 3, ghosts: [1, 1, 1, 1] }, new Generator(0));
	assert.deepEqual(result.events, ['dot', 'death']);
	assert.equal(state.lives, 2);
	assert.equal(state.player, state.home);
	assert.equal(state.grace, 24);
	assert.ok(!state.dots.includes(17 * game.width + 7));
	assert.ok(state.ghosts.every((ghost) => ghost.square === ghost.home));
});

test('entering a vacated ghost tile is safe unless the actors cross', () => {
	const game = createMazeGame();
	const state = game.initial();
	state.player = 17 * game.width + 8;
	state.tick = 1;
	state.ghosts[0].square = state.player - 1;
	game.rule(state, { player: 3, ghosts: [3] }, new Generator(0));
	assert.equal(state.lives, 3);
});

test('last-dot victory and final-life defeat stop subsequent simulation steps', () => {
	const game = createMazeGame();
	for (const lose of [false, true]) {
		const state = game.initial();
		state.dots = [state.player - 1];
		if (lose) {
			state.lives = 1;
			state.ghosts[0].square = state.player - 1;
		}
		const command = { player: 3, ghosts: [] };
		const result = game.rule(state, command, new Generator(0));
		assert.equal(state.status, lose ? 'lost' : 'won');
		assert.equal(result.status, 'finished');
		const snapshot = structuredClone(state);
		assert.deepEqual(game.rule(state, command, new Generator(0)).events, []);
		assert.deepEqual(state, snapshot);
	}
});

test('all AI controllers choose legal moves throughout a headless game', () => {
	const game = createMazeGame();
	const controllers = new MazeControllers(game, model as NeuralModel);
	const state = game.initial();
	for (let tick = 0; tick < 180; tick++) {
		for (const actor of [undefined, 0, 1, 2, 3]) {
			const observation = game.observe(state, actor);
			assert.equal(observation.input.length, 16);
			assert.equal(observation.mask!.length, 4);
			assert.ok(observation.input.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
			for (const mode of ['random', 'heuristic', 'neural', 'chase'] as const) {
				if (actor === undefined && mode === 'chase') continue;
				const action = controllers.choose(state, mode, actor);
				assert.ok(action !== null && observation.mask![action]);
			}
		}
		game.rule(
			state,
			{
				player: controllers.choose(state, 'heuristic'),
				ghosts: state.ghosts.map((_, i) => controllers.choose(state, 'heuristic', i)),
			},
			new Generator(0),
		);
		if (state.status !== 'playing') break;
	}
});

test('chase rules approach the player normally and flee while power dots are active', () => {
	const game = createMazeGame();
	const state = game.initial();
	const controllers = new MazeControllers(game, model as NeuralModel);
	const ghost = state.ghosts[0];
	state.player = ghost.square + 1;
	assert.equal(controllers.choose(state, 'human'), null);
	assert.equal(controllers.choose(state, 'chase', 0), 1);
	assert.equal(game.observe(state, 0).mask![2], false);
	state.powered = 60;
	assert.equal(game.observe(state, 0).mask![2], true);
	const flee = controllers.choose(state, 'chase', 0)!;
	const next = game.neighbour(ghost.square, flee);
	const distance =
		Math.abs((next % game.width) - (state.player % game.width)) +
		Math.abs(Math.floor(next / game.width) - Math.floor(state.player / game.width));
	assert.equal(distance, 2);
});

test('trained neural controller agrees with its teacher on unseen simulation seeds', () => {
	const game = createMazeGame();
	const policy = new NeuralPolicy(model as NeuralModel);
	let matches = 0,
		total = 0;
	for (const seed of [10001, 10002, 10003]) {
		const state = game.initial(new Generator(seed));
		const controllers = new MazeControllers(game, model as NeuralModel, seed);
		for (let tick = 0; tick < 120 && state.status === 'playing'; tick++) {
			for (const actor of [undefined, 0, 1, 2, 3]) {
				const observation = game.observe(state, actor);
				const scores = expertScores(observation);
				const legal = scores.map((_, i) => i).filter((i) => observation.mask![i]);
				const best = legal.reduce((a, b) => (scores[b] > scores[a] ? b : a));
				matches += Number(policy.selectAction(observation) === best);
				total++;
			}
			game.rule(
				state,
				{
					player: controllers.choose(state, 'neural'),
					ghosts: state.ghosts.map((_, i) => controllers.choose(state, 'heuristic', i)),
				},
				new Generator(0),
			);
		}
	}
	assert.ok(total >= 300);
	assert.ok(matches / total >= 0.9, `teacher agreement ${matches / total}`);
});
