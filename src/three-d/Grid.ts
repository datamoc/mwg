/** `square` cells, or flat-top `hex` cells in odd-q offset coordinates. */
export type GridShape3D = 'square' | 'hex';

/**
 * One floor cell: integer grid coordinates and an optional `height` in levels (default 0, negative sinks), scaled by `heightStep`.
 */
export interface GridCell3D {
	x: number;
	y: number;
	height?: number;
}

/** A world-space position; `y` is up. */
export interface Point3D {
	x: number;
	y: number;
	z: number;
}

/** Converts the framework's integer square or odd-q hex coordinate to 3D world space. */
export function gridPoint3D(
	shape: GridShape3D,
	x: number,
	y: number,
	tileSize = 1,
	height = 0,
	heightStep = 1,
): Point3D {
	if (!(tileSize > 0) || !(heightStep > 0)) throw new Error('3D grid sizes must be positive');
	if (shape === 'square') return { x: x * tileSize, y: height * heightStep, z: y * tileSize };
	return {
		x: x * tileSize * 1.5,
		y: height * heightStep,
		z: (y + (x & 1) * 0.5) * Math.sqrt(3) * tileSize,
	};
}
