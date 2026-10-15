import { MeshPlane } from 'pixi.js';
import { Cloth } from '../../physics/cloth/index.ts';
import { reducedMotion, type MotionIntent } from '../../core/Motion.ts';
import type { Texture2D } from './Types2D.ts';

/** Mesh density and simulation tuning for {@link ClothSprite}; the cloth spans the texture. */
export interface ClothSpriteOptions {
	/** quads across; an integer of at least 1, default 8 */
	segmentsX?: number;
	/** quads down; an integer of at least 1, default 8 */
	segmentsY?: number;
	/** how much of each constraint error one relaxation pass removes, 0 to 1; default 0.9 */
	stiffness?: number;
	/** share of velocity lost per update, 0 to 1; default 0.02 */
	damping?: number;
	/** acceleration in world units per second squared; default no gravity (a banner in still air) */
	gravity?: { x: number; y: number };
	/** acceleration in world units per second squared; default still air */
	wind?: { x: number; y: number };
	/** what the sway is for under reduced motion; default `decorative`, which holds the garment still */
	intent?: MotionIntent;
}

/**
 * A garment that follows with a slight lag: a `Cloth` simulation driving a textured mesh
 * on the GPU path 414 ships (roadmap 423). The cloth spans the texture, the top edge
 * starts pinned (a waistband, a held scarf end), and `update(dt)` steps the simulation
 * and re-uploads the vertex buffer; UVs are never rewritten and the sprite itself is
 * never rotated, so a skirt bends while its print stays printed. Pin more points to hang
 * it, unpin to let it fall, and drive `setWind` from the weather or the run cycle.
 *
 * @example
 * ```ts
 * import { ClothSprite } from '@datamoc/mw_games/two-d/render';
 * import type { Texture2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const tunicTexture: Texture2D;
 *
 * const tunic = new ClothSprite(tunicTexture, { segmentsX: 6, segmentsY: 8, gravity: { x: 0, y: 900 } });
 * tunic.update(1 / 60); // the hem answers gravity, the waistband stays pinned
 * console.log(tunic.movedCount()); // > 0 - everything below the pinned edge travelled
 * ```
 */
export class ClothSprite extends MeshPlane {
	private readonly cloth: Cloth;
	private readonly intent: MotionIntent;

	constructor(texture: Texture2D, options: ClothSpriteOptions = {}) {
		const segmentsX = options.segmentsX ?? 8;
		const segmentsY = options.segmentsY ?? 8;
		const cloth = new Cloth({
			width: texture.width,
			height: texture.height,
			segmentsX,
			segmentsY,
			stiffness: options.stiffness,
			damping: options.damping,
			gravity: options.gravity,
			wind: options.wind,
		});
		super({ texture, verticesX: segmentsX + 1, verticesY: segmentsY + 1 });
		this.cloth = cloth;
		this.intent = options.intent ?? 'decorative';
		//a later texture resize must not rebuild the plane under the simulation
		this.autoResize = false;
		this.sync();
	}

	/** quads across */
	get segmentsX(): number {
		return this.cloth.segmentsX;
	}

	/** quads down */
	get segmentsY(): number {
		return this.cloth.segmentsY;
	}

	/** how many simulated points the mesh holds */
	get pointCount(): number {
		return this.cloth.pointCount;
	}

	/** the flat index of the point at `(column, row)` */
	indexOf(column: number, row: number): number {
		return this.cloth.indexOf(column, row);
	}

	/** the current position of one mesh point */
	pointPosition(index: number): { x: number; y: number } {
		return this.cloth.pointPosition(index);
	}

	/** whether a point is pinned */
	isPinned(index: number): boolean {
		return this.cloth.isPinned(index);
	}

	/** how many points currently sit away from their rest positions */
	movedCount(): number {
		return this.cloth.movedCount();
	}

	/** pin a point where it currently stands */
	pinPoint(index: number): void {
		this.cloth.pinPoint(index);
	}

	/** release a pinned point; it keeps its current position and moves from there */
	unpinPoint(index: number): void {
		this.cloth.unpinPoint(index);
	}

	/** replace the wind acceleration */
	setWind(x: number, y: number): void {
		this.cloth.setWind(x, y);
	}

	/** replace the gravity acceleration */
	setGravity(x: number, y: number): void {
		this.cloth.setGravity(x, y);
	}

	/**
	 * Step the cloth and re-upload the vertex buffer. Under reduced motion a decorative
	 * garment holds its shape instead of swaying.
	 */
	update(dt: number): void {
		if (reducedMotion() && this.intent === 'decorative') return;
		this.cloth.update(dt);
		this.sync();
	}

	private sync(): void {
		const attribute = this.geometry.getAttribute('aPosition');
		this.cloth.writePositions(attribute.buffer.data as Float32Array);
		attribute.buffer.update();
	}
}
