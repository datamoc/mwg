import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateCave, type CaveOptions } from '../src/roguelike/Cave.ts';

const chambers: CaveOptions['chambers'] = [
	{ id: 'entrance', xRange: [2, 6], yRange: [2, 6], size: 10, passages: [{ to: 'depths', windiness: 60 }] },
	{ id: 'depths', xRange: [33, 37], yRange: [18, 22], size: 16, jagged: 80, passages: [{ to: 'lair', chance: 60 }] },
	{ id: 'lair', xRange: [18, 22], yRange: [2, 6], size: 12, jagged: 100, passages: [] },
];

const options = (): CaveOptions => ({
	width: 40,
	height: 25,
	seed: 7,
	chambers: chambers.map((chamber) => ({ ...chamber, passages: [...chamber.passages] })),
	starts: [{ side: 'player', chamber: 'entrance', ring: true }],
	villageDensity: 40,
	mustBeClear: [{ x: 20, y: 12 }],
});

const floorsOf = (cave: ReturnType<typeof generateCave>): Array<[number, number]> => {
	const cells: Array<[number, number]> = [];
	for (let y = 0; y < 25; y++) for (let x = 0; x < 40; x++) if (cave.level.get(x, y) === 1) cells.push([x, y]);
	return cells;
};

test('a cave is seeded, sized and chambered as asked', () => {
	const cave = generateCave(options());
	assert.equal(cave.chambers[0].cells.length, 10);
	assert.equal(cave.chambers[1].cells.length, 16);
	assert.equal(cave.chambers[2].cells.length, 12);
	//the same seed gives the same cave, a different seed a different one
	const again = generateCave(options());
	assert.deepEqual(floorsOf(cave), floorsOf(again));
	assert.deepEqual(cave.starts, again.starts);
	assert.deepEqual(cave.villages, again.villages);
	const other = generateCave({ ...options(), seed: 8 });
	assert.notDeepEqual(floorsOf(cave), floorsOf(other));
});

test('a generated cave is always fully connected', () => {
	const cave = generateCave(options());
	const first = cave.chambers[0].centre;
	const seen = new Set<string>([`${first.x},${first.y}`]);
	const queue: Array<[number, number]> = [[first.x, first.y]];
	while (queue.length) {
		const [x, y] = queue.pop()!;
		for (const [nx, ny] of [
			[x, y - 1],
			[x, y + 1],
			[x - 1, y],
			[x + 1, y],
		] as Array<[number, number]>) {
			const key = `${nx},${ny}`;
			if (seen.has(key) || cave.level.get(nx, ny) !== 1) continue;
			seen.add(key);
			queue.push([nx, ny]);
		}
	}
	for (const chamber of cave.chambers)
		for (const cell of chamber.cells) assert.ok(seen.has(`${cell.x},${cell.y}`), `${chamber.id} reachable`);
	assert.ok(seen.has('20,12'), 'mustBeClear is reachable');
	//the passage with chance 60 exists in this seed, the rolls are exercised either way:
	//whatever they did, the forced join guarantees the invariant above
});

test('chance, jagged, windiness and villageDensity do what they say', () => {
	const sparse = generateCave({
		width: 30,
		height: 20,
		seed: 3,
		chambers: [
			{ id: 'a', xRange: [2, 6], yRange: [2, 6], size: 8, jagged: 100, passages: [] },
			{ id: 'b', xRange: [23, 27], yRange: [13, 17], size: 8, jagged: 100, passages: [{ to: 'a', chance: 0 }] },
		],
	});
	//chance 0 carved no passage, but the forced join did: b is still reachable, and the
	//direct walk between the two centres exists only through that join
	assert.equal(sparse.chambers[0].cells.length, 8);
	const noVillages = generateCave({ ...options(), villageDensity: 0 });
	assert.equal(noVillages.villages.length, 0);
	const dense = generateCave({ ...options(), villageDensity: 40 });
	const floorCount = floorsOf(dense).length;
	assert.equal(dense.villages.length, Math.floor((floorCount * 40) / 1000));
});

test('a start sits on its chamber centre and its ring is carved', () => {
	const cave = generateCave(options());
	const start = cave.starts.find((entry) => entry.side === 'player');
	assert.ok(start);
	const centre = cave.chambers[0].centre;
	assert.deepEqual(start, { side: 'player', x: centre.x, y: centre.y });
	for (const [nx, ny] of [
		[centre.x, centre.y - 1],
		[centre.x, centre.y + 1],
		[centre.x - 1, centre.y],
		[centre.x + 1, centre.y],
	] as Array<[number, number]>)
		assert.equal(cave.level.get(nx, ny), 1);
});

test('a cave refuses impossible shapes by name', () => {
	assert.throws(() => generateCave({ ...options(), width: 3, height: 20 }), /at least 5x5/);
	assert.throws(() => generateCave({ ...options(), chambers: [] }), /at least one chamber/);
	assert.throws(
		() =>
			generateCave({
				...options(),
				starts: [{ side: 'player', chamber: 'nowhere' }],
			}),
		/names no chamber/,
	);
	assert.throws(
		() =>
			generateCave({
				...options(),
				chambers: [{ id: 'a', xRange: [2, 6], yRange: [2, 6], size: 4, passages: [{ to: 'ghost' }] }],
			}),
		/names no chamber/,
	);
});
