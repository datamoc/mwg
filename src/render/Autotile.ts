import { EMPTY } from './TileMap.ts';

/** which of a cell's 8 neighbours belong to the same terrain, for autotiling one cell */
export interface NeighborMask {
	n: boolean;
	e: boolean;
	s: boolean;
	w: boolean;
	ne: boolean;
	se: boolean;
	sw: boolean;
	nw: boolean;
}

/**
 * Stitching a terrain edge or corner from many small tile pieces, chosen by which neighbours
 * are the same terrain, rather than a game picking a frame per cell by hand.
 *
 * A diagonal neighbour only changes a cell's shape when both orthogonal neighbours flanking
 * it also belong to the terrain - a corner piece already covers every case where one of them
 * does not, since the edge piece on that side owns the corner instead. That rule is what
 * collapses the 256 raw 8-neighbour combinations down to the 47 that are ever actually
 * reachable, and it is the whole of what "blob" autotiling is - not 256 hand-drawn tiles, 47.
 *
 * `blobIndex` and `BLOB_SHAPES` are this module's own convention, not a claim of pixel
 * compatibility with any particular existing tileset's frame order - a tileset drawn for a
 * different engine's autotile layout will need its frames reordered into this one. What is
 * guaranteed: `BLOB_SHAPES` lists all 47 shapes in the exact order `blobIndex` returns them
 * in, so a tool (or a person, reading it once) can draw or arrange frames against it directly.
 */
export const BLOB_SHAPES: readonly NeighborMask[] = buildBlobShapes();

const blobIndexByMask = new Map<number, number>(BLOB_SHAPES.map((shape, index) => [maskOf(shape), index]));

function maskOf(shape: NeighborMask): number {
	//a corner bit only ever appears here already reduced - see effectiveMask - so this is
	//also how a raw NeighborMask gets canonicalised before the lookup
	const ne = shape.ne && shape.n && shape.e;
	const se = shape.se && shape.s && shape.e;
	const sw = shape.sw && shape.s && shape.w;
	const nw = shape.nw && shape.n && shape.w;

	return (
		(shape.n ? 1 : 0) |
		(shape.e ? 2 : 0) |
		(shape.s ? 4 : 0) |
		(shape.w ? 8 : 0) |
		(ne ? 16 : 0) |
		(se ? 32 : 0) |
		(sw ? 64 : 0) |
		(nw ? 128 : 0)
	);
}

function buildBlobShapes(): NeighborMask[] {
	const seen = new Set<number>();
	const shapes: Array<{ mask: number; shape: NeighborMask }> = [];

	//every one of the 256 raw combinations reduces to one of the 47 reachable masks; walking
	//all of them and keeping the first shape seen for each mask is simpler than deriving the
	//47 directly, and this runs once at module load over a fixed, tiny search space
	for (let bits = 0; bits < 256; bits++) {
		const shape: NeighborMask = {
			n: (bits & 1) !== 0,
			e: (bits & 2) !== 0,
			s: (bits & 4) !== 0,
			w: (bits & 8) !== 0,
			ne: (bits & 16) !== 0,
			se: (bits & 32) !== 0,
			sw: (bits & 64) !== 0,
			nw: (bits & 128) !== 0,
		};

		const mask = maskOf(shape);
		if (seen.has(mask)) continue;
		seen.add(mask);

		//store the shape in its canonical form - corner bits that do not survive the
		//reduction are cleared, so BLOB_SHAPES never claims a corner matters when it does not
		shapes.push({
			mask,
			shape: {
				n: shape.n,
				e: shape.e,
				s: shape.s,
				w: shape.w,
				ne: shape.ne && shape.n && shape.e,
				se: shape.se && shape.s && shape.e,
				sw: shape.sw && shape.s && shape.w,
				nw: shape.nw && shape.n && shape.w,
			},
		});
	}

	shapes.sort((a, b) => a.mask - b.mask);
	return shapes.map((entry) => entry.shape);
}

/** the blob index (0 to 46) for one cell's 8-neighbour membership test */
export function blobIndex(neighbors: NeighborMask): number {
	return blobIndexByMask.get(maskOf(neighbors))!;
}

/**
 * One frame per cell of a terrain, autotiled from a same-terrain test alone.
 *
 * @param sameTerrain called for every cell in range, and for the 8 neighbours around each -
 * including cells outside `width`/`height`, so a caller wanting a hard map edge should have
 * it return `false` there rather than relying on this to bounds-check
 * @param frames the 47 frames a `blobIndex` of 0 to 46 selects between, drawn (or arranged)
 * against `BLOB_SHAPES`
 * @returns one frame index per cell, row-major, `EMPTY` wherever `sameTerrain` is false
 */
export function autotileFrames(
	width: number,
	height: number,
	sameTerrain: (x: number, y: number) => boolean,
	frames: readonly number[]
): Int32Array {
	if (frames.length !== BLOB_SHAPES.length) {
		throw new Error(`autotileFrames needs exactly ${BLOB_SHAPES.length} frames, got ${frames.length}`);
	}

	const out = new Int32Array(width * height);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x;
			if (!sameTerrain(x, y)) {
				out[index] = EMPTY;
				continue;
			}

			const neighbors: NeighborMask = {
				n: sameTerrain(x, y - 1),
				e: sameTerrain(x + 1, y),
				s: sameTerrain(x, y + 1),
				w: sameTerrain(x - 1, y),
				ne: sameTerrain(x + 1, y - 1),
				se: sameTerrain(x + 1, y + 1),
				sw: sameTerrain(x - 1, y + 1),
				nw: sameTerrain(x - 1, y - 1),
			};

			out[index] = frames[blobIndex(neighbors)];
		}
	}

	return out;
}
