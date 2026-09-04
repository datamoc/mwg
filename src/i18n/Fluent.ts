import type { Catalog, Direction, MessageParams } from './index.ts';

export interface FluentOptions {
	direction?: Direction;
}

type Variant = { key: string; value: string; default: boolean };

/** Parses the useful, dependency-free subset of FTL used by game message catalogs. */
export function parseFTL(locale: string, source: string, options: FluentOptions = {}): Catalog {
	const messages: Record<string, string | { format(params?: MessageParams): string }> = {};
	const lines = source.replace(/\r/g, '').split('\n');
	let id: string | null = null;
	let value = '';
	let variants: Variant[] = [];
	let selectClosed = false;

	const finish = (): void => {
		if (!id) return;
		if (messages[id] !== undefined) throw new Error(`Duplicate FTL message: ${id}`);
		if (variants.length) {
			if (!selectClosed) throw new Error(`FTL select expression is not closed: ${id}`);
			const selector = value.trim().match(/^\{\s*\$([\w-]+)\s*->\s*$/)?.[1];
			if (!selector) throw new Error(`Invalid FTL selector: ${value}`);
			messages[id] = selectMessage(locale, selector, variants);
		} else {
			messages[id] = normalize(value);
		}
		id = null;
		value = '';
		variants = [];
		selectClosed = false;
	};

	for (const line of lines) {
		if (!line.trim() || line.trimStart().startsWith('#')) continue;
		const message = line.match(/^([\w-]+)\s*=\s*(.*)$/);
		if (message) {
			finish();
			id = message[1];
			value = message[2];
			continue;
		}
		if (!id) throw new Error(`FTL continuation has no message: ${line}`);
		if (line.trim() === '}') {
			if (!variants.length || selectClosed) throw new Error(`Unexpected FTL select terminator: ${line}`);
			selectClosed = true;
			continue;
		}
		if (selectClosed) throw new Error(`FTL content follows a closed select expression: ${line}`);
		const variant = line.match(/^\s*(\*)?\[([^\]]+)\]\s*(.*)$/);
		if (variant) {
			variants.push({ key: variant[2], value: variant[3], default: Boolean(variant[1]) });
			continue;
		}
		if (/^\s+/.test(line)) {
			if (variants.length) variants[variants.length - 1].value += ` ${line.trim()}`;
			else value += ` ${line.trim()}`;
			continue;
		}
		throw new Error(`Invalid FTL line: ${line}`);
	}
	finish();
	return { locale, direction: options.direction ?? (/^(ar|he|fa|ur)(?:-|$)/i.test(locale) ? 'rtl' : 'ltr'), messages };
}

function normalize(text: string): string {
	return text.replace(/\{\s*\$([\w-]+)\s*\}/g, '{$1}').trim();
}

function selectMessage(locale: string, selectorName: string, variants: Variant[]): { format(params?: MessageParams): string } {
	const defaults = variants.filter((variant) => variant.default);
	if (defaults.length !== 1) throw new Error('FTL select expressions need exactly one default variant');
	const defaultVariant = defaults[0];
	const rules = new Intl.PluralRules(locale);
	return {
		format(params = {}) {
			const selector = params[selectorName];
			const exact = variants.find((variant) => variant.key === String(selector));
			const category = typeof selector === 'number' ? rules.select(selector) : '';
			const chosen = exact ?? variants.find((variant) => variant.key === category) ?? defaultVariant;
			return normalize(chosen.value);
		},
	};
}
