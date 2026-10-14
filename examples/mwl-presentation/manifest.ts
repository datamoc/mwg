import type { PresentationManifest } from '../../src/mwl/presentation.ts';

export const manifest = {
	values: {
		caption: 'string',
		cost: 'number',
		budget: 'number',
		showWindow: 'boolean',
		materials: {
			type: 'items',
			fields: { id: 'string', text: 'string', selected: 'boolean', disabled: 'boolean' },
		},
	},
	actions: ['add', 'reorder', 'choose', 'biome', 'open', 'close'],
	adapters: ['bridgeWorld'],
	assets: ['scenery/trees.svg', 'scenery/snow.svg'],
} as const satisfies PresentationManifest;
