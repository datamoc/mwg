/**
 * A named lookup of values, registered once and read back by name - the shape underneath a
 * catalog of factories, handlers, or scene sections, so a game can grow that catalog by
 * registering another entry instead of adding another branch to a hand-written `if`/`switch`.
 *
 * Deliberately does not discover or import anything on its own: a game still writes the
 * import and the `register` call for each entry itself, the same explicit-import style
 * `core`/`two-d` already use throughout - this only replaces the dispatch step after that,
 * not the wiring step before it.
 *
 * @example
 * ```ts
 * import { Registry } from '@datamoc/mw_games/core';
 *
 * const commands = new Registry<(args: string[]) => void>();
 * commands.register('heal', (args) => console.log('healing', args[0]));
 *
 * commands.get('heal')(['fireling']); // "healing fireling"
 * commands.get('missing'); // throws: no registration named "missing"
 * ```
 */
export class Registry<T> {
	private items = new Map<string, T>();

	/** throws if `name` is already registered - a duplicate is always an authoring error */
	register(name: string, value: T): void {
		if (this.items.has(name)) throw new Error(`"${name}" is already registered`);
		this.items.set(name, value);
	}

	get(name: string): T {
		const value = this.items.get(name);
		if (value === undefined) throw new Error(`no registration named "${name}"`);
		return value;
	}

	has(name: string): boolean {
		return this.items.has(name);
	}

	/** every registered name, in registration order */
	list(): string[] {
		return [...this.items.keys()];
	}
}
