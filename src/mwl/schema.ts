import type { MwlDiagnostic, MwlNode } from './grammar.ts';
import { coerceCsvValue, type CsvColumnType } from '../core/Csv.ts';

export type MwlValueType = 'string' | 'id' | 'number' | 'integer' | 'boolean' | 'ref' | 'coordinate';

export interface MwlTableColumn {
	readonly name: string;
	readonly type: CsvColumnType;
}

/**
 * Parse the compact `name:type|name:type` declaration used by MWL tables.
 *
 * @example
 * ```ts
 * import { parseTableColumns } from '@datamoc/mw_games/mwl';
 *
 * console.log(parseTableColumns('id:string|cost:number'));
 * ```
 */
export function parseTableColumns(value: string): MwlTableColumn[] {
	const columns: MwlTableColumn[] = [];
	for (const part of value.split('|')) {
		const separator = part.indexOf(':');
		if (separator <= 0 || separator === part.length - 1) throw new Error(`invalid table column "${part}"`);
		const name = part.slice(0, separator).trim();
		const type = part.slice(separator + 1).trim() as CsvColumnType;
		if (!/^[A-Za-z_][\w.-]*$/.test(name)) throw new Error(`invalid table column name "${name}"`);
		if (!['string', 'number', 'boolean', 'list', 'map'].includes(type))
			throw new Error(`invalid table column type "${type}"`);
		if (columns.some((column) => column.name === name)) throw new Error(`duplicate table column "${name}"`);
		columns.push({ name, type });
	}
	if (columns.length === 0) throw new Error('table must declare at least one column');
	return columns;
}

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
	/** target tag for declared `ref` attributes, or `*` for any id-bearing node */
	readonly refTargets?: Readonly<Record<string, string>>;
	/** ref attributes which must form an acyclic graph */
	readonly acyclicRefs?: readonly string[];
}

/**
 * The `0.1` MWL tag schema: every tag with its attributes, children and `ref` targets. Pass a
 * different record to `compile`/`validate` to extend or replace the vocabulary.
 *
 * @example
 * ```ts
 * import { schema01 } from '@datamoc/mw_games/mwl';
 *
 * console.log(Object.keys(schema01).includes('game')); // true
 * ```
 */
export const schema01: Readonly<Record<string, MwlTagSchema>> = {
	game: {
		attributes: {
			schema: 'string',
			title: 'string',
			data_root: 'string',
			start_scene: 'id',
			default_schedule: 'id',
			save_slot: 'string',
			turn_limit: 'integer',
		},
		children: [
			'campaign',
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
			'table',
			//scenario-level data: placements, story beats, and named roles
			'object',
			'story',
			'role',
		],
	},
	campaign: {
		attributes: {
			id: 'id',
			name: 'string',
			title: 'string',
			description: 'string',
			start_scene: 'id',
			first_scenario: 'id',
		},
		// Scenario and campaign-extension tags belong to the owning game.
		openChildren: true,
	},
	table: {
		attributes: { id: 'id', columns: 'string', list_delimiter: 'string', map_delimiter: 'string' },
		children: ['row'],
	},
	row: { openAttributes: 'string' },
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
	unit: {
		attributes: {
			id: 'id',
			type: 'string',
			side: 'string',
			name: 'string',
			role: 'string',
			can_recruit: 'boolean',
			hp: 'integer',
			x: 'integer',
			y: 'integer',
		},
	},
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
			// Side ids are usually numbers in MWL content and converted Wesnoth data, but the
			// world keys sides by this id and `unit.side` holds it, so a named side is allowed.
			id: 'string',
			controller: 'id',
			gold: 'integer',
			income: 'integer',
			income_base: 'integer',
			income_per_village: 'integer',
			leader: 'id',
			team: 'integer',
			recruit: 'string',
			color: 'string',
			// Wesnoth's own side keys, as its data writes them: team_name groups sides into teams,
			// share_vision says whether a side shares what it sees, and the rest are flags a game
			// reads (fog/shroud/hidden/heal are yes/no there, not numbers).
			team_name: 'string',
			user_team_name: 'string',
			share_vision: 'string',
			village_gold: 'integer',
			heal: 'boolean',
			fog: 'boolean',
			shroud: 'boolean',
			hidden: 'boolean',
			flag: 'string',
		},
	},
	map: { attributes: { id: 'id', name: 'string', file: 'string', terrain: 'string' }, children: ['start'] },
	start: { attributes: { side: 'string', x: 'integer', y: 'integer' } },
	schedule: { attributes: { id: 'id' }, children: ['time'] },
	time: { attributes: { id: 'id', name: 'string', lawful_bonus: 'number' } },
	event: {
		attributes: {
			id: 'id',
			on: 'id',
			trigger: 'id',
			// `on=moveto` filters. All optional: `[event] on=moveto unit=scout` fires
			// for any hex that unit reaches, `x`/`y` narrow it to one hex.
			x: 'coordinate',
			y: 'coordinate',
			side: 'string',
			unit: 'string',
			// Defaults to true for moveto (a story beat fires once) and false for
			// start/turn (a per-turn event has to repeat).
			once: 'boolean',
		},
		children: [
			'condition',
			'filter',
			'filter_condition',
			'while',
			'foreach',
			'switch',
			'command',
			'say',
			'dialogue',
			'move',
			'attack',
			'spawn',
			'kill',
			'gold',
			'endlevel',
			'set_variable',
			'if',
			'else',
			'message',
			'teleport',
			'end_turn',
			'win',
			'lose',
			'hook',
			//WML action vocabulary: unit bookkeeping, terrain/village/fog, and firing an event
			'fire_event',
			'store_unit',
			'unstore_unit',
			'recall',
			'modify_unit',
			'heal_unit',
			'set_terrain',
			'capture_village',
			'clear_shroud',
			'role',
		],
	},
	objectives: {
		attributes: { side: 'string', victory: 'string', defeat: 'string' },
		children: ['victory', 'defeat'],
	},
	victory: {
		attributes: {
			side: 'string',
			condition: 'id',
			type: 'string',
			x: 'integer',
			y: 'integer',
			side_filter: 'string',
			turns: 'integer',
			gold: 'integer',
			hook: 'string',
			// generic predicate parameter, for `condition=hook` objectives
			value: 'integer',
		},
	},
	defeat: {
		attributes: {
			side: 'string',
			condition: 'id',
			type: 'string',
			x: 'integer',
			y: 'integer',
			side_filter: 'string',
			turns: 'integer',
			gold: 'integer',
			hook: 'string',
			value: 'integer',
		},
	},
	condition: {
		attributes: {
			condition: 'id',
			hook: 'string',
			variable: 'string',
			equals: 'string',
			not_equals: 'string',
			in: 'string',
			not_in: 'string',
			less_than: 'string',
			greater_than: 'string',
			less_than_or_equal_to: 'string',
			greater_than_or_equal_to: 'string',
		},
	},
	filter: {
		attributes: {
			side: 'string',
			type: 'string',
			not_type: 'string',
			unit: 'string',
			name: 'string',
			role: 'string',
			x: 'integer',
			y: 'integer',
			level: 'integer',
			alignment: 'id',
			can_recruit: 'boolean',
			leader: 'boolean',
		},
	},
	filter_condition: { children: ['variable', 'have_unit', 'predicate'] },
	variable: {
		attributes: {
			name: 'id',
			equals: 'string',
			not_equals: 'string',
			in: 'string',
			not_in: 'string',
			less_than: 'string',
			greater_than: 'string',
			less_than_or_equal_to: 'string',
			greater_than_or_equal_to: 'string',
		},
	},
	have_unit: {
		attributes: {
			id: 'string',
			type: 'string',
			side: 'string',
			name: 'string',
			role: 'string',
			can_recruit: 'boolean',
			x: 'integer',
			y: 'integer',
		},
	},
	predicate: { attributes: { name: 'id' }, openAttributes: 'string' },
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
	spawn: { attributes: { id: 'string', type: 'string', side: 'string', x: 'integer', y: 'integer', hp: 'integer' } },
	kill: { attributes: { unit: 'string', target: 'string' }, openAttributes: 'string' },
	gold: { attributes: { side: 'string', delta: 'integer', amount: 'integer' } },
	endlevel: {
		attributes: {
			result: 'id',
			side: 'string',
			bonus: 'integer',
			carryover_percentage: 'integer',
			carryover_add: 'boolean',
			next_scenario: 'id',
		},
	},
	set_variable: { attributes: { name: 'id', target: 'id', value: 'string' } },
	if: {
		attributes: { test: 'string' },
		children: [
			'condition',
			'while',
			'foreach',
			'switch',
			'if',
			'else',
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
			'while',
			'foreach',
			'switch',
			'if',
			'else',
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
	while: {
		attributes: { test: 'string', max_iterations: 'integer' },
		children: [
			'condition',
			'while',
			'foreach',
			'switch',
			'if',
			'else',
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
	foreach: {
		attributes: { variable: 'id', item: 'id', index: 'id' },
		children: [
			'while',
			'foreach',
			'switch',
			'if',
			'else',
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
	switch: {
		attributes: { variable: 'id' },
		children: ['case', 'default'],
	},
	case: {
		attributes: { equals: 'string' },
		children: [
			'while',
			'foreach',
			'switch',
			'if',
			'else',
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
			'dialogue',
		],
	},
	default: {
		children: [
			'while',
			'foreach',
			'switch',
			'if',
			'else',
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
			'dialogue',
		],
	},
	message: {
		// `speaker` is a display name, so it may contain spaces ("Orcish Grunt").
		attributes: { speaker: 'string', text: 'string', value: 'string', portrait: 'string', side: 'string' },
	},
	teleport: { attributes: { unit: 'string', target: 'string', x: 'integer', y: 'integer' } },
	end_turn: { attributes: {} },
	win: { attributes: { side: 'string' } },
	lose: { attributes: { side: 'string' } },
	say: { attributes: { speaker: 'id', text: 'string' } },
	dialogue: { attributes: { id: 'id', ref: 'id' }, children: ['say', 'choice', 'branch', 'message'] },
	choice: { attributes: { text: 'string', event: 'id', variable: 'id', equals: 'string' }, children: ['branch'] },
	branch: {
		attributes: { text: 'string' },
		children: ['message', 'say', 'command', 'set_variable', 'move', 'attack', 'spawn', 'kill', 'gold', 'hook'],
	},
	trait: { attributes: { id: 'id', name: 'string' }, children: ['effect'] },
	ability: { attributes: { id: 'id', name: 'string' }, children: ['effect'] },
	weapon_special: { attributes: { id: 'id', name: 'string' } },
	// A hook call: `name` is `type:hookName` and any further attributes are
	// passed to the hook as context.
	hook: { attributes: { name: 'string' }, openAttributes: 'string' },
	//WML action vocabulary (item 250). `[item]` is deliberately absent: the tag already means an
	//inventory item definition here, and WML's map placement would collide with it.
	fire_event: { attributes: { id: 'id', name: 'string' } },
	store_unit: { attributes: { variable: 'string', name: 'string' }, children: ['filter'] },
	unstore_unit: { attributes: { variable: 'string', name: 'string' } },
	recall: {
		attributes: { variable: 'string', id: 'string', unit: 'string', side: 'string', x: 'integer', y: 'integer' },
	},
	modify_unit: {
		attributes: { hp: 'integer', moves: 'integer', type: 'string', side: 'string', alive: 'boolean' },
		children: ['filter', 'set'],
	},
	set: { openAttributes: 'string' },
	heal_unit: {
		attributes: { amount: 'integer', hp: 'integer', side: 'string', type: 'string', x: 'integer', y: 'integer' },
		children: ['filter'],
	},
	set_terrain: { attributes: { terrain: 'string', x: 'integer', y: 'integer' } },
	capture_village: { attributes: { side: 'string', x: 'integer', y: 'integer', name: 'string' } },
	clear_shroud: { attributes: { side: 'string', x: 'integer', y: 'integer', radius: 'integer' } },
	role: {
		attributes: {
			role: 'string',
			name: 'string',
			type: 'string',
			not_type: 'string',
			unit: 'string',
			side: 'string',
			can_recruit: 'boolean',
			x: 'integer',
			y: 'integer',
		},
		children: ['filter'],
	},
	object: {
		attributes: { id: 'id', name: 'string', image: 'string', side: 'string', x: 'integer', y: 'integer' },
		children: ['filter'],
	},
	story: { attributes: { text: 'string', value: 'string', title: 'string', image: 'string', music: 'string' } },
	item: {
		attributes: { id: 'id', name: 'string', slot: 'id', stackable: 'boolean', weight: 'number' },
		children: ['effect'],
	},
	inventory: { attributes: { unit: 'string', side: 'string', items: 'string' } },
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
	ai: {
		attributes: {
			id: 'id',
			strategy: 'id',
			target: 'id',
			difficulty: 'number',
			scope: 'id',
			provider: 'id',
			algorithm: 'id',
			depth: 'integer',
			max_nodes: 'integer',
			player: 'string',
			moves: 'string',
			apply: 'string',
			terminal: 'string',
			evaluate: 'string',
		},
		children: ['behavior'],
	},
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

/**
 * Validates a parsed node tree against a schema, returning diagnostics rather than throwing.
 *
 * @example
 * ```ts
 * import { parse, validate } from '@datamoc/mw_games/mwl';
 *
 * console.log(validate(parse('[game]\nschema=0.1\n[/game]'))); // []
 * ```
 */
export function validate(nodes: readonly MwlNode[], schemas = schema01): MwlDiagnostic[] {
	const diagnostics: MwlDiagnostic[] = [];
	const ids = new Map<string, MwlNode[]>();
	const collectIds = (node: MwlNode): void => {
		const id = node.attributes.id;
		if (id) ids.set(id, [...(ids.get(id) ?? []), node]);
		node.children.forEach(collectIds);
	};
	nodes.forEach(collectIds);
	const references: Array<{ from: MwlNode; to: MwlNode; name: string }> = [];
	const visit = (node: MwlNode, openUnknown = false): void => {
		const definition = schemas[node.tag];
		if (!definition) {
			if (openUnknown) {
				// An open child is a game-owned attribute bag. Keep walking its subtree so
				// nested effect/filter nodes can remain opaque without losing their locations.
				node.children.forEach((child) => visit(child, true));
				return;
			}
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
			if (value !== undefined && type === 'ref') {
				const candidates = (ids.get(value) ?? []).filter((target) => {
					const targetTag = definition.refTargets?.[name];
					return !targetTag || targetTag === '*' || target.tag === targetTag;
				});
				if (candidates.length === 0)
					diagnostics.push({
						code: 'MWL_REF_MISSING',
						message: `${name} references missing target ${value}`,
						location: node.location,
					});
				else if (candidates.length > 1)
					diagnostics.push({
						code: 'MWL_REF_DUPLICATE',
						message: `${name} references ambiguous target ${value}`,
						location: node.location,
					});
				else if (definition.acyclicRefs?.includes(name))
					references.push({ from: node, to: candidates[0], name });
			}
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
			visit(child, definition.openChildren === true);
		}
	};
	nodes.forEach((node) => visit(node));
	validateTables(nodes, diagnostics);
	const visiting = new Set<MwlNode>();
	const visited = new Set<MwlNode>();
	const walkReference = (node: MwlNode, trail: MwlNode[]): void => {
		if (visiting.has(node)) {
			const repeated = trail.indexOf(node);
			diagnostics.push({
				code: 'MWL_REF_CYCLE',
				message: `reference cycle through ${trail
					.slice(repeated)
					.map((entry) => entry.attributes.id ?? entry.tag)
					.join(' -> ')}`,
				location: node.location,
			});
			return;
		}
		if (visited.has(node)) return;
		visiting.add(node);
		for (const reference of references.filter((entry) => entry.from === node))
			walkReference(reference.to, [...trail, node]);
		visiting.delete(node);
		visited.add(node);
	};
	for (const reference of references) walkReference(reference.from, []);
	return diagnostics.sort((a, b) => a.location.line - b.location.line || a.location.column - b.location.column);
}

function validateTables(nodes: readonly MwlNode[], diagnostics: MwlDiagnostic[]): void {
	const visit = (node: MwlNode): void => {
		if (node.tag === 'table') {
			let columns: MwlTableColumn[];
			try {
				columns = parseTableColumns(node.attributes.columns ?? '');
			} catch (error) {
				diagnostics.push({
					code: 'MWL_TABLE',
					message: String(error).replace(/^Error: /, ''),
					location: node.location,
				});
				columns = [];
			}
			const declared = new Map(columns.map((column) => [column.name, column]));
			for (const row of node.children.filter((child) => child.tag === 'row')) {
				for (const name of Object.keys(row.attributes)) {
					if (!declared.has(name))
						diagnostics.push({
							code: 'MWL_TABLE',
							message: `unknown table column ${name}`,
							location: row.location,
						});
				}
				for (const column of columns) {
					const value = row.attributes[column.name];
					if (value === undefined) {
						diagnostics.push({
							code: 'MWL_TABLE',
							message: `missing table column ${column.name}`,
							location: row.location,
						});
						continue;
					}
					try {
						coerceTableValue(
							value,
							column.type,
							column.name,
							node.attributes.list_delimiter,
							node.attributes.map_delimiter,
						);
					} catch (error) {
						diagnostics.push({
							code: 'MWL_TABLE',
							message: String(error).replace(/^Error: /, ''),
							location: row.location,
						});
					}
				}
			}
		}
		node.children.forEach(visit);
	};
	nodes.forEach(visit);
}

/**
 * Coerces one table cell from text using the column's type, accepting `yes`/`no` for booleans.
 *
 * @example
 * ```ts
 * import { coerceTableValue } from '@datamoc/mw_games/mwl';
 *
 * console.log(coerceTableValue('3', 'number', 'cost')); // 3
 * ```
 */
export function coerceTableValue(
	raw: string,
	type: CsvColumnType,
	column: string,
	listDelimiter = ';',
	mapDelimiter = '=',
): unknown {
	return coerceCsvValue(raw, type, {
		column,
		listDelimiter,
		mapDelimiter,
		acceptYesNo: true,
	});
}

/**
 * The rule behind the `id` value type: an identifier, allowed (unlike `ref`) to carry the
 * `[...]` index brackets a WML variable path uses, since `[set_variable] name=` and every
 * reader that takes that name type it as `id`. Exported so `readers.coerce` shares one
 * definition with the schema: a name the compiler accepts is a name an adapter's reader
 * accepts, rather than the two drifting into disagreeing about what an `id` is.
 *
 * @example
 * ```ts
 * import { isMwlId } from '@datamoc/mw_games/mwl';
 *
 * console.log(isMwlId('party[0].name')); // true - a variable path is an `id`
 * console.log(isMwlId('0bad')); // false - it does not start like an identifier
 * ```
 */
export function isMwlId(value: string): boolean {
	return /^[A-Za-z_][\w.[\]-]*$/.test(value);
}

function validType(value: string, type: MwlValueType): boolean {
	if (type === 'number') return Number.isFinite(Number(value));
	if (type === 'integer') return /^-?\d+$/.test(value);
	if (type === 'boolean') return value === 'true' || value === 'false' || value === 'yes' || value === 'no';
	if (type === 'ref') return /^[A-Za-z_][\w.-]*$/.test(value);
	if (type === 'coordinate') return /^-?\d+(?:\s*,\s*-?\d+|\s*-\s*-?\d+)*$/.test(value);
	if (type === 'id') return isMwlId(value);
	return true;
}
