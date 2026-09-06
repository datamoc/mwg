import type { AnimatedSprite } from './AnimatedSprite.ts';

/** the three states any character's animation ever needs to be in */
export type ActorAnimationState = 'idle' | 'move' | 'action';

export interface ActorAnimatorOptions {
	/**
	 * Names a state's animation, given whatever varies it - a facing direction for a grid
	 * character, an empty string for one that does not need it. Looked up through
	 * `AnimatedSprite.has`, so a state with nothing registered for the current variant is
	 * silently skipped rather than throwing - the same degrade-to-nothing `GridMover` already
	 * relies on for a sprite with no walk cycle at all.
	 */
	animationName: (state: ActorAnimationState, variant: string) => string;

	/** the variant to start in; defaults to the empty string */
	variant?: string;
}

/**
 * The convention `AnimatedSprite` and `GridMover` never had: standing still, moving, and
 * performing an action are the only three states a character's animation is ever in, and an
 * action is the only one of the three that interrupts the other two rather than being
 * interrupted by them.
 *
 * `setMoving` toggles between idle and move freely, as often as every frame - a grid
 * character's walk cycle calls it once per `update`. `playAction` cuts in over whichever of
 * those is currently showing, plays once, and - because an action animation must be
 * registered non-looping (`{ loop: false }`) for this to close the loop - hands control back
 * to idle or move automatically the instant it finishes, picking up whichever `setMoving`
 * calls arrived while it was playing rather than whatever was true when it started. A second
 * `playAction` while one is already running is ignored unless `restart` is passed, so an
 * attack animation is not stuttered by a turn resolving faster than its swing.
 *
 * This owns the sprite's `onFinish` hook entirely; a game driving one through
 * `ActorAnimator` should not also set `onFinish` itself.
 */
export class ActorAnimator {
	private sprite: AnimatedSprite;
	private animationName: (state: ActorAnimationState, variant: string) => string;

	private variant: string;
	private idleOrMove: 'idle' | 'move' = 'idle';
	private inAction = false;

	constructor(sprite: AnimatedSprite, options: ActorAnimatorOptions) {
		this.sprite = sprite;
		this.animationName = options.animationName;
		this.variant = options.variant ?? '';

		this.sprite.onFinish = () => this.onSpriteFinish();
		this.apply(this.idleOrMove);
	}

	/** the state actually showing right now - `'action'` overrides idle/move while it plays */
	get state(): ActorAnimationState {
		return this.inAction ? 'action' : this.idleOrMove;
	}

	get variantName(): string {
		return this.variant;
	}

	/**
	 * Standing still or moving, and which way. Has no effect while an action is playing -
	 * the request is remembered and taken up the moment it finishes.
	 */
	setMoving(moving: boolean, variant?: string): void {
		if (variant !== undefined) this.variant = variant;
		this.idleOrMove = moving ? 'move' : 'idle';
		if (!this.inAction) this.apply(this.idleOrMove);
	}

	/**
	 * Plays an action animation once - an attack, a use-item flourish, a wave. Idle/move
	 * resumes automatically when it finishes.
	 *
	 * @param restart replay from the first frame even if this action is already playing;
	 * without it, a second call while one is already running is a no-op
	 */
	playAction(variant?: string, restart = false): void {
		if (this.inAction && !restart) return;
		if (variant !== undefined) this.variant = variant;

		this.inAction = true;
		this.apply('action');
	}

	private onSpriteFinish(): void {
		//idle/move are registered looping and never reach this; a stray call (an action
		//registered looping by mistake) is ignored rather than left to desync `inAction`
		if (!this.inAction) return;

		this.inAction = false;
		this.apply(this.idleOrMove);
	}

	private apply(state: ActorAnimationState): void {
		const name = this.animationName(state, this.variant);
		if (this.sprite.has(name)) this.sprite.play(name, state === 'action');
	}
}
