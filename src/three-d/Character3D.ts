import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.pure.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';

import { resolve } from '../assets/index.ts';

export interface Billboard3DOptions {
	/**
	 * An asset path (resolved through `mwg/assets`) or an already-resolved `data:`/`blob:`
	 * URI. A `data:` URI must be base64-encoded (`;base64,...`) - Babylon's texture loader
	 * does not decode a percent-encoded one and fails to load it without an error.
	 */
	texture: string;
	width?: number;
	height?: number;
}

/** an asset path resolved via `mwg/assets`, or a URI passed through unchanged */
function resolveSource(source: string): string {
	return /^(?:data|blob|https?):/i.test(source) ? source : resolve(source);
}

/**
 * Moves either a billboard sprite or imported mesh through continuous 3D world space, and -
 * for an imported mesh - plays back whichever animation clips came baked into it.
 * `loadModel3D` already loads a glTF's own `animationGroups` as part of its import result;
 * this is what turns one of them into something a game can actually trigger, the way a walk
 * cycle baked into a mesh needs to be, rather than leaving them loaded but unreachable.
 */
export class Character3D {
	readonly node: TransformNode;
	private target: Vector3 | null = null;
	private speed = 0;

	private readonly animations: Map<string, AnimationGroup>;
	private currentClip: AnimationGroup | null = null;

	constructor(node: TransformNode, animations: readonly AnimationGroup[] = []) {
		this.node = node;
		this.animations = new Map(animations.map((group) => [group.name, group]));
	}

	/** true when an animation clip of this name was imported with the model */
	hasAnimation(name: string): boolean {
		return this.animations.has(name);
	}

	/**
	 * Plays an imported animation clip by name, stopping whichever one was already playing.
	 * A name the model has no clip for is a no-op, returning `false`, the same
	 * degrade-to-nothing `ActorAnimator`/`GridMover` already use for a missing animation
	 * rather than throwing over what is often just a naming mismatch between assets.
	 */
	playAnimation(name: string, loop = true): boolean {
		const clip = this.animations.get(name);
		if (!clip) return false;
		if (this.currentClip === clip) {
			if (!clip.isPlaying) clip.start(loop);
			return true;
		}
		this.currentClip?.stop();
		clip.start(loop);
		this.currentClip = clip;
		return true;
	}

	/** stops whichever imported clip is currently playing, if any */
	stopAnimation(): void {
		this.currentClip?.stop();
		this.currentClip = null;
	}

	/** the name of the clip currently playing, or null when none is */
	get currentAnimation(): string | null {
		return this.currentClip?.name ?? null;
	}

	moveTo(x: number, y: number, z: number, speed: number): void {
		if (!(speed > 0)) throw new Error('3D character speed must be positive');
		this.target = new Vector3(x, y, z);
		this.speed = speed;
	}

	update(deltaSeconds: number): boolean {
		if (!this.target) return false;
		const distance = Vector3.Distance(this.node.position, this.target);
		if (distance <= this.speed * deltaSeconds) {
			this.node.position.copyFrom(this.target);
			this.target = null;
			return false;
		}
		const direction = this.target.subtract(this.node.position).normalize();
		this.node.position.addInPlace(direction.scale(this.speed * deltaSeconds));
		this.node.rotation.y = Math.atan2(direction.x, direction.z);
		return true;
	}

	/** @param animations typically `loadModel3D`'s own `animationGroups` result field */
	static fromMesh(mesh: AbstractMesh, animations: readonly AnimationGroup[] = []): Character3D {
		return new Character3D(mesh, animations);
	}

	static billboard(scene: Scene, options: Billboard3DOptions): Character3D {
		const plane = CreatePlane('billboard-character', { width: options.width ?? 1, height: options.height ?? 1.5 }, scene);
		plane.billboardMode = Mesh.BILLBOARDMODE_Y;
		const material = new StandardMaterial('billboard-material', scene);
		material.diffuseTexture = new Texture(resolveSource(options.texture), scene);
		material.diffuseTexture.hasAlpha = true;
		material.useAlphaFromDiffuseTexture = true;
		material.backFaceCulling = false;
		plane.material = material;
		return new Character3D(plane);
	}
}
