import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.pure.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';

export interface VoxSize { x: number; y: number; z: number; }
export interface Voxel { x: number; y: number; z: number; color: number; }
export interface VoxModel { size: VoxSize; voxels: readonly Voxel[]; palette: Uint32Array; }

/** Reads one MagicaVoxel VOX model, including an optional RGBA palette chunk. */
export function parseVox(data: ArrayBuffer | ArrayBufferView): VoxModel {
	const bytes = data instanceof ArrayBuffer
		? new Uint8Array(data)
		: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	if (bytes.length < 20 || text(bytes, 0) !== 'VOX ') throw new Error('invalid VOX header');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = 8;
	let size: VoxSize | null = null;
	let voxels: Voxel[] | null = null;
	const palette = defaultPalette();

	while (offset + 12 <= bytes.length) {
		const id = text(bytes, offset);
		const contentSize = view.getUint32(offset + 4, true);
		const childrenSize = view.getUint32(offset + 8, true);
		const content = offset + 12;
		const end = content + contentSize;
		if (end + childrenSize > bytes.length) throw new Error(`truncated VOX ${id} chunk`);
		if (id === 'SIZE') {
			if (contentSize < 12) throw new Error('invalid VOX SIZE chunk');
			size = { x: view.getUint32(content, true), y: view.getUint32(content + 4, true), z: view.getUint32(content + 8, true) };
		} else if (id === 'XYZI') {
			const count = view.getUint32(content, true);
			if (contentSize < 4 + count * 4) throw new Error('invalid VOX XYZI chunk');
			voxels = Array.from({ length: count }, (_, index) => {
				const at = content + 4 + index * 4;
				return { x: bytes[at], y: bytes[at + 1], z: bytes[at + 2], color: bytes[at + 3] };
			});
		} else if (id === 'RGBA') {
			if (contentSize < 1024) throw new Error('invalid VOX RGBA chunk');
			for (let index = 0; index < 256; index++) palette[index] = view.getUint32(content + index * 4, true);
		}
		offset = end;
	}
	if (!size || !voxels) throw new Error('VOX file needs SIZE and XYZI chunks');
	return { size, voxels, palette };
}

/** Turns parsed voxels into color-batched Babylon thin instances under one transform node. */
export function createVoxModel3D(scene: Scene, model: VoxModel, voxelSize = 1): TransformNode {
	if (!(voxelSize > 0)) throw new Error('voxel size must be positive');
	const root = new TransformNode('vox-model', scene);
	const groups = new Map<number, Voxel[]>();
	for (const voxel of model.voxels) {
		const group = groups.get(voxel.color) ?? [];
		group.push(voxel);
		groups.set(voxel.color, group);
	}
	for (const [color, voxels] of groups) {
		const box = CreateBox(`voxels-${color}`, { size: voxelSize }, scene);
		box.parent = root;
		const rgba = model.palette[Math.max(0, color - 1)];
		const material = new StandardMaterial(`voxel-${color}`, scene);
		material.diffuseColor = new Color3((rgba & 0xff) / 255, ((rgba >> 8) & 0xff) / 255, ((rgba >> 16) & 0xff) / 255);
		material.alpha = ((rgba >>> 24) & 0xff) / 255;
		box.material = material;
		const matrices = new Float32Array(voxels.length * 16);
		for (let index = 0; index < voxels.length; index++) {
			const voxel = voxels[index];
			Matrix.Translation(voxel.x * voxelSize, voxel.z * voxelSize, voxel.y * voxelSize)
				.copyToArray(matrices, index * 16);
		}
		box.thinInstanceSetBuffer('matrix', matrices, 16, true);
	}
	return root;
}

function text(bytes: Uint8Array, offset: number): string {
	return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function defaultPalette(): Uint32Array {
	const palette = new Uint32Array(256);
	for (let index = 0; index < 256; index++) {
		const shade = index & 0xff;
		palette[index] = shade | (shade << 8) | (shade << 16) | 0xff000000;
	}
	return palette;
}
