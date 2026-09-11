// Fengari 0.1 intentionally ships JavaScript without TypeScript declarations.
// The checked subset is documented in fengari.d.ts.
// @ts-expect-error Fengari has no declarations in its npm package.
import { lauxlib, lua, lualib, to_luastring } from 'fengari';
import type { ScriptContext, ScriptEmit, ScriptHost, ScriptValue } from './scripts.ts';

export interface FengariScriptHostOptions {
	readonly instructionLimit?: number;
	readonly seed?: number;
}

const DEFAULT_INSTRUCTION_LIMIT = 100_000;

/** Optional Lua 5.3 host. Fengari is loaded only by this subpath, never by `mwg/mwl`. */
export function createFengariScriptHost(options: FengariScriptHostOptions = {}): ScriptHost {
	const state = lauxlib.luaL_newstate();
	lualib.luaL_openlibs(state);
	const limit = options.instructionLimit ?? DEFAULT_INSTRUCTION_LIMIT;
	if (!Number.isInteger(limit) || limit < 1) throw new RangeError('instructionLimit must be a positive integer');
	let randomState = (options.seed ?? 0x6d7767) >>> 0;
	let emit: ScriptEmit | undefined;

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

	const read = (index: number, depth = 0): ScriptValue => {
		const type = lua.lua_type(state, index);
		if (type === lua.LUA_TNIL) return null;
		if (type === lua.LUA_TBOOLEAN) return lua.lua_toboolean(state, index);
		if (type === lua.LUA_TNUMBER) return lua.lua_tonumber(state, index);
		if (type === lua.LUA_TSTRING) return lua.lua_tojsstring(state, index) ?? '';
		if (type !== lua.LUA_TTABLE) throw new Error('Lua result must be a JSON-compatible value');
		if (depth > 20) throw new Error('Lua result is nested too deeply');
		const result: Record<string, ScriptValue> = {};
		const tableIndex = index < 0 ? lua.lua_gettop(state) + index + 1 : index;
		lua.lua_pushnil(state);
		while (lua.lua_next(state, tableIndex) !== 0) {
			const key = lua.lua_isinteger(state, -2)
				? String(lua.lua_tointeger(state, -2))
				: lua.lua_tojsstring(state, -2);
			if (key === null) throw new Error('Lua table keys must be strings or integers');
			result[key] = read(-1, depth + 1);
			lua.lua_settop(state, -2);
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
		let remaining = limit;
		lua.lua_sethook(
			state,
			() => {
				remaining -= limit > 1000 ? 1000 : 1;
				if (remaining <= 0) {
					lua.lua_pushstring(state, to_luastring('Lua instruction limit exceeded'));
					lua.lua_error(state);
				}
			},
			lua.LUA_MASKCOUNT,
			limit > 1000 ? 1000 : 1,
		);
		const status = lua.lua_pcall(state, args, results, 0);
		lua.lua_sethook(state, null, 0, 0);
		if (status !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(state, -1) ?? 'Lua execution error');
		return results === 0 ? null : read(-1);
	};

	const run = (source: string, results: number): ScriptValue => {
		lua.lua_settop(state, 0);
		const loadStatus = lauxlib.luaL_loadstring(state, to_luastring(source));
		if (loadStatus !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(state, -1) ?? 'Lua syntax error');
		return protectedCall(0, results);
	};

	const install = (context: ScriptContext, callback?: ScriptEmit): void => {
		emit = callback;
		setContext(context);
		lua.lua_pushjsfunction(state, (currentState: unknown) => {
			const name = lua.lua_tojsstring(currentState, 1) ?? '';
			const payload = lua.lua_gettop(currentState) > 1 ? read(2) : undefined;
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
			'os=nil; io=nil; debug=nil; package=nil; require=nil; dofile=nil; loadfile=nil; load=nil; math.random=__mwg_random; math.randomseed=function() end';
		run(sandbox, 0);
	};

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
			lua.lua_settop(state, 0);
			lua.lua_getglobal(state, to_luastring(name));
			args.forEach(push);
			return protectedCall(args.length, 1);
		},
		dispose() {
			lua.lua_close(state);
		},
	};
}
