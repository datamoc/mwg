import { hexDistance, hexNeighbors, hexRange } from '../core/Hex.ts';
import * as Random from '../core/Random.ts';
import type { LevelShape } from './Level.ts';

/**
 * An overworld map: a whole realm as plain tile data.
 *
 * The world-map counterpart to `generateDungeon` and `generateCave`: elevation and moisture
 * fields from seeded value noise classify each cell into water, plains, forest, hills,
 * mountains, desert or swamp (the `seaLevel` knob decides how much is sea); rivers run from
 * high ground down to the sea or a lake, merging when they meet and never crossing a
 * mountain ridge (a ridge stops a river as a lake instead); settlements place themselves by
 * suitability (near water, on buildable ground, spaced apart) and join into a road network
 * that prefers flat ground and fords a river where it must cross one; points of interest
 * carry a `leadsTo` id a game feeds its `Overworld` locations with; and every cell carries a
 * coarse region id so encounter tables and names can hang off a region instead of a cell.
 *
 * `shape: 'hex'` generates the same realm on a hex grid (odd-q offset coordinates, the `Level`
 * convention): the noise is sampled where each hex is drawn so landmasses are not stretched,
 * rivers and roads step across the six edges, spacing and "near water" count hex distance.
 *
 * Deterministic: the same seed gives the same realm on every platform, drawn from the
 * framework `Random` stack. Sizes up to a few hundred tiles a side generate on load; a
 * bigger realm is a `threads.spawn` task like any other long job.
 *
 * @example
 * ```ts
 * import { generateOverworld } from '@datamoc/mwg/roguelike';
 *
 * const realm = generateOverworld({ width: 96, height: 64, seed: 42 });
 * console.log(realm.terrain[0]); // 'water' | 'plains' | 'forest' | ...
 * console.log(realm.settlements.length); // roads join every one of them
 * ```
 */
export type OverworldTerrain = 'water' | 'plains' | 'forest' | 'hills' | 'mountains' | 'desert' | 'swamp';

export interface OverworldOptions {
	width: number;
	height: number;
	seed: number;

	/** elevation below which a cell is sea; 0..1, defaults to 0.4 */
	seaLevel?: number;
	/** river sources attempted on high ground; defaults to `width * height / 600` */
	rivers?: number;
	/** settlements to place by suitability; defaults to `width * height / 500` */
	settlements?: number;
	/** points of interest to place; defaults to `width * height / 900` */
	pointsOfInterest?: number;
	/** the coarse region grid's cell side, in tiles; defaults to 12 */
	regionSize?: number;
	/** how stretched the noise is: larger values give broader landmasses; defaults to 6 */
	noiseScale?: number;
	/** the grid the realm is laid out on; defaults to `'square'` */
	shape?: LevelShape;
}

export interface OverworldSettlement {
	x: number;
	y: number;
	kind: 'village' | 'town' | 'castle';
}

export interface OverworldInterest {
	x: number;
	y: number;
	kind: 'ruin' | 'shrine' | 'dungeon';
	/** the id a game's `Overworld` location this point leads to carries */
	leadsTo: string;
}

export interface OverworldResult {
	/** row-major terrain ids, `width * height` entries */
	terrain: OverworldTerrain[];
	/** row-major elevation, 0..1, the field `terrain` was classified from */
	elevation: number[];
	/** row-major moisture, 0..1 */
	moisture: number[];
	/** each river's cells from its source to its mouth or lake */
	rivers: Array<Array<{ x: number; y: number }>>;
	/** each road's cells, settlement to settlement; river crossings are the ford sites */
	roads: Array<Array<{ x: number; y: number }>>;
	settlements: OverworldSettlement[];
	pointsOfInterest: OverworldInterest[];
	/** coarse region id per cell, row-major; region r's cells share `(y / regionSize) * cols + (x / regionSize)` */
	regions: number[];
	/** how many columns the coarse region grid has */
	regionColumns: number;
}

/** seeded value noise: a lattice of random values, smoothly interpolated, a few octaves */
function valueNoise(random: () => number, width: number, height: number, scale: number, hex: boolean): number[] {
	const latticeSide = (side: number): number => Math.max(2, Math.ceil(side / scale) + 2);
	const columns = latticeSide(width);
	const rows = latticeSide(height);
	const lattice = new Float64Array(columns * rows);
	for (let index = 0; index < lattice.length; index++) lattice[index] = random();
	const smooth = (t: number): number => t * t * (3 - 2 * t);
	const field = new Array<number>(width * height).fill(0);
	for (let octave = 0; octave < 3; octave++) {
		const factor = 1 << octave;
		const weight = 1 / (factor * factor);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				//on a hex grid sample where the cell is drawn: columns are 0.866 apart and
				//odd columns sit half a row lower
				const gx = ((hex ? x * HEX_COLUMN_PITCH : x) / scale) * factor;
				const gy = ((hex ? y + (x & 1) / 2 : y) / scale) * factor;
				const x0 = Math.floor(gx) % (columns - 1);
				const y0 = Math.floor(gy) % (rows - 1);
				const fx = smooth(gx - Math.floor(gx));
				const fy = smooth(gy - Math.floor(gy));
				const at = (lx: number, ly: number): number =>
					lattice[((y0 + ly) % rows) * columns + ((x0 + lx) % columns)];
				const top = at(0, 0) * (1 - fx) + at(1, 0) * fx;
				const bottom = at(0, 1) * (1 - fx) + at(1, 1) * fx;
				field[y * width + x] += (top * (1 - fy) + bottom * fy) * weight;
			}
		}
	}
	const total = 1 + 1 / 4 + 1 / 16;
	for (let index = 0; index < field.length; index++) field[index] /= total;
	return field;
}

/** distance between hex columns in units of the row height: 3/4 of a flat-top hex's width */
const HEX_COLUMN_PITCH = Math.sqrt(3) / 2;

const EIGHT = [
	[0, -1],
	[0, 1],
	[-1, 0],
	[1, 0],
	[-1, -1],
	[1, -1],
	[-1, 1],
	[1, 1],
] as const;

/**
 * Visit the cells a river or road may step to from `(x, y)`: the eight surrounding squares
 * (flagged diagonal for the corners), or the six hexes, every one an edge neighbour.
 */
function forEachStep(
	hex: boolean,
	x: number,
	y: number,
	visit: (nx: number, ny: number, diagonal: boolean) => void,
): void {
	if (hex) {
		for (const cell of hexNeighbors(x, y)) visit(cell.x, cell.y, false);
		return;
	}
	for (const [dx, dy] of EIGHT) visit(x + dx, y + dy, dx !== 0 && dy !== 0);
}

/** how much a road dislikes crossing each terrain; water is only crossable at a ford */
const ROAD_COST: Record<OverworldTerrain, number> = {
	plains: 1,
	forest: 3,
	hills: 5,
	desert: 2,
	swamp: 6,
	water: 24,
	mountains: 40,
};

export function generateOverworld(options: OverworldOptions): OverworldResult {
	const { width, height } = options;
	if (width < 16 || height < 16) throw new Error('an overworld needs at least 16x16 tiles');
	const seaLevel = options.seaLevel ?? 0.4;
	if (!(seaLevel > 0 && seaLevel < 1)) throw new Error('seaLevel must be between 0 and 1');
	const scale = options.noiseScale ?? 6;
	const hex = options.shape === 'hex';
	const at = (x: number, y: number): number => y * width + x;
	const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height;

	Random.push(options.seed);
	try {
		//a terrain field from elevation and moisture, both seeded; landmasses read as
		//coherent shapes rather than scattered peaks because the noise octaves overlap
		const elevation = valueNoise(() => Random.float(), width, height, scale, hex);
		const moisture = valueNoise(() => Random.float(), width, height, scale * 1.5, hex);
		const terrain: OverworldTerrain[] = new Array(width * height);
		const classify = (x: number, y: number): OverworldTerrain => {
			const index = at(x, y);
			const up = elevation[index];
			const wet = moisture[index];
			if (up < seaLevel) return 'water';
			if (up > 0.78) return 'mountains';
			if (up > 0.62) return 'hills';
			if (wet < 0.3) return 'desert';
			if (wet > 0.72) return up < seaLevel + 0.08 ? 'swamp' : 'forest';
			return 'plains';
		};
		for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) terrain[at(x, y)] = classify(x, y);

		//rivers: walk downhill from high ground to the sea or a lake; two rivers that
		//meet merge (the second stops on the first), and a ridge that stops a walk
		//drowns its basin cell into a lake instead of crossing the mountains
		const riverCells = new Set<number>();
		const rivers: Array<Array<{ x: number; y: number }>> = [];
		const riverTarget = options.rivers ?? Math.max(1, Math.floor((width * height) / 600));
		const highGround: number[] = [];
		for (let index = 0; index < terrain.length; index++)
			if (elevation[index] > 0.7 && terrain[index] !== 'water') highGround.push(index);
		for (let attempt = 0; attempt < riverTarget * 4 && rivers.length < riverTarget; attempt++) {
			if (highGround.length === 0) break;
			const sourceIndex = highGround[Random.int(highGround.length)];
			const path: Array<{ x: number; y: number }> = [];
			let x = sourceIndex % width;
			let y = Math.floor(sourceIndex / width);
			const walked = new Set<number>();
			for (let step = 0; step < width + height; step++) {
				const index = at(x, y);
				if (riverCells.has(index) || terrain[index] === 'water') {
					if (path.length > 0) path.push({ x, y });
					break;
				}
				path.push({ x, y });
				walked.add(index);
				let best: { x: number; y: number; up: number } | undefined;
				forEachStep(hex, x, y, (nx, ny) => {
					if (!inside(nx, ny)) return;
					const candidate = { x: nx, y: ny, up: elevation[at(nx, ny)] };
					if (!best || candidate.up < best.up) best = candidate;
				});
				if (!best || best.up >= elevation[at(x, y)]) {
					//no way down: a ridge or a basin. Drown the cell as a lake and stop here
					terrain[at(x, y)] = 'water';
					break;
				}
				[x, y] = [best.x, best.y];
			}
			if (path.length >= 2) {
				for (const cell of path) riverCells.add(at(cell.x, cell.y));
				rivers.push(path);
			}
		}

		//settlements: buildable ground near water, spaced apart; a castle prefers hills,
		//a town the plains, and everything else reads as a village
		const settlements: OverworldSettlement[] = [];
		const nearWater = (x: number, y: number): boolean => {
			if (hex)
				return hexRange({ x, y }, 3).some(
					(cell) => inside(cell.x, cell.y) && terrain[at(cell.x, cell.y)] === 'water',
				);
			for (let dy = -3; dy <= 3; dy++)
				for (let dx = -3; dx <= 3; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (inside(nx, ny) && terrain[at(nx, ny)] === 'water') return true;
				}
			return false;
		};
		const spaced = (x: number, y: number, distance: number): boolean =>
			settlements.every(
				(settlement) =>
					(hex
						? hexDistance(settlement, { x, y })
						: Math.abs(settlement.x - x) + Math.abs(settlement.y - y)) >= distance,
			);
		const wanted = options.settlements ?? Math.max(2, Math.floor((width * height) / 500));
		for (let attempt = 0; attempt < wanted * 60 && settlements.length < wanted; attempt++) {
			const x = Random.int(width);
			const y = Random.int(height);
			const kind = terrain[at(x, y)];
			if ((kind !== 'plains' && kind !== 'hills' && kind !== 'forest') || !nearWater(x, y)) continue;
			if (!spaced(x, y, 8)) continue;
			settlements.push({ x, y, kind: kind === 'hills' ? 'castle' : 'town' });
		}
		for (const settlement of settlements)
			if (settlement.kind === 'town' && Random.int(2) === 0) settlement.kind = 'village';

		//roads: a Dijkstra tree over the settlements, preferring flat ground; a water or
		//river cell on a route is a ford or bridge site, which is why water is expensive
		//rather than impassable here
		const roads: Array<Array<{ x: number; y: number }>> = [];
		const from = settlements[0];
		if (from) {
			const connected: OverworldSettlement[] = [from];
			const pending = settlements.slice(1);
			while (pending.length) {
				let bestRoute: { path: Array<{ x: number; y: number }>; to: OverworldSettlement } | undefined;
				for (const to of pending) {
					for (const start of connected) {
						const path = roadBetween(terrain, width, height, start, to, hex);
						if (path && (!bestRoute || path.length < bestRoute.path.length)) bestRoute = { path, to };
					}
				}
				if (!bestRoute) break;
				roads.push(bestRoute.path);
				connected.push(bestRoute.to);
				pending.splice(pending.indexOf(bestRoute.to), 1);
			}
		}

		//points of interest away from settlements, each leading somewhere
		const pointsOfInterest: OverworldInterest[] = [];
		const wantedInterest = options.pointsOfInterest ?? Math.max(1, Math.floor((width * height) / 900));
		for (let attempt = 0; attempt < wantedInterest * 40 && pointsOfInterest.length < wantedInterest; attempt++) {
			const x = Random.int(width);
			const y = Random.int(height);
			const kind = terrain[at(x, y)];
			if (kind === 'water' || kind === 'mountains') continue;
			if (!spaced(x, y, 6)) continue;
			const kinds = ['ruin', 'shrine', 'dungeon'] as const;
			const interest = kinds[Random.int(kinds.length)];
			pointsOfInterest.push({
				x,
				y,
				kind: interest,
				leadsTo: `overworld-${interest}-${pointsOfInterest.length}`,
			});
		}

		//regions: a coarse id per cell, so a game hangs encounters and names off a region
		const regionSize = Math.max(2, options.regionSize ?? 12);
		const regionColumns = Math.ceil(width / regionSize);
		const regions = new Array<number>(width * height);
		for (let y = 0; y < height; y++)
			for (let x = 0; x < width; x++)
				regions[at(x, y)] = Math.floor(y / regionSize) * regionColumns + Math.floor(x / regionSize);

		return { terrain, elevation, moisture, rivers, roads, settlements, pointsOfInterest, regions, regionColumns };
	} finally {
		Random.pop();
	}
}

/** one road: Dijkstra from one settlement to another over per-terrain costs */
function roadBetween(
	terrain: OverworldTerrain[],
	width: number,
	height: number,
	from: { x: number; y: number },
	to: { x: number; y: number },
	hex: boolean,
): Array<{ x: number; y: number }> | undefined {
	const at = (x: number, y: number): number => y * width + x;
	const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height;
	const total = width * height;
	const distance = new Float64Array(total).fill(Infinity);
	const previous = new Int32Array(total).fill(-1);
	const start = at(from.x, from.y);
	const goal = at(to.x, to.y);
	distance[start] = 0;
	//a binary heap keyed by distance: with per-terrain costs this stays fast at the
	//'few hundred tiles a side' sizes an overworld is allowed to load with
	const heap: number[] = [start];
	const inHeap = new Uint8Array(total);
	const swapDown = (position: number): void => {
		while (true) {
			const left = position * 2 + 1;
			const right = left + 1;
			let smallest = position;
			if (left < heap.length && distance[heap[left]] < distance[heap[smallest]]) smallest = left;
			if (right < heap.length && distance[heap[right]] < distance[heap[smallest]]) smallest = right;
			if (smallest === position) return;
			[heap[position], heap[smallest]] = [heap[smallest], heap[position]];
			position = smallest;
		}
	};
	const pop = (): number => {
		const top = heap[0];
		const last = heap.pop()!;
		if (heap.length) {
			heap[0] = last;
			swapDown(0);
		}
		inHeap[top] = 0;
		return top;
	};
	const push = (cell: number): void => {
		heap.push(cell);
		inHeap[cell] = 1;
		let position = heap.length - 1;
		while (position > 0) {
			const parent = (position - 1) >> 1;
			if (distance[heap[parent]] <= distance[heap[position]]) break;
			[heap[position], heap[parent]] = [heap[parent], heap[position]];
			position = parent;
		}
	};
	while (heap.length) {
		const current = pop();
		if (current === goal) {
			const path: Array<{ x: number; y: number }> = [];
			for (let cell = goal; cell !== -1; cell = previous[cell])
				path.push({ x: cell % width, y: Math.floor(cell / width) });
			return path.reverse();
		}
		const cx = current % width;
		const cy = Math.floor(current / width);
		forEachStep(hex, cx, cy, (nx, ny, diagonal) => {
			if (!inside(nx, ny)) return;
			const next = at(nx, ny);
			if (distance[current] === Infinity) return;
			const step = ROAD_COST[terrain[next]] * (diagonal ? 1.5 : 1);
			if (distance[current] + step < distance[next]) {
				distance[next] = distance[current] + step;
				previous[next] = current;
				if (!inHeap[next]) push(next);
			}
		});
	}
	return undefined;
}
