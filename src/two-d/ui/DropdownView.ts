import { Container } from 'pixi.js';
import { Button } from './Button.ts';
import { Dropdown, type DropdownOptions } from './Dropdown.ts';

export interface DropdownViewOptions extends DropdownOptions {
	width: number;
	/** the height of the closed button and of each row of the open list; 28 when omitted */
	rowHeight?: number;
}

/**
 * The widget for a `Dropdown` model: a button showing the current choice that opens a column
 * of buttons beneath it, the chosen row marked with `Button.setSelected`. Picking a row
 * selects it, closes the list and fires the model's `onChange`; clicking the closed button
 * again closes it.
 *
 * The list is drawn in this container's own space below the button, so a game places the view
 * where the closed button should sit and keeps it above its siblings when it is open.
 *
 * @example
 * ```ts
 * import { DropdownView } from '@datamoc/mw_games/two-d/ui';
 *
 * const level = new DropdownView({
 * 	width: 180,
 * 	options: [{ label: 'Level 1' }, { label: 'Level 2' }],
 * });
 * level.model.onChange.add(({ index }) => console.log('chose', index));
 * level.model.open();
 * level.refresh();
 * ```
 */
export class DropdownView extends Container {
	readonly model: Dropdown;
	private readonly width_: number;
	private readonly rowHeight: number;
	private readonly head: Button;
	private readonly list = new Container();

	constructor(options: DropdownViewOptions) {
		super();
		this.model = new Dropdown(options);
		this.width_ = options.width;
		this.rowHeight = options.rowHeight ?? 28;
		this.head = new Button({
			width: this.width_,
			height: this.rowHeight,
			text: '',
			disabled: this.model.disabled,
			onClick: () => {
				this.model.toggleOpen();
				this.refresh();
			},
		});
		this.list.y = this.rowHeight;
		this.addChild(this.head, this.list);
		this.refresh();
	}

	/** redraws the closed label and the open list from the model; call after changing the model directly */
	refresh(): void {
		const model = this.model;
		this.head.setText(`${model.selected?.label ?? ''} ▾`);
		this.head.setDisabled(model.disabled);
		for (const child of this.list.removeChildren()) child.destroy({ children: true });
		this.list.visible = model.isOpen;
		if (!model.isOpen) return;
		model.options.forEach((option, index) => {
			const row = new Button({
				width: this.width_,
				height: this.rowHeight,
				text: option.label,
				disabled: option.disabled,
				onClick: () => {
					model.setHighlight(index);
					model.confirm();
					this.refresh();
				},
			});
			row.y = index * this.rowHeight;
			row.setSelected(index === model.selectedIndex);
			this.list.addChild(row);
		});
	}
}
