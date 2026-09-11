import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Level } from '../src/roguelike/Level.ts';
import { MultiTurnBeam } from '../src/roguelike/MultiTurnBeam.ts';
import type { MultiTurnBeamSave } from '../src/roguelike/MultiTurnBeam.ts';
import type { Step } from '../src/roguelike/Pathfinder.ts';

const WALL = { passable: false, transparent: false };
const FLOOR = { passable: true, transparent: true };

function square(): Level {
	const level = new Level(10, 10, [WALL, FLOOR], 1);
	return level;
}

/** a widening cone along +x from (0, 4): one cell, then three, then five, then seven */
function cone(maxX = 5): (previous: readonly Step[], turn: number) => readonly Step[] {
	return (previous, turn) => {
		const x = Math.max(...previous.map((cell) => cell.x)) + 1;
		if (x > maxX) return [];
		const cells: Step[] = [];
		for (let dy = -turn; dy <= turn; dy++) cells.push({ x, y: 4 + dy });
		return cells;
	};
}

test('an explicit none blocker passes a beam through opaque terrain', () => {
	const level = square();
	level.set(3, 4, 0); // opaque and impassable
	const beam = new MultiTurnBeam({
		level,
		from: { x: 1, y: 4 },
		target: { x: 6, y: 4 },
		damage: 2,
		blocker: 'none',
	});
	beam.start();
	assert.deepEqual(beam.advance().cell, { x: 2, y: 4 });
	assert.deepEqual(beam.advance().cell, { x: 3, y: 4 }, 'the wall did not stop it');
	assert.deepEqual(beam.advance().cell, { x: 4, y: 4 });
});

test('a blocker function is the whole policy, terrain ignored', () => {
	const level = square();
	const blockedAt: number[] = [];
	const beam = new MultiTurnBeam({
		level,
		from: { x: 1, y: 4 },
		target: { x: 6, y: 4 },
		damage: 1,
		blocker: (cell) => {
			blockedAt.push(cell.x);
			return cell.x === 4;
		},
	});
	beam.start();
	beam.advance();
	beam.advance();
	assert.equal(beam.advance().status, 'blocked', 'the function stopped it at x=4');
	assert.deepEqual(blockedAt, [2, 3, 4]);
});

test('isBlocked is an extra rule on top of the chosen blocker', () => {
	const level = square();
	const beam = new MultiTurnBeam({
		level,
		from: { x: 1, y: 4 },
		target: { x: 6, y: 4 },
		damage: 1,
		blocker: 'none',
		isBlocked: (cell) => cell.x === 3,
	});
	beam.start();
	beam.advance();
	assert.equal(beam.advance().status, 'blocked', 'the game rule still applies');
});

test('per-turn fronts widen a cone deterministically on a square grid', () => {
	const run = () => {
		const beam = new MultiTurnBeam({
			level: square(),
			from: { x: 0, y: 4 },
			target: { x: 5, y: 4 },
			damage: 1,
			fronts: cone(5),
			shape: 'cone',
		});
		beam.start();
		const seen: number[] = [];
		for (let i = 0; i < 5; i++) seen.push(beam.advance().cells.length);
		return { seen, end: beam.advance().status };
	};

	//the resolver stopped after x=5, so the fifth front is the last one and the sixth advance is done
	assert.deepEqual(run(), { seen: [1, 3, 5, 7, 9], end: 'done' });
	assert.deepEqual(run(), run(), 'the shape is deterministic');
});

test('a cone front damages every cell it reaches, and onCell sees each one', () => {
	const cells: Step[] = [];
	const hit: Step[] = [];
	const beam = new MultiTurnBeam({
		level: square(),
		from: { x: 0, y: 4 },
		target: { x: 5, y: 4 },
		damage: 3,
		fronts: cone(5),
		onCell: (cell) => cells.push(cell),
		targetsAt: (cell) => (cell.y === 4 ? [{ cell }] : []),
		applyDamage: (target: { cell: Step }) => hit.push(target.cell),
	});
	beam.start();

	const first = beam.advance();
	assert.deepEqual(first.cells, [{ x: 1, y: 4 }]);
	assert.equal(first.damage, 3);

	const second = beam.advance();
	assert.deepEqual(second.cells, [
		{ x: 2, y: 3 },
		{ x: 2, y: 4 },
		{ x: 2, y: 5 },
	]);
	assert.equal(second.damage, 3, 'only the y=4 cell carried a target');
	assert.deepEqual(hit, [{ x: 1, y: 4 }, { x: 2, y: 4 }]);
	assert.deepEqual(cells, [
		{ x: 1, y: 4 },
		{ x: 2, y: 3 },
		{ x: 2, y: 4 },
		{ x: 2, y: 5 },
	]);
});

test('a multi-cell front drops blocked cells and keeps the rest', () => {
	const level = square();
	level.set(2, 3, 0); // the top cell of the turn-1 front is a wall
	const beam = new MultiTurnBeam({
		level,
		from: { x: 0, y: 4 },
		target: { x: 5, y: 4 },
		damage: 1,
		fronts: cone(5),
	});
	beam.start();
	beam.advance();
	const second = beam.advance();
	assert.deepEqual(second.cells, [
		{ x: 2, y: 4 },
		{ x: 2, y: 5 },
	]);
	assert.equal(second.status, 'active', 'the front continued past the blocked cell');
});

test('a fully blocked front ends the beam as blocked', () => {
	const level = square();
	level.set(1, 4, 0);
	const beam = new MultiTurnBeam({
		level,
		from: { x: 0, y: 4 },
		target: { x: 3, y: 4 },
		damage: 1,
	});
	beam.start();
	assert.equal(beam.advance().status, 'blocked');
	assert.equal(beam.advance().status, 'blocked', 'and it stays blocked');
});

test('fronts resolve deterministically on a hex grid too', () => {
	const run = () => {
		const level = new Level(10, 10, [WALL, FLOOR], 1, 'hex');
		const beam = new MultiTurnBeam({
			level,
			from: { x: 2, y: 5 },
			target: { x: 6, y: 5 },
			damage: 1,
			//one widening ring per turn, straight from the level's own neighbourhood being known
			fronts: (previous, turn) => {
				if (turn === 0) return [{ x: 3, y: 5 }];
				if (turn > 3) return [];
				return previous.map((cell) => ({ x: cell.x + 1, y: cell.y }));
			},
			shape: 'hex-line',
		});
		beam.start();
		const seen: Array<{ step: number; cells: Step[] }> = [];
		for (let i = 0; i < 5; i++) {
			const result = beam.advance();
			seen.push({ step: result.step, cells: result.cells.map((cell) => ({ ...cell })) });
		}
		return seen;
	};

	const first = run();
	assert.deepEqual(first, run(), 'the hex run is reproducible');
	assert.deepEqual(
		first.map((entry) => entry.cells[0] ?? null),
		[{ x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }, null],
	);
});

test('a saved beam reports its shape and refuses to resume as another', () => {
	const beam = new MultiTurnBeam({
		level: square(),
		from: { x: 0, y: 4 },
		target: { x: 5, y: 4 },
		damage: 1,
		fronts: cone(5),
		shape: 'cone',
	});
	assert.equal(beam.beamShape, 'cone');
	beam.start();
	beam.advance();
	const saved = beam.toJSON();
	assert.equal(saved.shape, 'cone');

	assert.throws(
		() => MultiTurnBeam.fromJSON({ level: square(), damage: 1, shape: 'line' }, saved),
		/shape "cone"/,
	);
});

test('a saved cone resumes at the exact front, without re-asking the resolver', () => {
	const level = square();
	let calls = 0;
	const resolver = (previous: readonly Step[], turn: number): readonly Step[] => {
		calls++;
		return cone(5)(previous, turn);
	};
	const beam = new MultiTurnBeam({
		level,
		from: { x: 0, y: 4 },
		target: { x: 5, y: 4 },
		damage: 1,
		fronts: resolver,
	});
	beam.start();
	beam.advance();
	beam.advance();
	const saved = beam.toJSON();
	const callsBefore = calls;

	const resumed = MultiTurnBeam.fromJSON({ level, damage: 1, fronts: resolver }, saved);
	assert.equal(resumed.beamShape, 'fronts');

	//both beams are on turn 2; each resolves exactly its own next front and reaches the same cells
	const expected = beam.advance();
	const actual = resumed.advance();
	assert.deepEqual(actual.cells, expected.cells);
	assert.equal(calls, callsBefore + 2, 'each beam resolved exactly one further front');
});

test('a save written before fronts landed still loads as a line', () => {
	const level = square();
	const legacy = {
		path: [
			{ x: 2, y: 4 },
			{ x: 3, y: 4 },
			{ x: 4, y: 4 },
		],
		index: 1,
		state: 'active',
	} as unknown as MultiTurnBeamSave;

	const beam = MultiTurnBeam.fromJSON({ level, damage: 1 }, legacy);
	assert.equal(beam.beamShape, 'line');
	assert.deepEqual(beam.advance().cell, { x: 3, y: 4 });
	assert.deepEqual(beam.advance().cell, { x: 4, y: 4 });
	assert.equal(beam.advance().status, 'done');
});
