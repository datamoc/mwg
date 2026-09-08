/**
 * What a mover actually needs of the thing it moves.
 *
 * `GridMover` and `FreeMover` used to name `render.AnimatedSprite` outright, which said two
 * untrue things: that the thing being moved has to be a sprite at all (it can be any object
 * with a position - a 3D mesh wrapper, a plain record a test asserts against), and that it
 * has to be animated (it does not; `examples/movement` carries a comment apologising for
 * exactly that). Naming the members instead is enough for TypeScript's structural typing:
 * a real `AnimatedSprite` satisfies this without knowing it exists, and so does anything else
 * shaped the same way.
 *
 * The animation members are optional because a mover degrades cleanly without them - a static
 * sprite simply never changes frame, which is what a game with no walk-cycle art wants.
 */
export interface MovableSprite {
	x: number;
	y: number;

	/** advances a frame-based animation, if the thing being moved has one */
	update?(dt: number): void;

	/** whether an animation of this name is registered */
	has?(animation: string): boolean;

	/** switches to a registered animation */
	play?(animation: string): void;
}

/**
 * Plays `name` on `sprite` when it names an animation the sprite actually has - the guard
 * both movers share around their walk/idle callbacks, so a missing animation (or a sprite
 * with no animation support at all) is a silent no-op rather than a throw.
 */
export function playMoverAnimation(sprite: MovableSprite, name: string | undefined): void {
	if (name && sprite.has?.(name)) sprite.play?.(name);
}
