import type { MwlDiagnostic, MwlNode } from './grammar.ts';

export type MwlValueType = 'string' | 'id' | 'number' | 'integer' | 'boolean';

export interface MwlTagSchema {
	/** fixed attributes, name -> value type */
	readonly attributes?: Readonly<Record<string, MwlValueType>>;
	/**
	 * When set, any attribute name is accepted on this tag and every value is
	 * checked as this type. Open data maps need this: the keys of a movement
	 * table (`[movement_costs]`, `[defense]`, `[resistance]`) are game-defined
	 * terrain or damage-type ids, not schema-defined attribute names.
	 */
	readonly openAttributes?: MwlValueType;
	/** allowed child tags; when omitted, any child is accepted */
	readonly children?: readonly string[];
	/** when true, children are accepted even though `children` is set */
	readonly openChildren?: boolean;
}

export const schema01: Readonly<Record<string, MwlTagSchema>> = {
	game: {
		attributes: {
			schema: 'string',
			title: 'string',
			data_root: 'string',
			start_scene: 'id',
			default_schedule: 'id',
			save_slot: 'string',
		},
		children: [
			'terrain_type',
			'movetype',
			'unit_type',
			'unit',
			'side',
			'map',
			'schedule',
			'event',
			'objectives',
			'trait',
			'weapon_special',
			'dialogue',
			'save',
			'item',
			'inventory',
			'monster',
			'status',
			'loot',
			'turn_clock',
			'battle_move',
			'type_matchup',
			'evolution',
		],
	},
	terrain_type: {
		attributes: {
			id: 'id',
			string: 'string',
			aliasof: 'string',
			mvt_alias: 'string',
			default_base: 'string',
			heals: 'integer',
			gives_income: 'boolean',
			map_code: 'string',
			base_tile: 'string',
			overlay_tile: 'string',
			defense: 'number',
			healing: 'number',
		},
	},
	movetype: { attributes: { id: 'id', name: 'string' }, children: ['movement_costs', 'defense', 'resistance'] },
	// Open maps: every attribute is a terrain or damage-type id, every value a number.
	movement_costs: { openAttributes: 'number' },
	defense: { openAttributes: 'number' },
	resistance: { openAttributes: 'number' },
	unit_type: {
		attributes: {
			// Wesnoth unit type ids may contain spaces ("Drake Arbiter"), so this is a
			// string rather than the stricter id type.
			id: 'string',
			name: 'string',
			description: 'string',
			image: 'string',
			image_icon: 'string',
			profile: 'string',
			sound: 'string',
			hitpoints: 'integer',
			movement: 'integer',
			movement_type: 'id',
			movetype: 'id',
			experience: 'integer',
			level: 'integer',
			alignment: 'id',
			cost: 'integer',
			advances_to: 'string',
			race: 'id',
			usage: 'id',
		},
		children: ['attack', 'trait', 'ability'],
	},
	unit: { attributes: { id: 'id', type: 'string', side: 'integer', hp: 'integer', x: 'integer', y: 'integer' } },
	attack: {
		attributes: {
			id: 'id',
			// Unit references are strings: converted unit ids may contain spaces.
			attacker: 'string',
			defender: 'string',
			target: 'string',
			amount: 'integer',
			weapon: 'id',
			name: 'string',
			sound: 'string',
			description: 'string',
			type: 'id',
			range: 'id',
			damage: 'integer',
			number: 'integer',
			strikes: 'integer',
			icon: 'string',
			specials: 'string',
		},
	},
	side: {
		attributes: {
			// Side ids are numbers in MWL content and in converted Wesnoth data.
			id: 'integer',
			controller: 'id',
			gold: 'integer',
			income: 'integer',
			income_base: 'integer',
			income_per_village: 'integer',
			leader: 'id',
			team: 'integer',
			recruit: 'string',
			color: 'string',
		},
	},
	map: { attributes: { id: 'id', name: 'string', file: 'string', terrain: 'string' }, children: ['start'] },
	start: { attributes: { side: 'integer', x: 'integer', y: 'integer' } },
	schedule: { attributes: { id: 'id' }, children: ['time'] },
	time: { attributes: { id: 'id', name: 'string', lawful_bonus: 'number' } },
	event: {
		attributes: {
			id: 'id',
			on: 'id',
			trigger: 'id',
			// `on=moveto` filters. All optional: `[event] on=moveto unit=scout` fires
			// for any hex that unit reaches, `x`/`y` narrow it to one hex.
			x: 'integer',
			y: 'integer',
			side: 'integer',
			unit: 'string',
			// Defaults to true for moveto (a story beat fires once) and false for
			// start/turn (a per-turn event has to repeat).
			once: 'boolean',
		},
		children: [
			'condition',
			'filter',
			'command',
			'say',
			'dialogue',
			'move',
			'attack',
			'spawn',
			'kill',
			'gold',
			'set_variable',
			'if',
			'else',
			'message',
			'teleport',
			'end_turn',
			'win',
			'lose',
			'hook',
		],
	},
	objectives: {
		attributes: { side: 'integer', victory: 'string', defeat: 'string' },
		children: ['victory', 'defeat'],
	},
	victory: {
		attributes: {
			side: 'integer',
			condition: 'id',
			type: 'string',
			x: 'integer',
			y: 'integer',
			side_filter: 'integer',
			turns: 'integer',
			gold: 'integer',
			hook: 'string',
			// generic predicate parameter, for `condition=hook` objectives
			value: 'integer',
		},
	},
	defeat: {
		attributes: {
			side: 'integer',
			condition: 'id',
			type: 'string',
			x: 'integer',
			y: 'integer',
			side_filter: 'integer',
			turns: 'integer',
			gold: 'integer',
			hook: 'string',
			value: 'integer',
		},
	},
	condition: { attributes: { variable: 'id', equals: 'string' } },
	filter: {
		attributes: {
			side: 'integer',
			type: 'string',
			x: 'integer',
			y: 'integer',
			level: 'integer',
			alignment: 'id',
			can_recruit: 'boolean',
		},
	},
	command: {
		attributes: {
			name: 'id',
			target: 'string',
			value: 'string',
			amount: 'integer',
			x: 'integer',
			y: 'integer',
			hp: 'integer',
		},
	},
	move: { attributes: { unit: 'string', target: 'string', x: 'integer', y: 'integer' } },
	spawn: { attributes: { id: 'string', type: 'string', side: 'integer', x: 'integer', y: 'integer', hp: 'integer' } },
	kill: { attributes: { unit: 'string', target: 'string' } },
	gold: { attributes: { side: 'string', delta: 'integer', amount: 'integer' } },
	set_variable: { attributes: { name: 'id', target: 'id', value: 'string' } },
	if: {
		attributes: { test: 'string' },
		children: [
			'condition',
			'command',
			'message',
			'move',
			'attack',
			'spawn',
			'kill',
			'gold',
			'set_variable',
			'win',
			'lose',
			'hook',
		],
	},
	else: {
		children: [
			'condition',
			'command',
			'message',
			'move',
			'attack',
			'spawn',
			'kill',
			'gold',
			'set_variable',
			'win',
			'lose',
			'hook',
		],
	},
	message: {
		// `speaker` is a display name, so it may contain spaces ("Orcish Grunt").
		attributes: { speaker: 'string', text: 'string', value: 'string', portrait: 'string', side: 'integer' },
	},
	teleport: { attributes: { unit: 'string', target: 'string', x: 'integer', y: 'integer' } },
	end_turn: { attributes: {} },
	win: { attributes: { side: 'integer' } },
	lose: { attributes: { side: 'integer' } },
	say: { attributes: { speaker: 'id', text: 'string' } },
	dialogue: { attributes: { id: 'id', ref: 'id' }, children: ['say', 'choice', 'branch', 'message'] },
	choice: { attributes: { text: 'string', event: 'id' }, children: ['branch'] },
	branch: { attributes: { text: 'string' }, children: ['message', 'say', 'command'] },
	trait: { attributes: { id: 'id', name: 'string' }, children: ['effect'] },
	ability: { attributes: { id: 'id', name: 'string' }, children: ['effect'] },
	weapon_special: { attributes: { id: 'id', name: 'string' } },
	// A hook call: `name` is `type:hookName` and any further attributes are
	// passed to the hook as context.
	hook: { attributes: { name: 'string' }, openAttributes: 'string' },
	item: {
		attributes: { id: 'id', name: 'string', slot: 'id', stackable: 'boolean', weight: 'number' },
		children: ['effect'],
	},
	inventory: { attributes: { unit: 'string', side: 'integer', items: 'string' } },
	monster: {
		attributes: {
			id: 'string',
			name: 'string',
			hp: 'integer',
			types: 'string',
			attack: 'number',
			defense: 'number',
			speed: 'number',
			accuracy: 'number',
			evasion: 'number',
			damage_min: 'integer',
			damage_max: 'integer',
			armor_min: 'integer',
			armor_max: 'integer',
			experience: 'integer',
			max_level: 'integer',
			image: 'string',
		},
		children: ['ability', 'loot'],
	},
	status: { attributes: { id: 'id', name: 'string', duration: 'integer', tick: 'string', modifiers: 'string' } },
	loot: { attributes: { item: 'id', chance: 'number', quantity: 'integer', weight: 'number' } },
	turn_clock: { attributes: { id: 'id', tick: 'number', hunger: 'number' } },
	ai: { attributes: { id: 'id', strategy: 'id', target: 'id', difficulty: 'number' }, children: ['behavior'] },
	behavior: { attributes: { id: 'id', when: 'string', action: 'string', hook: 'string' } },
	battle_move: { attributes: { id: 'id', type: 'id', target: 'id', power: 'number', cost: 'number' } },
	type_matchup: { attributes: { attacker: 'id', defender: 'id', multiplier: 'number' } },
	evolution: { attributes: { from: 'id', into: 'id', level: 'integer' } },
	effect: {
		attributes: {
			apply_to: 'id',
			range: 'id',
			increase: 'string',
			increase_total: 'string',
			increase_damage: 'string',
			add: 'string',
			sub: 'string',
			multiply: 'string',
			divide: 'string',
			set: 'string',
		},
	},
	save: { attributes: { version: 'integer', fields: 'string', migration: 'string' } },
};

export function validate(nodes: readonly MwlNode[], schemas = schema01): MwlDiagnostic[] {
	const diagnostics: MwlDiagnostic[] = [];
	const visit = (node: MwlNode): void => {
		const definition = schemas[node.tag];
		if (!definition) {
			diagnostics.push({ code: 'MWL_UNKNOWN_TAG', message: `unknown tag ${node.tag}`, location: node.location });
			return;
		}
		for (const name of Object.keys(node.attributes)) {
			if (definition.openAttributes) continue;
			if (!definition.attributes || !(name in definition.attributes))
				diagnostics.push({
					code: 'MWL_UNKNOWN_ATTRIBUTE',
					message: `unknown attribute ${name} on ${node.tag}`,
					location: node.location,
				});
		}
		for (const [name, type] of Object.entries(definition.attributes ?? {})) {
			const value = node.attributes[name];
			if (value !== undefined && !validType(value, type))
				diagnostics.push({ code: 'MWL_VALUE', message: `${name} must be ${type}`, location: node.location });
		}
		if (definition.openAttributes) {
			for (const [name, value] of Object.entries(node.attributes)) {
				if (!validType(value, definition.openAttributes))
					diagnostics.push({
						code: 'MWL_VALUE',
						message: `${name} must be ${definition.openAttributes}`,
						location: node.location,
					});
			}
		}
		for (const child of node.children) {
			if (!definition.openChildren && definition.children && !definition.children.includes(child.tag))
				diagnostics.push({
					code: 'MWL_CHILD',
					message: `${child.tag} is not allowed inside ${node.tag}`,
					location: child.location,
				});
			visit(child);
		}
	};
	nodes.forEach(visit);
	return diagnostics.sort((a, b) => a.location.line - b.location.line || a.location.column - b.location.column);
}

function validType(value: string, type: MwlValueType): boolean {
	if (type === 'number') return Number.isFinite(Number(value));
	if (type === 'integer') return /^-?\d+$/.test(value);
	if (type === 'boolean') return value === 'true' || value === 'false' || value === 'yes' || value === 'no';
	if (type === 'id') return /^[A-Za-z_][\w.-]*$/.test(value);
	return true;
}
