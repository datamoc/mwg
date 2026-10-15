import { Container, Graphics, Sprite } from 'pixi.js';
import * as Input from '../../core/Input.ts';
import { texture } from '../../assets/loader.ts';
import { Camera } from '../render/Camera.ts';
import { Button } from '../ui/Button.ts';
import { Label } from '../ui/Label.ts';
import { Bar } from '../ui/Bar.ts';
import { Window } from '../ui/Window.ts';
import { WindowStack } from '../ui/WindowStack.ts';
import { Grid, flowLayout, resolveAnchor, type LayoutRect } from '../ui/Layout.ts';
import { setTheme, theme, type Theme } from '../ui/theme.ts';
import type {
	CompiledPresentation,
	PresentationItem,
	PresentationNode,
	PresentationProperties,
	PresentationValue,
} from '../../mwl/presentation.ts';

/** Fallback widget sizes, shared by construction and layout so the two cannot drift. */
const DEFAULT_BUTTON_WIDTH = 160;
const DEFAULT_BUTTON_HEIGHT = 32;
const DEFAULT_BAR_HEIGHT = 12;
const DEFAULT_WINDOW_WIDTH = 300;
const DEFAULT_WINDOW_HEIGHT = 200;

export type PresentationState = Readonly<Record<string, PresentationValue | readonly PresentationItem[]>>;
export interface PresentationAdapterContext {
	readonly tokens: Readonly<Record<string, number>>;
	readonly properties: PresentationProperties;
}
/** Runtime owns and destroys `view`; destroy detaches adapter-owned subscriptions/resources. */
export interface PresentationAdapter {
	readonly view: Container;
	update?(dt: number, state: PresentationState): void;
	resize?(width: number, height: number): void;
	restyle?(context: PresentationAdapterContext): void;
	destroy?(): void;
}
export interface PresentationRuntimeOptions {
	readonly parent: Container;
	readonly state: () => PresentationState;
	readonly actions: Readonly<Record<string, (item?: PresentationItem) => void>>;
	readonly adapters?: Readonly<Record<string, (context: PresentationAdapterContext) => PresentationAdapter>>;
	readonly translate?: (message: string) => string;
	/** Optional external notification; returned disposer is called at destruction. */
	readonly subscribe?: (refresh: () => void) => () => void;
}
interface MountedNode {
	readonly definition: PresentationNode;
	readonly path: string;
	readonly parent: Container;
	view: Container | null;
	children: MountedNode[];
	item?: PresentationItem;
	adapter?: PresentationAdapter;
	background?: Graphics;
	image?: Sprite;
	properties: Record<string, string>;
	values: Record<string, PresentationValue>;
	width: number;
	height: number;
	state: string;
	closed: boolean;
	cleanups: Array<() => void>;
}

/**
 * Instantiates compiled MWL presentation using existing Pixi widgets. The controller owns state
 * and actions; context switches restyle the same views without rebuilding procedural adapters.
 * Kept off the root barrel so a game pays for this runtime only when it imports the subpath.
 *
 * @example
 * ```ts
 * import { MwlPresentation } from '@datamoc/mw_games/two-d/presentation';
 * import type { CompiledPresentation } from '@datamoc/mw_games/mwl/presentation';
 * import { Node2D } from '@datamoc/mw_games/two-d/render';
 * declare const data: CompiledPresentation;
 * const ui = new MwlPresentation(data, 'game', { parent: new Node2D(), state: () => ({}), actions: {} });
 * ui.resize(800, 600);
 * ui.update(1 / 60);
 * ui.destroy();
 * ```
 */
export class MwlPresentation<Id extends string = string> {
	private readonly data: CompiledPresentation;
	private readonly options: PresentationRuntimeOptions;
	readonly root = new Container();
	readonly windows: WindowStack;
	readonly camera: Camera;
	private readonly nodes = new Map<string, MountedNode>();
	private readonly roots: MountedNode[] = [];
	private readonly baseTheme: string;
	private readonly cameraProperties: PresentationProperties;
	private readonly cameraPath: string | null;
	private readonly previousTheme: Theme;
	private appliedTheme: Theme | null = null;
	private context = '';
	private tokens: Readonly<Record<string, number>> = {};
	private viewport = { width: 0, height: 0 };
	private focused: MountedNode | null = null;
	private destroyed = false;
	private unsubscribe?: () => void;
	private state: PresentationState = {};
	private readonly inputListener = (action: string) => this.handleAction(action);

	constructor(data: CompiledPresentation, sceneId: string, options: PresentationRuntimeOptions) {
		this.data = data;
		this.options = options;
		if (!Object.hasOwn(data.scenes, sceneId)) throw new Error(`unknown presentation scene "${sceneId}"`);
		const scene = data.scenes[sceneId];
		for (const action of data.manifest.actions)
			if (!Object.hasOwn(options.actions, action)) throw new Error(`missing presentation action "${action}"`);
		for (const adapter of data.manifest.adapters ?? [])
			if (!options.adapters || !Object.hasOwn(options.adapters, adapter))
				throw new Error(`missing presentation adapter "${adapter}"`);
		this.baseTheme = scene.theme;
		this.previousTheme = theme();
		const cameraNode = scene.children.find((node) => node.kind === 'scene_camera');
		this.cameraProperties = cameraNode?.properties ?? {};
		this.cameraPath = cameraNode ? `${sceneId}/${cameraNode.id}` : null;
		this.camera = new Camera({ zoom: Number(cameraNode?.properties.zoom ?? 1) });
		this.camera.snapTo(Number(cameraNode?.properties.x ?? 0), Number(cameraNode?.properties.y ?? 0));
		this.windows = new WindowStack();
		this.root.addChild(this.camera.world);
		options.parent.addChild(this.root);
		try {
			this.applyTheme();
			for (const node of scene.children) {
				if (node.kind === 'scene_camera') continue;
				const parent =
					node.kind === 'scene_layer' && node.properties.space === 'world' ? this.camera.world : this.root;
				this.roots.push(this.createRecord(node, `${sceneId}/${node.id}`, parent));
			}
			this.root.addChild(this.windows);
			Input.onAction.add(this.inputListener);
			this.update();
			this.unsubscribe = options.subscribe?.(() => this.update());
		} catch (error) {
			this.destroy();
			throw error;
		}
	}

	/** Looks up an instance by its compiled path; repeats add their stable key to the path. */
	get(id: Id): Container | null {
		if (!this.destroyed && id === this.cameraPath) return this.camera.world;
		return this.nodes.get(id)?.view ?? null;
	}
	get focusId(): string | null {
		return this.focused?.path ?? null;
	}
	get activeContext(): string {
		return this.context;
	}
	get palette(): Readonly<Record<string, number>> {
		return this.tokens;
	}

	setContext(context = ''): void {
		this.assertAlive();
		if (context && !Object.hasOwn(this.data.contexts, context))
			throw new Error(`unknown presentation context "${context}"`);
		if (context === this.context) return;
		this.context = context;
		this.applyTheme();
		for (const node of this.nodes.values()) node.values = {};
		this.update();
	}

	private applyTheme(): void {
		const context = this.data.contexts[this.context];
		const definition = this.data.themes[context?.theme ?? this.baseTheme];
		this.tokens = { ...definition.tokens, ...context?.tokens };
		const props = definition.properties;
		setTheme({
			...this.previousTheme,
			padding: Number(props.padding ?? this.previousTheme.padding),
			spacing: Number(props.spacing ?? this.previousTheme.spacing),
			font: {
				...this.previousTheme.font,
				family: props.font_family ?? this.previousTheme.font.family,
				size: Number(props.font_size ?? this.previousTheme.font.size),
			},
			color: {
				...this.previousTheme.color,
				panelFill: this.tokens.panel,
				text: this.tokens.text,
				textHighlight: this.tokens.accent,
				selection: this.tokens.selection,
			},
		});
		this.appliedTheme = theme();
	}

	update(dt = 0): void {
		this.assertAlive();
		this.state = this.options.state();
		let changed = false;
		for (const node of this.roots) changed = this.refresh(node) || changed;
		if (this.root.children[this.root.children.length - 1] !== this.windows)
			this.root.setChildIndex(this.windows, this.root.children.length - 1);
		if (changed) this.layout();
		for (const node of this.nodes.values()) node.adapter?.update?.(dt, this.state);
		this.camera.update(dt);
		this.windows.update(dt);
		const window = this.windows.top
			? [...this.nodes.values()].find((node) => node.view === this.windows.top)
			: undefined;
		const candidates = this.focusable(window);
		if (!this.focused || !candidates.includes(this.focused)) this.setFocus(candidates[0] ?? null);
	}

	resize(width: number, height: number): void {
		this.assertAlive();
		if (![width, height].every((size) => Number.isFinite(size) && size >= 0))
			throw new Error('presentation viewport must be finite and nonnegative');
		this.viewport = { width, height };
		this.camera.setViewport(width, height);
		if (this.cameraProperties.fit_width)
			this.camera.fit(Number(this.cameraProperties.fit_width), Number(this.cameraProperties.fit_height));
		this.windows.setViewport(width, height);
		this.layout();
	}

	private createRecord(
		definition: PresentationNode,
		path: string,
		parent: Container,
		item?: PresentationItem,
	): MountedNode {
		const node: MountedNode = {
			definition,
			path,
			parent,
			item,
			view: null,
			children: [],
			properties: {},
			values: {},
			width: 0,
			height: 0,
			state: 'idle',
			closed: false,
			cleanups: [],
		};
		if (this.nodes.has(path)) throw new Error(`duplicate presentation path "${path}"`);
		this.nodes.set(path, node);
		return node;
	}

	private read(node: MountedNode, name: string, fallback: PresentationValue): PresentationValue {
		const binding = node.definition.properties[`${name}_binding`];
		if (!binding)
			return node.definition.properties[name] === undefined
				? fallback
				: this.coerce(node.definition.properties[name], typeof fallback);
		const value = binding.startsWith('item.') ? node.item?.[binding.slice(5)] : this.state[binding];
		if (typeof value !== typeof fallback || (typeof value === 'number' && !Number.isFinite(value)))
			throw new Error(`${node.path}: invalid binding "${binding}"`);
		return value as PresentationValue;
	}
	private coerce(value: string, type: string): PresentationValue {
		if (type === 'number') return Number(value);
		if (type === 'boolean') return value === 'true';
		return value;
	}
	private resolveProperties(node: MountedNode): Record<string, string> {
		const base = node.definition.properties;
		return {
			...base,
			...this.data.contexts[this.context]?.overrides[node.definition.source],
			...this.data.variants[base.variant],
			...node.definition.states[node.state],
		};
	}

	private refresh(node: MountedNode): boolean {
		const visible = this.read(node, 'visible', true) as boolean;
		if (!visible) node.closed = false;
		if (node.definition.kind === 'ui_window' && (!visible || node.closed)) {
			const changed = Boolean(node.view);
			if (node.view) this.unmount(node);
			return changed;
		}
		let changed = false;
		if (!node.view) {
			this.mount(node);
			changed = true;
		}
		const view = this.viewOf(node);
		if (view.visible !== visible) {
			view.visible = visible;
			changed = true;
		}
		if (view instanceof Button) changed = this.refreshButton(node, view) || changed;
		const properties = this.resolveProperties(node);
		if (!equalProperties(node.properties, properties)) {
			node.properties = properties;
			changed = true;
		}
		const values = this.readValues(node, properties, visible);
		if (!equalProperties(node.values, values)) {
			node.values = values;
			changed = true;
		}
		if (changed) this.applyProperties(node);
		if (node.definition.kind === 'ui_repeat') changed = this.reconcile(node) || changed;
		for (const child of node.children) {
			child.item = node.item ?? child.item;
			changed = this.refresh(child) || changed;
		}
		return changed;
	}

	private refreshButton(node: MountedNode, view: Button): boolean {
		let changed = false;
		const disabled = this.read(node, 'disabled', false) as boolean;
		const selected = this.read(node, 'selected', false) as boolean;
		if (disabled !== view.disabled) {
			view.setDisabled(disabled);
			changed = true;
		}
		if (selected !== view.selected) {
			view.setSelected(selected);
			changed = true;
		}
		if (disabled) node.state = 'disabled';
		else if (selected) node.state = 'selected';
		else if (node === this.focused) node.state = 'focused';
		else if (['disabled', 'selected', 'focused'].includes(node.state)) node.state = 'idle';
		return changed;
	}

	private readValues(
		node: MountedNode,
		properties: PresentationProperties,
		visible: boolean,
	): Record<string, PresentationValue> {
		const view = this.viewOf(node);
		const values: Record<string, PresentationValue> = { visible, alpha: Number(properties.alpha ?? 1) };
		if (view instanceof Button || view instanceof Label) values.text = this.read(node, 'text', '');
		if (view instanceof Window) values.title = this.read(node, 'title', '');
		if (view instanceof Bar) {
			values.value = this.read(node, 'value', 1);
			values.max = this.read(node, 'max', 1);
			values.color = this.read(node, 'color', this.token(properties.color_token, 'accent'));
		}
		return values;
	}

	private viewOf(node: MountedNode): Container {
		const view = node.view;
		if (!view) throw new Error(`${node.path}: missing view`);
		return view;
	}

	private mount(node: MountedNode): void {
		const props = this.resolveProperties(node);
		const width = Number(props.width ?? DEFAULT_BUTTON_WIDTH),
			height = Number(props.height ?? DEFAULT_BUTTON_HEIGHT);
		switch (node.definition.kind) {
			case 'ui_label':
				node.view = new Label({ text: '', color: this.token(props.color_token, 'text') });
				break;
			case 'ui_button':
				node.view = new Button({ width, height, text: '' });
				break;
			case 'ui_bar':
				node.view = new Bar({ width, height: Number(props.height ?? DEFAULT_BAR_HEIGHT) });
				break;
			case 'ui_window':
				node.view = new Window({
					width: Number(props.width ?? DEFAULT_WINDOW_WIDTH),
					height: Number(props.height ?? DEFAULT_WINDOW_HEIGHT),
					title: '',
					modal: props.modal !== 'false',
					closable: props.closable !== 'false',
					closeButton: true,
					blocker: true,
					anchor: (props.anchor ?? 'center') as 'center' | 'top' | 'bottom',
				});
				break;
			default: {
				if (props.adapter) {
					const adapters = this.options.adapters;
					const create =
						adapters && Object.hasOwn(adapters, props.adapter) ? adapters[props.adapter] : undefined;
					if (!create) throw new Error(`${node.path}: missing presentation adapter "${props.adapter}"`);
					node.adapter = create({ tokens: this.tokens, properties: props });
					node.view = node.adapter.view;
				} else node.view = new Container();
			}
		}
		node.parent.addChild(node.view);
		const childParent = node.view instanceof Window ? node.view.content : node.view;
		if (node.definition.kind !== 'ui_repeat')
			for (const child of node.definition.children)
				node.children.push(this.createRecord(child, `${node.path}/${child.id}`, childParent, node.item));
		if (node.view instanceof Button) this.wireButton(node, node.view);
		if (node.view instanceof Window) this.wireWindow(node, node.view);
	}

	private wireButton(node: MountedNode, button: Button): void {
		const click = () => {
			this.setFocus(node);
			this.invoke(node.definition.properties.action, node.item);
			if (!this.destroyed) this.update();
		};
		button.onClick.add(click);
		node.cleanups.push(() => button.onClick.remove(click));
		for (const [event, state] of [
			['pointerover', 'hover'],
			['pointerout', 'idle'],
			['pointerdown', 'pressed'],
			['pointerup', 'hover'],
		] as const) {
			const listener = () => {
				node.state = state;
				this.update();
			};
			button.on(event, listener);
			node.cleanups.push(() => button.off(event, listener));
		}
	}

	private wireWindow(node: MountedNode, window: Window): void {
		window.delegate = { handleAction: (action) => this.navigate(action, node) };
		const close = () => {
			node.closed = true;
			this.unmount(node, false);
			this.invoke(node.definition.properties.close_action, node.item);
		};
		window.onClose.add(close);
		node.cleanups.push(() => window.onClose.remove(close));
		this.windows.push(window);
	}

	private reconcile(node: MountedNode): boolean {
		const p = node.definition.properties;
		const items = this.state[p.items_binding];
		if (!Array.isArray(items)) throw new Error(`${node.path}: collection "${p.items_binding}" must be an array`);
		const keys = new Set<string>();
		for (const item of items) {
			const key = item[p.key];
			if (
				(typeof key !== 'string' && typeof key !== 'number') ||
				(typeof key === 'number' && !Number.isFinite(key))
			)
				throw new Error(`${node.path}: invalid repeat key`);
			const path = `${node.path}/${encodeURIComponent(String(key))}`;
			if (keys.has(path)) throw new Error(`${node.path}: duplicate repeat key "${key}"`);
			keys.add(path);
		}
		const existing = new Map(
			node.children.map((child) => [child.path.slice(0, child.path.lastIndexOf('/')), child]),
		);
		const next: MountedNode[] = [];
		let changed = false;
		for (const item of items) {
			const prefix = `${node.path}/${encodeURIComponent(String(item[p.key]))}`;
			const template = node.definition.children[0];
			const child =
				existing.get(prefix) ??
				this.createRecord(template, `${prefix}/${template.id}`, this.viewOf(node), item);
			if (!existing.has(prefix)) changed = true;
			existing.delete(prefix);
			child.item = item;
			next.push(child);
		}
		for (const child of existing.values()) {
			this.dispose(child);
			changed = true;
		}
		if (next.some((child, i) => child !== node.children[i])) changed = true;
		node.children = next;
		return changed;
	}

	private token(name: string | undefined, fallback: string): number {
		return this.tokens[name ?? fallback];
	}
	private applyProperties(node: MountedNode): void {
		const view = this.viewOf(node),
			props = node.properties,
			values = node.values;
		view.alpha = values.alpha as number;
		if (node.definition.kind === 'scene_layer' && !node.adapter) {
			if (props.image) {
				if (!node.image) {
					node.image = new Sprite(texture(props.image));
					view.addChildAt(node.image, 0);
				} else node.image.texture = texture(props.image);
			} else {
				node.image?.destroy();
				node.image = undefined;
			}
		}
		if (
			['ui_container', 'ui_row', 'ui_column', 'ui_grid', 'ui_mount', 'ui_repeat'].includes(node.definition.kind)
		) {
			if (props.background_token && !node.background) {
				node.background = new Graphics();
				view.addChildAt(node.background, 0);
			} else if (!props.background_token && node.background) {
				node.background.destroy();
				node.background = undefined;
			}
		}
		const translate = this.options.translate ?? ((text: string) => text);
		if (view instanceof Label) {
			view.setText(translate(values.text as string));
			view.setColor(this.token(props.color_token, 'text'));
		}
		if (view instanceof Button) {
			view.setText(translate(values.text as string));
			view.setColors({
				text: this.token(props.color_token, 'text'),
				disabledText: this.token(props.color_token, 'text'),
				background: this.token(props.background_token, 'panel'),
				border: this.token(props.border_token, 'accent'),
				selection: node.definition.states[node.state]?.background_token
					? this.token(props.background_token, 'selection')
					: this.tokens.selection,
			});
		}
		if (view instanceof Bar) {
			view.setValue(values.value as number, values.max as number);
			view.setColor(values.color as number);
			view.setBackground(this.token(props.background_token, 'panel'));
		}
		if (view instanceof Window) {
			view.setTitle(translate(values.title as string));
			view.setColors({
				background: this.token(props.background_token, 'panel'),
				border: this.token(props.border_token, 'accent'),
				title: this.token(props.color_token, 'accent'),
			});
		}
		node.adapter?.restyle?.({ tokens: this.tokens, properties: props });
	}

	private isVisible(node: MountedNode): node is MountedNode & { view: Container } {
		return Boolean(node.view?.visible);
	}

	private layout(): void {
		const bounds = { x: 0, y: 0, ...this.viewport };
		for (const node of this.roots)
			this.layoutNode(
				node,
				node.parent === this.camera.world
					? { ...bounds, width: this.camera.view.width, height: this.camera.view.height }
					: bounds,
			);
		this.windows.setViewport(this.viewport.width, this.viewport.height);
	}
	private layoutNode(node: MountedNode, bounds: LayoutRect): void {
		const view = node.view;
		if (!view || !view.visible) return;
		const { width, height: measured } = this.measureNode(node, view, bounds);
		const props = node.properties;
		const padding = Number(props.padding ?? 0),
			gap = Number(props.gap ?? 0);
		const inner = {
			x: 0,
			y: 0,
			width: Math.max(0, width - padding * 2),
			height: Math.max(0, measured - padding * 2),
		};
		if (view instanceof Window) {
			inner.width = view.contentWidth;
			inner.height = view.contentHeight;
		}
		const visible = node.children.filter((child) => this.isVisible(child));
		for (const child of visible) this.layoutNode(child, inner);
		const auto = this.placeChildren(node, visible, inner, padding, gap);
		const height = auto ?? measured;
		node.width = width;
		node.height = height;
		this.paintNode(node, width, height);
		this.anchorNode(node, view, bounds, width, height);
		node.adapter?.resize?.(width, height);
	}

	private measureNode(node: MountedNode, view: Container, bounds: LayoutRect): { width: number; height: number } {
		const props = node.properties;
		const defaultWidth = view instanceof Button || view instanceof Bar ? DEFAULT_BUTTON_WIDTH : bounds.width;
		let width = Math.min(Number(props.width ?? defaultWidth), bounds.width);
		let height = Number(props.height ?? this.defaultHeight(view, bounds));
		if (view instanceof Window) {
			width = Math.max(
				0,
				Math.min(Number(props.width ?? DEFAULT_WINDOW_WIDTH), this.viewport.width - theme().padding * 2),
			);
			height = Math.max(
				0,
				Math.min(Number(props.height ?? DEFAULT_WINDOW_HEIGHT), this.viewport.height - theme().padding * 2),
			);
			view.resize(width, height);
		} else if (view instanceof Button || view instanceof Bar) view.resize(width, height);
		else if (view instanceof Label) {
			view.setWrapWidth(width);
			height = view.height;
		}
		return { width, height };
	}

	private defaultHeight(view: Container, bounds: LayoutRect): number {
		if (view instanceof Button) return DEFAULT_BUTTON_HEIGHT;
		if (view instanceof Bar) return DEFAULT_BAR_HEIGHT;
		if (view instanceof Label) return view.height;
		return bounds.height;
	}

	/** Positions visible children; returns the content height when the node sizes to fit. */
	private placeChildren(
		node: MountedNode,
		visible: Array<MountedNode & { view: Container }>,
		inner: LayoutRect,
		padding: number,
		gap: number,
	): number | undefined {
		const props = node.properties;
		const kind = node.definition.kind;
		if (['ui_row', 'ui_repeat'].includes(kind)) {
			const total = visible.reduce((sum, child) => sum + child.width, 0) + gap * Math.max(0, visible.length - 1);
			const result = flowLayout(
				visible,
				kind === 'ui_row' && props.wrap === 'false' ? Math.max(total, inner.width) : inner.width,
				{ gap, align: props.align as 'start' | 'center' | 'end' | undefined },
			);
			visible.forEach((child, i) => {
				child.view.position.set(padding + result.positions[i].x, padding + result.positions[i].y);
			});
			return props.height === undefined ? result.height + padding * 2 : undefined;
		}
		if (kind === 'ui_column') {
			let y = padding;
			for (const child of visible) {
				child.view.position.set(padding, y);
				y += child.height + gap;
			}
			return props.height === undefined ? Math.max(0, y - gap + padding) : undefined;
		}
		if (kind === 'ui_grid') {
			const columns = Number(props.columns),
				rows = Math.ceil(visible.length / columns);
			const grid = new Grid({
				columns: Array.from({ length: columns }, () => ({ grow: 1 })),
				rows: Array.from({ length: rows }, () => ({
					size: Math.max(0, ...visible.map((child) => child.height)),
				})),
				gap,
			});
			visible.forEach((child, i) => {
				const cell = grid.rect(Math.floor(i / columns), i % columns, inner);
				this.layoutNode(child, { ...cell, x: cell.x + padding, y: cell.y + padding });
			});
			if (props.height === undefined)
				return (
					grid.rowSizes(inner.height).reduce((sum, size) => sum + size, 0) +
					gap * Math.max(0, rows - 1) +
					padding * 2
				);
			return undefined;
		}
		if (['ui_container', 'ui_mount'].includes(kind) && props.height === undefined)
			return Math.max(0, ...visible.map((child) => child.view.y + child.height)) + padding * 2;
		return undefined;
	}

	private paintNode(node: MountedNode, width: number, height: number): void {
		const props = node.properties;
		if (node.background) {
			node.background.clear().rect(0, 0, width, height).fill(this.token(props.background_token, 'panel'));
			if (props.border_token)
				node.background.stroke({ color: this.token(props.border_token, 'accent'), width: 1 });
		}
	}

	private anchorNode(node: MountedNode, view: Container, bounds: LayoutRect, width: number, height: number): void {
		const props = node.properties;
		if (node.parent === this.camera.world) view.position.set(Number(props.x ?? 0), Number(props.y ?? 0));
		else if (!(view instanceof Window)) {
			const placed = resolveAnchor(
				{
					anchor: (props.anchor ?? 'top-left') as Parameters<typeof resolveAnchor>[0]['anchor'],
					width,
					height,
					offsetX: Number(props.x ?? 0),
					offsetY: Number(props.y ?? 0),
				},
				bounds,
			);
			view.position.set(placed.x, placed.y);
		}
	}

	private invoke(action: string | undefined, item?: PresentationItem): void {
		if (action) this.options.actions[action](item);
	}
	private isFocusable(node: MountedNode): boolean {
		if (!(node.view instanceof Button) || node.view.disabled) return false;
		for (let view: Container | null = node.view; view; view = view.parent) if (!view.visible) return false;
		return true;
	}
	private focusable(window?: MountedNode): MountedNode[] {
		const result: MountedNode[] = [];
		const visit = (node: MountedNode): void => {
			if (this.isFocusable(node)) result.push(node);
			for (const child of node.children) visit(child);
		};
		for (const node of window ? window.children : this.roots) visit(node);
		return result;
	}
	private setFocus(node: MountedNode | null): void {
		if (node === this.focused) return;
		if (this.focused?.state === 'focused') this.focused.state = 'idle';
		this.focused = node;
		if (node && node.state === 'idle') node.state = 'focused';
	}
	private navigate(action: string, window?: MountedNode): boolean {
		const nodes = this.focusable(window);
		if (!nodes.length) return false;
		let index = nodes.indexOf(this.focused!);
		if (['up', 'left', 'down', 'right', 'next'].includes(action)) {
			const delta = ['up', 'left'].includes(action) ? -1 : 1;
			index = index < 0 ? 0 : (index + delta + nodes.length) % nodes.length;
			this.setFocus(nodes[index]);
			this.update();
			return true;
		}
		if (action === 'confirm') {
			const node = nodes[Math.max(0, index)];
			this.setFocus(node);
			(node.view as Button).onClick.dispatch();
			this.update();
			return true;
		}
		return false;
	}
	/** Offers modal windows input first, then the screen-space buttons. */
	handleAction(action: string): boolean {
		if (this.destroyed) return false;
		if (this.windows.top) return this.windows.handleAction(action) || this.windows.blocksWorld;
		return this.navigate(action);
	}
	private unmount(node: MountedNode, destroyView = true): void {
		const children = node.children;
		const cleanups = node.cleanups;
		const adapter = node.adapter;
		const view = node.view;
		node.children = [];
		node.cleanups = [];
		node.adapter = undefined;
		node.background = undefined;
		node.image = undefined;
		node.view = null;
		node.values = {};
		node.properties = {};
		cleanupAll([
			...children.map((child) => () => this.dispose(child)),
			...cleanups,
			() => adapter?.destroy?.(),
			() => {
				if (!destroyView || !view || view.destroyed) return;
				if (view instanceof Window) view.close();
				else {
					view.parent?.removeChild(view);
					view.destroy({ children: true });
				}
			},
		]);
	}
	private dispose(node: MountedNode): void {
		this.nodes.delete(node.path);
		this.unmount(node);
	}
	private assertAlive(): void {
		if (this.destroyed) throw new Error('presentation is destroyed');
	}
	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		const unsubscribe = this.unsubscribe;
		this.unsubscribe = undefined;
		Input.onAction.remove(this.inputListener);
		cleanupAll([
			() => unsubscribe?.(),
			...this.roots.map((node) => () => this.dispose(node)),
			() => {
				this.nodes.clear();
				this.focused = null;
				this.root.parent?.removeChild(this.root);
				this.root.destroy({ children: true });
			},
			() => {
				if (theme() === this.appliedTheme) setTheme(this.previousTheme);
			},
		]);
	}
}

function cleanupAll(tasks: readonly (() => void)[]): void {
	const errors: unknown[] = [];
	for (const task of tasks) {
		try {
			task();
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length) throw new AggregateError(errors, 'presentation cleanup failed');
}

function equalProperties(
	a: Readonly<Record<string, string | PresentationValue>>,
	b: Readonly<Record<string, string | PresentationValue>>,
): boolean {
	return Object.keys(a).length === Object.keys(b).length && Object.keys(b).every((key) => a[key] === b[key]);
}
