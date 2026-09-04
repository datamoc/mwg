import assert from 'node:assert/strict';
import { test } from 'node:test';

import { inspectGraphicsCapabilities, RENDERING_DECISIONS } from '../src/render/Capabilities.ts';

test('inspectGraphicsCapabilities reports available graphics APIs', () => {
	const capabilities = inspectGraphicsCapabilities({
		createCanvas: () => ({ getContext: (kind) => kind === 'webgl2' ? {} : null }),
		webgpu: true,
	});

	assert.deepEqual(capabilities, { webgl1: true, webgl2: true, webgpu: true, wgsl: true });
});

test('inspectGraphicsCapabilities remains safe without a browser renderer', () => {
	const capabilities = inspectGraphicsCapabilities({ createCanvas: () => null, webgpu: false });
	assert.deepEqual(capabilities, { webgl1: false, webgl2: false, webgpu: false, wgsl: false });
});

test('rendering decisions cover both 2D and 3D workloads', () => {
	assert.deepEqual(RENDERING_DECISIONS.map(({ workload }) => workload), [
		'sprites', 'ui', 'custom-shaders', 'particles', 'instanced-terrain', 'voxels', 'animated-models', 'large-3d-worlds',
	]);
});
