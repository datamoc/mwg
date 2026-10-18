import { Graphics } from 'pixi.js';
import type { Spring } from '../../physics/spring/index.ts';

export interface SpringSpriteOptions {
	/** the spring to draw */
	spring: Spring;
	/** line colour */
	color?: number;
	/** line opacity */
	alpha?: number;
	/** line width */
	lineWidth?: number;
}

/**
 * A debug line from a spring's anchor to its bob: one straight segment that stretches,
 * overshoots and settles with the simulation. A game draws hair or hems by placing its
 * own sprites with `Spring.place`, and keeps this around while tuning stiffness and
 * damping. Call `sync` after stepping the spring; the line never steps anything itself.
 *
 * @example
 * ```ts
 * import { Spring } from '@datamoc/mwg/physics';
 * import { SpringSprite } from '@datamoc/mwg/two-d/render';
 *
 * const spring = new Spring({ stiffness: 120, damping: 8 });
 * const line = new SpringSprite({ spring });
 * spring.setAnchor(10, 0);
 * spring.update(1 / 60);
 * line.sync(); // the segment now leans toward the anchor
 * ```
 */
export class SpringSprite extends Graphics {
	private readonly spring: Spring;
	private readonly color: number;
	private readonly opacity: number;
	private readonly lineWidth: number;

	constructor(options: SpringSpriteOptions) {
		super();
		this.spring = options.spring;
		this.color = options.color ?? 0xffffff;
		this.opacity = options.alpha ?? 1;
		this.lineWidth = options.lineWidth ?? 2;
		this.sync();
	}

	/** redraw the anchor-to-bob segment from the spring's current state */
	sync(): void {
		const anchor = this.spring.anchorPosition;
		const bob = this.spring.position;
		this.clear();
		this.moveTo(anchor.x, anchor.y)
			.lineTo(bob.x, bob.y)
			.stroke({ color: this.color, width: this.lineWidth, alpha: this.opacity });
	}
}
