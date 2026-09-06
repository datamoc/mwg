import { Container } from 'pixi.js';
import { Label } from './Label.ts';

export interface StatRow {
	label: string;
	value: string;
}

export interface StatsScreenOptions {
	width: number;
	stats: readonly StatRow[];
}

/**
 * A read-only "your stats" display: one `label: value` line per `StatRow`, over the same
 * `Label` every other screen already builds from - a recipe, not a new primitive, the way
 * `HelpScreen` composes `ListView`/`Label` rather than inventing its own row widget. No
 * navigation or selection here: a stats readout has nothing to pick, unlike `HelpScreen`'s
 * topic list, so this is just a `Label` wrapping a game's own aggregate (`core.PlayerStats`,
 * typically) formatted into rows.
 */
export class StatsScreen extends Container {
	private text: Label;

	constructor(options: StatsScreenOptions) {
		super();
		this.text = new Label({ text: StatsScreen.format(options.stats), wrapWidth: options.width });
		this.addChild(this.text);
	}

	/** replaces every row, for a screen kept alive while its stats keep changing */
	setStats(stats: readonly StatRow[], width?: number): void {
		this.text.setText(StatsScreen.format(stats));
		if (width !== undefined) this.text.style.wordWrapWidth = width;
	}

	private static format(stats: readonly StatRow[]): string {
		return stats.map((row) => `${row.label}: ${row.value}`).join('\n');
	}
}
