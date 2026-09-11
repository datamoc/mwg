import { Container } from 'pixi.js';
import { FloatingText, type FloatingTextOptions } from './FloatingText.ts';

/**
 * One pop-up the stack knows about: where it was asked to appear, how tall it is, and what it
 * stacks against.
 */
export interface FloatingTextStackEntry {
	/** pop-ups sharing a key are stacked apart; leave it unset for one that stands alone */
	key?: string | number;

	/** the world point, as asked for - not wherever stacking moved the pop-up to */
	x: number;
	y: number;

	/** the pop-up's own height, measured rather than assumed */
	height: number;
}

/**
 * How far a newcomer must move up to clear every live pop-up it shares a key *and* an origin
 * with - the classic "three numbers on one creature in one turn" case.
 *
 * Exported and pure on purpose: the stacking rule is arithmetic, and this way it is checked as
 * arithmetic rather than through a rendered label (`Label` needs a DOM to measure text).
 * Offsets accumulate by measured height, so a taller line clears the one under it rather than
 * overlapping it by a fixed guess.
 *
 * @example
 * ```ts
 * import { floatingTextStackOffset } from '@datamoc/mw_games/two-d/ui';
 * console.log(floatingTextStackOffset([{ key: 'hero', x: 1, y: 2, height: 10 }], { key: 'hero', x: 1, y: 2, height: 8 })); // 11
 * ```
 */
export function floatingTextStackOffset(
	live: readonly FloatingTextStackEntry[],
	incoming: FloatingTextStackEntry,
): number {
	if (incoming.key === undefined) return 0;

	let lift = 0;
	for (const entry of live) {
		if (entry.key !== incoming.key) continue;
		if (entry.x !== incoming.x || entry.y !== incoming.y) continue;
		lift += entry.height + 1;
	}
	return lift;
}

export interface FloatingTextPush extends FloatingTextOptions {
	/** where the pop-up belongs, in the stack's own coordinate space */
	x: number;
	y: number;

	/**
	 * Pop-ups pushed with the same key and the same origin stack upward instead of
	 * overprinting. A pop-up with no key always stands alone.
	 */
	key?: string | number;
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

	/** spawns a pop-up at `options.x`/`options.y`, stacked clear of anything it shares a key with */
	push(options: FloatingTextPush): FloatingText {
		const popup = new FloatingText({
			text: options.text,
			color: options.color,
			size: options.size,
			duration: options.duration,
			rise: options.rise,
			hold: options.hold,
		});
		const entry: FloatingTextStackEntry = { key: options.key, x: options.x, y: options.y, height: popup.height };
		popup.position.set(
			options.x,
			options.y +
				floatingTextStackOffset(
					this.live.map((held) => held.entry),
					entry,
				),
		);

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
