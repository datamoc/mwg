import pyroeis from '@datamoc/pyroeis';
import type { LuaRefType } from '@datamoc/pyroeis';
import type { PyroeisScriptHostOptions } from './pyroeis.ts';

/** Values for the integration host; Lua functions and live tables can retain their identity. */
export type PyroeisValue =
	| null
	| boolean
	| number
	| string
	| bigint
	| Uint8Array
	| PyroeisReference
	| PyroeisValue[]
	| { readonly [key: string]: PyroeisValue }
	| Map<PyroeisValue, PyroeisValue>;

/** An owned Lua registry reference. Use runtime.call/coroutine for functions; dispose when no longer needed. */
export interface PyroeisReference {
	readonly type: 'function' | 'table' | 'thread' | 'userdata';
	dispose(): void;
}

/**
 * A Lua thread driven by the host: `resume` runs it until it yields or returns (`done`), and `values` are what it yielded or returned.
 */
export interface PyroeisCoroutine {
	readonly status: 'suspended' | 'running' | 'dead';
	resume(args?: readonly PyroeisValue[]): { readonly done: boolean; readonly values: readonly PyroeisValue[] };
	/** Runs pending close handlers with a fresh, bounded execution budget. */
	close(): void;
}

/** An empty Lua proxy table whose ordinary indexing always consults the game. */
export interface PyroeisTableBinding {
	get(key: string | number): PyroeisValue;
	set?(key: string | number, value: PyroeisValue): void;
	keys?(): readonly (string | number)[];
	length?(): number;
}

/** Script-host limits plus the `require` module table and an optional wall-clock budget. */
export interface PyroeisRuntimeOptions extends PyroeisScriptHostOptions {
	/** Exact module IDs mapped to embedded text sources; never filesystem or network paths. */
	readonly modules?: Readonly<Record<string, string>>;
	/** Optional wall-clock budget per call/resume, host callbacks included. */
	readonly timeLimit?: number;
}

/**
 * A Lua 5.4 state the host drives directly: run chunks, call and bind functions, hold references, and resume coroutines. Dotted `path` arguments address globals and nested tables. Call `dispose` to release the VM.
 */
export interface PyroeisRuntime {
	run(source: string, chunkName?: string): PyroeisValue;
	call(target: string | PyroeisReference, args?: readonly PyroeisValue[]): PyroeisValue;
	get(path: string): PyroeisValue;
	set(path: string, value: PyroeisValue): void;
	reference(path: string): PyroeisReference;
	defineFunction(path: string, callback: (...args: PyroeisValue[]) => PyroeisValue | void): void;
	/** The returned values are yielded to the host; resume arguments become the Lua call's results. */
	defineYieldingFunction(path: string, callback: (...args: PyroeisValue[]) => readonly PyroeisValue[]): void;
	createTable(binding: PyroeisTableBinding): PyroeisReference;
	/** Creates a thread from a function or adopts an existing Lua thread, with one host controller. */
	coroutine(target: string | PyroeisReference): PyroeisCoroutine;
	dispose(): void;
}

/**
 * Optional Lua integration host for a game-owned API, embedded modules and resumable handlers.
 * The JSON-only ScriptHost stays independent. This host opens no system libraries, compiles
 * text only and bounds calls, compilation and coroutine resumes. Tables read normally become
 * arrays/objects/Maps; reference() and createTable() retain Lua identity explicitly.
 * Host callbacks are trusted synchronous code. Proxy tables follow Lua's ordinary metatable
 * rules: rawget/rawset bypass bindings. Neither heap size nor arbitrary host code is bounded.
 *
 * @example
 * ```ts
 * import { createPyroeisRuntime } from '@datamoc/mw_games/mwl/pyroeis';
 *
 * const runtime = createPyroeisRuntime({ modules: { rules: 'return { cost = 4 }' } });
 * let gold = 10;
 * runtime.set('game.side', runtime.createTable({
 *   get: (key) => key === 'gold' ? gold : null,
 *   set: (key, value) => { if (key === 'gold' && typeof value === 'number') gold = value; },
 * }));
 * runtime.defineFunction('game.balance', () => gold);
 * runtime.defineYieldingFunction('game.ask', (prompt) => [prompt]);
 * runtime.run('function dialogue() game.side.gold = game.side.gold - require("rules").cost; return game.ask("Continue?") end');
 * const dialogue = runtime.coroutine('dialogue');
 * console.log(dialogue.resume().values); // ['Continue?']
 * console.log(dialogue.resume([true]).values); // [true]
 * runtime.dispose();
 * ```
 */
export function createPyroeisRuntime(options: PyroeisRuntimeOptions = {}): PyroeisRuntime {
	const { lua, lauxlib } = pyroeis;
	const instructionLimit = options.instructionLimit ?? 100_000;
	const memoryLimit = options.memoryLimit ?? 32 * 1024 * 1024;
	for (const [name, value] of [
		['instructionLimit', instructionLimit],
		['memoryLimit', memoryLimit],
	] as const) {
		if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive safe integer`);
	}
	if (options.timeLimit !== undefined && (!Number.isFinite(options.timeLimit) || options.timeLimit <= 0))
		throw new RangeError('timeLimit must be a positive finite number');
	const sources = new Map(Object.entries(options.modules ?? {}));
	for (const source of sources.values()) text(source);
	const vm = new pyroeis.PyroeisVm(undefined, options.seed ?? 0x6d7767, {
		sandbox: true,
		remove: ['print'],
		limits: { instructions: instructionLimit, totalAllocation: memoryLimit, timeMs: options.timeLimit },
	});
	const L = vm.state;
	let disposed = false;
	let depth = 0;
	const references = new Map<PyroeisReference, InstanceType<typeof pyroeis.LuaRef>>();
	const proxies = new Map<unknown, PyroeisReference>();
	const coroutines = new Map<unknown, PyroeisCoroutine>();
	const bytes = pyroeis.to_luastring;

	function text(source: string): void {
		if (typeof source !== 'string' || source.startsWith('\x1b'))
			throw new Error('Lua source must be text, not binary bytecode');
	}
	function limitError(): Error {
		return vm.luaError(`Lua ${vm.limitHit} limit exceeded`, '');
	}
	function pushPath(path: string): void {
		pathParts(path);
		vm.pushPath(L, path);
	}
	function guard<T>(action: () => T): T {
		if (disposed) throw new Error('Lua runtime is disposed');
		depth++;
		try {
			return vm.guarded(() => {
				// Indexing a bound table can execute Lua even during a host-side get/set,
				// so every operation runs protected and an error cannot panic the state.
				let result: T;
				try {
					result = vm.protect(action);
				} catch (error) {
					throw vm.limitHit === null ? error : limitError();
				}
				if (vm.limitHit !== null) throw limitError();
				return result;
			});
		} finally {
			depth--;
		}
	}
	function own(native: InstanceType<typeof pyroeis.LuaRef>): PyroeisReference {
		const ref: PyroeisReference = {
			type: native.type,
			dispose() {
				if (!references.delete(ref)) return;
				native.release();
				for (const [pointer, proxy] of proxies) if (proxy === ref) proxies.delete(pointer);
			},
		};
		references.set(ref, native);
		return ref;
	}
	function nativeRef(ref: PyroeisReference): InstanceType<typeof pyroeis.LuaRef> {
		const native = references.get(ref);
		if (!native) throw new Error('Lua reference is released or belongs to another runtime');
		return native;
	}
	function toNative(value: unknown, seen = new Map<object, unknown>(), depth = 0): unknown {
		if (depth > 128) throw new RangeError('Lua value is too deeply nested');
		if (value === undefined || value === null) return null;
		if (typeof value !== 'object') {
			if (!['boolean', 'number', 'string', 'bigint'].includes(typeof value))
				throw new TypeError('Unsupported Lua value');
			return value;
		}
		if (value instanceof Uint8Array) return value;
		if ('dispose' in value && typeof value.dispose === 'function' && 'type' in value)
			return nativeRef(value as PyroeisReference);
		if (seen.has(value)) return seen.get(value);
		if (value instanceof Map) {
			const result = new Map();
			seen.set(value, result);
			for (const [key, entry] of value)
				result.set(toNative(key, seen, depth + 1), toNative(entry, seen, depth + 1));
			return result;
		}
		if (
			!Array.isArray(value) &&
			Object.getPrototypeOf(value) !== Object.prototype &&
			Object.getPrototypeOf(value) !== null
		)
			throw new TypeError('Unsupported Lua value');
		const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
		seen.set(value, result);
		for (const [key, entry] of Object.entries(value))
			Object.defineProperty(result, key, {
				value: toNative(entry, seen, depth + 1),
				writable: true,
				enumerable: true,
				configurable: true,
			});
		return result;
	}
	function read(state: unknown, index: number, seen = new Map<unknown, PyroeisValue>(), depth = 0): PyroeisValue {
		if (depth > 128) throw new RangeError('Lua value is too deeply nested');
		const pointer = lua.lua_topointer(state, index);
		const proxy = proxies.get(pointer);
		if (proxy) return proxy;
		if (lua.lua_type(state, index) !== lua.LUA_TTABLE) {
			const value = vm.read(index, 0, state);
			if (value instanceof pyroeis.Userdata) throw new TypeError('Unsupported Lua light userdata');
			return value instanceof pyroeis.LuaRef ? own(value) : (value as PyroeisValue);
		}
		const previous = seen.get(pointer);
		if (previous) return previous;
		lua.lua_checkstack(state, 8);
		const table = lua.lua_absindex(state, index);
		const kind = vm.classifyKeys(state, table);
		let result: PyroeisValue;
		if (kind === 'array') result = [];
		else if (kind === 'map') result = new Map<PyroeisValue, PyroeisValue>();
		else result = {};
		seen.set(pointer, result);
		lua.lua_pushnil(state);
		while (lua.lua_next(state, table) !== 0) {
			const entry = read(state, -1, seen, depth + 1);
			if (result instanceof Map) result.set(read(state, -2, seen, depth + 1), entry);
			else if (Array.isArray(result)) result[Number(lua.lua_tointeger(state, -2)) - 1] = entry;
			else {
				const name = String(read(state, -2, seen, depth + 1));
				Object.defineProperty(result, name, {
					value: entry,
					enumerable: true,
					writable: true,
					configurable: true,
				});
			}
			lua.lua_pop(state, 1);
		}
		return result;
	}
	function callStack(args: number): PyroeisValue {
		if (lua.lua_pcall(L, args, 1, 0) !== lua.LUA_OK) vm.throwLuaError(L);
		return read(L, -1);
	}
	function pathParts(path: string): string[] {
		if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(path))
			throw new Error(`Invalid Lua global path: ${path}`);
		return path.split('.');
	}
	function setPath(path: string, push: () => void): void {
		const parts = pathParts(path);
		if (parts.length === 1) {
			push();
			lua.lua_setglobal(L, bytes(path));
			return;
		}
		lua.lua_getglobal(L, bytes(parts[0]));
		if (lua.lua_isnil(L, -1)) {
			lua.lua_pop(L, 1);
			lua.lua_newtable(L);
			lua.lua_pushvalue(L, -1);
			lua.lua_setglobal(L, bytes(parts[0]));
		}
		for (const part of parts.slice(1, -1)) {
			if (!lua.lua_istable(L, -1)) throw new Error(`Lua global path is not a table: ${path}`);
			lua.lua_getfield(L, -1, bytes(part));
			if (lua.lua_isnil(L, -1)) {
				lua.lua_pop(L, 1);
				lua.lua_newtable(L);
				lua.lua_pushvalue(L, -1);
				lua.lua_setfield(L, -3, bytes(part));
			}
			lua.lua_remove(L, -2);
		}
		if (!lua.lua_istable(L, -1)) throw new Error(`Lua global path is not a table: ${path}`);
		push();
		lua.lua_setfield(L, -2, bytes(parts.at(-1)!));
	}
	function protectedCallback(fn: (state: unknown) => number): (state: unknown) => number {
		return (state: unknown): number => {
			try {
				return fn(state);
			} catch (error) {
				lua.lua_pushstring(state, bytes(error instanceof Error ? error.message : String(error)));
				return lua.lua_error(state);
			}
		};
	}
	function callback(
		fn: (...args: PyroeisValue[]) => PyroeisValue | void | readonly PyroeisValue[],
		mode: 'single' | 'multi' | 'yield' = 'single',
	) {
		const pushResults = protectedCallback((state) => {
			const args = Array.from({ length: lua.lua_gettop(state) }, (_, index) => read(state, index + 1));
			const result = fn(...args);
			let values: readonly PyroeisValue[];
			if (mode === 'single') values = result === undefined ? [] : [result as PyroeisValue];
			else values = result as readonly PyroeisValue[];
			for (const value of values) vm.push(toNative(value), state);
			return values.length;
		});
		return (state: unknown): number => {
			const count = pushResults(state);
			return mode === 'yield' ? lua.lua_yield(state, count) : count;
		};
	}
	function capture(index: number): PyroeisReference {
		const luaType = lua.lua_type(L, index);
		if (![lua.LUA_TTABLE, lua.LUA_TFUNCTION, lua.LUA_TTHREAD, lua.LUA_TUSERDATA].includes(luaType))
			throw new Error('Only Lua tables, functions, threads and userdata can be referenced');
		lua.lua_pushvalue(L, index);
		// Pyroeis's own references are never tables, but a table is registry-owned the same way.
		const type = pyroeis.to_jsstring(lua.lua_typename(L, luaType)) as LuaRefType;
		return own(new pyroeis.LuaRef(vm, lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX), type));
	}
	function key(value: PyroeisValue): string | number {
		if (typeof value !== 'string' && typeof value !== 'number')
			throw new TypeError('Lua binding keys must be strings or numbers');
		return value;
	}

	const runtime: PyroeisRuntime = {
		run(source, chunkName = '=game') {
			text(source);
			return guard(() => {
				const buffer = bytes(source);
				const status = lauxlib.luaL_loadbufferx(L, buffer, buffer.length, bytes(chunkName), bytes('t'));
				if (status !== lua.LUA_OK) vm.throwLuaError(L);
				return callStack(0);
			});
		},
		call(target, args = []) {
			return guard(() => {
				if (typeof target === 'string') pushPath(target);
				else {
					if (target.type !== 'function') throw new TypeError('Lua call target must be a function');
					vm.push(nativeRef(target), L);
				}
				for (const value of args) vm.push(toNative(value), L);
				return callStack(args.length);
			});
		},
		get(path) {
			return guard(() => {
				pushPath(path);
				return read(L, -1);
			});
		},
		set(path, value) {
			guard(() => setPath(path, () => vm.push(toNative(value), L)));
		},
		reference(path) {
			return guard(() => {
				pushPath(path);
				return capture(-1);
			});
		},
		defineFunction(path, fn) {
			guard(() => setPath(path, () => lua.lua_pushjsfunction(L, callback(fn))));
		},
		defineYieldingFunction(path, fn) {
			guard(() => setPath(path, () => lua.lua_pushjsfunction(L, callback(fn, 'yield'))));
		},
		createTable(binding) {
			return guard(() => {
				lua.lua_newtable(L);
				const pointer = lua.lua_topointer(L, -1);
				lua.lua_newtable(L);
				const methods: Record<string, (...args: PyroeisValue[]) => PyroeisValue | void> = {
					__index: (_table, index) => binding.get(key(index)),
					__newindex: (_table, index, value) => {
						if (!binding.set) throw new Error('Lua table binding is read-only');
						binding.set(key(index), value);
					},
				};
				if (binding.length) methods.__len = () => binding.length!();
				for (const [name, fn] of Object.entries(methods)) {
					lua.lua_pushjsfunction(L, callback(fn));
					lua.lua_setfield(L, -2, bytes(name));
				}
				if (binding.keys) {
					lua.lua_pushjsfunction(
						L,
						protectedCallback((state) => {
							const keys = [...binding.keys!()];
							let index = 0;
							lua.lua_pushjsfunction(
								state,
								callback(() => {
									if (index === keys.length) return [];
									const next = keys[index++];
									return [next, binding.get(next)];
								}, 'multi'),
							);
							lua.lua_pushnil(state);
							lua.lua_pushnil(state);
							return 3;
						}),
					);
					lua.lua_setfield(L, -2, bytes('__pairs'));
				}
				lua.lua_pushboolean(L, false);
				lua.lua_setfield(L, -2, bytes('__metatable'));
				lua.lua_setmetatable(L, -2);
				const ref = capture(-1);
				proxies.set(pointer, ref);
				return ref;
			});
		},
		coroutine(target) {
			return guard(() => {
				if (typeof target === 'string') pushPath(target);
				else vm.push(nativeRef(target), L);
				let thread: unknown;
				if (lua.lua_isthread(L, -1)) thread = lua.lua_tothread(L, -1);
				else if (lua.lua_isfunction(L, -1)) {
					thread = lua.lua_newthread(L);
					lua.lua_pop(L, 1);
					lua.lua_xmove(L, thread, 1);
				} else throw new TypeError('Lua coroutine target must be a function or thread');
				if (coroutines.has(thread)) throw new Error('Lua coroutine already has a host controller');
				let closed = false;
				let running = false;
				let failure: string | undefined;
				const coroutine: PyroeisCoroutine = {
					get status() {
						if (closed || disposed) return 'dead';
						if (running) return 'running';
						const status = lua.lua_status(thread);
						return status === lua.LUA_YIELD || (status === lua.LUA_OK && lua.lua_gettop(thread) > 0)
							? 'suspended'
							: 'dead';
					},
					resume(args = []) {
						if (closed) throw new Error('Lua coroutine is closed');
						if (coroutine.status !== 'suspended')
							throw new Error(`Cannot resume ${coroutine.status} Lua coroutine`);
						return guard(() => {
							for (const value of args) vm.push(toNative(value), thread);
							running = true;
							try {
								const result = lua.lua_resume(thread, L, args.length);
								if (result !== lua.LUA_OK && result !== lua.LUA_YIELD) {
									// Keep the error on the thread stack until close(), so pending
									// __close handlers receive it instead of a discarded stack value.
									failure = vm.errorMessage(thread, -1);
									throw vm.luaError(failure, failure);
								}
								const values = Array.from({ length: lua.lua_gettop(thread) }, (_, index) =>
									read(thread, index + 1),
								);
								lua.lua_settop(thread, 0);
								if (result === lua.LUA_OK) coroutines.delete(thread);
								return { done: result === lua.LUA_OK, values };
							} finally {
								running = false;
							}
						});
					},
					close() {
						if (closed || disposed) return;
						if (running) throw new Error('Cannot close a running Lua coroutine');
						guard(() => {
							try {
								const result = lua.lua_closethread(thread, L);
								if (result !== lua.LUA_OK) {
									const message = vm.errorMessage(thread, -1);
									if (message !== failure) throw vm.luaError(message, message);
								}
							} finally {
								closed = true;
								coroutines.delete(thread);
							}
						});
					},
				};
				coroutines.set(thread, coroutine);
				return coroutine;
			});
		},
		dispose() {
			if (disposed) return;
			if (depth !== 0) throw new Error('Cannot dispose an active Lua runtime');
			let failure: unknown;
			try {
				for (const coroutine of coroutines.values()) {
					try {
						coroutine.close();
					} catch (error) {
						failure ??= error;
					}
				}
			} finally {
				for (const ref of references.keys()) ref.dispose();
				lua.lua_close(L);
				disposed = true;
			}
			if (failure !== undefined) throw failure;
		},
	};

	try {
		runtime.defineFunction('__mwg_source', (name) => {
			if (typeof name !== 'string' || !sources.has(name))
				throw new Error(`Unknown embedded Lua module: ${String(name)}`);
			return sources.get(name)!;
		});
		runtime.run(
			`
local compile, source = load, __mwg_source
__mwg_source = nil; __random = nil; load = nil
local cache, loading = {}, {}
function dofile(name)
  local fn, err = compile(source(name), '@' .. name, 't')
  if not fn then error(err, 2) end
  return fn()
end
local execute = dofile
function require(name)
  if cache[name] ~= nil and cache[name] ~= false then return cache[name] end
  if loading[name] then error('Cyclic embedded Lua module: ' .. name, 2) end
  local cleanup <close> = setmetatable({}, { __close = function() loading[name] = nil end })
  loading[name] = true
  local ok, result = pcall(execute, name)
  loading[name] = nil
  if not ok then error(result, 2) end
  if result == nil then result = true end
  cache[name] = result
  return result
end
math.randomseed = function() end
getmetatable('').__metatable = false
`,
			'=mwg-runtime',
		);
		runtime.defineFunction('math.random', (...args) => {
			if (args.length === 0) return vm.nextRandom();
			const lower = args.length === 1 ? 1 : args[0];
			const upper = args.length === 1 ? args[0] : args[1];
			if (
				args.length > 2 ||
				typeof lower !== 'number' ||
				typeof upper !== 'number' ||
				!Number.isSafeInteger(lower) ||
				!Number.isSafeInteger(upper) ||
				upper < lower ||
				!Number.isSafeInteger(upper - lower + 1)
			)
				throw new RangeError('math.random interval must contain safe integers');
			return lower + Math.floor(vm.nextRandom() * (upper - lower + 1));
		});
		return runtime;
	} catch (error) {
		runtime.dispose();
		throw error;
	}
}
