export type MwlConditionValue = string | number | boolean;
export type MwlConditionContext = Readonly<Record<string, MwlConditionValue>>;
export type MwlConditionHelper = (...args: readonly MwlConditionValue[]) => MwlConditionValue;

export interface MwlConditionOptions {
	readonly helpers?: Readonly<Record<string, MwlConditionHelper>>;
}

/** Evaluate the side-effect-free condition subset allowed in MWL content. */
export function evaluateCondition(
	source: string,
	context: MwlConditionContext,
	options: MwlConditionOptions = {},
): boolean {
	const whereIndex = source.search(/\s+where\s+/);
	const expression = whereIndex < 0 ? source : source.slice(0, whereIndex);
	const values: Record<string, MwlConditionValue> = { ...context };
	if (whereIndex >= 0) {
		for (const binding of source
			.slice(whereIndex)
			.replace(/^\s+where\s+/, '')
			.split(',')) {
			const match = /^\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.+)\s*$/.exec(binding);
			if (!match) throw new Error(`invalid MWL where binding: ${binding}`);
			const bindingParser = new ConditionParser(match[2], values, options.helpers ?? {});
			values[match[1]] = bindingParser.parseOr();
			if (!bindingParser.atEnd()) throw new Error(`invalid MWL where binding: ${binding}`);
		}
	}
	const parser = new ConditionParser(expression, values, options.helpers ?? {});
	const result = parser.parseOr();
	if (!parser.atEnd()) throw new Error(`unexpected token in MWL condition: ${parser.peek()}`);
	return asBoolean(result);
}

class ConditionParser {
	private readonly tokens: string[];
	private index = 0;
	private readonly context: MwlConditionContext;
	private readonly helpers: Readonly<Record<string, MwlConditionHelper>>;
	constructor(source: string, context: MwlConditionContext, helpers: Readonly<Record<string, MwlConditionHelper>>) {
		this.tokens = tokenize(source);
		this.context = context;
		this.helpers = helpers;
	}
	parseOr(): MwlConditionValue {
		let value = this.parseAnd();
		while (this.take('or')) value = asBoolean(value) || asBoolean(this.parseAnd());
		return value;
	}
	private parseAnd(): MwlConditionValue {
		let value = this.parseNot();
		while (this.take('and')) value = asBoolean(value) && asBoolean(this.parseNot());
		return value;
	}
	private parseNot(): MwlConditionValue {
		if (this.take('not')) return !asBoolean(this.parseNot());
		return this.parseComparison();
	}
	private parseComparison(): MwlConditionValue {
		const left = this.parseAdditive();
		const op = this.peek();
		if (!['==', '~=', '<', '<=', '>', '>='].includes(op)) return left;
		this.index++;
		const right = this.parseAdditive();
		if (op === '==') return left === right;
		if (op === '~=') return left !== right;
		if (typeof left !== 'number' || typeof right !== 'number') throw new Error(`${op} requires numeric operands`);
		if (op === '<') return left < right;
		if (op === '<=') return left <= right;
		if (op === '>') return left > right;
		return left >= right;
	}
	private parseAdditive(): MwlConditionValue {
		let value = this.parseMultiplicative();
		while (this.peek() === '+' || this.peek() === '-') {
			const op = this.tokens[this.index++];
			const right = this.parseMultiplicative();
			if (typeof value !== 'number' || typeof right !== 'number')
				throw new Error(`${op} requires numeric operands`);
			value = op === '+' ? value + right : value - right;
		}
		return value;
	}
	private parseMultiplicative(): MwlConditionValue {
		let value = this.parsePrimary();
		while (this.peek() === '*' || this.peek() === '/') {
			const op = this.tokens[this.index++];
			const right = this.parsePrimary();
			if (typeof value !== 'number' || typeof right !== 'number')
				throw new Error(`${op} requires numeric operands`);
			if (op === '/' && right === 0) throw new Error('division by zero in MWL condition');
			value = op === '*' ? value * right : value / right;
		}
		return value;
	}
	private parsePrimary(): MwlConditionValue {
		if (this.take('(')) {
			const value = this.parseOr();
			this.expect(')');
			return value;
		}
		const token = this.tokens[this.index++];
		if (token === undefined) throw new Error('incomplete MWL condition');
		if (/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return Number(token);
		if (token === 'true' || token === 'yes') return true;
		if (token === 'false' || token === 'no') return false;
		if (token.startsWith('"') || token.startsWith("'")) return token.slice(1, -1);
		const helper = this.helpers[token];
		if (helper && this.take('(')) {
			const args: MwlConditionValue[] = [];
			if (!this.take(')')) {
				do args.push(this.parseOr());
				while (this.take(','));
				this.expect(')');
			}
			return helper(...args);
		}
		const value = this.context[token];
		if (value === undefined) throw new Error(`missing MWL condition variable "${token}"`);
		return value;
	}
	private take(token: string): boolean {
		if (this.peek() !== token) return false;
		this.index++;
		return true;
	}
	private expect(token: string): void {
		if (!this.take(token)) throw new Error(`expected "${token}" in MWL condition`);
	}
	peek(): string {
		return this.tokens[this.index] ?? '<end>';
	}
	atEnd(): boolean {
		return this.index >= this.tokens.length;
	}
}

function tokenize(source: string): string[] {
	const tokens: string[] = [];
	const pattern =
		/\s*(?:("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|([A-Za-z_][A-Za-z0-9_.-]*)|(-?(?:\d+(?:\.\d*)?|\.\d+))|(==|~=|<=|>=|[()+*/,<>-]))/y;
	let index = 0;
	while (index < source.length) {
		pattern.lastIndex = index;
		const match = pattern.exec(source);
		if (!match) throw new Error(`invalid MWL condition near "${source.slice(index)}"`);
		tokens.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
		index = pattern.lastIndex;
	}
	return tokens;
}

function asBoolean(value: MwlConditionValue): boolean {
	return value !== false && value !== 0 && value !== '';
}
