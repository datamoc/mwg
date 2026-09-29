/**
 * Groove templates: a quantized performance carried as data. Every slot of one bar says
 * how far its notes sit from the grid and how loud they are relative to usual, so a
 * template can be extracted from a performance, exchanged, and played back into another.
 *
 * The offsets are dense and ordered by construction - slot 0 through the last slot of the
 * bar - which is what lets a consumer look a note's slot up directly instead of searching,
 * and what lets an import recognise a truncated or hand-edited file by its length alone.
 * `timeSignature` and `subdivision` are part of the data rather than outside context: the
 * same offsets mean different things against a bar of 4/4 and a bar of 6/8, and a template
 * moved between the two without saying so is a silent misreading.
 */

/** how finely a bar is cut up: an eighth, sixteenth or thirty-second grid */
export type GridSubdivision = '8n' | '16n' | '32n';

export interface GrooveOffset {
	/** which slot of the bar this describes, counting from 0 */
	subdivisionIndex: number;
	/** how far the slot is played from its grid position, in ticks; negative is early */
	timeOffsetTicks: number;
	/** velocity multiplier for the slot: 1 unchanged, 1.1 a tenth louder, 0 muted */
	velocityFactor: number;
}

export interface GrooveTemplate {
	/** a stable name: the file it came from, or whatever a DAW calls it */
	name: string;
	/** numerator and denominator of the bar the slots divide up, e.g. [4, 4] */
	timeSignature: [number, number];
	/** ticks per quarter note, the same quantity `MidiFile.ticksPerQuarter` reports */
	ppq: number;
	/** the tempo the offsets were measured at; applying it elsewhere rescales them in time */
	tempoBpm: number;
	subdivision: GridSubdivision;
	/** one entry per slot of the bar, in slot order */
	offsets: GrooveOffset[];
}

/** subdivisions that fit in one quarter note: a quarter is two eighths, four sixteenths */
const SUBDIVISIONS_PER_QUARTER: Record<GridSubdivision, number> = { '8n': 2, '16n': 4, '32n': 8 };

/**
 * How many slots a bar of this signature has on this grid: the number of subdivisions
 * that fit in `beats * (4 / beatValue)` quarters. It throws when the grid does not tile
 * the bar exactly (an eighth grid against a bar of three sixteenths), because a template
 * with a fractional slot count would wrap onto a position no note can land on.
 *
 * @example
 * ```ts
 * import { subdivisionCount } from '@datamoc/mw_games/audio';
 *
 * console.log(subdivisionCount([4, 4], '16n')); // 16: a bar of 4/4 cut into sixteenths
 * console.log(subdivisionCount([6, 8], '8n')); // 6: a bar of 6/8 cut into eighths
 * ```
 */
export function subdivisionCount(timeSignature: [number, number], subdivision: GridSubdivision): number {
	const [beats, beatValue] = timeSignature;
	const slots = (beats * 4 * SUBDIVISIONS_PER_QUARTER[subdivision]) / beatValue;
	if (!Number.isInteger(slots) || slots < 1)
		throw new Error(
			`a ${subdivision} grid does not cut a ${beats}/${beatValue} bar into whole slots (it needs ${slots})`,
		);
	return slots;
}

/** ticks between two grid slots of this subdivision in a file with this ppq (480 and '16n' is 120) */
export function subdivisionTicks(pq: number, subdivision: GridSubdivision): number {
	return pq / SUBDIVISIONS_PER_QUARTER[subdivision];
}

/**
 * Checks every invariant of a `GrooveTemplate` at once, so a template read from a file or
 * handed in from outside fails here rather than as a misaligned grid several frames later.
 * The engines call it before applying a template, and the JSON import calls it before
 * returning one.
 *
 * @example
 * ```ts
 * import { assertGrooveTemplate, subdivisionCount } from '@datamoc/mw_games/audio';
 *
 * const template = {
 *   name: 'four-on-the-floor',
 *   timeSignature: [4, 4] as [number, number],
 *   ppq: 480,
 *   tempoBpm: 120,
 *   subdivision: '16n' as const,
 *   offsets: Array.from({ length: subdivisionCount([4, 4], '16n') }, (_, index) => ({
 *     subdivisionIndex: index,
 *     timeOffsetTicks: 0,
 *     velocityFactor: 1,
 *   })),
 * };
 *
 * assertGrooveTemplate(template); // throws when a slot is missing or a tick is fractional
 * ```
 */
export function assertGrooveTemplate(template: GrooveTemplate): void {
	if (typeof template !== 'object' || template === null) throw new Error('a groove template must be an object');
	const { name, timeSignature, ppq, tempoBpm, subdivision, offsets } = template;

	if (typeof name !== 'string' || name.length === 0) throw new Error('a groove template needs a non-empty name');
	if (!Array.isArray(timeSignature) || timeSignature.length !== 2)
		throw new Error(`groove template "${name}": timeSignature must be [beats, beatValue]`);
	const [beats, beatValue] = timeSignature;
	if (!Number.isInteger(beats) || beats < 1)
		throw new Error(
			`groove template "${name}": time signature numerator must be a positive integer, got ${String(beats)}`,
		);
	if (!Number.isInteger(beatValue) || beatValue < 1 || (beatValue & (beatValue - 1)) !== 0)
		throw new Error(
			`groove template "${name}": time signature denominator must be a power of two, got ${String(beatValue)}`,
		);
	if (!Number.isInteger(ppq) || ppq < 1)
		throw new Error(`groove template "${name}": ppq must be a positive integer, got ${String(ppq)}`);
	if (!Number.isFinite(tempoBpm) || tempoBpm <= 0)
		throw new Error(`groove template "${name}": tempoBpm must be greater than 0, got ${String(tempoBpm)}`);
	if (subdivision !== '8n' && subdivision !== '16n' && subdivision !== '32n')
		throw new Error(`groove template "${name}": subdivision must be 8n, 16n or 32n, got ${String(subdivision)}`);

	const tickSpan = subdivisionTicks(ppq, subdivision);
	if (!Number.isInteger(tickSpan) || tickSpan < 1)
		throw new Error(
			`groove template "${name}": ${ppq} ppq does not cut into whole ${subdivision} ticks (it needs ${String(tickSpan)})`,
		);

	const slots = subdivisionCount(timeSignature, subdivision);
	if (!Array.isArray(offsets) || offsets.length !== slots)
		throw new Error(
			`groove template "${name}": a ${subdivision} grid in ${beats}/${beatValue} has ${slots} slots, this carries ${
				Array.isArray(offsets) ? offsets.length : String(offsets)
			}`,
		);

	offsets.forEach((offset, index) => {
		if (typeof offset !== 'object' || offset === null)
			throw new Error(`groove template "${name}": slot ${index} must be an object`);
		if (offset.subdivisionIndex !== index)
			throw new Error(
				`groove template "${name}": slots must run in order, slot ${index} carries ${String(offset.subdivisionIndex)}`,
			);
		if (!Number.isInteger(offset.timeOffsetTicks))
			throw new Error(
				`groove template "${name}": slot ${index} has a fractional timeOffsetTicks (${String(offset.timeOffsetTicks)}); ticks are whole numbers`,
			);
		if (!Number.isFinite(offset.velocityFactor) || offset.velocityFactor < 0)
			throw new Error(
				`groove template "${name}": slot ${index} has velocityFactor ${String(offset.velocityFactor)}, which must be a finite number of at least 0`,
			);
	});
}
