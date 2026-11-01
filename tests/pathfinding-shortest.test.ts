import assert from 'node:assert/strict';
import test from 'node:test';
import { shortestPath } from '../src/core/Pathfinding.ts';

/** a row-major grid of `width` by `height`, cells numbered from 0 top-left */
function grid(width: number, height: number) {
	return {
		at: (x: number, y: number) => y * width + x,
		neighbors: (index: number): number[] => {
			const x = index % width;
			const y = (index - x) / width;
			const cells: number[] = [];
			if (x > 0) cells.push(index - 1);
			if (x < width - 1) cells.push(index + 1);
			if (y > 0) cells.push(index - width);
			if (y < height - 1) cells.push(index + width);
			return cells;
		},
	};
}

const { at, neighbors } = grid(5, 3);

test('shortestPath walks a straight grid route from start to goal inclusive', () => {
	const route = shortestPath(at(0, 0), at(4, 0), { key: (cell) => cell, neighbors });
	assert.deepEqual(route, [at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(4, 0)]);
});

test('shortestPath detours around a blocked cell', () => {
	const route = shortestPath(at(0, 0), at(4, 0), {
		key: (cell) => cell,
		neighbors,
		canEnter: (cell) => cell !== at(2, 0),
	});

	assert.ok(route);
	assert.equal(route[0], at(0, 0));
	assert.equal(route[route.length - 1], at(4, 0));
	assert.equal(route.includes(at(2, 0)), false);
	assert.equal(route.length, 7, 'the detour is two steps longer than the direct route');
	for (let index = 1; index < route.length; index++) {
		assert.ok(neighbors(route[index - 1]).includes(route[index]), 'every step is between neighbours');
	}
});

test('shortestPath returns null when the goal is unreachable', () => {
	const route = shortestPath(at(0, 0), at(4, 0), {
		key: (cell) => cell,
		neighbors,
		canEnter: (cell) => cell % 5 !== 2,
	});
	assert.equal(route, null);
});

test('shortestPath returns the start alone when start equals goal', () => {
	const route = shortestPath(at(2, 1), at(2, 1), { key: (cell) => cell, neighbors });
	assert.deepEqual(route, [at(2, 1)]);
});

test('shortestPath prefers a cheaper longer route to an expensive short one', () => {
	const board = grid(4, 2);
	const route = shortestPath(board.at(0, 0), board.at(3, 0), {
		key: (cell) => cell,
		neighbors: board.neighbors,
		cost: (_from, to) => (to === board.at(1, 0) || to === board.at(2, 0) ? 100 : 1),
	});
	assert.deepEqual(route, [
		board.at(0, 0),
		board.at(0, 1),
		board.at(1, 1),
		board.at(2, 1),
		board.at(3, 1),
		board.at(3, 0),
	]);
});

test('shortestPath returns null when canEnter excludes the goal', () => {
	const route = shortestPath(at(0, 0), at(4, 0), {
		key: (cell) => cell,
		neighbors,
		canEnter: (cell) => cell !== at(4, 0),
	});
	assert.equal(route, null);
});

test('maxExpanded returns null when the cap is reached before a reachable goal is settled', () => {
	const corridor = (cell: number): number[] => (cell < 4 ? [cell + 1] : []);
	const options = { key: (cell: number) => cell, neighbors: corridor };

	assert.equal(shortestPath(0, 4, { ...options, maxExpanded: 4 }), null, 'five cells must be settled');
	assert.deepEqual(shortestPath(0, 4, { ...options, maxExpanded: 5 }), [0, 1, 2, 3, 4]);
});

test('maxExpanded large enough still finds a grid route', () => {
	const route = shortestPath(at(0, 0), at(4, 0), {
		key: (cell) => cell,
		neighbors,
		maxExpanded: 100,
	});
	assert.deepEqual(route, [at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(4, 0)]);
});

test('maxExpanded rejects a value that is not a positive integer', () => {
	for (const maxExpanded of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.throws(
			() => shortestPath(at(0, 0), at(4, 0), { key: (cell) => cell, neighbors, maxExpanded }),
			/maxExpanded must be a positive integer/,
			`maxExpanded ${String(maxExpanded)} should throw`,
		);
	}
});

test('canEnter receives the cell being entered and the cell it comes from', () => {
	const seen: Array<[number, number | undefined]> = [];
	const route = shortestPath(at(0, 0), at(2, 0), {
		key: (cell) => cell,
		neighbors,
		canEnter: (cell, from) => {
			seen.push([cell, from]);
			return true;
		},
	});

	assert.deepEqual(route, [at(0, 0), at(1, 0), at(2, 0)]);
	assert.deepEqual(seen[0], [at(0, 0), undefined], 'the start is checked once, with no origin');
	for (const [cell, from] of seen.slice(1)) {
		assert.ok(from !== undefined, `cell ${cell} was checked without an origin`);
		assert.ok(neighbors(from).includes(cell), `${from} and ${cell} are neighbours`);
	}
	assert.ok(
		seen.some(([cell, from]) => cell === at(1, 0) && from === at(0, 0)),
		'the first step is reported with the start as its origin',
	);
});

/** a row-major grid of `width` by `height` with all eight neighbours, cells numbered from 0 top-left */
function grid8(width: number, height: number) {
	const base = grid(width, height);
	return {
		at: base.at,
		neighbors: (index: number): number[] => {
			const x = index % width;
			const y = (index - x) / width;
			const cells: number[] = [];
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dy === 0) continue;
					const nx = x + dx;
					const ny = y + dy;
					if (nx >= 0 && nx < width && ny >= 0 && ny < height) cells.push(ny * width + nx);
				}
			}
			return cells;
		},
	};
}

function diagonal(width: number, from: number, to: number): boolean {
	return from % width !== to % width && Math.floor(from / width) !== Math.floor(to / width);
}

/** the two orthogonal cells a diagonal step passes between */
function beside(width: number, from: number, to: number): [number, number] {
	const fromX = from % width;
	const fromY = (from - fromX) / width;
	const toX = to % width;
	const toY = (to - toX) / width;
	return [fromY * width + toX, toY * width + fromX];
}

test('a one-side-open diagonal rule rejects a corner cut using both cells', () => {
	const board = grid8(3, 3);
	const start = board.at(0, 0);
	const goal = board.at(1, 1);
	const checked: number[] = [];
	const canEnter = (cell: number, from: number | undefined): boolean => {
		const open = (index: number) => index !== board.at(1, 0) && index !== board.at(0, 1);
		if (from === undefined || !diagonal(3, from, cell)) return open(cell);
		const sides = beside(3, from, cell);
		checked.push(...sides);
		return open(cell) && sides.some(open);
	};

	const route = shortestPath(start, goal, { key: (cell) => cell, neighbors: board.neighbors, canEnter });
	assert.equal(route, null, 'both orthogonal cells beside the diagonal are blocked');
	assert.deepEqual(new Set(checked), new Set([board.at(1, 0), board.at(0, 1)]), 'both side cells were consulted');

	const oneOpen = (cell: number, from: number | undefined): boolean => {
		const open = (index: number) => index !== board.at(1, 0);
		if (from === undefined || !diagonal(3, from, cell)) return open(cell);
		return open(cell) && beside(3, from, cell).some(open);
	};
	assert.deepEqual(
		shortestPath(start, goal, { key: (cell) => cell, neighbors: board.neighbors, canEnter: oneOpen }),
		[start, goal],
		'one open side is enough for the diagonal',
	);
});

test('an origin-dependent canEnter cannot move through a blocked diagonal', () => {
	const board = grid8(3, 3);
	const start = board.at(0, 0);
	const goal = board.at(1, 1);
	const route = shortestPath(start, goal, {
		key: (cell) => cell,
		neighbors: board.neighbors,
		canEnter: (cell, from) => !(from !== undefined && diagonal(3, from, cell) && from === start && cell === goal),
	});

	assert.ok(route);
	assert.equal(route.length, 3, 'the diagonal is unusable, so the route takes two orthogonal steps');
	assert.ok(route[1] === board.at(1, 0) || route[1] === board.at(0, 1));
	assert.notDeepEqual([route[0], route[1]], [start, goal]);
});

test('equal-cost routes are broken by neighbour order and repeat the same path', () => {
	const options = { key: (cell: number) => cell, neighbors };
	// two equally cheap routes from (0, 0) to (1, 1): right then down, or down then right
	const expected = [at(0, 0), at(1, 0), at(1, 1)];
	for (let run = 0; run < 5; run++) {
		assert.deepEqual(shortestPath(at(0, 0), at(1, 1), options), expected, `run ${run}`);
	}
});
