import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';

import { loadModelContainer3D, isModelContainerLoaded, releaseModelContainer } from '../src/three-d/Models.ts';

function minimalGlbDataUri(name = 'scene'): string {
	const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ name }] }));
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

	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `data:model/gltf-binary;base64,${btoa(binary)}`;
}

test('loadModelContainer3D loads a container from a data URI and can instantiate it', async () => {
	const engine = new NullEngine();
	const scene = new Scene(engine);
	const source = minimalGlbDataUri();
	try {
		const container = await loadModelContainer3D(source, scene, { pluginExtension: '.glb' });
		assert.ok(container);
		assert.doesNotThrow(() => container.instantiateModelsToScene());
	} finally {
		await releaseModelContainer(source);
		scene.dispose();
		engine.dispose();
	}
});

test('a second call for the same source returns the same cached container, not a fresh load', async () => {
	const engine = new NullEngine();
	const scene = new Scene(engine);
	const source = minimalGlbDataUri();
	try {
		const first = await loadModelContainer3D(source, scene, { pluginExtension: '.glb' });
		const second = await loadModelContainer3D(source, scene, { pluginExtension: '.glb' });
		assert.equal(first, second);
	} finally {
		await releaseModelContainer(source);
		scene.dispose();
		engine.dispose();
	}
});

test('isModelContainerLoaded reflects load and release', async () => {
	const engine = new NullEngine();
	const scene = new Scene(engine);
	const source = minimalGlbDataUri();
	try {
		assert.equal(isModelContainerLoaded(source), false);
		await loadModelContainer3D(source, scene, { pluginExtension: '.glb' });
		assert.equal(isModelContainerLoaded(source), true);
		await releaseModelContainer(source);
		assert.equal(isModelContainerLoaded(source), false);
	} finally {
		scene.dispose();
		engine.dispose();
	}
});

test('releasing a never-loaded source is a silent no-op', async () => {
	await assert.doesNotReject(releaseModelContainer('never-loaded.glb'));
});

test('two different sources cache independently', async () => {
	const engine = new NullEngine();
	const scene = new Scene(engine);
	const sourceA = minimalGlbDataUri('a');
	const sourceB = minimalGlbDataUri('b');
	try {
		const containerA = await loadModelContainer3D(sourceA, scene, { pluginExtension: '.glb' });
		const containerB = await loadModelContainer3D(sourceB, scene, { pluginExtension: '.glb' });
		assert.notEqual(containerA, containerB);
	} finally {
		await releaseModelContainer(sourceA);
		await releaseModelContainer(sourceB);
		scene.dispose();
		engine.dispose();
	}
});
