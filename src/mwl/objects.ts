import type { MwlCompiledNode } from './compiler.ts';
import type { MwlDiagnostic } from './grammar.ts';
import type { MwlReadResult } from './readers.ts';
import { validAttributeValue, type MwlTagSchema } from './schema.ts';

/** Plain JSON output of a schema-directed node conversion. Child tags become fields. */
export interface MwlObject {
	[key: string]: string | number | boolean | MwlObject | MwlObject[];
}

/**
 * Converts compiled nodes into plain objects using the same schema as `compile`.
 * Attributes become fields; numbers and booleans are converted by their declared types.
 * Children are grouped by tag in source order. A tag with `cardinality.max: 1` becomes
 * one object, otherwise an array. Absent children and optional attributes stay absent.
 * Strings, references, enum values and coordinates stay strings. The result carries no
 * parser metadata and can be written directly as JSON. Diagnostics must be checked before use.
 *
 * @example
 * ```ts
 * import { compile, nodesToObjects } from '@datamoc/mw_games/mwl';
 * import type { MwlTagSchema } from '@datamoc/mw_games/mwl';
 * const schemas = {
 *   bridge: { attributes: { budget: 'number' }, children: ['anchor'] },
 *   anchor: { attributes: { x: 'number', fixed: 'boolean' }, children: [] },
 * } satisfies Record<string, MwlTagSchema>;
 * const game = compile("[{ tag: 'bridge', budget: 120, children: [{ tag: 'anchor', x: 4, fixed: true }] }]", { schemas });
 * const result = nodesToObjects(game.roots, schemas);
 * if (result.diagnostics.length) throw new Error(JSON.stringify(result.diagnostics));
 * console.log(result.value[0].budget); // 120 as a number
 * ```
 */
export function nodesToObjects(
	nodes: readonly MwlCompiledNode[],
	schemas: Readonly<Record<string, MwlTagSchema>>,
): MwlReadResult<MwlObject[]> {
	const diagnostics: MwlDiagnostic[] = [];
	function report(node: MwlCompiledNode, message: string): void {
		diagnostics.push({
			code: 'MWL_OBJECT',
			message,
			location: node.location ?? { file: '<mwl>', line: 1, column: 1 },
		});
	}
	function convert(node: MwlCompiledNode): MwlObject {
		const fields: MwlObject = {};
		const schema = Object.hasOwn(schemas, node.tag) ? schemas[node.tag] : undefined;
		if (!schema) {
			report(node, `no object schema for tag "${node.tag}"`);
			return fields;
		}
		for (const [key, raw] of Object.entries(node.attributes)) {
			const type =
				(schema.attributes && Object.hasOwn(schema.attributes, key) ? schema.attributes[key] : undefined) ??
				schema.openAttributes;
			if (!type || !validAttributeValue(raw, type)) {
				report(node, `invalid or undeclared attribute "${key}" on "${node.tag}"`);
				continue;
			}
			let value: string | number | boolean = raw;
			if (type === 'number' || type === 'integer') value = Number(raw);
			else if (type === 'boolean') value = raw === 'true' || raw === 'yes';
			Object.defineProperty(fields, key, { value, enumerable: true, writable: true, configurable: true });
		}
		for (const key of schema.required ?? []) {
			if (!Object.hasOwn(node.attributes, key))
				report(node, `missing required attribute "${key}" on "${node.tag}"`);
		}
		const children = new Map<string, MwlObject[]>();
		for (const child of node.children) {
			const group = children.get(child.tag) ?? [];
			group.push(convert(child));
			children.set(child.tag, group);
		}
		for (const [tag, group] of children) {
			if (Object.hasOwn(fields, tag)) {
				report(node, `attribute and child tag "${tag}" collide on "${node.tag}"`);
				continue;
			}
			const single = schema.cardinality?.[tag]?.max === 1;
			if (single && group.length > 1) report(node, `multiple "${tag}" children on "${node.tag}"`);
			Object.defineProperty(fields, tag, {
				value: single ? group[0] : group,
				enumerable: true,
				writable: true,
				configurable: true,
			});
		}
		return fields;
	}
	return { value: nodes.map(convert), diagnostics };
}
