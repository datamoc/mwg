import { Container } from 'pixi.js';
import { Label } from './Label.ts';
import { theme } from './theme.ts';

/** how a message reads at a glance: routine, good news, bad news, a caution, or an emphasis */
export type MessageLevel = 'info' | 'positive' | 'negative' | 'warning' | 'highlight';

/** the default per-level text colours; `info` and `highlight` follow the active theme */
const LEVEL_COLORS = { positive: 0x55dd77, negative: 0xff5555, warning: 0xffb347 } as const;

/**
 * How many of the oldest entries to drop so the rest fit in `maxLines`. The budget is in
 * wrapped lines, not entries, so one long message costs the room of the several short ones
 * it is worth. The newest entry always stays, even when it alone is over budget.
 *
 * @example
 * ```ts
 * import { linesToDrop } from '@datamoc/mw_games/two-d/ui';
 *
 * console.log(linesToDrop([1, 2, 2], 3)); // 2 - the two oldest go, leaving one 2-line entry
 * ```
 */
export function linesToDrop(lineCounts: readonly number[], maxLines: number): number {
	let total = 0;
	for (const lines of lineCounts) total += lines;
	let dropped = 0;
	while (total > maxLines && dropped < lineCounts.length - 1) total -= lineCounts[dropped++];
	return dropped;
}

export interface MessageLogOptions {
	/** wrap width of each message, in pixels */
	wrapWidth: number;
	/** wrapped lines of history to keep; default 3 */
	maxLines?: number;
	/** text size; default the theme's */
	size?: number;
	/** overrides for the per-level colours */
	colors?: Partial<Record<MessageLevel, number>>;
	/** rasterisation resolution of every message, for a log drawn inside a zoomed container */
	resolution?: number;
}

/**
 * A player-facing message pane: each message is its own block, coloured by its level, and
 * the oldest blocks fall away once the wrapped lines pass `maxLines`. The classic
 * roguelike "you hit the rat" strip; a `Toast` is transient and a `Logger` is for
 * developers, this is neither.
 *
 * @example
 * ```ts
 * import { MessageLog } from '@datamoc/mw_games/two-d/ui';
 *
 * const log = new MessageLog({ wrapWidth: 200, maxLines: 4 });
 * log.add('You find a dewdrop.', 'positive');
 * log.add('You are starving.', 'negative');
 * console.log(log.entryCount); // 2
 * ```
 */
export class MessageLog extends Container {
	private readonly blocks: { label: Label; level: MessageLevel }[] = [];
	private readonly options: MessageLogOptions;
	private maxLines: number;

	constructor(options: MessageLogOptions) {
		super();
		this.options = options;
		this.maxLines = options.maxLines ?? 3;
	}

	get entryCount(): number {
		return this.blocks.length;
	}

	/** the drawn height of every block together, so a caller can sit the log on an edge */
	get contentHeight(): number {
		return this.blocks.reduce((height, block) => height + block.label.height, 0);
	}

	add(text: string, level: MessageLevel = 'info'): void {
		const label = new Label({
			text,
			size: this.options.size,
			color: this.colorOf(level),
			wrapWidth: this.options.wrapWidth,
			resolution: this.options.resolution,
		});
		this.addChild(label);
		this.blocks.push({ label, level });
		this.trim();
		this.layout();
	}

	setMaxLines(lines: number): void {
		this.maxLines = Math.max(1, Math.floor(lines));
		this.trim();
		this.layout();
	}

	setWrapWidth(width: number): void {
		this.options.wrapWidth = width;
		for (const block of this.blocks) block.label.style.wordWrapWidth = width;
		this.trim();
		this.layout();
	}

	clear(): void {
		for (const block of this.blocks.splice(0)) block.label.destroy();
	}

	private colorOf(level: MessageLevel): number {
		const own = this.options.colors?.[level];
		if (own !== undefined) return own;
		if (level === 'info') return theme().color.text;
		if (level === 'highlight') return theme().color.textHighlight;
		return LEVEL_COLORS[level];
	}

	private linesOf(label: Label): number {
		//Pixi measures the wrapped text; its height over the line height is the line count
		const lineHeight = Number(label.style.lineHeight) || Number(label.style.fontSize) || 1;
		return Math.max(1, Math.round(label.height / lineHeight));
	}

	private trim(): void {
		const drop = linesToDrop(
			this.blocks.map((block) => this.linesOf(block.label)),
			this.maxLines,
		);
		for (const block of this.blocks.splice(0, drop)) block.label.destroy();
	}

	private layout(): void {
		let y = 0;
		for (const block of this.blocks) {
			block.label.position.set(0, y);
			y += block.label.height;
		}
	}
}
