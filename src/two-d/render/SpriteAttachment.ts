export interface AttachmentPoint {
	x: number;
	y: number;
}

export interface SpriteAttachmentOptions {
	/** where the attachment sits relative to its owner, in pixels */
	offsetX?: number;
	offsetY?: number;

	/** seconds this attachment lives before `done`; omit for one that lives as long as its owner does */
	duration?: number;
}

/**
 * Ties a second sprite's position to a first one's, with its own offset and its own optional
 * lifetime - a shadow flat beneath a unit, a status icon floating above it, a shield glyph at a
 * corner. `StatusVisuals` only tints a sprite that already exists; this is for a sprite that is
 * its own thing, positioned relative to an owner rather than drawn as part of it.
 *
 * Renderer-neutral by the same design `Projectile` and `LightningArc` use: it takes any
 * `{ x, y }` point (a real Pixi `Sprite`, a plain object, a test double) and only ever writes
 * to it, so it needs no renderer to construct or test. Z-order and parenting stay the caller's,
 * for the same reason `Halo` leaves them: whether a shadow is added before or after its unit is
 * a per-game drawing decision, not something a framework should guess.
 *
 * @example
 * ```ts
 * import { SpriteAttachment } from '@datamoc/mw_games/two-d/render';
 *
 * declare const shadowSprite: { x: number; y: number };
 * declare const statusIcon: { x: number; y: number };
 *
 * const shadow = new SpriteAttachment(shadowSprite, { offsetY: 4 });
 * const poisoned = new SpriteAttachment(statusIcon, { offsetY: -20, duration: 3 });
 *
 * shadow.follow(100, 200);
 * poisoned.follow(100, 200);
 *
 * const expired = poisoned.update(1 / 60);
 * console.log(expired); // false - not yet 3 seconds in
 * ```
 */
export class SpriteAttachment {
	private readonly child: AttachmentPoint;
	private readonly offsetX: number;
	private readonly offsetY: number;
	private readonly duration?: number;
	private elapsed = 0;
	private expired = false;

	constructor(child: AttachmentPoint, options: SpriteAttachmentOptions = {}) {
		this.child = child;
		this.offsetX = options.offsetX ?? 0;
		this.offsetY = options.offsetY ?? 0;
		this.duration = options.duration;
	}

	get done(): boolean {
		return this.expired;
	}

	/** puts the attachment where its owner stands, with whatever offset it was built with */
	follow(ownerX: number, ownerY: number): this {
		this.child.x = ownerX + this.offsetX;
		this.child.y = ownerY + this.offsetY;
		return this;
	}

	/** @returns true the instant `duration` elapses, so a caller can remove it exactly once; always false with no `duration` */
	update(dt: number): boolean {
		if (this.expired || this.duration === undefined) return false;
		this.elapsed += dt;
		if (this.elapsed >= this.duration) {
			this.expired = true;
			return true;
		}
		return false;
	}
}
