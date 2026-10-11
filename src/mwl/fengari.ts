import fengari from '@datamoc/fengari';
import type { LuaToJsOptions, LuaToJsResult } from '@datamoc/fengari';
const { lauxlib, lua, lualib } = fengari;
const to_luastring = (str: string) => new TextEncoder().encode(str);
import type { ScriptContext, ScriptEmit, ScriptHost, ScriptValue } from './scripts.ts';

export { createFengariRuntime } from './fengari-runtime.ts';
export type {
	FengariValue,
	FengariReference,
	FengariCoroutine,
	FengariTableBinding,
	FengariRuntimeOptions,
	FengariRuntime,
} from './fengari-runtime.ts';

export type { LuaToJsOptions, LuaToJsResult };

/**
 * Translates Lua source to readable JavaScript without running it, for a game that
 * is leaving Lua scripting behind. Metatables, coroutines, general `goto` and some
 * patterns are not translated: they stay as `TODO(lua2js)` comments and `warnings`.
 * Throws a `LuaSyntaxError` for source that does not parse.
 *
 * @example
 * ```ts
 * import { luaToJs } from '@datamoc/mw_games/mwl/fengari';
 *
 * const { code } = luaToJs('function double(n) return n * 2 end', { format: 'esm' });
 * ```
 */
export function luaToJs(source: string, options: LuaToJsOptions = {}): LuaToJsResult {
	return fengari.FengariVm.toJs(source, options);
}

export interface FengariScriptHostOptions {
	readonly instructionLimit?: number;
	/** bytes of string and buffer data one call may allocate; defaults to 32 MB */
	readonly memoryLimit?: number;
	readonly seed?: number;
}

const DEFAULT_INSTRUCTION_LIMIT = 100_000;
const DEFAULT_MEMORY_LIMIT = 32 * 1024 * 1024;

/**
 * Optional Lua 5.4 host. Fengari is loaded only by this subpath, never by `mwg/mwl`.
 *
 * Sandboxed for untrusted scripts: only the base, coroutine, math, string, table and utf8
 * libraries are opened (`io`, `os`, `debug` and `package` with its `require` are never
 * constructed, identically in Node and the browser), the base library's `load`, `loadfile`
 * and `dofile` are removed, every chunk is compiled in text mode so binary bytecode is
 * rejected, `math.random` is the host's seeded stream, and every call is bounded by
 * `instructionLimit` and by `memoryLimit` (bytes of string and buffer data the call
 * allocates, parsing included). The byte budget is enforced through the fork's per-state
 * allocation hook, so a refused allocation surfaces to scripts as Lua's standard
 * `not enough memory` even under a script-level `pcall`, but the host rejects the whole
 * call regardless. Globals persist between calls on one host, so scripts that must not
 * influence each other need a host each.
 *
 * @example
 * ```ts
 * import { createFengariScriptHost } from '@datamoc/mw_games/mwl/fengari';
 *
 * const host = createFengariScriptHost();
 * console.log(host.evaluate('1 + 2')); // 3
 * host.dispose();
 * ```
 */
export function createFengariScriptHost(options: FengariScriptHostOptions = {}): ScriptHost {
	const limit = options.instructionLimit ?? DEFAULT_INSTRUCTION_LIMIT;
	if (!Number.isInteger(limit) || limit < 1) throw new RangeError('instructionLimit must be a positive integer');
	const memoryLimit = options.memoryLimit ?? DEFAULT_MEMORY_LIMIT;
	if (!Number.isInteger(memoryLimit) || memoryLimit < 1)
		throw new RangeError('memoryLimit must be a positive integer');
	let randomState = (options.seed ?? 0x6d7767) >>> 0;
	let emit: ScriptEmit | undefined;
	// Keep our text-only loader and JSON conversion, but share Fengari's guard with
	// native operations, coroutine resumes and script-level protected calls.
	const vm = new fengari.FengariVm(undefined, options.seed, {
		sandbox: true,
		libs: [],
		remove: ['load', 'print', '__random'],
		limits: { instructions: limit, totalAllocation: memoryLimit },
	});
	const state = vm.state;
	// Open the native libraries after construction to keep the original print function,
	// rather than FengariVm's accumulating output buffer.
	lualib.luaL_openselectedlibs(
		state,
		lualib.LUA_GLIBK |
			lualib.LUA_COLIBK |
			lualib.LUA_MATHLIBK |
			lualib.LUA_STRLIBK |
			lualib.LUA_TABLIBK |
			lualib.LUA_UTF8LIBK,
		0,
	);

	const push = (value: ScriptValue): void => {
		if (value === null) return lua.lua_pushnil(state);
		if (typeof value === 'boolean') return lua.lua_pushboolean(state, value);
		if (typeof value === 'number') return lua.lua_pushnumber(state, value);
		if (typeof value === 'string') return lua.lua_pushstring(state, to_luastring(value));
		lua.lua_createtable(
			state,
			Array.isArray(value) ? value.length : 0,
			Array.isArray(value) ? 0 : Object.keys(value).length,
		);
		if (Array.isArray(value)) {
			value.forEach((entry, index) => {
				push(entry);
				lua.lua_seti(state, -2, index + 1);
			});
		} else {
			for (const [key, entry] of Object.entries(value)) {
				push(entry);
				lua.lua_setfield(state, -2, to_luastring(key));
			}
		}
	};

	const read = (L: unknown, index: number, depth = 0): ScriptValue => {
		const type = lua.lua_type(L, index);
		if (type === lua.LUA_TNIL) return null;
		if (type === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, index);
		if (type === lua.LUA_TNUMBER) return lua.lua_tonumber(L, index);
		if (type === lua.LUA_TSTRING) return lua.lua_tojsstring(L, index) ?? '';
		if (type !== lua.LUA_TTABLE) throw new Error('Lua result must be a JSON-compatible value');
		if (depth > 20) throw new Error('Lua result is nested too deeply');
		const result: Record<string, ScriptValue> = {};
		const tableIndex = index < 0 ? lua.lua_gettop(L) + index + 1 : index;
		lua.lua_pushnil(L);
		while (lua.lua_next(L, tableIndex) !== 0) {
			const key = lua.lua_isinteger(L, -2) ? String(lua.lua_tointeger(L, -2)) : lua.lua_tojsstring(L, -2);
			if (key === null) throw new Error('Lua table keys must be strings or integers');
			result[key] = read(L, -1, depth + 1);
			lua.lua_settop(L, -2);
		}
		return result;
	};

	const setContext = (context: ScriptContext = {}): void => {
		for (const [key, value] of Object.entries(context)) {
			if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
			push(value);
			lua.lua_setglobal(state, to_luastring(key));
		}
	};

	const protectedCall = (args: number, results: number): ScriptValue => {
		const status = lua.lua_pcall(state, args, results, 0);
		if (vm.limitHit !== null) {
			lua.lua_settop(state, 0);
			throw new Error(`Lua ${vm.limitHit === 'memory' ? 'memory' : 'instruction'} limit exceeded`);
		}
		if (status !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(state, -1) ?? 'Lua execution error');
		return results === 0 ? null : read(state, -1);
	};

	const run = (source: string, results: number): ScriptValue =>
		vm.guarded(() => {
			lua.lua_settop(state, 0);
			const bytes = to_luastring(source);
			//'t' compiles text only: a '\x1bLua' binary dump must never reach the bytecode undumper
			const loadStatus = lauxlib.luaL_loadbufferx(state, bytes, bytes.length, bytes, to_luastring('t'));
			if (loadStatus !== lua.LUA_OK) {
				//a budget exhausted by parsing itself is a limit error, not a syntax error
				if (vm.limitHit === 'memory') throw new Error('Lua memory limit exceeded');
				throw new Error(lua.lua_tojsstring(state, -1) ?? 'Lua syntax error');
			}
			return protectedCall(0, results);
		});

	const install = (context: ScriptContext, callback?: ScriptEmit): void => {
		emit = callback;
		setContext(context);
		lua.lua_pushjsfunction(state, (currentState: unknown) => {
			const name = lua.lua_tojsstring(currentState, 1) ?? '';
			const payload = lua.lua_gettop(currentState) > 1 ? read(currentState, 2) : undefined;
			//host-side code: the allocation hook charges only the VM's own strings and buffers
			emit?.(name, payload);
			return 0;
		});
		lua.lua_setglobal(state, to_luastring('mwg_emit'));
		lua.lua_pushjsfunction(state, (currentState: unknown) => {
			randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
			lua.lua_pushnumber(currentState, randomState / 0x1_0000_0000);
			return 1;
		});
		lua.lua_setglobal(state, to_luastring('__mwg_random'));
		const sandbox =
			'load=nil; loadfile=nil; dofile=nil; __random=nil; string.dump=nil; math.random=__mwg_random; math.randomseed=function() end';
		run(sandbox, 0);
	};
	//hides the string metatable (the `string` library itself) from `getmetatable("")`
	run('getmetatable("").__metatable = false', 0);

	return {
		evaluate(source, context = {}) {
			install(context);
			return run(`return (${source})`, 1);
		},
		execute(source, context = {}, callback) {
			install(context, callback);
			run(source, 0);
		},
		call(name, args = [], context = {}, callback) {
			install(context, callback);
			return vm.guarded(() => {
				lua.lua_settop(state, 0);
				lua.lua_getglobal(state, to_luastring(name));
				args.forEach(push);
				return protectedCall(args.length, 1);
			});
		},
		dispose() {
			lua.lua_close(state);
		},
	};
}
