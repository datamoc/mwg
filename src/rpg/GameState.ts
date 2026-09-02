/**
 * Global switches and variables - the two pieces of state an RPG's events read and write
 * most, kept as plain maps rather than anything fancier so `mwg/core`'s eventual save
 * system (see the roadmap) can serialise them like any other plain data.
 */
export class GameState {
	private switches = new Map<string, boolean>();
	private variables = new Map<string, number>();

	switch(name: string): boolean {
		return this.switches.get(name) ?? false;
	}

	setSwitch(name: string, value: boolean): void {
		this.switches.set(name, value);
	}

	variable(name: string): number {
		return this.variables.get(name) ?? 0;
	}

	setVariable(name: string, value: number): void {
		this.variables.set(name, value);
	}

	toJSON(): { switches: [string, boolean][]; variables: [string, number][] } {
		return { switches: [...this.switches], variables: [...this.variables] };
	}

	static fromJSON(data: { switches: [string, boolean][]; variables: [string, number][] }): GameState {
		const state = new GameState();
		for (const [name, value] of data.switches) state.setSwitch(name, value);
		for (const [name, value] of data.variables) state.setVariable(name, value);
		return state;
	}
}
