import { evaluateExpression } from './expression.ts';

/** A deliberately small boundary for executable game content. */
export type ScriptValue = null | boolean | number | string | ScriptValue[] | { readonly [key: string]: ScriptValue };

export type ScriptContext = Readonly<Record<string, ScriptValue>>;

export type ScriptEmit = (name: string, payload?: ScriptValue) => void;

export interface ScriptHost {
	evaluate(source: string, context?: ScriptContext): ScriptValue;
	execute(source: string, context?: ScriptContext, emit?: ScriptEmit): void;
	call(name: string, args?: readonly ScriptValue[], context?: ScriptContext, emit?: ScriptEmit): ScriptValue;
	dispose(): void;
}

/**
 * Default host for MWL formulas. It never executes statements or calls code.
 *
 * @example
 * ```ts
 * import { createExpressionScriptHost } from '@datamoc/mw_games/mwl';
 *
 * const host = createExpressionScriptHost();
 * console.log(host.evaluate('level * 2', { level: 3 })); // 6
 * host.dispose();
 * ```
 */
export function createExpressionScriptHost(): ScriptHost {
	return {
		evaluate(source, context = {}) {
			const numbers: Record<string, number> = {};
			for (const [key, value] of Object.entries(context)) {
				if (typeof value !== 'number') throw new Error(`MWL expression context value must be numeric: ${key}`);
				numbers[key] = value;
			}
			return evaluateExpression(source, numbers);
		},
		execute() {
			throw new Error('the expression ScriptHost cannot execute statements');
		},
		call() {
			throw new Error('the expression ScriptHost cannot call functions');
		},
		dispose() {},
	};
}
