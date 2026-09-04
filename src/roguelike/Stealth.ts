import { chebyshevDistance } from './Targeting.ts';
import type { Step } from './Pathfinder.ts';

/**
 * A unit that stays undetected in clear sight, independent of terrain, until an enemy comes
 * within a fixed radius - the primitive under every "hidden unless someone's right next to
 * you" mechanic. `FieldOfView` is the other half of visibility (can an observer's line of
 * sight even reach this cell); this is a separate, distance-only check layered on top of it,
 * not a change to how `FieldOfView` itself works.
 */
export interface StealthOptions {
	/** an observer this close or closer reveals the unit, in `chebyshevDistance` steps */
	radius: number;
}

/**
 * Tracks one hidden unit's detection state. Detection is one-way and sticky: once found, a
 * unit stays found until something explicitly re-hides it (`reset`), the same way a real
 * ambush does not un-happen because the enemy that spotted you wandered off again.
 */
export class Stealth {
	private detected = false;
	private radius: number;

	constructor(options: StealthOptions) {
		this.radius = options.radius;
	}

	get isDetected(): boolean {
		return this.detected;
	}

	/**
	 * Checks `observers` against `hidden`'s position, and returns `true` only on the call
	 * that first brings one within range - the discoverer's move should be spent on that
	 * call, and that call alone, never on every later check while the unit stays in range.
	 * Already-detected units always return `false` here; read `isDetected` for their
	 * ongoing state instead.
	 */
	checkDetection(hidden: Step, observers: readonly Step[]): boolean {
		if (this.detected) return false;
		const found = observers.some((observer) => chebyshevDistance(hidden, observer) <= this.radius);
		if (found) this.detected = true;
		return found;
	}

	/** hides the unit again - a smoke bomb, breaking line of sight for long enough, a new floor */
	reset(): void {
		this.detected = false;
	}
}
