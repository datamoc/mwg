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
/**
 * Clamps one frame's intended horizontal move to wherever collision actually allows - the
 * hook `mwg/3d`'s own grid collision (`resolveCapsuleAgainstGrid`) plugs into. `blocked`,
 * when the resolver reports it (`resolveCapsuleAgainstGrid` always does), tells `update`
 * directly whether the move was cut short, rather than `update` re-deriving the same fact by
 * comparing the resolved position against the intended one through separate floating-point
 * arithmetic - two numbers that are conceptually equal are not guaranteed bit-identical.
 */
export type CollideXZ = (
	from: { x: number; z: number },
	to: { x: number; z: number }
) => { x: number; z: number; blocked?: boolean };

export class Character3D {
	readonly node: TransformNode;
	private target: Vector3 | null = null;
	private speed = 0;
	private readonly collideXZ?: CollideXZ;

	private readonly animations: Map<string, AnimationGroup>;
	private currentClip: AnimationGroup | null = null;

	/**
	 * @param collideXZ optional, like `rpg.FreeMover` stays unopinionated about collision
	 * until a game wires one in - omitted, `moveTo` interpolates through open space with no
	 * notion of terrain height or collision at all, same as before this existed.
	 */
	constructor(node: TransformNode, animations: readonly AnimationGroup[] = [], collideXZ?: CollideXZ) {
		this.node = node;
		this.animations = new Map(animations.map((group) => [group.name, group]));
		this.collideXZ = collideXZ;
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
		const reachesTarget = distance <= this.speed * deltaSeconds;
		const rawDirection = this.target.subtract(this.node.position);
		const intended = reachesTarget ? this.target : this.node.position.add(rawDirection.normalize().scale(this.speed * deltaSeconds));
		if (!reachesTarget) this.node.rotation.y = Math.atan2(rawDirection.x, rawDirection.z);

		if (this.collideXZ) {
			const from = { x: this.node.position.x, z: this.node.position.z };
			const to = { x: intended.x, z: intended.z };
			const resolved = this.collideXZ(from, to);
			this.node.position.set(resolved.x, intended.y, resolved.z);
			//stopped short of where it meant to go - the target it was walking toward is no
			//longer reachable along this line, the same "give up on this path" a caller of
			//rpg.Collision's resolveAabbAgainstTiles already has to decide for itself
			const blocked = resolved.blocked ?? (resolved.x !== to.x || resolved.z !== to.z);
			if (blocked) {
				this.target = null;
				return false;
			}
		} else {
			this.node.position.copyFrom(intended);
		}

		if (reachesTarget) {
			this.target = null;
			return false;
		}
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
