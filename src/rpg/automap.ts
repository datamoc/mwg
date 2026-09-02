import { EMPTY, type TileMap } from '../render/TileMap.ts';
import { int } from '../core/Random.ts';

/**
 * One automapping rule: a 2D pattern to find, and what to write where it matches.
 *
 * This is Tiled's automapping, minus the editor: `input_*` layers are arbitrary
 * 2D patterns (not just one cell's 8 neighbours, unlike blob autotiling) matched
 * anywhere against the map, and the paired `output_*` layers replace what matched.
 * `EMPTY` is the wildcard on the way in (an empty input tile constrains nothing)
 * and a no-op on the way out (an empty output tile leaves the cell alone).
 */
export interface AutomapRule {
	/** only used to name the rule in errors */
	name?: string;
	/** the pattern size, in cells; every input and output grid must hold exactly this many */
	width: number;
	height: number;
	/** layer name to pattern cells, row-major - all have to match at an origin for the rule to fire */
	input: Record<string, ArrayLike<number>>;
	/**
	 * Possible replacements, each a layer name to replacement cells. One variant is
	 * picked per match, so several numbered outputs are random variation and one is
	 * a plain deterministic write.
	 */
	outputs: Array<Record<string, ArrayLike<number>>>;
}

export interface AutomapOptions {
	/** picks the winning variant per match; defaults to the shared seeded generator */
	pick?: (variants: number) => number;
}

/**
 * Applies automapping rules to a `TileMap`, in order.
 *
 * Rules read the live map but each rule collects all of its matches before writing
 * any of them: a later rule sees - and can override - what an earlier one wrote,
 * while a rule never trips over its own writes. Patterns must fit entirely; origins
 * where they would hang past the map edge are skipped. Returns how many times rules
 * matched (origins times rules), for tests and debug overlays.
 */
export function automap(map: TileMap, rules: readonly AutomapRule[], options: AutomapOptions = {}): number {
	const pick = options.pick ?? int;
	let matches = 0;

	rules.forEach((rule, index) => {
		const label = rule.name ?? `#${index + 1}`;
		checkRule(rule, label);
		const origins = findMatches(map, rule);
		matches += origins.length;
		if (origins.length === 0) return;
		for (const [ox, oy] of origins) {
			const output = rule.outputs[pick(rule.outputs.length)];
			for (const [layer, cells] of Object.entries(output)) {
				for (let dy = 0; dy < rule.height; dy++) {
					for (let dx = 0; dx < rule.width; dx++) {
						const value = cells[dy * rule.width + dx];
						if (value !== EMPTY) map.setTile(layer, ox + dx, oy + dy, value);
					}
				}
			}
		}
	});

	return matches;
}

function checkRule(rule: AutomapRule, label: string): void {
	if (!Number.isInteger(rule.width) || rule.width <= 0 || !Number.isInteger(rule.height) || rule.height <= 0) {
		throw new Error(`automap rule "${label}" needs a positive width and height`);
	}
	if (rule.outputs.length === 0) {
		throw new Error(`automap rule "${label}" has no outputs - a rule that matches and writes nothing is a mistake`);
	}
	const size = rule.width * rule.height;
	for (const [layer, cells] of Object.entries(rule.input)) {
		if (cells.length !== size) {
			throw new Error(
				`automap rule "${label}" input "${layer}" has ${cells.length} cells, but the pattern is ${size}`
			);
		}
	}
	rule.outputs.forEach((output, i) => {
		for (const [layer, cells] of Object.entries(output)) {
			if (cells.length !== size) {
				throw new Error(
					`automap rule "${label}" output ${i + 1} "${layer}" has ${cells.length} cells, but the pattern is ${size}`
				);
			}
		}
	});
}

/** every origin where the whole pattern fits and every constrained cell agrees */
function findMatches(map: TileMap, rule: AutomapRule): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (let oy = 0; oy + rule.height <= map.heightInTiles; oy++) {
		for (let ox = 0; ox + rule.width <= map.widthInTiles; ox++) {
			if (matchesAt(map, rule, ox, oy)) out.push([ox, oy]);
		}
	}
	return out;
}

function matchesAt(map: TileMap, rule: AutomapRule, ox: number, oy: number): boolean {
	for (const [layer, cells] of Object.entries(rule.input)) {
		for (let dy = 0; dy < rule.height; dy++) {
			for (let dx = 0; dx < rule.width; dx++) {
				const want = cells[dy * rule.width + dx];
				if (want !== EMPTY && map.getTile(layer, ox + dx, oy + dy) !== want) return false;
			}
		}
	}
	return true;
}
