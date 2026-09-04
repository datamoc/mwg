import type { EffectClock } from './StatusEffect.ts';

export interface ItemStatusEffectOptions<T> {
	/** fields applied to the item for the duration, restored to their prior value on expiry */
	fields: Partial<T>;

	/** turns until the fields are restored */
	duration: number;

	/** called once per turn the effect is active, such as a poison coating's own tick */
	tick?: (turn: number) => void;
}

/** ends an `ItemStatusEffect` early, restoring the item's fields immediately rather than at expiry */
export interface ItemStatusEffectHandle {
	cancel(): void;
}

/**
 * A temporary status on an item itself - a weapon coated in poison for a fixed number of
 * turns, a shield reinforced until it wears off, a ring blessed only "for this floor" - the
 * item-targeted counterpart to `applyStatusEffect`, which only ever targets a `StatBlock`.
 * Today's item-level fields (`cursed`, `blessed`, `level`, `affix`) are all permanent until
 * a game explicitly changes them; this is what expires one instead.
 *
 * Applies `fields` onto `item`, remembering each field's prior value (not merely deleting
 * it), and restores exactly that value once `clock` expires the effect or `cancel()` is
 * called early - the same "never has to remember to remove what it added" guarantee
 * `applyStatusEffect` already gives a `StatBlock`.
 */
export function applyItemStatusEffect<T extends object>(
	item: T,
	clock: EffectClock,
	options: ItemStatusEffectOptions<T>
): ItemStatusEffectHandle {
	const previous = new Map<keyof T, T[keyof T]>();
	for (const key of Object.keys(options.fields) as (keyof T)[]) {
		previous.set(key, item[key]);
		item[key] = options.fields[key] as T[keyof T];
	}

	const restore = (): void => {
		for (const [key, value] of previous) item[key] = value;
	};

	const id = clock.add({
		duration: options.duration,
		tick: (turn) => options.tick?.(turn),
		onExpire: restore,
	});

	return {
		cancel: () => {
			clock.remove(id);
			restore();
		},
	};
}
