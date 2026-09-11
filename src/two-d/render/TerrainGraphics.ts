import { Generator } from '../../core/Random.ts';

/**
 * One condition a rule tests against a neighbouring cell (or its own cell, at `dx=0, dy=0`):
 * which flags that cell must carry, must not carry, or carry at least one of. `dx`/`dy` are in
 * whatever unit the caller's grid uses - a square or isometric grid's own cell steps, or an
 * axial hex offset for `hexRotate` - `resolveTerrainGraphics` never interprets them itself.
 */
export interface TerrainCondition {
	readonly dx: number;
	readonly dy: number;
	readonly hasAll?: readonly string[];
	readonly hasAny?: readonly string[];
	readonly hasNone?: readonly string[];
}

/** One image a matched rule places, at an offset from the rule's own anchor cell. */
export interface TerrainImage {
	readonly image: string;
	/** offset from the anchor cell, in the same pixel/cell unit the caller draws with */
	readonly dx?: number;
	readonly dy?: number;
	/** draw order among a rule's own images and other rules matching the same cell; higher draws later (on top) */
	readonly layer?: number;
}

/**
 * One `[terrain_graphics]`-style transition rule: a set of neighbour conditions that must all
 * hold, and the image or images to draw when they do. A rule with more conditions is more
 * specific and wins over a less specific one covering the same cell, the same precedence a
 * hand-authored rule set expects (a "this exact corner" rule beats a "any edge" rule); among
 * rules tied on specificity, `probability` weights which one is picked, so a terrain can vary
 * its look without every variant needing a different neighbourhood to key off of.
 */
export interface TerrainRule {
	readonly id: string;
	readonly conditions: readonly TerrainCondition[];
	readonly images: readonly TerrainImage[];
	/** relative weight among rules tied for most-specific at a cell; default 1 */
	readonly probability?: number;
	/**
	 * how many rotated copies of this rule to also try, each one `conditions`/`images` rotated
	 * by one more step of `rotate` (see `squareRotate`/`hexRotate`) - so one rule authored for
	 * one direction covers every direction a symmetric transition needs, instead of one rule
	 * per direction written out by hand. 0 or omitted tries only the rule as written.
	 */
	readonly rotations?: number;
}

/** One resolved image placement: an absolute cell plus the rule's own image and offset. */
export interface TerrainPlacement {
	readonly x: number;
	readonly y: number;
	readonly ruleId: string;
	readonly image: string;
	readonly dx: number;
	readonly dy: number;
	readonly layer: number;
}

/** The flags present at a cell, or `undefined` for a cell with no terrain at all (e.g. off the map). */
export type TerrainFlagsAt = (x: number, y: number) => ReadonlySet<string> | undefined;

/** Rotates one condition/image offset by `rotationIndex` of `rotations` total steps around the cell. */
export type TerrainRotate = (dx: number, dy: number, rotationIndex: number, rotations: number) => { dx: number; dy: number };

/**
 * `TerrainRotate` for a square or isometric grid: exact 90-degree steps only (`rotations` must
 * be a multiple of 4, or 0).
 *
 * @example
 * ```ts
 * import { squareRotate } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(squareRotate(1, 0, 1, 4)); // { dx: 0, dy: 1 } - one 90-degree step
 * ```
 */
export function squareRotate(dx: number, dy: number, rotationIndex: number, rotations: number): { dx: number; dy: number } {
	const steps = (rotationIndex * 4) / rotations;
	let x = dx;
	let y = dy;
	for (let i = 0; i < steps; i += 1) [x, y] = [-y, x];
	return { dx: x || 0, dy: y || 0 };
}

/**
 * `TerrainRotate` for an axial hex grid: exact 60-degree steps (`rotations` must be a multiple
 * of 6, or 0), via the standard cube-coordinate rotation (`q,r,s -> -r,-s,-q` per 60-degree step,
 * `s = -q - r`).
 *
 * @example
 * ```ts
 * import { hexRotate } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(hexRotate(1, 0, 1, 6)); // one 60-degree step of the axial offset (1, 0)
 * ```
 */
export function hexRotate(dx: number, dy: number, rotationIndex: number, rotations: number): { dx: number; dy: number } {
	const steps = (rotationIndex * 6) / rotations;
	let q = dx;
	let r = dy;
	for (let i = 0; i < steps; i += 1) {
		const s = -q - r;
		[q, r] = [-r, -s];
	}
	return { dx: q || 0, dy: r || 0 };
}

function conditionMatches(condition: TerrainCondition, flags: ReadonlySet<string> | undefined): boolean {
	const present = flags ?? new Set<string>();
	if (condition.hasAll && !condition.hasAll.every((flag) => present.has(flag))) return false;
	if (condition.hasAny && !condition.hasAny.some((flag) => present.has(flag))) return false;
	if (condition.hasNone && condition.hasNone.some((flag) => present.has(flag))) return false;
	return true;
}

/**
 * Whether `rule`, rotated by `rotationIndex` of `rotations` steps, matches the cell at `x, y`.
 *
 * @example
 * ```ts
 * import { matchTerrainRule } from '@datamoc/mw_games/two-d/render';
 *
 * const rule = { id: 'coast', conditions: [{ dx: 1, dy: 0, hasAll: ['water'] }], images: [] };
 * const flagsAt = (x: number, y: number) => (x === 1 && y === 0 ? new Set(['water']) : new Set(['land']));
 * console.log(matchTerrainRule(rule, 0, 0, flagsAt)); // true
 * ```
 */
export function matchTerrainRule(
	rule: TerrainRule,
	x: number,
	y: number,
	flagsAt: TerrainFlagsAt,
	rotate: TerrainRotate = squareRotate,
	rotationIndex = 0,
): boolean {
	const rotations = rule.rotations ?? 0;
	return rule.conditions.every((condition) => {
		const offset = rotations > 0 ? rotate(condition.dx, condition.dy, rotationIndex, rotations) : condition;
		return conditionMatches(condition, flagsAt(x + offset.dx, y + offset.dy));
	});
}

export interface ResolveTerrainGraphicsOptions {
	rotate?: TerrainRotate;
	/** deterministic when given a seeded `Generator`; a fresh unseeded one otherwise */
	random?: Generator;
}

/**
 * Resolves a `[terrain_graphics]`-style rule set over a grid into the flat list of image
 * placements a renderer draws, the generalisation `Autotile`'s 47-shape blob table cannot
 * express: a rule can test flags rather than only "same terrain", key off any offset rather
 * than only the 8 immediate neighbours, place more than one image (so a piece bigger than one
 * cell, overlapping its neighbours, is one rule's `images` rather than something `TileMap`'s
 * one-sprite-per-cell grid has to hold), and vary by rotation or probability.
 *
 * At each cell, every rule (at every rotation it declares) is tested; among the rules that
 * match, the most specific (most conditions) wins, and `probability` breaks a tie among rules
 * of equal specificity. A cell with no matching rule contributes nothing. The result is plain
 * data - which cell, which rule, which image, at what offset and layer - a caller draws
 * through `TileMap`, a custom `Sprite` pass, or anything else; this function never touches a
 * renderer itself.
 *
 * @example
 * ```ts
 * import { resolveTerrainGraphics } from '@datamoc/mw_games/two-d/render';
 *
 * const water = new Set(['water']);
 * const land = new Set(['land']);
 * const flagsAt = (x: number, y: number) => (x === 0 ? water : land);
 *
 * const placements = resolveTerrainGraphics(2, 1, [
 * 	{ id: 'coast', conditions: [{ dx: 0, dy: 0, hasAll: ['land'] }, { dx: -1, dy: 0, hasAll: ['water'] }], images: [{ image: 'coast.png' }] },
 * ], flagsAt);
 * console.log(placements); // [{ x: 1, y: 0, ruleId: 'coast', image: 'coast.png', dx: 0, dy: 0, layer: 0 }]
 * ```
 */
export function resolveTerrainGraphics(
	width: number,
	height: number,
	rules: readonly TerrainRule[],
	flagsAt: TerrainFlagsAt,
	options: ResolveTerrainGraphicsOptions = {},
): TerrainPlacement[] {
	const rotate = options.rotate ?? squareRotate;
	const random = options.random ?? new Generator();
	const placements: TerrainPlacement[] = [];

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			let bestSpecificity = -1;
			let candidates: { rule: TerrainRule; rotationIndex: number }[] = [];

			for (const rule of rules) {
				const rotations = rule.rotations ?? 0;
				const steps = rotations > 0 ? rotations : 1;
				for (let rotationIndex = 0; rotationIndex < steps; rotationIndex += 1) {
					if (!matchTerrainRule(rule, x, y, flagsAt, rotate, rotationIndex)) continue;
					const specificity = rule.conditions.length;
					if (specificity > bestSpecificity) {
						bestSpecificity = specificity;
						candidates = [{ rule, rotationIndex }];
					} else if (specificity === bestSpecificity) {
						candidates.push({ rule, rotationIndex });
					}
				}
			}

			if (candidates.length === 0) continue;
			const chosen =
				candidates.length === 1
					? candidates[0]
					: candidates[weightedIndex(candidates.map((c) => c.rule.probability ?? 1), random)];

			const rotations = chosen.rule.rotations ?? 0;
			for (const image of chosen.rule.images) {
				const offset =
					rotations > 0
						? rotate(image.dx ?? 0, image.dy ?? 0, chosen.rotationIndex, rotations)
						: { dx: image.dx ?? 0, dy: image.dy ?? 0 };
				placements.push({
					x,
					y,
					ruleId: chosen.rule.id,
					image: image.image,
					dx: offset.dx,
					dy: offset.dy,
					layer: image.layer ?? 0,
				});
			}
		}
	}

	return placements;
}

function weightedIndex(weights: readonly number[], random: Generator): number {
	const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
	if (total <= 0) return 0;
	let roll = random.float() * total;
	for (let index = 0; index < weights.length; index += 1) {
		roll -= Math.max(0, weights[index]);
		if (roll < 0) return index;
	}
	return weights.length - 1;
}
