import { Text, TextStyle } from 'pixi.js';
import { theme } from './theme.ts';

export interface LabelOptions {
	text?: string;
	color?: number;
	size?: number;
	/** wraps at this width in pixels; omit for a single unwrapped line */
	wrapWidth?: number;
	align?: 'left' | 'center' | 'right';
	bold?: boolean;
}

/**
 * A piece of text, styled from the theme.
 *
 * This is a thin wrapper over Pixi's `Text`, and its job is to stop every call site from
 * repeating a style object. Pixi renders text to its own texture, so changing the string
 * costs a re-render: cheap enough for a label, wasteful for something updated every
 * frame, where a value that only changes on whole numbers should be guarded.
 */
export class Label extends Text {
	constructor(options: LabelOptions | string = {}) {
		const opts = typeof options === 'string' ? { text: options } : options;
		const t = theme();

		super({
			text: opts.text ?? '',
			style: new TextStyle({
				fontFamily: t.font.family,
				fontSize: opts.size ?? t.font.size,
				fontWeight: opts.bold ? 'bold' : 'normal',
				fill: opts.color ?? t.color.text,
				lineHeight: (opts.size ?? t.font.size) * t.font.lineHeight,
				align: opts.align ?? (t.direction === 'rtl' ? 'right' : 'left'),
				wordWrap: opts.wrapWidth !== undefined,
				wordWrapWidth: opts.wrapWidth ?? 0,
				//without this a long unbroken word overflows its window instead of wrapping
				breakWords: true,
			}),
		});
	}

	/** changes the colour without rebuilding the style object */
	setColor(color: number): void {
		this.style.fill = color;
	}

	/** avoids the re-render when the text has not actually changed */
	setText(value: string): void {
		if (this.text !== value) this.text = value;
	}
}
