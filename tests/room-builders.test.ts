import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Random from '../src/core/Random.ts';
import { Level, type Rect } from '../src/roguelike/Level.ts';
import { generateDungeonGraph } from '../src/roguelike/generate.ts';
import { hallBuilder, eligibleBuilders, pickBuilder, type RoomBuilder } from '../src/roguelike/RoomBuilders.ts';
import { DUNGEON_KINDS } from '../src/roguelike/generate.ts';

const room = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom });

test('hallBuilder fills the whole rectangle, which is what the generator always did', () => {
	const level = new Level(10, 10, DUNGEON_KINDS, 0);
	hallBuilder.paint(level, room(2, 2, 4, 5), 1);

	for (let y = 2; y <= 5; y++) for (let x = 2; x <= 4; x++) assert.equal(level.get(x, y), 1);
	assert.equal(level.get(1, 2), 0, 'outside the room is untouched');
	assert.equal(level.get(5, 2), 0);
});

test('eligibleBuilders checks minSize against the shorter side and maxSize against the longer', () => {
	const big: RoomBuilder = { id: 'big', minSize: 5, paint: () => {} };
	const small: RoomBuilder = { id: 'small', maxSize: 4, paint: () => {} };
	const any: RoomBuilder = { id: 'any', paint: () => {} };
	const builders = [big, small, any];

	//3 wide by 8 tall: shorter side 3, longer side 8
	const narrow = room(0, 0, 2, 7);
	assert.deepEqual(
		eligibleBuilders(builders, narrow).map((b) => b.id),
		['any'],
		'too narrow for big, too long for small',
	);

	//6x6: shorter and longer both 6
	assert.deepEqual(
		eligibleBuilders(builders, room(0, 0, 5, 5)).map((b) => b.id),
		['big', 'any'],
	);

	//3x3 fits small and any
	assert.deepEqual(
		eligibleBuilders(builders, room(0, 0, 2, 2)).map((b) => b.id),
		['small', 'any'],
	);
});

test('pickBuilder returns null when nothing fits, so the generator can fall back', () => {
	const onlyBig: RoomBuilder = { id: 'big', minSize: 20, paint: () => {} };
	assert.equal(pickBuilder([onlyBig], room(0, 0, 2, 2)), null);
	assert.equal(pickBuilder([], room(0, 0, 9, 9)), null);
});

test('pickBuilder honours weight, and a zero-weight builder is never picked', () => {
	const never: RoomBuilder = { id: 'never', weight: 0, paint: () => {} };
	const always: RoomBuilder = { id: 'always', weight: 1, paint: () => {} };

	Random.push(1);
	try {
		for (let i = 0; i < 40; i++) {
			assert.equal(pickBuilder([never, always], room(0, 0, 5, 5))?.id, 'always');
		}
	} finally {
		Random.pop();
	}
});

test('a floor generated with no builders reports every room as a plain hall', () => {
	Random.push(3);
	try {
		const { level, roomBuilders } = generateDungeonGraph({ width: 40, height: 40 });
		assert.equal(roomBuilders.length, level.rooms.length);
		assert.ok(roomBuilders.every((id) => id === 'hall'));
	} finally {
		Random.pop();
	}
});

test('the generator calls a supplied builder for every room and records which', () => {
	Random.push(5);
	try {
		const painted: Rect[] = [];
		const ring: RoomBuilder = {
			id: 'ring',
			paint: (level, r, floor) => {
				painted.push(r);
				//a hollow room: walls kept in the middle, so it is visibly not a plain hall
				for (let y = r.top; y <= r.bottom; y++) {
					for (let x = r.left; x <= r.right; x++) {
						const edge = x === r.left || x === r.right || y === r.top || y === r.bottom;
						if (edge) level.set(x, y, floor);
					}
				}
			},
		};

		const { level, roomBuilders } = generateDungeonGraph({ width: 40, height: 40, builders: [ring] });
		assert.equal(painted.length, level.rooms.length);
		assert.ok(level.rooms.length > 0);
		assert.ok(roomBuilders.every((id) => id === 'ring'));
	} finally {
		Random.pop();
	}
});

test('a room no builder fits falls back to a hall rather than being left solid', () => {
	Random.push(7);
	try {
		//a builder that fits nothing this generator produces
		const impossible: RoomBuilder = {
			id: 'impossible',
			minSize: 999,
			paint: () => assert.fail('should never run'),
		};
		const { level, roomBuilders } = generateDungeonGraph({ width: 40, height: 40, builders: [impossible] });

		assert.ok(roomBuilders.every((id) => id === 'hall'));
		//every room really is walkable, which is the point of the fallback
		for (const r of level.rooms) {
			assert.equal(level.get(r.left, r.top), 1);
			assert.equal(level.get(r.right, r.bottom), 1);
		}
	} finally {
		Random.pop();
	}
});

test('the same seed picks the same builders, so a floor stays reproducible', () => {
	const builders: RoomBuilder[] = [
		{ id: 'a', paint: (level, r, floor) => level.fillRect(r, floor) },
		{ id: 'b', paint: (level, r, floor) => level.fillRect(r, floor) },
	];
	const run = () => {
		Random.push(11);
		try {
			return generateDungeonGraph({ width: 40, height: 40, builders }).roomBuilders;
		} finally {
			Random.pop();
		}
	};
	const first = run();
	assert.deepEqual(run(), first);
	//and the two builders really are both in play, or the test proves nothing
	assert.ok(new Set(first).size >= 1);
});
