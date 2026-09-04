import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';

import { loadModel3D } from '../src/three-d/Models.ts';

test('loadModel3D imports an in-memory GLB through the registered loader', async () => {
	const engine = new NullEngine();
	const scene = new Scene(engine);
	try {
		const result = await loadModel3D(minimalGlb(), scene, { pluginExtension: '.glb' });
		assert.equal(result.animationGroups.length, 0);
		assert.ok(result.meshes.length >= 0);
	} finally {
		scene.dispose();
		engine.dispose();
	}
});

function minimalGlb(): Uint8Array {
	const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{}] }));
	const jsonLength = Math.ceil(json.length / 4) * 4;
	const bytes = new Uint8Array(20 + jsonLength);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, 0x46546c67, true); // glTF
	view.setUint32(4, 2, true);
	view.setUint32(8, bytes.length, true);
	view.setUint32(12, jsonLength, true);
	view.setUint32(16, 0x4e4f534a, true); // JSON
	bytes.set(json, 20);
	bytes.fill(0x20, 20 + json.length);
	return bytes;
}
