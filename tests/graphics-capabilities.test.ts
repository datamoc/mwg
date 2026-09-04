import assert from 'node:assert/strict';
import { test } from 'node:test';

import { inspectGraphicsCapabilities, detectWebGpu, RENDERING_DECISIONS } from '../src/render/Capabilities.ts';

test('inspectGraphicsCapabilities reports available graphics APIs', () => {
	const capabilities = inspectGraphicsCapabilities({
		createCanvas: () => ({ getContext: (kind) => kind === 'webgl2' ? {} : null }),
		webgpu: true,
	});

	//wgsl is never assumed from webgpu alone - a browser can expose WebGPU behind a still
	//broken or disabled implementation - so it stays false unless a caller supplies a real,
	//actually-compiled result via probe.wgsl (see detectWebGpu)
	assert.deepEqual(capabilities, { webgl1: true, webgl2: true, webgpu: true, wgsl: false });
});

test('inspectGraphicsCapabilities takes wgsl only from a caller-supplied, real result', () => {
	const capabilities = inspectGraphicsCapabilities({
		createCanvas: () => ({ getContext: (kind) => kind === 'webgl2' ? {} : null }),
		webgpu: true,
		wgsl: true,
	});
	assert.equal(capabilities.wgsl, true);
});

test('inspectGraphicsCapabilities remains safe without a browser renderer', () => {
	const capabilities = inspectGraphicsCapabilities({ createCanvas: () => null, webgpu: false });
	assert.deepEqual(capabilities, { webgl1: false, webgl2: false, webgpu: false, wgsl: false });
});

test('detectWebGpu resolves both flags false when navigator.gpu does not exist', async () => {
	assert.deepEqual(await detectWebGpu(), { webgpu: false, wgsl: false });
});

test('rendering decisions cover both 2D and 3D workloads', () => {
	assert.deepEqual(RENDERING_DECISIONS.map(({ workload }) => workload), [
		'sprites', 'ui', 'custom-shaders', 'particles', 'instanced-terrain', 'voxels', 'animated-models', 'large-3d-worlds',
	]);
});
