import { compileSources, type MwlCompiledNode, type MwlSourceFile } from './compiler.ts';
import { schema10, type MwlTagSchema } from './schema.ts';
import { contrastRatio } from '../two-d/ui/contrast.ts';

export type PresentationScalarType = 'string' | 'number' | 'boolean';
export type PresentationValue = string | number | boolean;
export type PresentationItem = Readonly<Record<string, PresentationValue>>;
export interface PresentationCollection {
	readonly type: 'items';
	readonly fields: Readonly<Record<string, PresentationScalarType>>;
}
/** The game's TypeScript adapter declares these names and value types at build time. */
export interface PresentationManifest {
	readonly values: Readonly<Record<string, PresentationScalarType | PresentationCollection>>;
	readonly actions: readonly string[];
	readonly adapters?: readonly string[];
	readonly assets?: readonly string[];
}
export type PresentationProperties = Readonly<Record<string, string>>;
export interface PresentationNode {
	readonly kind: string;
	readonly id: string;
	/** Authored definition path, shared by every instance of a reusable component. */
	readonly source: string;
	readonly properties: PresentationProperties;
	readonly states: Readonly<Record<string, PresentationProperties>>;
	readonly children: readonly PresentationNode[];
}
export interface PresentationTheme {
	readonly tokens: Readonly<Record<string, number>>;
	readonly properties: PresentationProperties;
}
export interface PresentationContext {
	readonly theme: string;
	readonly tokens: Readonly<Record<string, number>>;
	readonly overrides: Readonly<Record<string, PresentationProperties>>;
}
export interface PresentationScene {
	readonly theme: string;
	readonly children: readonly PresentationNode[];
}
export interface CompiledPresentation {
	readonly scenes: Readonly<Record<string, PresentationScene>>;
	readonly themes: Readonly<Record<string, PresentationTheme>>;
	readonly contexts: Readonly<Record<string, PresentationContext>>;
	readonly variants: Readonly<Record<string, PresentationProperties>>;
	readonly manifest: PresentationManifest;
	readonly ids: readonly string[];
	readonly assets: readonly string[];
	readonly messages: readonly string[];
}

const styleAttributes = {
	color_token: 'id',
	background_token: 'id',
	border_token: 'id',
	width: 'number',
	height: 'number',
	gap: 'number',
	padding: 'number',
	alpha: 'number',
} as const;
const commonAttributes = {
	id: 'id',
	...styleAttributes,
	variant: 'id',
	anchor: [
		'top-left',
		'top',
		'top-right',
		'left',
		'center',
		'right',
		'bottom-left',
		'bottom',
		'bottom-right',
		'fill',
	],
	x: 'number',
	y: 'number',
	visible: 'boolean',
	visible_binding: 'string',
} as const;
const uiTags = [
	'ui_container',
	'ui_row',
	'ui_column',
	'ui_grid',
	'ui_label',
	'ui_button',
	'ui_bar',
	'ui_window',
	'ui_repeat',
	'ui_mount',
	'ui_adapter',
];
const children = [...uiTags, 'ui_state'];
const tree = { attributes: commonAttributes, required: ['id'], children };
const vocabulary: Readonly<Record<string, MwlTagSchema>> = {
	theme_definition: {
		attributes: { id: 'id', font_family: 'string', font_size: 'number', padding: 'number', spacing: 'number' },
		required: ['id'],
		children: ['theme_token'],
	},
	theme_token: { attributes: { id: 'id', value: 'number' }, required: ['id', 'value'], children: [] },
	presentation_context: {
		attributes: { id: 'id', theme: 'id' },
		required: ['id', 'theme'],
		children: ['theme_token', 'ui_override'],
	},
	ui_override: {
		attributes: { target: 'string', ...styleAttributes, image: 'string' },
		required: ['target'],
		children: [],
	},
	component_variant: { attributes: { id: 'id', ...styleAttributes }, required: ['id'], children: [] },
	ui_component: { attributes: { id: 'id', items_binding: 'id' }, required: ['id'], children: uiTags },
	scene_definition: {
		attributes: { id: 'id', theme: 'id' },
		required: ['id', 'theme'],
		children: ['scene_layer', 'scene_camera', ...uiTags],
	},
	scene_layer: {
		...tree,
		attributes: { ...commonAttributes, space: ['world', 'screen'], adapter: 'id', image: 'string' },
	},
	scene_camera: {
		attributes: { id: 'id', zoom: 'number', x: 'number', y: 'number', fit_width: 'number', fit_height: 'number' },
		required: ['id'],
		children: [],
	},
	ui_container: tree,
	ui_row: { ...tree, attributes: { ...commonAttributes, wrap: 'boolean', align: ['start', 'center', 'end'] } },
	ui_column: tree,
	ui_grid: { ...tree, attributes: { ...commonAttributes, columns: 'integer' }, required: ['id', 'columns'] },
	ui_label: {
		...tree,
		attributes: { ...commonAttributes, text: 'string', text_binding: 'string' },
		children: ['ui_state'],
	},
	ui_button: {
		...tree,
		attributes: {
			...commonAttributes,
			text: 'string',
			text_binding: 'string',
			action: 'id',
			selected_binding: 'string',
			disabled_binding: 'string',
		},
		children: ['ui_state'],
	},
	ui_bar: {
		...tree,
		attributes: {
			...commonAttributes,
			value: 'number',
			max: 'number',
			value_binding: 'string',
			max_binding: 'string',
			color_binding: 'string',
		},
		children: ['ui_state'],
	},
	ui_window: {
		...tree,
		attributes: {
			...commonAttributes,
			anchor: ['center', 'top', 'bottom'],
			title: 'string',
			title_binding: 'string',
			modal: 'boolean',
			closable: 'boolean',
			close_action: 'id',
		},
	},
	ui_repeat: {
		...tree,
		attributes: { ...commonAttributes, items_binding: 'id', key: 'id' },
		required: ['id', 'items_binding', 'key'],
	},
	ui_mount: {
		...tree,
		attributes: { ...commonAttributes, component: 'id' },
		required: ['id', 'component'],
		children: [],
	},
	ui_adapter: {
		...tree,
		attributes: { ...commonAttributes, adapter: 'id', image: 'string' },
		required: ['id', 'adapter'],
		children: [],
	},
	ui_state: {
		attributes: { state: ['idle', 'hover', 'pressed', 'disabled', 'selected', 'focused'], ...styleAttributes },
		required: ['state'],
		children: [],
	},
};
const bindingTypes: Record<string, PresentationScalarType> = {
	text_binding: 'string',
	title_binding: 'string',
	value_binding: 'number',
	max_binding: 'number',
	color_binding: 'number',
	visible_binding: 'boolean',
	selected_binding: 'boolean',
	disabled_binding: 'boolean',
};
const semanticTokens = ['panel', 'text', 'accent', 'success', 'warning', 'danger', 'selection'];

/**
 * Compiles optional scene/UI definitions, validating every reference against the game's manifest.
 * Reusable components are expanded at build time; emitted data contains no parser or executable content.
 *
 * @example
 * ```ts
 * import { compilePresentation, emitPresentationModule } from '@datamoc/mw_games/mwl/presentation';
 * const data = compilePresentation([], { values: {}, actions: [] });
 * console.log(emitPresentationModule(data).startsWith('export const presentationData')); // true
 * ```
 */
export function compilePresentation(
	files: readonly MwlSourceFile[],
	manifest: PresentationManifest,
): CompiledPresentation {
	const game = compileSources(files, { schemas: { ...schema10, ...vocabulary } });
	const roots = game.roots;
	const definitions = new Map<string, MwlCompiledNode>();
	const sources = new Map<string, MwlCompiledNode>();
	const mountedComponents = new Set<string>();
	const tokenUses: Array<{ node: MwlCompiledNode; token: string }> = [];
	const fail = (node: MwlCompiledNode, message: string): never => {
		const location = node.location;
		throw new Error(
			`${location?.file ?? '<presentation>'}:${location?.line ?? 1}:${location?.column ?? 1}: ${message}`,
		);
	};
	const keyOf = (tag: string, id: string) => `${tag}:${id}`;
	for (const node of roots) {
		if (node.attributes.id === '__proto__') fail(node, 'reserved definition id "__proto__"');
		if (
			![
				'theme_definition',
				'presentation_context',
				'component_variant',
				'ui_component',
				'scene_definition',
			].includes(node.tag)
		)
			continue;
		const key = keyOf(node.tag, node.attributes.id);
		if (definitions.has(key)) fail(node, `duplicate ${key}`);
		definitions.set(key, node);
	}
	const find = (node: MwlCompiledNode, tag: string, id: string): MwlCompiledNode =>
		definitions.get(keyOf(tag, id)) ?? fail(node, `unknown ${tag} "${id}"`);
	const props = (node: MwlCompiledNode, excluded = ['id']): Record<string, string> =>
		Object.fromEntries(Object.entries(node.attributes).filter(([key]) => !excluded.includes(key)));
	const validateStyle = (node: MwlCompiledNode): void => {
		if (node.attributes.image && !manifest.assets?.includes(node.attributes.image))
			fail(node, `unknown asset "${node.attributes.image}"`);
		for (const [name, value] of Object.entries(node.attributes)) {
			if (name.endsWith('_token')) tokenUses.push({ node, token: value });
			if (['width', 'height', 'gap', 'padding'].includes(name) && Number(value) < 0)
				fail(node, `${name} must be nonnegative`);
			if (name === 'alpha' && (Number(value) < 0 || Number(value) > 1))
				fail(node, 'alpha must be between 0 and 1');
		}
	};
	const readTokens = (node: MwlCompiledNode): Record<string, number> => {
		const tokens: Record<string, number> = Object.create(null);
		for (const child of node.children.filter((child) => child.tag === 'theme_token')) {
			const { id, value } = child.attributes;
			if (id === '__proto__') fail(child, 'reserved token id "__proto__"');
			const color = Number(value);
			if (Object.hasOwn(tokens, id)) fail(child, `duplicate theme token "${id}"`);
			if (!Number.isInteger(color) || color < 0 || color > 0xffffff)
				fail(child, `token "${id}" must be a 24-bit color`);
			tokens[id] = color;
		}
		return tokens;
	};
	const themes: Record<string, PresentationTheme> = Object.create(null);
	const contexts: Record<string, PresentationContext> = Object.create(null);
	const variants: Record<string, PresentationProperties> = Object.create(null);
	const scenes: Record<string, PresentationScene> = Object.create(null);
	for (const node of roots) {
		const id = node.attributes.id;
		if (node.tag === 'theme_definition') {
			validateStyle(node);
			if (node.attributes.font_size !== undefined && Number(node.attributes.font_size) <= 0)
				fail(node, 'font_size must be positive');
			const tokens = readTokens(node);
			for (const token of semanticTokens)
				if (!Object.hasOwn(tokens, token)) fail(node, `missing semantic token "${token}"`);
			themes[id] = { tokens, properties: props(node) };
		} else if (node.tag === 'component_variant') {
			validateStyle(node);
			variants[id] = props(node);
		}
	}
	const buildTree = (
		nodes: readonly MwlCompiledNode[],
		prefix: string,
		fields?: PresentationCollection['fields'],
		stack: readonly string[] = [],
	): PresentationNode[] => {
		const siblings = new Set<string>();
		return nodes
			.filter((node) => node.tag !== 'ui_state')
			.map((node) => {
				const id = node.attributes.id;
				if (!id || siblings.has(id)) fail(node, `duplicate or missing component id "${id}" in ${prefix}`);
				siblings.add(id);
				const source = `${prefix}/${id}`;
				sources.set(source, node);
				validateStyle(node);
				const attributes = node.attributes;
				if (attributes.variant) find(node, 'component_variant', attributes.variant);
				for (const name of ['action', 'close_action'])
					if (attributes[name] && !manifest.actions.includes(attributes[name]))
						fail(node, `unknown action "${attributes[name]}"`);
				if (attributes.adapter && !manifest.adapters?.includes(attributes.adapter))
					fail(node, `unknown adapter "${attributes.adapter}"`);
				for (const [name, expected] of Object.entries(bindingTypes)) {
					const binding = attributes[name];
					if (!binding) continue;
					const actual = binding.startsWith('item.') ? fields?.[binding.slice(5)] : manifest.values[binding];
					if (actual !== expected) fail(node, `binding "${binding}" for ${name} must be ${expected}`);
				}
				const states: Record<string, PresentationProperties> = Object.create(null);
				for (const state of node.children.filter((child) => child.tag === 'ui_state')) {
					if (Object.hasOwn(states, state.attributes.state))
						fail(state, `duplicate component state "${state.attributes.state}"`);
					validateStyle(state);
					states[state.attributes.state] = props(state, ['state']);
				}
				let childNodes: PresentationNode[];
				if (node.tag === 'ui_mount') {
					const name = attributes.component;
					if (stack.includes(name)) fail(node, `component cycle: ${[...stack, name].join(' -> ')}`);
					mountedComponents.add(name);
					const component = find(node, 'ui_component', name);
					childNodes = buildTree(component.children, `component:${name}`, fields, [...stack, name]);
				} else if (node.tag === 'ui_repeat') {
					const collection = manifest.values[attributes.items_binding];
					if (!collection || typeof collection !== 'object' || collection.type !== 'items')
						fail(node, `unknown collection "${attributes.items_binding}"`);
					const itemFields = (collection as PresentationCollection).fields;
					if (!['string', 'number'].includes(itemFields[attributes.key]))
						fail(node, `repeat key "${attributes.key}" must be a string or number field`);
					if (node.children.filter((child) => child.tag !== 'ui_state').length !== 1)
						fail(node, 'ui_repeat needs exactly one template child');
					childNodes = buildTree(node.children, source, itemFields, stack);
				} else childNodes = buildTree(node.children, source, fields, stack);
				if (node.tag === 'ui_grid' && Number(attributes.columns) < 1)
					fail(node, 'grid columns must be positive');
				if (node.tag === 'scene_camera') {
					if (attributes.zoom !== undefined && Number(attributes.zoom) <= 0)
						fail(node, 'camera zoom must be positive');
					if (Boolean(attributes.fit_width) !== Boolean(attributes.fit_height))
						fail(node, 'camera fit needs width and height');
					if (
						attributes.fit_width &&
						(Number(attributes.fit_width) <= 0 || Number(attributes.fit_height) <= 0)
					)
						fail(node, 'camera fit dimensions must be positive');
				}
				return { kind: node.tag, id, source, properties: props(node), states, children: childNodes };
			});
	};
	function componentFields(node: MwlCompiledNode): PresentationCollection['fields'] | undefined {
		if (!node.attributes.items_binding) return undefined;
		const collection = manifest.values[node.attributes.items_binding];
		if (typeof collection !== 'object' || collection.type !== 'items')
			fail(node, `unknown collection "${node.attributes.items_binding}"`);
		return (collection as PresentationCollection).fields;
	}
	for (const node of roots.filter((node) => node.tag === 'scene_definition')) {
		find(node, 'theme_definition', node.attributes.theme);
		if (node.children.filter((child) => child.tag === 'scene_camera').length > 1)
			fail(node, 'a scene can have only one camera');
		scenes[node.attributes.id] = {
			theme: node.attributes.theme,
			children: buildTree(node.children, `scene:${node.attributes.id}`),
		};
	}
	// Validate unused reusable definitions too; an unmounted typo must not escape the build.
	for (const node of roots.filter((node) => node.tag === 'ui_component')) {
		if (!mountedComponents.has(node.attributes.id))
			buildTree(node.children, `component:${node.attributes.id}`, componentFields(node), [node.attributes.id]);
	}
	for (const node of roots.filter((node) => node.tag === 'presentation_context')) {
		find(node, 'theme_definition', node.attributes.theme);
		const overrides: Record<string, PresentationProperties> = Object.create(null);
		for (const override of node.children.filter((child) => child.tag === 'ui_override')) {
			const target = override.attributes.target;
			if (!sources.has(target)) fail(override, `unknown override target "${target}"`);
			if (override.attributes.image && !['scene_layer', 'ui_adapter'].includes(sources.get(target)!.tag))
				fail(override, 'image overrides require a scene layer or adapter');
			if (Object.hasOwn(overrides, target)) fail(override, `duplicate override target "${target}"`);
			validateStyle(override);
			overrides[target] = props(override, ['target']);
		}
		const tokens = readTokens(node);
		for (const token of Object.keys(tokens))
			if (!Object.hasOwn(themes[node.attributes.theme].tokens, token))
				fail(node, `unknown context token "${token}"`);
		contexts[node.attributes.id] = { theme: node.attributes.theme, tokens, overrides };
	}
	const checkPalette = (node: MwlCompiledNode, tokens: Readonly<Record<string, number>>): void => {
		for (const use of tokenUses)
			if (!Object.hasOwn(tokens, use.token))
				fail(use.node, `unknown theme token "${use.token}" in ${node.attributes.id}`);
		if (contrastRatio(tokens.text, tokens.panel) < 4.5) fail(node, 'text/panel contrast must reach 4.5');
		for (const token of ['danger', 'selection'])
			if (contrastRatio(tokens[token], tokens.panel) < 3) fail(node, `${token}/panel contrast must reach 3`);
	};
	for (const node of roots.filter((node) => node.tag === 'theme_definition'))
		checkPalette(node, themes[node.attributes.id].tokens);
	for (const node of roots.filter((node) => node.tag === 'presentation_context')) {
		const context = contexts[node.attributes.id];
		checkPalette(node, { ...themes[context.theme].tokens, ...context.tokens });
	}
	const ids: string[] = [];
	const collect = (nodes: readonly PresentationNode[], prefix: string): void => {
		for (const node of nodes) {
			const path = `${prefix}/${node.id}`;
			ids.push(path);
			collect(node.children, node.kind === 'ui_repeat' ? `${path}/*` : path);
		}
	};
	for (const [id, scene] of Object.entries(scenes)) collect(scene.children, id);
	return {
		scenes,
		themes,
		contexts,
		variants,
		manifest,
		ids: ids.sort(),
		assets: game.assets,
		messages: game.messages,
	};
}

/**
 * Emits data and literal ID types for a game's build script to write alongside its other MWL artifacts.
 * @example
 * ```ts
 * import { compilePresentation, emitPresentationModule } from '@datamoc/mw_games/mwl/presentation';
 * console.log(emitPresentationModule(compilePresentation([], { values: {}, actions: [] })));
 * ```
 */
export function emitPresentationModule(data: CompiledPresentation): string {
	return `export const presentationData = ${JSON.stringify(data, null, '\t')} as const;\ntype ExpandRepeat<S extends string> = S extends \`\${infer Prefix}/*/\${infer Rest}\` ? \`\${Prefix}/\${string}/\${ExpandRepeat<Rest>}\` : S;\nexport type PresentationId = ExpandRepeat<typeof presentationData.ids[number]>;\nexport type PresentationSceneId = keyof typeof presentationData.scenes;\n`;
}
