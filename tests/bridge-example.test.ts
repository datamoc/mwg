import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Player, Recorder, Signal, deserializeReplay, serializeReplay } from '../src/core/index.ts';
import {
	LEVELS,
	applyAction,
	beamProblem,
	cross,
	describe,
	isBetter,
	ratioColour,
	totalCost,
	warrenBeams,
	type Beam,
} from '../examples/bridge/sim.ts';

const [shortSpan, gorge, pier] = LEVELS;

/** the joints a bare chain of planks would use: the deck alone, no triangles */
function bareDeck(beams: readonly Beam[], deckJoints: number): Beam[] {
	return beams.filter(([a, b]) => a < deckJoints && b < deckJoints);
}

test('every level is solvable with a truss inside its budget', () => {
	for (const level of LEVELS) {
		const truss = warrenBeams(level);
		assert.ok(totalCost(level, truss) <= level.budget, `${level.name}: the truss fits the budget`);
		const result = cross(level, truss);
		assert.equal(result.crossed, true, `${level.name}: crosses`);
		assert.equal(result.broken, 0);
		assert.ok(result.sag < level.maxSag);
		assert.ok(result.peakLoad < 1);
	}
});

test('a braced bridge carries a light vehicle, a bare chain of planks only sags', () => {
	const truss = warrenBeams(shortSpan);
	const light = cross({ ...shortSpan, vehicleMass: 1 }, truss);
	assert.equal(light.crossed, true);

	const chain = cross(shortSpan, bareDeck(truss, shortSpan.deck.length));
	assert.equal(chain.crossed, false);
	assert.ok(chain.sag > shortSpan.maxSag, 'the rope lesson: no triangles, no stiffness');
	assert.ok(chain.cost < light.cost);
});

test('an overloaded bridge breaks beams and fails', () => {
	const heavy = cross({ ...gorge, vehicleMass: 30 }, warrenBeams(gorge));
	assert.equal(heavy.crossed, false);
	assert.ok(heavy.broken > 0);
	assert.ok(heavy.peakLoad > 1);
});

test('one missing beam in the wide gorge is enough to bring it down', () => {
	const weak = warrenBeams(gorge).filter((_, i) => i !== 7);
	const result = cross(gorge, weak);
	assert.equal(result.crossed, false);
	assert.ok(result.broken > 0);
});

test('a cable pulls but never pushes: on the deck it saves money, in the top chord it fails', () => {
	const deck = shortSpan.deck.length;
	const truss = warrenBeams(shortSpan);
	const rigid = cross(shortSpan, truss);
	const asCables = (pick: (a: number, b: number) => boolean): Beam[] =>
		truss.map(([a, b]) => (pick(a, b) ? [a, b, true] : [a, b]));

	//the deck is in tension under a load, so cables there carry it for half the price
	const cheap = cross(
		shortSpan,
		asCables((a, b) => a < deck && b < deck),
	);
	assert.equal(cheap.crossed, true);
	assert.ok(cheap.cost < rigid.cost);

	//the top chord is in compression, and a cable in compression just goes slack
	const slack = cross(
		shortSpan,
		asCables((a, b) => a >= deck && b >= deck),
	);
	assert.equal(slack.crossed, false);
	assert.deepEqual(applyAction(shortSpan, [], 'cable:0:1'), [[0, 1, true]]);
});

test('a pier makes the chain cheaper than the truss, which is the point of the level', () => {
	const cheap = cross({ ...pier, vehicleMass: 1 }, bareDeck(warrenBeams(pier), pier.deck.length));
	assert.equal(cheap.crossed, true);
	assert.ok(cheap.cost < totalCost(pier, warrenBeams(pier)));
});

test('a beam over budget, too long, repeated or between nothing is rejected', () => {
	const poor = { ...shortSpan, budget: 100 };
	let beams: readonly Beam[] = [];
	for (const [a, b] of warrenBeams(poor)) beams = applyAction(poor, beams, `beam:${a}:${b}`);
	assert.ok(totalCost(poor, beams) <= poor.budget, 'the budget is never exceeded');
	assert.ok(beams.length < warrenBeams(poor).length);
	assert.equal(beamProblem(poor, [], [0, 1]), null);
	assert.equal(beamProblem(poor, [[0, 1]], [1, 0]), 'that beam is already there');
	assert.equal(beamProblem(shortSpan, [], [0, 6]), 'too long for one beam');
	assert.equal(beamProblem(shortSpan, [], [0, 99]), 'a beam joins two different joints');
	const full = { ...shortSpan, budget: totalCost(shortSpan, [[0, 1]]) };
	assert.equal(beamProblem(full, [[0, 1]], [1, 2]), 'over budget');
	assert.deepEqual(applyAction(full, [[0, 1]], 'beam:1:2'), [[0, 1]], 'a rejected action changes nothing');
	assert.deepEqual(applyAction(full, [[0, 1]], 'clear'), []);
});

test('recording the build actions and replaying them gives a deep-equal result', () => {
	const onAction = new Signal<string>();
	const onTick = new Signal<number>();
	const recorder = new Recorder(onAction, onTick);

	let live: readonly Beam[] = [];
	onAction.add((action) => {
		live = applyAction(gorge, live, action);
	});
	const actions = ['beam:0:1', 'clear', ...warrenBeams(gorge).map(([a, b]) => `beam:${a}:${b}`), 'beam:0:99'];
	for (const action of actions) {
		onAction.dispatch(action);
		onTick.dispatch(recorder.frame);
	}
	recorder.stop();
	const original = cross(gorge, live);
	assert.equal(original.crossed, true);

	const saved = serializeReplay(recorder.toJSON());
	let replayed: readonly Beam[] = [];
	const replayTick = new Signal<number>();
	const player = new Player(
		deserializeReplay(saved),
		(action) => {
			replayed = applyAction(gorge, replayed, action);
		},
		replayTick,
	);
	while (!player.done) replayTick.dispatch(0);
	player.stop();

	assert.deepEqual(replayed, live);
	assert.deepEqual(cross(gorge, replayed), original, 'fixed steps, no randomness: the same result to the last digit');
});

test('the colour of a beam runs from green to red as its ratio climbs', () => {
	const red = (colour: number): number => colour >> 16;
	const green = (colour: number): number => (colour >> 8) & 0xff;
	assert.ok(green(ratioColour(0)) > red(ratioColour(0)));
	assert.ok(red(ratioColour(1)) > green(ratioColour(1)));
	assert.equal(ratioColour(5), ratioColour(1), 'past the breaking point it stays red');
	assert.match(describe(shortSpan, cross(shortSpan, warrenBeams(shortSpan))), /^Crossed!/);
});

test('every code block in the tutorial is real code from the example', () => {
	const page = new URL('../webpage/tutorials/bridge/index.html', import.meta.url);
	if (!existsSync(page)) return;
	const source = ['sim.ts', 'main.ts']
		.map((file) => readFileSync(new URL(`../examples/bridge/${file}`, import.meta.url), 'utf8'))
		.join('\n');
	const normalise = (text: string): string =>
		text
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.join('\n');
	const unescape = (text: string): string =>
		text
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&amp;/g, '&');
	const blocks = [
		...readFileSync(page, 'utf8').matchAll(/<pre class="from-source"><code>([\s\S]*?)<\/code><\/pre>/g),
	];
	assert.ok(blocks.length >= 8, 'the tutorial quotes the example');
	for (const [, code] of blocks) {
		assert.ok(normalise(source).includes(normalise(unescape(code))), `not found in examples/bridge:\n${code}`);
	}
});

test('a result replaces the best only when it crosses and costs less, or costs the same and sags less', () => {
	const level = LEVELS[0];
	const run = (cost: number, sag: number, crossed = true) => ({
		...cross(level, warrenBeams(level)),
		cost,
		sag,
		crossed,
	});
	const best = run(100, 5);
	assert.equal(isBetter(run(100, 5), undefined), true);
	assert.equal(isBetter(run(90, 9), best), true, 'cheaper wins even when it sags more');
	assert.equal(isBetter(run(100, 3), best), true, 'the same cost with less sag wins');
	assert.equal(isBetter(run(100, 7), best), false);
	assert.equal(isBetter(run(120, 1), best), false);
	assert.equal(isBetter(run(10, 0, false), best), false, 'a failed crossing never counts');
});
