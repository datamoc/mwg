import type { MwlCompiledNode } from './compiler.ts';

export function flattenNodes(roots: readonly MwlCompiledNode[]): MwlCompiledNode[] {
	const result: MwlCompiledNode[] = [];
	const visit = (node: MwlCompiledNode): void => {
		result.push(node);
		node.children.forEach(visit);
	};
	roots.forEach(visit);
	return result;
}

export function requiredAttribute(node: MwlCompiledNode, name: string): string {
	const value = node.attributes[name];
	if (!value) throw new Error(`MWL ${node.tag} is missing ${name}`);
	return value;
}

export function numberAttribute(node: MwlCompiledNode, name: string): number | undefined {
	const value = node.attributes[name];
	if (value === undefined) return undefined;
	const result = Number(value);
	return Number.isFinite(result) ? result : undefined;
}

export function integerAttribute(node: MwlCompiledNode, name: string, fallback?: number): number | undefined {
	const value = node.attributes[name];
	if (value === undefined) return fallback;
	const result = Number.parseInt(value, 10);
	return Number.isFinite(result) ? result : fallback;
}

export function booleanAttribute(node: MwlCompiledNode, name: string): boolean | undefined {
	const value = node.attributes[name];
	return value === undefined ? undefined : value === 'true' || value === 'yes';
}

export function enumAttribute<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
	return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}
