/**
 * A list of listeners that can consume an event.
 *
 * Unlike a DOM event, a listener returning `true` stops the dispatch. Input handling in a
 * roguelike needs that: a modal window has to be able to swallow a keypress before the map
 * below it sees it.
 */
export type SignalListener<T> = (value: T) => boolean | void;

export class Signal<T> {
	private listeners: SignalListener<T>[] = [];
	private readonly stackMode: boolean;

	/**
	 * @param stackMode when true, new listeners are added at the front rather than the
	 * back, so the most recently opened window is offered the event first.
	 */
	constructor(stackMode = false) {
		this.stackMode = stackMode;
	}

	add(listener: SignalListener<T>): void {
		if (!this.listeners.includes(listener)) {
			if (this.stackMode) this.listeners.unshift(listener);
			else this.listeners.push(listener);
		}
	}

	remove(listener: SignalListener<T>): void {
		const i = this.listeners.indexOf(listener);
		if (i !== -1) this.listeners.splice(i, 1);
	}

	removeAll(): void {
		this.listeners.length = 0;
	}

	get size(): number {
		return this.listeners.length;
	}

	/** @returns true if a listener consumed the event */
	dispatch(value: T): boolean {
		//iterating a copy lets a listener remove itself, or others, mid-dispatch
		const snapshot = this.listeners.slice();
		for (const listener of snapshot) {
			if (this.listeners.includes(listener) && listener(value) === true) {
				return true;
			}
		}
		return false;
	}
}
