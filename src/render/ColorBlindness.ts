import { ColorMatrixFilter } from 'pixi.js';
import type { ColorMatrix } from 'pixi.js';

export type ColorBlindnessType = 'protanopia' | 'deuteranopia' | 'tritanopia';

//Brettel/Viénot-derived simulation matrices, the same values widely used by colourblindness
//simulators - a 5x4 (20-value) row-major RGBA matrix, Pixi's own `ColorMatrixFilter` format.
//Exported so the matrix data itself can be tested without constructing a `ColorMatrixFilter`,
//which (like `BitmapText`) needs a real WebGL context even to construct.
export const COLOR_BLINDNESS_MATRICES: Record<ColorBlindnessType, ColorMatrix> = {
	protanopia: [
		0.567, 0.433, 0, 0, 0,
		0.558, 0.442, 0, 0, 0,
		0, 0.242, 0.758, 0, 0,
		0, 0, 0, 1, 0,
	],
	deuteranopia: [
		0.625, 0.375, 0, 0, 0,
		0.7, 0.3, 0, 0, 0,
		0, 0.3, 0.7, 0, 0,
		0, 0, 0, 1, 0,
	],
	tritanopia: [
		0.95, 0.05, 0, 0, 0,
		0, 0.433, 0.567, 0, 0,
		0, 0.475, 0.525, 0, 0,
		0, 0, 0, 1, 0,
	],
};

/**
 * A whole-scene filter simulating one of the three common types of colour vision deficiency.
 * Assign the result to a container's `.filters` (typically a game's whole stage), the same
 * way any Pixi filter is applied - nothing here is `mwg`-specific beyond the named matrices.
 *
 * This simulates, showing a sighted developer what a colourblind player sees - the standard
 * first step toward choosing a palette that reads clearly for them. It does not correct an
 * existing palette automatically; that would need the source colours' own intent (which one
 * is the "danger" colour, say), not just their RGB values.
 */
export function createColorBlindnessFilter(type: ColorBlindnessType): ColorMatrixFilter {
	const filter = new ColorMatrixFilter();
	filter.matrix = COLOR_BLINDNESS_MATRICES[type];
	return filter;
}
