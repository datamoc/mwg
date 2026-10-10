import * as Random from '../core/Random.ts';
import { DUNGEON_KINDS } from './generate.ts';
import { Level, type TerrainKind } from './Level.ts';

/**
 * Caves: chambers grown as blobs, joined by winding passages.
 *
 * The counterpart to `generateDungeon`'s rooms-and-corridors: where a dungeon reads as built
 * architecture, a cave reads as carved rock. Chambers grow from a centre by absorbing frontier
 * cells until they hold `size` cells (`jagged` is the chance a step picks any frontier cell
 * instead of the one nearest the centre, so 0 gives a round room and 100 a splatter);
 * passages are biased random walks between chamber centres (`windiness` the chance of a
 * random step instead of the one closing in on the target, `width` how many cells wide);
 * `chance` rolls whether a passage exists at all. Every chamber centre and every
 * `mustBeClear` coordinate is force-joined to the first chamber, so a generated cave is
 * always fully connected whatever the rolls did.
 *
 * Seeded through the framework `Random` stack: the same seed produces the same cave on every
 * machine, the same contract `generateDungeon` already carries.
 *
 * @example
 * ```ts
 * import { generateCave } from '@datamoc/mw_games/roguelike';
 *
 * const cave = generateCave({
 *   width: 40,
 *   height: 25,
 *   seed: 7,
 *   chambers: [
 *     { id: 'entrance', xRange: [2, 8], yRange: [2, 8], size: 12, passages: [] },
 *     { id: 'depths', xRange: [30, 37], yRange: [17, 22], size: 20, jagged: 60, passages: [] },
 *   ],
 * });
 * console.log(cave.chambers[0].cells.length); // 12
 * ```
 */
export interface CavePassage {
	/** the chamber id this passage runs to */
	to: string;
	/** cells wide; defaults to 1 */
	width?: number;
	/** 0-100, the chance a walk step wanders instead of closing in; defaults to 0 */
	windiness?: number;
	/** 0-100, the chance the passage is walked at all; defaults to 100 */
	chance?: number;
}

export interface CaveChamber {
	id: string;
	/** inclusive cell ranges the centre is drawn from */
	xRange: [number, number];
	yRange: [number, number];
	/** how many cells the chamber holds once grown */
	size: number;
	/** 0-100, the chance a growth step picks any frontier cell instead of the nearest */
	jagged?: number;
	passages: CavePassage[];
}

/** a start placed at a chamber's centre, with its ring of cells cleared when `ring` */
export interface CaveStart {
	side: string;
	chamber: string;
	ring?: boolean;
}

export interface CaveOptions {
	width: number;
	height: number;

	/** seeds the `Random` stream the cave is drawn from */
	seed: number;

	/** terrain ids to write; both must exist in the kinds passed to the Level */
	wall?: number;
	floor?: number;

	/** extra terrain kinds beyond wall/floor, appended after them - a game's own ids */
	kinds?: TerrainKind[];

	chambers: CaveChamber[];

	/** one start per side, placed on the named chamber's centre */
	starts?: CaveStart[];

	/** cleared cells per 1000 floor cells, returned as `villages` (the game decides what one means) */
	villageDensity?: number;

	/** cells that must end up floor whatever the rolls did, and reachable */
	mustBeClear?: ReadonlyArray<{ x: number; y: number }>;
}

export interface CaveResult {
	level: Level;

	/** every chamber as grown, with its centre and carved cells */
	chambers: ReadonlyArray<{
		id: string;
		centre: { x: number; y: number };
		cells: ReadonlyArray<{ x: number; y: number }>;
	}>;

	/** start positions by side, chamber centres with their ring carved when asked */
	starts: ReadonlyArray<{ side: string; x: number; y: number }>;

	/** cells picked as villages by density; their terrain stays `floor` */
	villages: ReadonlyArray<{ x: number; y: number }>;
}

/** the four orthogonal neighbours, the square-grid cave's whole step set */
function neighbours(x: number, y: number): Array<[number, number]> {
	return [
		[x, y - 1],
		[x, y + 1],
		[x - 1, y],
		[x + 1, y],
	];
}

export function generateCave(options: CaveOptions): CaveResult {
	const { width, height } = options;
	if (width < 5 || height < 5) throw new Error('a cave needs at least 5x5 cells');
	if (options.chambers.length < 1) throw new Error('a cave needs at least one chamber');
	const wall = options.wall ?? 0;
	const floor = options.floor ?? 1;
	const kinds = options.kinds ?? [];
	const level = new Level(width, height, [...DUNGEON_KINDS, ...kinds], wall);
	const at = (x: number, y: number): number => y * width + x;
	const inner = (x: number, y: number): boolean => level.insideWithBorder(x, y);
	const open = new Uint8Array(width * height);
	const carve = (x: number, y: number): void => {
		if (inner(x, y)) open[at(x, y)] = 1;
	};

	Random.push(options.seed);
	try {
		const centres = new Map<string, { x: number; y: number }>();
		const cellsById = new Map<string, Array<{ x: number; y: number }>>();
		for (const chamber of options.chambers) {
			if (chamber.size < 1) throw new Error(`cave chamber ${chamber.id} needs at least one cell`);
			const cx = Random.range(Math.max(1, chamber.xRange[0]), Math.min(width - 2, chamber.xRange[1]));
			const cy = Random.range(Math.max(1, chamber.yRange[0]), Math.min(height - 2, chamber.yRange[1]));
			centres.set(chamber.id, { x: cx, y: cy });

			// random growth: absorb frontier cells until `size` are carved; `jagged` is the
			// chance a step picks any frontier cell instead of the one nearest the centre
			const cells = [{ x: cx, y: cy }];
			const seen = new Set<number>([at(cx, cy)]);
			const frontier: Array<[number, number]> = [];
			const push = (x: number, y: number): void => {
				for (const [nx, ny] of neighbours(x, y)) {
					if (!inner(nx, ny) || seen.has(at(nx, ny))) continue;
					seen.add(at(nx, ny));
					frontier.push([nx, ny]);
				}
			};
			push(cx, cy);
			while (cells.length < chamber.size && frontier.length) {
				let pick = 0;
				if (Random.int(100) < (chamber.jagged ?? 0)) {
					pick = Random.int(frontier.length);
				} else {
					let best = Infinity;
					for (let index = 0; index < frontier.length; index++) {
						const distance = Math.abs(frontier[index][0] - cx) + Math.abs(frontier[index][1] - cy);
						if (distance < best) {
							best = distance;
							pick = index;
						}
					}
				}
				const [nx, ny] = frontier.splice(pick, 1)[0];
				cells.push({ x: nx, y: ny });
				push(nx, ny);
			}
			for (const cell of cells) carve(cell.x, cell.y);
			cellsById.set(chamber.id, cells);
		}

		// a passage is a biased random walk from one chamber centre to another
		const walk = (
			from: { x: number; y: number },
			to: { x: number; y: number },
			widthHexes: number,
			windiness: number,
		): void => {
			let x = from.x;
			let y = from.y;
			for (let step = 0; step < width * height && (x !== to.x || y !== to.y); step++) {
				carve(x, y);
				if (widthHexes > 1) for (const [nx, ny] of neighbours(x, y).slice(0, widthHexes - 1)) carve(nx, ny);
				const steps = neighbours(x, y).filter(([nx, ny]) => inner(nx, ny));
				let next = steps[0];
				if (Random.int(100) < windiness) {
					next = steps[Random.int(steps.length)];
				} else {
					let best = Infinity;
					for (const option of steps) {
						const distance = (option[0] - to.x) ** 2 + (option[1] - to.y) ** 2;
						if (distance < best) {
							best = distance;
							next = option;
						}
					}
				}
				[x, y] = next;
			}
			carve(to.x, to.y);
		};
		for (const chamber of options.chambers) {
			for (const passage of chamber.passages) {
				const from = centres.get(chamber.id);
				const to = centres.get(passage.to);
				if (!from || !to) throw new Error(`cave passage ${chamber.id} -> ${passage.to} names no chamber`);
				if (Random.int(100) >= (passage.chance ?? 100)) continue;
				walk(from, to, Math.max(1, passage.width ?? 1), passage.windiness ?? 0);
			}
		}

		// everything the game named must be walkable, whatever the rolls did
		const mustBeClear = options.mustBeClear ?? [];
		for (const point of mustBeClear) {
			carve(point.x, point.y);
			for (const [nx, ny] of neighbours(point.x, point.y)) carve(nx, ny);
		}

		// force-join every chamber centre and mustBeClear cell to the first chamber, so the
		// cave is always connected even where `chance` left a passage out
		const first = centres.get(options.chambers[0].id);
		if (first) {
			const reachable = (): Set<number> => {
				const found = new Set<number>([at(first.x, first.y)]);
				const queue: Array<[number, number]> = [[first.x, first.y]];
				while (queue.length) {
					const [x, y] = queue.pop()!;
					for (const [nx, ny] of neighbours(x, y)) {
						if (!inner(nx, ny) || !open[at(nx, ny)] || found.has(at(nx, ny))) continue;
						found.add(at(nx, ny));
						queue.push([nx, ny]);
					}
				}
				return found;
			};
			for (const target of [...centres.values(), ...mustBeClear]) {
				if (!inner(target.x, target.y) || reachable().has(at(target.x, target.y))) continue;
				walk(target, first, 1, 15);
			}
		}

		const reserved = new Set<number>();
		const starts: Array<{ side: string; x: number; y: number }> = [];
		for (const start of options.starts ?? []) {
			const centre = centres.get(start.chamber);
			if (!centre) throw new Error(`cave start ${start.side} names no chamber`);
			carve(centre.x, centre.y);
			reserved.add(at(centre.x, centre.y));
			if (start.ring)
				for (const [nx, ny] of neighbours(centre.x, centre.y)) {
					if (!inner(nx, ny)) continue;
					carve(nx, ny);
					reserved.add(at(nx, ny));
				}
			starts.push({ side: start.side, x: centre.x, y: centre.y });
		}

		const villages: Array<{ x: number; y: number }> = [];
		const density = options.villageDensity ?? 0;
		if (density > 0) {
			const candidates: number[] = [];
			for (let index = 0; index < open.length; index++)
				if (open[index] && !reserved.has(index)) candidates.push(index);
			const wanted = Math.floor((candidates.length * density) / 1000);
			for (let placed = 0; placed < wanted && candidates.length; placed++) {
				const pick = Random.int(candidates.length);
				const index = candidates.splice(pick, 1)[0];
				villages.push({ x: index % width, y: Math.floor(index / width) });
			}
		}

		for (let index = 0; index < open.length; index++)
			if (open[index]) level.set(index % width, Math.floor(index / width), floor);
		return {
			level,
			chambers: [...cellsById.entries()].map(([id, cells]) => ({ id, centre: centres.get(id)!, cells })),
			starts,
			villages,
		};
	} finally {
		Random.pop();
	}
}
