declare module 'fengari' {
	export const lua: {
		readonly LUA_OK: number;
		readonly LUA_MULTRET: number;
		readonly LUA_MASKCOUNT: number;
		readonly LUA_TNIL: number;
		readonly LUA_TBOOLEAN: number;
		readonly LUA_TNUMBER: number;
		readonly LUA_TSTRING: number;
		readonly LUA_TTABLE: number;
		lua_close(state: unknown): void;
		lua_createtable(state: unknown, arraySize: number, recordSize: number): void;
		lua_getfield(state: unknown, index: number, key: Uint8Array): number;
		lua_getglobal(state: unknown, name: Uint8Array): number;
		lua_geti(state: unknown, index: number, i: number): number;
		lua_gettop(state: unknown): number;
		lua_isinteger(state: unknown, index: number): boolean;
		lua_next(state: unknown, index: number): number;
		lua_pcall(state: unknown, args: number, results: number, errorFunction: number): number;
		lua_pushboolean(state: unknown, value: boolean): void;
		lua_pushinteger(state: unknown, value: number): void;
		lua_pushjsfunction(state: unknown, callback: (state: unknown) => number): void;
		lua_pushnil(state: unknown): void;
		lua_pushnumber(state: unknown, value: number): void;
		lua_pushstring(state: unknown, value: Uint8Array): void;
		lua_setfield(state: unknown, index: number, key: Uint8Array): void;
		lua_setglobal(state: unknown, name: Uint8Array): void;
		lua_sethook(
			state: unknown,
			callback: ((state: unknown, event: number, line: number) => void) | null,
			mask: number,
			count: number,
		): void;
		lua_seti(state: unknown, index: number, i: number): void;
		lua_settop(state: unknown, index: number): void;
		lua_toboolean(state: unknown, index: number): boolean;
		lua_tonumber(state: unknown, index: number): number;
		lua_tointeger(state: unknown, index: number): number;
		lua_tojsstring(state: unknown, index: number): string | null;
		lua_type(state: unknown, index: number): number;
		lua_error(state: unknown): never;
	};
	export const lauxlib: {
		luaL_loadstring(state: unknown, source: Uint8Array): number;
		luaL_newstate(): unknown;
	};
	export const lualib: { luaL_openlibs(state: unknown): void };
	export const to_luastring: (value: string) => Uint8Array;
}
