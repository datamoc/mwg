export const presentationData = {
	scenes: {
		bridge: {
			theme: 'bridge-ui',
			children: [
				{
					kind: 'scene_camera',
					id: 'camera',
					source: 'scene:bridge/camera',
					properties: {
						x: '320',
						y: '180',
						fit_width: '640',
						fit_height: '360',
					},
					states: {},
					children: [],
				},
				{
					kind: 'scene_layer',
					id: 'world',
					source: 'scene:bridge/world',
					properties: {
						space: 'world',
						adapter: 'bridgeWorld',
					},
					states: {},
					children: [],
				},
				{
					kind: 'scene_layer',
					id: 'decor',
					source: 'scene:bridge/decor',
					properties: {
						space: 'world',
						image: 'scenery/trees.svg',
					},
					states: {},
					children: [],
				},
				{
					kind: 'ui_column',
					id: 'hud',
					source: 'scene:bridge/hud',
					properties: {
						anchor: 'bottom',
						padding: '12',
						gap: '8',
						background_token: 'panel',
					},
					states: {},
					children: [
						{
							kind: 'ui_label',
							id: 'caption',
							source: 'scene:bridge/hud/caption',
							properties: {
								text_binding: 'caption',
								color_token: 'text',
							},
							states: {},
							children: [],
						},
						{
							kind: 'ui_bar',
							id: 'budget',
							source: 'scene:bridge/hud/budget',
							properties: {
								width: '300',
								height: '12',
								value_binding: 'cost',
								max_binding: 'budget',
								color_token: 'success',
							},
							states: {},
							children: [],
						},
						{
							kind: 'ui_mount',
							id: 'controls',
							source: 'scene:bridge/hud/controls',
							properties: {
								component: 'controls',
							},
							states: {},
							children: [
								{
									kind: 'ui_row',
									id: 'toolbar',
									source: 'component:controls/toolbar',
									properties: {
										wrap: 'true',
										gap: '8',
									},
									states: {},
									children: [
										{
											kind: 'ui_button',
											id: 'add',
											source: 'component:controls/toolbar/add',
											properties: {
												text: 'Add beam',
												variant: 'tool',
												action: 'add',
											},
											states: {
												focused: {
													border_token: 'warning',
												},
											},
											children: [],
										},
										{
											kind: 'ui_button',
											id: 'biome',
											source: 'component:controls/toolbar/biome',
											properties: {
												text: 'Change biome',
												variant: 'tool',
												action: 'biome',
											},
											states: {},
											children: [],
										},
										{
											kind: 'ui_button',
											id: 'reorder',
											source: 'component:controls/toolbar/reorder',
											properties: {
												text: 'Reorder list',
												variant: 'tool',
												action: 'reorder',
											},
											states: {},
											children: [],
										},
										{
											kind: 'ui_button',
											id: 'open',
											source: 'component:controls/toolbar/open',
											properties: {
												text: 'Results',
												variant: 'tool',
												action: 'open',
											},
											states: {},
											children: [],
										},
									],
								},
							],
						},
						{
							kind: 'ui_repeat',
							id: 'materials',
							source: 'scene:bridge/hud/materials',
							properties: {
								items_binding: 'materials',
								key: 'id',
								gap: '8',
							},
							states: {},
							children: [
								{
									kind: 'ui_button',
									id: 'material',
									source: 'scene:bridge/hud/materials/material',
									properties: {
										width: '140',
										height: '36',
										text_binding: 'item.text',
										selected_binding: 'item.selected',
										disabled_binding: 'item.disabled',
										action: 'choose',
									},
									states: {
										focused: {
											border_token: 'warning',
										},
										selected: {
											background_token: 'selection',
										},
									},
									children: [],
								},
							],
						},
					],
				},
				{
					kind: 'ui_window',
					id: 'results',
					source: 'scene:bridge/results',
					properties: {
						width: '320',
						height: '210',
						title: 'Bridge results',
						visible_binding: 'showWindow',
						close_action: 'close',
					},
					states: {},
					children: [
						{
							kind: 'ui_column',
							id: 'body',
							source: 'scene:bridge/results/body',
							properties: {
								gap: '12',
							},
							states: {},
							children: [
								{
									kind: 'ui_label',
									id: 'message',
									source: 'scene:bridge/results/body/message',
									properties: {
										text_binding: 'caption',
									},
									states: {},
									children: [],
								},
								{
									kind: 'ui_button',
									id: 'close',
									source: 'scene:bridge/results/body/close',
									properties: {
										text: 'Continue editing',
										action: 'close',
										width: '220',
										height: '40',
									},
									states: {
										focused: {
											border_token: 'warning',
										},
									},
									children: [],
								},
							],
						},
					],
				},
			],
		},
	},
	themes: {
		'bridge-ui': {
			tokens: {
				panel: 1120295,
				text: 16777215,
				accent: 10079487,
				success: 8973994,
				warning: 16764006,
				danger: 16746632,
				selection: 6453936,
				sky: 3233136,
				rock: 5404245,
				water: 2394539,
			},
			properties: {
				font_size: '16',
				padding: '10',
			},
		},
	},
	contexts: {
		alpine: {
			theme: 'bridge-ui',
			tokens: {
				sky: 8625843,
				rock: 12965341,
				water: 4954044,
				accent: 11919103,
			},
			overrides: {
				'component:controls/toolbar': {
					gap: '12',
				},
				'scene:bridge/decor': {
					image: 'scenery/snow.svg',
				},
			},
		},
	},
	variants: {
		tool: {
			width: '140',
			height: '36',
			color_token: 'text',
			border_token: 'accent',
		},
	},
	manifest: {
		values: {
			caption: 'string',
			cost: 'number',
			budget: 'number',
			showWindow: 'boolean',
			materials: {
				type: 'items',
				fields: {
					id: 'string',
					text: 'string',
					selected: 'boolean',
					disabled: 'boolean',
				},
			},
		},
		actions: ['add', 'reorder', 'choose', 'biome', 'open', 'close'],
		adapters: ['bridgeWorld'],
		assets: ['scenery/trees.svg', 'scenery/snow.svg'],
	},
	ids: [
		'bridge/camera',
		'bridge/decor',
		'bridge/hud',
		'bridge/hud/budget',
		'bridge/hud/caption',
		'bridge/hud/controls',
		'bridge/hud/controls/toolbar',
		'bridge/hud/controls/toolbar/add',
		'bridge/hud/controls/toolbar/biome',
		'bridge/hud/controls/toolbar/open',
		'bridge/hud/controls/toolbar/reorder',
		'bridge/hud/materials',
		'bridge/hud/materials/*/material',
		'bridge/results',
		'bridge/results/body',
		'bridge/results/body/close',
		'bridge/results/body/message',
		'bridge/world',
	],
	assets: ['scenery/snow.svg', 'scenery/trees.svg'],
	messages: ['Add beam', 'Bridge results', 'Change biome', 'Continue editing', 'Reorder list', 'Results'],
} as const;
type ExpandRepeat<S extends string> = S extends `${infer Prefix}/*/${infer Rest}`
	? `${Prefix}/${string}/${ExpandRepeat<Rest>}`
	: S;
export type PresentationId = ExpandRepeat<(typeof presentationData.ids)[number]>;
export type PresentationSceneId = keyof typeof presentationData.scenes;
