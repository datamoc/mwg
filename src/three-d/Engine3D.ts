import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';

export interface Engine3DOptions {
	canvas: HTMLCanvasElement;
	antialias?: boolean;
	clearColor?: readonly [number, number, number, number?];
}

export type Frame3D = (deltaSeconds: number) => void;

/** Owns Babylon's WebGL engine, scene, default camera, lighting, and render loop. */
export class Engine3D {
	readonly engine: Engine;
	readonly scene: Scene;
	readonly camera: ArcRotateCamera;
	private frame: Frame3D | null = null;
	private readonly resize = (): void => this.engine.resize();

	constructor(options: Engine3DOptions) {
		this.engine = new Engine(options.canvas, options.antialias ?? true);
		this.scene = new Scene(this.engine);
		const color = options.clearColor ?? [0.04, 0.06, 0.09, 1];
		this.scene.clearColor = new Color4(color[0], color[1], color[2], color[3] ?? 1);
		this.camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 3, 18, Vector3.Zero(), this.scene);
		this.camera.lowerRadiusLimit = 3;
		this.camera.upperRadiusLimit = 80;
		this.camera.attachControl(options.canvas, true);
		new HemisphericLight('ambient', new Vector3(0.3, 1, 0.2), this.scene).intensity = 0.9;
		addEventListener('resize', this.resize);
		(globalThis as unknown as Record<string, unknown>).__MWG_3D__ = this;
	}

	start(frame?: Frame3D): void {
		this.frame = frame ?? null;
		this.engine.runRenderLoop(() => this.step(this.engine.getDeltaTime() / 1000));
	}

	step(deltaSeconds: number): void {
		this.frame?.(deltaSeconds);
		this.scene.render();
	}

	stop(): void {
		this.engine.stopRenderLoop();
	}

	dispose(): void {
		this.stop();
		removeEventListener('resize', this.resize);
		this.scene.dispose();
		this.engine.dispose();
		const globals = globalThis as unknown as Record<string, unknown>;
		if (globals.__MWG_3D__ === this) delete globals.__MWG_3D__;
	}
}
