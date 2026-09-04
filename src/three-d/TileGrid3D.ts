import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.pure.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.pure.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { gridPoint3D } from './Grid.ts';
import type { GridCell3D, GridShape3D } from './Grid.ts';

export interface TileGrid3DOptions {
	shape: GridShape3D;
	tileSize?: number;
	heightStep?: number;
	tileThickness?: number;
	tileColor?: number;
	columnColor?: number;
	origin?: readonly [number, number, number];
}

export interface TileGrid3DMeshes {
	tiles: Mesh;
	columns: Mesh | null;
	dispose(): void;
}

/** Builds an instanced square or flat-top hex floor with optional raised columns. */
export function createTileGrid3D(scene: Scene, cells: readonly GridCell3D[], options: TileGrid3DOptions): TileGrid3DMeshes {
	const tileSize = options.tileSize ?? 1;
	const heightStep = options.heightStep ?? 1;
	const thickness = options.tileThickness ?? 0.12;
	if (!(thickness > 0)) throw new Error('3D tile thickness must be positive');
	const origin = options.origin ?? [0, 0, 0];
	const tiles = options.shape === 'square'
		? CreateBox('square-tiles', { width: tileSize * 0.94, height: thickness, depth: tileSize * 0.94 }, scene)
		: CreateCylinder('hex-tiles', { diameter: tileSize * 1.9, height: thickness, tessellation: 6 }, scene);
	const tileMaterial = material(scene, 'tile-material', options.tileColor ?? 0x5f8f62);
	tiles.material = tileMaterial;
	setMatrices(tiles, cells.map((cell) => {
		const point = gridPoint3D(options.shape, cell.x, cell.y, tileSize, cell.height ?? 0, heightStep);
		return Matrix.Translation(point.x + origin[0], point.y + origin[1] - thickness / 2, point.z + origin[2]);
	}));

	const raised = cells.filter((cell) => (cell.height ?? 0) !== 0);
	let columns: Mesh | null = null;
	let columnMaterial: StandardMaterial | null = null;
	if (raised.length) {
		columns = options.shape === 'square'
			? CreateBox('square-columns', { size: 1 }, scene)
			: CreateCylinder('hex-columns', { diameter: 1.9, height: 1, tessellation: 6 }, scene);
		columnMaterial = material(scene, 'column-material', options.columnColor ?? 0x3f6048);
		columns.material = columnMaterial;
		setMatrices(columns, raised.map((cell) => {
			const levels = cell.height ?? 0;
			const point = gridPoint3D(options.shape, cell.x, cell.y, tileSize, 0, heightStep);
			const height = Math.abs(levels * heightStep);
			const centerY = origin[1] + Math.sign(levels) * height / 2;
			const horizontal = options.shape === 'square' ? tileSize * 0.94 : tileSize;
			return Matrix.Compose(
				new Vector3(horizontal, height, horizontal),
				Quaternion.Identity(),
				new Vector3(point.x + origin[0], centerY, point.z + origin[2]),
			);
		}));
	}

	return {
		tiles,
		columns,
		dispose() {
			tiles.dispose();
			columns?.dispose();
			tileMaterial.dispose();
			columnMaterial?.dispose();
		},
	};
}

function setMatrices(mesh: Mesh, matrices: readonly Matrix[]): void {
	const data = new Float32Array(matrices.length * 16);
	for (let index = 0; index < matrices.length; index++) matrices[index].copyToArray(data, index * 16);
	mesh.thinInstanceSetBuffer('matrix', data, 16, true);
}

function material(scene: Scene, name: string, color: number): StandardMaterial {
	const value = new StandardMaterial(name, scene);
	value.diffuseColor = new Color3(((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255);
	return value;
}
