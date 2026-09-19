import type { Camera } from './Camera.ts';

/**
 * Anything a `SpriteGroup` can gate: a position in the world units the camera sees, and a
 * per-frame advance. Both `AnimatedSprite` and `ParticleEmitter` satisfy this structurally,
 * so a crowd of goblins and the campfire between them can share one group.
 */
export interface SpriteGroupMember {
	x: number;
	y: number;
	update(dt: number): void;
}

//the one rule both `isOnScreen` and `SpriteGroup.update` apply: the box is read once per
//frame by the caller, never once per member, since `Camera.view` re-derives its corners
//(and their trigonometry when rotated) on every read
function insideBox(
	box: { x: number; y: number; width: number; height: number },
	x: number,
	y: number,
	margin: number,
): boolean {
	return (
		x >= box.x - margin &&
		x <= box.x + box.width + margin &&
		y >= box.y - margin &&
		y <= box.y + box.height + margin
	);
}

/**
 * Whether a world-space point is on screen, for skipping animation work nobody sees.
 *
 * The edges count as on screen, and `margin` grows the box by that many world units on
 * every side, for sprites whose bodies spill past their anchor point. Under a rotated
 * camera the checked box is the axis-aligned one around the turned viewport (the same
 * over-inclusive box `TileMap.cull` uses), so this can only ever animate too much, never
 * freeze something the player can see.
 *
 * @example
 * ```ts
 * import { Camera, isOnScreen } from '@datamoc/mw_games/two-d/render';
 *
 * declare const camera: Camera;
 *
 * if (isOnScreen(camera, 160, 160)) console.log('the market square, animate it');
 * console.log(isOnScreen(camera, 10000, 10000, 32)); // far away, even with a margin
 * ```
 */
export function isOnScreen(camera: Camera, x: number, y: number, margin = 0): boolean {
	return insideBox(camera.view, x, y, margin);
}

/**
 * A crowd that only animates its on-screen members.
 *
 * `TileMap.cull(camera)` keeps tile *rendering* cost to what is on screen; this is the
 * same idea for per-frame *animation* cost. A scene with hundreds of animated inhabitants
 * calls `group.update(camera, dt)` once per frame instead of updating each sprite itself,
 * and members outside `camera.view` (plus `margin`) simply keep whatever frame they had
 * until they come back into view. Skipped members are never touched: no `paused` flag is
 * set, no state is rewritten, so a sprite that leaves the group animates exactly as
 * before.
 *
 * Members are positioned in the camera's own world units, the way `GridMover` and
 * `TileMap.tileCenter` already place things: direct children of `camera.world`, or
 * anything else whose `x`/`y` already read as world coordinates. Members nested deeper
 * (a sword in a hero's hand) report their *local* position, so they belong to no group,
 * or to one updated unconditionally.
 *
 * @example
 * ```ts
 * import { SpriteGroup, AnimatedSprite, Camera } from '@datamoc/mw_games/two-d/render';
 *
 * declare const camera: Camera;
 *
 * const crowd = new SpriteGroup();
 * const goblin = new AnimatedSprite();
 * crowd.add(goblin);
 *
 * function onFrame(dt: number): void {
 * 	crowd.update(camera, dt); // goblins off screen keep their frame, for free
 * }
 * ```
 */
export class SpriteGroup {
	private members: SpriteGroupMember[] = [];

	/** how many members this group holds */
	get size(): number {
		return this.members.length;
	}

	/**
	 * Adds a member; adding the same one twice is a no-op, so a spawn loop can call this
	 * every frame without growing the group.
	 */
	add(member: SpriteGroupMember): this {
		if (!this.members.includes(member)) this.members.push(member);
		return this;
	}

	/** removes a member; reports whether it was there */
	remove(member: SpriteGroupMember): boolean {
		const index = this.members.indexOf(member);
		if (index < 0) return false;
		this.members.splice(index, 1);
		return true;
	}

	/** empties the group, for a scene change */
	clear(): void {
		this.members.length = 0;
	}

	/**
	 * Advances every member on screen by `dt`, skipping the rest. `margin` grows the
	 * tested box the way `isOnScreen`'s does, for members larger than a point.
	 */
	update(camera: Camera, dt: number, margin = 0): void {
		const view = camera.view;
		//a snapshot, so a member added or removed mid-frame (an onFinish hook spawning a
		//replacement, say) cannot shift the array under this loop
		for (const member of [...this.members]) {
			if (insideBox(view, member.x, member.y, margin)) member.update(dt);
		}
	}
}
