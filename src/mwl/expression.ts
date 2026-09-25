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

/** deepest parenthesis or `^` nesting, and most operators, one expression may hold: both bound
 * the recursion of parsing and of `evaluateExpression`, so hostile content fails with a message
 * instead of overflowing the stack */
const MAX_NESTING = 256;
const MAX_OPERATORS = 4096;
const NUMBER = /(?:\d+(?:\.\d*)?|\.\d+)/y;
const NAME = /[A-Za-z_][A-Za-z0-9_.-]*/y;

class Parser {
	private index = 0;
	private depth = 0;
	private operators = 0;
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
			this.operator();
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
			this.operator();
			left = { kind: 'binary', op, left, right: this.power() };
		}
	}
	private power(): MwlExpression {
		let left = this.primary();
		this.skip();
		if (this.peek('^')) {
			this.index++;
			this.operator();
			left = { kind: 'binary', op: '^', left, right: this.nested(() => this.power()) };
		}
		return left;
	}
	private primary(): MwlExpression {
		this.skip();
		if (this.peek('(')) {
			this.index++;
			const value = this.nested(() => this.expression());
			this.skip();
			if (!this.peek(')')) throw new Error('missing closing parenthesis in MWL expression');
			this.index++;
			return value;
		}
		const number = this.match(NUMBER);
		if (number) {
			this.index += number[0].length;
			return { kind: 'number', value: Number(number[0]) };
		}
		const name = this.match(NAME);
		if (name) {
			this.index += name[0].length;
			return { kind: 'variable', name: name[0] };
		}
		throw new Error(`expected number, variable, or parenthesis near "${this.rest()}"`);
	}
	/** a sticky match at the current position, without copying the rest of the source */
	private match(pattern: RegExp): RegExpExecArray | null {
		pattern.lastIndex = this.index;
		return pattern.exec(this.source);
	}
	private nested<T>(parse: () => T): T {
		if (++this.depth > MAX_NESTING) throw new Error(`MWL expression is nested more than ${MAX_NESTING} deep`);
		try {
			return parse();
		} finally {
			this.depth--;
		}
	}
	private operator(): void {
		if (++this.operators > MAX_OPERATORS)
			throw new Error(`MWL expression has more than ${MAX_OPERATORS} operators`);
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
	/** the unparsed remainder, shortened for an error message */
	rest(): string {
		const rest = this.source.slice(this.index, this.index + 40);
		return this.index + 40 < this.source.length ? `${rest}...` : rest;
	}
}
