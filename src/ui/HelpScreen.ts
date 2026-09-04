import { Container } from 'pixi.js';
import type { Action } from '../core/Input.ts';
import { ListView } from './ListView.ts';
import { Label } from './Label.ts';
import { theme } from './theme.ts';

export interface HelpTopic {
	title: string;
	body: string;
}

export interface HelpScreenOptions {
	width: number;
	height: number;
	topics: readonly HelpTopic[];

	/** how much of `width` the topic list takes; the body fills the rest. Defaults to a third */
	listWidth?: number;
}

/**
 * A controls-reference or FAQ screen: a list of topics and the body of whichever one is
 * highlighted, over the same `ListView`/`Label` a game already builds every other menu
 * from - a recipe, not a new primitive, the way `RebindScreen` composes `ListView` rather
 * than inventing its own row widget.
 */
export class HelpScreen extends Container {
	private list: ListView;
	private body: Label;
	private topics: readonly HelpTopic[];

	constructor(options: HelpScreenOptions) {
		super();
		this.topics = options.topics;

		const listWidth = options.listWidth ?? Math.floor(options.width / 3);
		const bodyLeft = listWidth + theme().spacing;

		this.list = new ListView({
			width: listWidth,
			height: options.height,
			items: this.topics.map((topic) => ({ text: topic.title })),
			onHighlight: (_item, index) => this.showBody(index),
			onSelect: (_item, index) => this.showBody(index),
		});
		this.addChild(this.list);

		this.body = new Label({ wrapWidth: options.width - bodyLeft });
		this.body.x = bodyLeft;
		this.addChild(this.body);

		if (this.topics.length > 0) this.showBody(this.list.selectedIndex);
	}

	private showBody(index: number): void {
		this.body.setText(this.topics[index]?.body ?? '');
	}

	/** @returns true when the action was used */
	handleAction(action: Action): boolean {
		return this.list.handleAction(action);
	}
}
