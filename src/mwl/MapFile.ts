import { parseTerrain } from './runtime.ts';

/**
 * A loaded `.map`: the header keys the file declared, the grid `parseTerrain` already produces,
 * and the same start markers an inline `[map] terrain=` string carries.
 */
export interface MwlMapFile {
	/** the `key=value` lines before the grid, in the order written (`border_size`, `usage`, ...) */
	readonly header: Readonly<Record<string, string>>;
	readonly width: number;
	readonly height: number;
	/** row-major terrain codes, `width * height` of them */
	readonly codes: string[];
	/** side number -> the hexes its `[side] start` came from, when the grid marks them */
	readonly starts: Record<number, { x: number; y: number }[]>;
}

const HEADER_LINE = /^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/;

/**
 * Reads a Wesnoth-shaped `.map` file: `key=value` header lines (`border_size=1`, `usage=map`,
 * and anything else the file carries), then one comma-separated row of terrain codes per line.
 * The header is split off and kept, and the grid goes through the same `parseTerrain` an inline
 * `[map] terrain=` string does, so a cell is `base^overlay` exactly as it is there and a
 * `<side> <code>` token still marks that side's start.
 *
 * A file with no header is a bare grid, and the header keys are not interpreted here: what
 * `usage` or `border_size` means to a game is the game's business, the same way this framework
 * leaves `[terrain_graphics]` rules to content.
 *
 * @example
 * ```ts
 * import { parseMapFile } from '@datamoc/mw_games/mwl';
 *
 * const map = parseMapFile('border_size=1\nusage=map\n\nGg, Gg, Gg\nGg, Gg^Vh, Gg\n');
 * map.header.usage; // 'map'
 * map.width; // 3
 * map.height; // 2
 * map.codes; // ['Gg', 'Gg', 'Gg', 'Gg', 'Gg^Vh', 'Gg'] - overlays kept as written
 * ```
 */
export function parseMapFile(text: string): MwlMapFile {
	const lines = text.split(/\r?\n/);

	const header: Record<string, string> = {};
	let index = 0;
	for (; index < lines.length; index++) {
		const line = lines[index];
		if (line.trim() === '') continue;
		const match = HEADER_LINE.exec(line);
		if (!match) break;
		header[match[1]] = match[2];
	}

	//a trailing separator or stray spaces would otherwise become an empty cell
	const grid = lines.slice(index).map((line) => line.replace(/[,\s]+$/, ''));
	const parsed = parseTerrain(grid.join('\n'));
	return { header, ...parsed };
}
