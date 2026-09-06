export interface TintTarget {
	lerpTint(color: number, strength: number): void;
	resetColor(): void;
}

export interface StatusVisualStyle {
	/** colour to pull the sprite towards while this status is active */
	color: number;
	/** 0..1, how far towards `color` at full intensity; defaults to 0.5 */
	strength?: number;
	/** cycles per second the strength oscillates between 0 and `strength`; omit for a steady tint */
	pulseRate?: number;
}

export interface StatusVisualsOptions {
	/** which status wins when more than one is active - key order is priority, first to last */
	styles: Record<string, StatusVisualStyle>;
}

/**
 * Turns a set of active status-effect names into one tint on a sprite, so a game's own
 * `actors.applyStatusEffect` handles - which know nothing about rendering - can drive what a
 * character looks like without either side importing the other. `styles`' key order is the
 * priority: with both `poisoned` and `burning` active, whichever is declared first wins, the
 * same "declaration order decides" rule `rpg.activePage` uses for map events.
 *
 * `target` is any object shaped like `TintedSprite`'s own `lerpTint`/`resetColor` - duck-typed
 * the way `Projectile` takes a plain `{x, y}` rather than a real Pixi `Sprite`, so this is
 * fully testable without Pixi and works on any sprite subclass that exposes the same two
 * methods. A `pulseRate` status flickers between its style's `strength` and zero rather than
 * holding steady. This owns none of the sprite's other colour state; a caller mixing in an
 * unrelated `tint` write (a damage flash, standing in shade) will fight this the same way two
 * direct writers to any shared field would.
 */
export class StatusVisuals {
	private target: TintTarget;
	private styles: Record<string, StatusVisualStyle>;
	/** `styles`' own key order, computed once rather than every `update()` - a per-frame call */
	private priority: readonly string[];
	private active = new Set<string>();
	private elapsed = 0;

	constructor(target: TintTarget, options: StatusVisualsOptions) {
		this.target = target;
		this.styles = options.styles;
		this.priority = Object.keys(options.styles);
	}

	/** marks `kind` active or inactive; a `kind` with no matching style is tracked but never shown */
	set(kind: string, active: boolean): void {
		if (active) this.active.add(kind);
		else this.active.delete(kind);
	}

	has(kind: string): boolean {
		return this.active.has(kind);
	}

	/** advances any pulsing style and repaints the sprite from the current active set */
	update(dt: number): void {
		this.elapsed += dt;

		const kind = this.priority.find((k) => this.active.has(k));
		if (kind === undefined) {
			this.target.resetColor();
			return;
		}

		const style = this.styles[kind];
		const peak = style.strength ?? 0.5;
		const strength = style.pulseRate ? peak * (0.5 + 0.5 * Math.sin(this.elapsed * style.pulseRate * Math.PI * 2)) : peak;

		this.target.lerpTint(style.color, strength);
	}
}
