/** Small, game-neutral numeric expressions used by MWL effects.
 *
 * MWG only evaluates arithmetic. A game supplies the variables, so names such as
 * `level` or `missing_hp_fraction` remain game vocabulary rather than MWG rules.
 */
export type MwlExpression =
	| { readonly kind: 'number'; readonly value: number }
	| { readonly kind: 'variable'; readonly name: string }
	| {
			readonly kind: 'binary';
			readonly op: '+' | '-' | '*' | '/' | '^';
			readonly left: MwlExpression;
			readonly right: MwlExpression;
	  };

export type MwlExpressionContext = Readonly<Record<string, number>>;

/**
 * Parses the small arithmetic grammar MWL effects use into an expression tree.
 *
 * @example
 * ```ts
 * import { parseExpression } from '@datamoc/mw_games/mwl';
 *
 * console.log(parseExpression('level * 2 + 1'));
 * ```
 */
export function parseExpression(source: string): MwlExpression {
	const parser = new Parser(source);
	const result = parser.expression();
	parser.skip();
	if (!parser.atEnd()) throw new Error(`invalid MWL expression near "${parser.rest()}"`);
	return result;
}

/**
 * Evaluates an expression against a numeric context. A string is parsed first, so callers can
 * pass content text straight through; a missing or non-numeric variable is an error, not zero.
 *
 * @example
 * ```ts
 * import { evaluateExpression } from '@datamoc/mw_games/mwl';
 *
 * console.log(evaluateExpression('level * 2', { level: 3 })); // 6
 * ```
 */
export function evaluateExpression(expression: MwlExpression | string, context: MwlExpressionContext): number {
	const node = typeof expression === 'string' ? parseExpression(expression) : expression;
	if (node.kind === 'number') return node.value;
	if (node.kind === 'variable') {
		const value = context[node.name];
		if (value === undefined || !Number.isFinite(value))
			throw new Error(`missing MWL expression variable "${node.name}"`);
		return value;
	}
	const left = evaluateExpression(node.left, context);
	const right = evaluateExpression(node.right, context);
	if (node.op === '+') return left + right;
	if (node.op === '-') return left - right;
	if (node.op === '*') return left * right;
	if (node.op === '/') {
		if (right === 0) throw new Error('division by zero in MWL expression');
		return left / right;
	}
	return left ** right;
}

class Parser {
	private index = 0;
	private readonly source: string;
	constructor(source: string) {
		this.source = source;
	}
	expression(): MwlExpression {
		return this.additive();
	}
	private additive(): MwlExpression {
		let left = this.multiplicative();
		while (true) {
			this.skip();
			const op = this.peek('+') ? '+' : this.peek('-') ? '-' : null;
			if (!op) return left;
			this.index++;
			left = { kind: 'binary', op, left, right: this.multiplicative() };
		}
	}
	private multiplicative(): MwlExpression {
		let left = this.power();
		while (true) {
			this.skip();
			const op = this.peek('*') ? '*' : this.peek('/') ? '/' : null;
			if (!op) return left;
			this.index++;
			left = { kind: 'binary', op, left, right: this.power() };
		}
	}
	private power(): MwlExpression {
		let left = this.primary();
		this.skip();
		if (this.peek('^')) {
			this.index++;
			left = { kind: 'binary', op: '^', left, right: this.power() };
		}
		return left;
	}
	private primary(): MwlExpression {
		this.skip();
		if (this.peek('(')) {
			this.index++;
			const value = this.expression();
			this.skip();
			if (!this.peek(')')) throw new Error('missing closing parenthesis in MWL expression');
			this.index++;
			return value;
		}
		const number = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(this.rest());
		if (number) {
			this.index += number[0].length;
			return { kind: 'number', value: Number(number[0]) };
		}
		const name = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(this.rest());
		if (name) {
			this.index += name[0].length;
			return { kind: 'variable', name: name[0] };
		}
		throw new Error(`expected number, variable, or parenthesis near "${this.rest()}"`);
	}
	private peek(value: string): boolean {
		return this.source[this.index] === value;
	}
	skip(): void {
		while (/\s/.test(this.source[this.index] ?? '')) this.index++;
	}
	atEnd(): boolean {
		return this.index >= this.source.length;
	}
	rest(): string {
		return this.source.slice(this.index);
	}
}
