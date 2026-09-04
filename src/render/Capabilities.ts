export type GraphicsWorkload =
	| 'sprites'
	| 'ui'
	| 'custom-shaders'
	| 'particles'
	| 'instanced-terrain'
	| 'voxels'
	| 'animated-models'
	| 'large-3d-worlds';

export interface GraphicsCapabilities {
	webgl1: boolean;
	webgl2: boolean;
	webgpu: boolean;
	/** WGSL is usable only through a WebGPU-capable browser runtime. */
	wgsl: boolean;
}

export interface GraphicsProbe {
	createCanvas?(): { getContext(kind: string): unknown } | null;
	webgpu?: boolean;
}

export interface RenderingDecision {
	workload: GraphicsWorkload;
	preferred: string;
	fallback: string;
	reason: string;
}

/**
 * The framework's rendering choices by workload. This is data, not a global renderer switch:
 * each game imports only the module it uses and keeps 2D Pixi and optional 3D Babylon paths
 * independent.
 */
export const RENDERING_DECISIONS: readonly RenderingDecision[] = [
	{ workload: 'sprites', preferred: 'PixiJS WebGL/WebGPU batcher', fallback: 'PixiJS WebGL', reason: 'high-volume textured 2D batches' },
	{ workload: 'ui', preferred: 'PixiJS display tree', fallback: 'PixiJS display tree', reason: 'themeable 2D layout and text' },
	{ workload: 'custom-shaders', preferred: 'backend-specific GLSL/WGSL only when profiled', fallback: 'PixiJS filters', reason: 'avoid maintaining paired shader sources without a measured gain' },
	{ workload: 'particles', preferred: 'PixiJS for 2D, Babylon.js for 3D', fallback: 'instanced sprites/meshes', reason: 'match simulation and depth to the scene' },
	{ workload: 'instanced-terrain', preferred: 'Babylon.js thin instances', fallback: 'PixiJS TileMap for 2D', reason: 'depth-tested repeated 3D geometry' },
	{ workload: 'voxels', preferred: 'Babylon.js thin instances', fallback: 'batched meshes', reason: 'color-grouped 3D voxels' },
	{ workload: 'animated-models', preferred: 'Babylon.js glTF animation groups', fallback: 'billboard sprites', reason: 'standard 3D interchange and animation support' },
	{ workload: 'large-3d-worlds', preferred: 'Babylon.js with streaming/culling', fallback: 'partitioned scenes', reason: 'scene graph, depth, and instancing' },
];

/**
 * Reports browser graphics APIs without creating a renderer or selecting a fallback.
 * Pass a probe in tests or host integrations; omitting it reads the current browser safely.
 */
export function inspectGraphicsCapabilities(probe: GraphicsProbe = {}): GraphicsCapabilities {
	const canvas = probe.createCanvas?.() ?? (typeof document === 'undefined' ? null : document.createElement('canvas'));
	const webgl2 = Boolean(canvas?.getContext('webgl2'));
	const webgl1 = webgl2 || Boolean(canvas?.getContext('webgl') ?? canvas?.getContext('experimental-webgl'));
	const webgpu = probe.webgpu ?? Boolean((globalThis.navigator as Navigator & { gpu?: unknown } | undefined)?.gpu);
	return { webgl1, webgl2, webgpu, wgsl: webgpu };
}
