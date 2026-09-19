import { Container, Graphics } from 'pixi.js';
import * as Input from '../../core/Input.ts';
import type { Action } from '../../core/Input.ts';
import { Settings, type CustomSettingValue } from '../../core/Settings.ts';
import { Button } from './Button.ts';
import { Checkbox } from './Checkbox.ts';
import { Label } from './Label.ts';
import { RebindScreen } from './RebindScreen.ts';
import { Slider } from './Slider.ts';
import { Spinner } from './Spinner.ts';
import { theme, themeChanged } from './theme.ts';

/** one game-defined row over the `Settings` custom bag (`hints`, `violence`, ...) */
export type SettingsCustomRow =
	| { kind: 'boolean'; key: string; label: string }
	| { kind: 'number'; key: string; label: string; min: number; max: number; step?: number }
	| { kind: 'choice'; key: string; label: string; options: readonly [string, ...string[]] };

export interface SettingsScreenOptions {
	settings: Settings;
	width?: number;
	rowHeight?: number;

	/** English defaults; a game mapping these to translated strings overrides them */
	labels?: {
		music?: string;
		sfx?: string;
		muted?: string;
		zoom?: string;
		controls?: string;
		reset?: string;
		rebindHint?: string;
	};

	zoomMin?: number;
	zoomMax?: number;
	zoomStep?: number;

	/** game-defined rows appended after zoom, in order */
	custom?: readonly SettingsCustomRow[];

	/** which actions the controls page lists; the stored binding keys when omitted */
	actions?: readonly Action[];

	/** passed through to the controls page's `RebindScreen` */
	onConflict?: (key: string, action: Action, previousOwners: readonly Action[]) => boolean;
}

interface Row {
	id: string;
	root: Container;
	adjust(delta: number): void;
	activate(): void;
	refresh(): void;
}

/**
 * A ready-made settings screen over `core.Settings`: music and sound-effect sliders,
 * a mute checkbox, a zoom slider, one row per game-defined `custom` descriptor, a
 * controls page (`RebindScreen`), and a reset-to-defaults row. Every change writes
 * straight through to the `Settings` it was given, so there is no apply step and no
 * second persistence mechanism.
 *
 * Bindings captured on the controls page reach `Input` directly, bypassing `Settings`;
 * leaving the page writes them back into it, so a rebind survives a restart. `cancel` on
 * the main page is left to the caller (a `Window` closes, typically), reported as `false`.
 *
 * @example
 * ```ts
 * import { Settings } from '@datamoc/mw_games/core';
 * import { SettingsScreen } from '@datamoc/mw_games/two-d/ui';
 *
 * const settings = new Settings({ namespace: 'my-game' });
 * const screen = new SettingsScreen({
 * 	settings,
 * 	custom: [{ kind: 'boolean', key: 'hints', label: 'Hints' }],
 * });
 *
 * screen.handleAction('down');
 * console.log(screen.selectedRow); // 'sfx'
 * ```
 */
export class SettingsScreen extends Container {
	private readonly settings: Settings;
	private readonly width_: number;
	private readonly rowHeight: number;
	private readonly labels: Required<NonNullable<SettingsScreenOptions['labels']>>;
	private readonly zoomMin: number;
	private readonly zoomMax: number;
	private readonly zoomStep: number;
	private readonly customRows: readonly SettingsCustomRow[];
	private readonly actionsOption: readonly Action[] | undefined;
	private readonly onConflict: SettingsScreenOptions['onConflict'];

	private readonly highlight = new Graphics();
	private readonly main = new Container();
	private readonly rebindLayer = new Container();
	private rows: Row[] = [];
	private selected = 0;
	private rebind: RebindScreen | null = null;

	private readonly themeListener = () => this.drawHighlight();

	constructor(options: SettingsScreenOptions) {
		super();
		this.settings = options.settings;
		this.width_ = options.width ?? 320;
		this.rowHeight = options.rowHeight ?? 36;
		this.labels = {
			music: 'Music',
			sfx: 'Sound effects',
			muted: 'Mute',
			zoom: 'Zoom',
			controls: 'Controls...',
			reset: 'Reset to defaults',
			rebindHint: 'Keys (cancel: back)',
			...options.labels,
		};
		this.zoomMin = options.zoomMin ?? 0.5;
		this.zoomMax = options.zoomMax ?? 4;
		this.zoomStep = options.zoomStep ?? 0.25;
		this.customRows = options.custom ?? [];
		this.actionsOption = options.actions;
		this.onConflict = options.onConflict;

		this.addChild(this.highlight);
		this.addChild(this.main);
		this.addChild(this.rebindLayer);
		this.rebindLayer.visible = false;

		this.buildMain();
		this.refresh();
		this.drawHighlight();

		themeChanged.add(this.themeListener);
	}

	/** the selected main-page row: 'music', 'sfx', 'muted', 'zoom', `custom:${key}`, 'controls' or 'reset' */
	get selectedRow(): string {
		return this.rows[this.selected]?.id ?? '';
	}

	/** true while the controls (rebind) page is open */
	get isRebinding(): boolean {
		return this.rebind !== null;
	}

	/** @returns true when the action was used; `cancel` on the main page returns false */
	handleAction(action: Action): boolean {
		if (this.rebind) {
			if (action === 'cancel' && !this.rebind.isCapturing) {
				this.closeRebind();
				return true;
			}
			return this.rebind.handleAction(action);
		}

		const row = this.rows[this.selected];
		if (!row) return false;
		switch (action) {
			case 'up':
				this.select((this.selected + this.rows.length - 1) % this.rows.length);
				return true;
			case 'down':
				this.select((this.selected + 1) % this.rows.length);
				return true;
			case 'left':
				row.adjust(-1);
				return true;
			case 'right':
				row.adjust(1);
				return true;
			case 'confirm':
				row.activate();
				return true;
			default:
				return false;
		}
	}

	/** re-reads every row from `Settings`, for a screen kept alive while settings change elsewhere */
	refresh(): void {
		for (const row of this.rows) row.refresh();
	}

	private select(index: number): void {
		this.selected = index;
		this.drawHighlight();
	}

	private drawHighlight(): void {
		if (this.rows.length === 0) {
			this.highlight.clear();
			return;
		}
		this.highlight
			.clear()
			.rect(0, this.selected * this.rowHeight, this.width_, this.rowHeight)
			.fill({ color: theme().color.selection });
	}

	private buildMain(): void {
		const current = this.settings.current;
		this.addSliderRow('music', this.labels.music, 0, 100, 1, 10, Math.round(current.musicVolume * 100), (v) =>
			this.settings.setMusicVolume(v / 100),
		);
		this.addSliderRow('sfx', this.labels.sfx, 0, 100, 1, 10, Math.round(current.sfxVolume * 100), (v) =>
			this.settings.setSfxVolume(v / 100),
		);
		this.addToggleRow('muted', this.labels.muted, current.muted, (v) => this.settings.setMuted(v));
		this.addSliderRow(
			'zoom',
			this.labels.zoom,
			this.zoomMin,
			this.zoomMax,
			this.zoomStep,
			this.zoomStep,
			current.zoom,
			(v) => this.settings.setZoom(v),
		);
		for (const descriptor of this.customRows) this.addCustomRow(descriptor);
		this.addActionRow('controls', this.labels.controls, () => this.openRebind());
		this.addActionRow('reset', this.labels.reset, () => {
			this.settings.reset();
			this.refresh();
		});
		this.main.children.forEach((child, index) => {
			child.y = index * this.rowHeight;
		});
	}

	private addSliderRow(
		id: string,
		label: string,
		min: number,
		max: number,
		step: number,
		keyStep: number,
		initial: number,
		write: (value: number) => void,
	): void {
		const root = new Container();
		const caption = new Label({ text: label });
		caption.y = 10;
		const control = new Slider({ width: 140, min, max, step, value: initial });
		control.x = this.width_ - 148;
		control.y = 10;
		root.addChild(caption, control);
		this.main.addChild(root);

		const show = (): void => {
			caption.setText(`${label}: ${control.value}`);
		};
		show();
		control.onChange.add((value) => {
			write(value);
			show();
		});
		this.rows.push({
			id,
			root,
			adjust: (delta) => control.setValue(control.value + delta * keyStep),
			activate: () => {},
			refresh: () => {
				control.setValue(this.readSlider(id));
				show();
			},
		});
	}

	private readSlider(id: string): number {
		const current = this.settings.current;
		switch (id) {
			case 'music':
				return Math.round(current.musicVolume * 100);
			case 'sfx':
				return Math.round(current.sfxVolume * 100);
			case 'zoom':
				return current.zoom;
			default:
				return 0;
		}
	}

	private addToggleRow(id: string, label: string, initial: boolean, write: (value: boolean) => void): void {
		const root = new Container();
		const caption = new Label({ text: label });
		caption.y = 10;
		const control = new Checkbox({ checked: initial });
		control.x = this.width_ - 28;
		control.y = 8;
		root.addChild(caption, control);
		this.main.addChild(root);

		control.onChange.add(write);
		this.rows.push({
			id,
			root,
			adjust: () => control.toggle(),
			activate: () => control.toggle(),
			refresh: () => control.setChecked(this.readToggle(id)),
		});
	}

	private readToggle(id: string): boolean {
		if (id === 'muted') return this.settings.current.muted;
		return this.settings.getCustom(id.slice('custom:'.length), false) === true;
	}

	private addCustomRow(descriptor: SettingsCustomRow): void {
		const id = `custom:${descriptor.key}`;
		if (descriptor.kind === 'boolean') {
			const stored = this.settings.getCustom(descriptor.key, false);
			this.addToggleRow(id, descriptor.label, stored === true, (v) => this.settings.setCustom(descriptor.key, v));
		} else if (descriptor.kind === 'number') {
			const stored = this.settings.getCustom(descriptor.key, descriptor.min);
			const initial = typeof stored === 'number' ? stored : descriptor.min;
			const grid = descriptor.step ?? 0;
			const keyStep = grid > 0 ? grid : (descriptor.max - descriptor.min) / 20;
			const root = new Container();
			const caption = new Label({ text: descriptor.label });
			caption.y = 10;
			const control = new Slider({
				width: 140,
				min: descriptor.min,
				max: descriptor.max,
				step: descriptor.step ?? 0,
				value: initial,
			});
			control.x = this.width_ - 148;
			control.y = 10;
			root.addChild(caption, control);
			this.main.addChild(root);
			const show = (): void => {
				caption.setText(`${descriptor.label}: ${control.value}`);
			};
			show();
			control.onChange.add((value) => {
				this.settings.setCustom(descriptor.key, value);
				show();
			});
			this.rows.push({
				id,
				root,
				adjust: (delta) => control.setValue(control.value + delta * keyStep),
				activate: () => {},
				refresh: () => {
					const value = this.settings.getCustom(descriptor.key, descriptor.min);
					control.setValue(typeof value === 'number' ? value : descriptor.min);
					show();
				},
			});
		} else {
			const options = descriptor.options;
			const root = new Container();
			const caption = new Label({ text: descriptor.label });
			caption.y = 10;
			const control = new Spinner({ min: 0, max: options.length - 1, step: 1, value: 0, wrap: true });
			control.x = this.width_ - 32;
			control.y = 2;
			root.addChild(caption, control);
			this.main.addChild(root);
			const indexOf = (value: CustomSettingValue): number => {
				const index = typeof value === 'string' ? options.indexOf(value) : -1;
				return index >= 0 ? index : 0;
			};
			const show = (): void => {
				caption.setText(`${descriptor.label}: ${options[control.value]}`);
			};
			control.setValue(indexOf(this.settings.getCustom(descriptor.key, options[0])));
			show();
			control.onChange.add((index) => {
				this.settings.setCustom(descriptor.key, options[index]);
				show();
			});
			this.rows.push({
				id,
				root,
				adjust: (delta) => (delta > 0 ? control.increment() : control.decrement()),
				activate: () => control.increment(),
				refresh: () => {
					control.setValue(indexOf(this.settings.getCustom(descriptor.key, options[0])));
					show();
				},
			});
		}
	}

	private addActionRow(id: string, label: string, run: () => void): void {
		const root = new Container();
		const control = new Button({ width: this.width_ - 16, height: 28, text: label, onClick: run });
		control.x = 8;
		control.y = 4;
		root.addChild(control);
		this.main.addChild(root);
		this.rows.push({ id, root, adjust: () => {}, activate: run, refresh: () => {} });
	}

	private openRebind(): void {
		const actions = this.actionsOption ?? Object.keys(this.settings.current.bindings);
		const hint = new Label({ text: this.labels.rebindHint });
		const list = new RebindScreen({
			width: this.width_,
			height: Math.max(1, actions.length) * this.rowHeight,
			actions,
			onConflict: this.onConflict,
		});
		hint.y = 0;
		list.y = this.rowHeight;
		this.rebindLayer.addChild(hint, list);
		this.rebindLayer.visible = true;
		this.main.visible = false;
		this.highlight.visible = false;
		this.rebind = list;
	}

	private closeRebind(): void {
		//captures bypass Settings straight into Input, so sync them back on exit
		this.settings.setBindings(Input.exportBindings());
		this.rebindLayer.removeChildren();
		this.rebind?.destroy();
		this.rebind = null;
		this.rebindLayer.visible = false;
		this.main.visible = true;
		this.highlight.visible = true;
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		this.rebind?.destroy();
		this.rebind = null;
		super.destroy(options);
	}
}
