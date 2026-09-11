import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SideTurns, alignmentBonus } from '../src/world/SideTurns.ts';
import type { TimeArea } from '../src/world/SideTurns.ts';

const SCHEDULE = [
	{ id: 'day', lawfulBonus: 25 },
	{ id: 'night', lawfulBonus: -25 },
];

function turns(overrides = {}) {
	return new SideTurns({ sides: ['rebels', 'undead'], schedule: SCHEDULE, ...overrides });
}

test('the first side, round and time of day are the ones configured', () => {
	const game = turns();
	assert.equal(game.side, 'rebels');
	assert.equal(game.round, 1);
	assert.equal(game.timeOfDay.id, 'day');
	assert.equal(game.timeIndex, 0);
});

test('advancing within a round moves the side but not the round or time', () => {
	const game = turns();
	const turn = game.advance();
	assert.deepEqual(turn, { side: 'undead', round: 1, newRound: false });
	assert.equal(game.timeOfDay.id, 'day');
});

test('advancing past the last side opens a new round and steps the time on', () => {
	const game = turns();
	game.advance(); // undead
	const turn = game.advance(); // back to rebels, round 2
	assert.deepEqual(turn, { side: 'rebels', round: 2, newRound: true });
	assert.equal(game.timeOfDay.id, 'night');
});

test('the time schedule cycles once it runs out', () => {
	const game = turns();
	const seen: string[] = [game.timeOfDay.id];
	for (let i = 0; i < 4; i++) {
		game.advance();
		game.advance(); // a full round
		seen.push(game.timeOfDay.id);
	}
	assert.deepEqual(seen, ['day', 'night', 'day', 'night', 'day']);
	assert.equal(game.round, 5);
});

test('a lawful unit takes the bonus, a chaotic one its negation, neutral and liminal nothing', () => {
	assert.equal(alignmentBonus('lawful', 25), 25);
	assert.equal(alignmentBonus('chaotic', 25), -25);
	assert.equal(alignmentBonus('neutral', 25), 0);
	assert.equal(alignmentBonus('liminal', 25), 0);

	assert.equal(alignmentBonus('lawful', -25), -25);
	assert.equal(alignmentBonus('chaotic', -25), 25);
});

test('lawfulBonusAt reads the current time through the unit alignment', () => {
	const game = turns();
	assert.equal(game.lawfulBonusAt('lawful', 1, 1), 25);
	assert.equal(game.lawfulBonusAt('chaotic', 1, 1), -25);

	game.advance();
	game.advance(); // night, round 2
	assert.equal(game.lawfulBonusAt('lawful', 1, 1), -25);
	assert.equal(game.lawfulBonusAt('chaotic', 1, 1), 25);
});

test('a time area overrides the schedule for its own cells only', () => {
	const cave: TimeArea = {
		contains: (x) => x >= 5,
		times: [
			{ id: 'cave_light', lawfulBonus: 0 },
			{ id: 'cave_dark', lawfulBonus: 0 },
		],
	};
	const game = turns({ areas: [cave] });

	assert.equal(game.timeOfDayAt(1, 1).id, 'day', 'outside the area, the global time');
	assert.equal(game.timeOfDayAt(7, 1).id, 'cave_light', 'inside, the area time');
	assert.equal(game.lawfulBonusAt('lawful', 7, 1), 0, 'the area has no lawful bonus');

	game.advance();
	game.advance(); // night
	assert.equal(game.timeOfDayAt(1, 1).id, 'night');
	assert.equal(game.timeOfDayAt(7, 1).id, 'cave_dark');
});

test('overlapping time areas: the first one listed wins', () => {
	const first: TimeArea = { contains: () => true, times: [{ id: 'first', lawfulBonus: 10 }] };
	const second: TimeArea = { contains: () => true, times: [{ id: 'second', lawfulBonus: 20 }] };
	const game = turns({ areas: [first, second] });
	assert.equal(game.timeOfDayAt(0, 0).id, 'first');
});

test('a time area with a shorter schedule falls back to the global time', () => {
	const short: TimeArea = { contains: () => true, times: [{ id: 'only', lawfulBonus: 1 }] };
	const game = turns({ areas: [short] });
	assert.equal(game.timeOfDayAt(0, 0).id, 'only');
	game.advance();
	game.advance(); // time index 1, past the area's single entry
	assert.equal(game.timeOfDayAt(0, 0).id, 'night', 'the global schedule fills the gap');
});

test('the snapshot is a copy, so mutating it does not move the turn', () => {
	const game = turns();
	const snapshot = game.snapshot;
	snapshot.round = 99;
	snapshot.sideIndex = 1;
	assert.equal(game.round, 1);
	assert.equal(game.side, 'rebels');
});

test('toJSON/fromJSON resumes the exact position', () => {
	const game = turns();
	game.advance();
	game.advance();
	const saved = game.toJSON();

	const resumed = SideTurns.fromJSON({ sides: ['rebels', 'undead'], schedule: SCHEDULE }, saved);
	assert.equal(resumed.side, game.side);
	assert.equal(resumed.round, game.round);
	assert.equal(resumed.timeOfDay.id, game.timeOfDay.id);
	assert.deepEqual(resumed.advance(), game.advance());
});

test('a configured starting round and time index are honoured', () => {
	const game = turns({ round: 3, timeIndex: 1, sideIndex: 1 });
	assert.equal(game.round, 3);
	assert.equal(game.side, 'undead');
	assert.equal(game.timeOfDay.id, 'night');
});

test('malformed configuration throws up front', () => {
	assert.throws(() => new SideTurns({ sides: [], schedule: SCHEDULE }), /at least one side/);
	assert.throws(() => new SideTurns({ sides: ['a'], schedule: [] }), /non-empty schedule/);
	assert.throws(() => turns({ sideIndex: 2 }), /side index 2/);
	assert.throws(() => turns({ timeIndex: 5 }), /time index 5/);
	assert.throws(() => turns({ round: 0 }), /positive integer/);
});
