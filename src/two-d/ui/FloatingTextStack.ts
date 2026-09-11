import { Container } from 'pixi.js';
import { FloatingText, type FloatingTextOptions } from './FloatingText.ts';

/**
 * One pop-up the stack knows about: where it sits right now, how tall it is, and what it stacks
 * against.
 */
export interface FloatingTextStackEntry {
	/** pop-ups sharing a key are stacked apart; leave it unset for one that stands alone */
	key?: string | number;

	/**
	 * Where the pop-up is placed, at its centre - stacking moves the older ones, never a newcomer.
	 *
	 * This is the box the rise happens *inside* (`FloatingText` rises its own inner layer), so the
	 * arithmetic below compares where lines are put rather than where one frame caught them: a burst
	 * stacks the same way whatever the frame rate, where Java compares live positions.
	 */
	x: number;
	y: number;

	/** the pop-up's own height, measured rather than assumed */
	height: number;
}

/** The vertical gap left between two stacked lines - Java's `FloatingText.push()` uses `4`. */
export const FLOATING_TEXT_STACK_GAP = 4;

/**
 * The age a lifted line is forced to, in seconds, from how many lines sit below it - Java's
 * `LIFESPAN - numBelow / 5f` read as a floor under the age rather than a cap on what is left, the
 * same rule `FloatingText.ageAtLeast` applies. One second per five lines, a fifth of a second each,
 * so a burst of numbers cannot become a column that outlives the fight that produced it.
 */
export function floatingTextStackLifePenalty(linesBelow: number): number {
	return Math.max(0, linesBelow) / 5;
}

/**
 * The `y` `older` must sit at to clear `below`, or `older.y` when it already does.
 *
 * The direction is the point, and it is why this returns a *position* rather than an offset to add:
 * Java's `FloatingText.push()` anchors the newcomer on the target and lifts the lines already there
 * (`above.setPos(above.left(), below.top() - above.height() - 4)`), the opposite of moving the
 * newcomer out of the way. Pop-ups rise, so the older ones belong above the newer ones - an offset
 * the caller adds is direction-ambiguous, a position the caller assigns is not.
 *
 * Both boxes are anchored at their centre, so a line's top is `y - height / 2`; a line is clear when
 * its bottom plus the gap no longer reaches the other's top.
 *
 * Exported and pure on purpose: the stacking rule is arithmetic, and this way it is checked as
 * arithmetic rather than through a rendered label (`Label` needs a DOM to measure text).
 */
export function floatingTextStackLift(
	older: FloatingTextStackEntry,
	below: FloatingTextStackEntry,
	gap: number = FLOATING_TEXT_STACK_GAP,
): number {
	const belowTop = below.y - below.height / 2;
	if (older.y + older.height / 2 + gap <= belowTop) return older.y;
	return belowTop - older.height / 2 - gap;
}

/** One line a newcomer pushes out of the way, and what that costs it. */
export interface FloatingTextStackMove {
	/** index into the `live` entries the policy was handed */
	readonly index: number;

	/** where the line ends up: the position to give it, not an offset to add */
	readonly y: number;

	/** the age the line is forced to, in seconds, from `floatingTextStackLifePenalty` */
	readonly ageAtLeast: number;
}

/**
 * The whole stacking policy as arithmetic: which of `live` (oldest first) share the newcomer's key,
 * where each of them ends up, and what age each is forced to.
 *
 * Newest first, stopping at the first line already clear of the one below it: a stack is ordered,
 * an older line sits above a newer one, so a line that needs no move means nothing above it does
 * either. That is Java's `break`, and the reason the walk runs backwards over `live`.
 *
 * Pure and exported for the same reason `floatingTextStackLift` is: applying a plan needs a
 * `FloatingText`, which is a `Label`, which needs a DOM. The decision is therefore checked as
 * arithmetic and the class is left with the assignments. `push` inlined this loop once, and the
 * loop is where the direction, the order and the life floor were all wrong at the same time.
 *
 * @example
 * ```ts
 * import {
 *   FLOATING_TEXT_STACK_GAP,
 *   floatingTextStackLift,
 *   floatingTextStackLifePenalty,
 *   floatingTextStackMoves,
 * } from '@datamoc/mw_games/two-d/ui';
 *
 * const older = { key: 'hero', x: 0, y: 0, height: 10 };
 * const newcomer = { key: 'hero', x: 0, y: 0, height: 8 };
 *
 * console.log(FLOATING_TEXT_STACK_GAP); // 4, the gap Java's push leaves
 * console.log(floatingTextStackLift(older, newcomer)); // -13, where the older line must sit
 * console.log(floatingTextStackLifePenalty(1)); // 0.2, the age a first lifted line is forced to
 * console.log(floatingTextStackMoves([older], newcomer)); // [{ index: 0, y: -13, ageAtLeast: 0.2 }]
 * ```
 */
export function floatingTextStackMoves(
	live: readonly FloatingTextStackEntry[],
	incoming: FloatingTextStackEntry,
	gap: number = FLOATING_TEXT_STACK_GAP,
): FloatingTextStackMove[] {
	const moves: FloatingTextStackMove[] = [];
	if (incoming.key === undefined) return moves;

	let below = incoming;
	for (let index = live.length - 1; index >= 0; index--) {
		const held = live[index];
		if (held.key !== incoming.key) continue;
		const y = floatingTextStackLift(held, below, gap);
		//already clear of the line below, so everything above it is too: Java stops here
		if (y === held.y) break;
		moves.push({ index, y, ageAtLeast: floatingTextStackLifePenalty(moves.length + 1) });
		//the next line up is measured against where this one is going, not where it was. The
		//entries handed in are not mutated, so the move is carried forward on a copy: without this
		//every line of a burst lands at the same y.
		below = { ...held, y };
	}
	return moves;
}

export interface FloatingTextPush extends FloatingTextOptions {
	/** where the pop-up belongs, in the stack's own coordinate space */
	x: number;
	y: number;

	/**
	 * Pop-ups pushed with the same key stack upward instead of overprinting. A pop-up with no key
	 * always stands alone.
	 *
	 * A key is the target's own identity, which is what Java's `stacks.get(key)` is keyed on: a
	 * caller reusing one key for two different targets sees their lines stacked together.
	 */
	key?: string | number;

	/**
	 * Uniform scale for the pop-up, applied *before* it is measured. Pass it here rather than
	 * scaling the returned pop-up: a `FloatingText`'s `height` includes its own scale, so a scale
	 * applied after the push is measured wrong and the lines stack by a size they are not drawn at
	 * (a port rasterising at 21px and drawing at 7 spaced one stack three times too far apart).
	 */
	scale?: number;
}

/**
 * Owns the pop-ups a game spawns over world points: one `push` per number, one `update(dt)` to
 * drive them all, and no bookkeeping left to the caller.
 *
 * The alternative - every call site constructing, positioning, collecting and destroying its own
 * `FloatingText` - is where the stacking rule gets forgotten and duplicate numbers land on top of
 * each other, which is the whole reason this exists rather than being left to the game.
 *
 * @example
 * ```ts
 * import { FloatingTextStack } from '@datamoc/mw_games/two-d/ui';
 * import type { Container2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const worldLayer: Container2D;
 * declare const hero: { x: number; y: number };
 * declare function update(dt: number): void;
 *
 * const popups = new FloatingTextStack();
 * worldLayer.addChild(popups);
 *
 * popups.push({ text: '-12', x: hero.x, y: hero.y, key: 'hero', color: 0xff4444, hold: 0.5 });
 * popups.update(0.25); // half a second's worth of rise and fade over every live pop-up
 * ```
 */
export class FloatingTextStack extends Container {
	private readonly live: Array<{ popup: FloatingText; entry: FloatingTextStackEntry }> = [];

	/**
	 * Spawns a pop-up at `options.x`/`options.y`, lifting the lines already there out of its way.
	 *
	 * The newcomer stays exactly where it was asked to appear; anything sharing its key that it
	 * would overlap moves up, newest first, each one measured against the line below it and each
	 * nudge costing it a little life - Java's order, so a stack grows upward and self-limits. The
	 * decision is `floatingTextStackMoves`; this method only assigns what that plan says.
	 */
	push(options: FloatingTextPush): FloatingText {
		const popup = new FloatingText({
			text: options.text,
			color: options.color,
			size: options.size,
			duration: options.duration,
			rise: options.rise,
			hold: options.hold,
		});
		//before the measurement below, never after: `height` includes the pop-up's own scale
		if (options.scale !== undefined) popup.scale.set(options.scale);
		const entry: FloatingTextStackEntry = { key: options.key, x: options.x, y: options.y, height: popup.height };

		for (const move of floatingTextStackMoves(
			this.live.map((held) => held.entry),
			entry,
		)) {
			const held = this.live[move.index];
			held.entry.y = move.y;
			held.popup.y = move.y;
			held.popup.ageAtLeast(move.ageAtLeast);
		}

		popup.position.set(options.x, options.y);
		this.addChild(popup);
		this.live.push({ popup, entry });
		return popup;
	}

	/** drives every live pop-up, then forgets the ones that have finished and removed themselves */
	update(dt: number): void {
		for (const { popup } of this.live) popup.update(dt);
		for (let i = this.live.length - 1; i >= 0; i--) {
			if (this.live[i].popup.finished) this.live.splice(i, 1);
		}
	}

	/** how many pop-ups are still alive */
	get count(): number {
		return this.live.length;
	}

	/** drops every live pop-up at once - a scene change, say */
	clear(): void {
		for (const { popup } of this.live) {
			this.removeChild(popup);
			popup.destroy({ children: true });
		}
		this.live.length = 0;
	}
}
