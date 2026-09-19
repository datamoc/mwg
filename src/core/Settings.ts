import { defaultStorage, type SaveStorage } from './Save.ts';
import { DEFAULT_BINDINGS, importBindings, type Action } from './Input.ts';
import { clamp } from './Math.ts';

/** a game-defined value: hints on/off, a violence level, anything JSON-flat */
export type CustomSettingValue = string | number | boolean;

/** the player-facing values `Settings` persists; everything is renderer-free on purpose */
export interface GameSettings {
	/** background-music level, 0 to 1 */
	musicVolume: number;
	/** sound-effect level, 0 to 1 */
	sfxVolume: number;
	/** master mute: both effective volumes read 0 while true, levels are kept */
	muted: boolean;
	/** the zoom a game applies to its own `Camera`; never below 0.01, like `Camera` itself */
	zoom: number;
	/** key bindings, in the shape `Input.exportBindings` writes and `importBindings` reads */
	bindings: Record<Action, string[]>;
	/** game-defined values beyond the built-ins above (`hints`, `violence`, ...), keyed by name */
	custom: Record<string, CustomSettingValue>;
}

export interface SettingsOptions {
	/** namespaces the storage key, so two games sharing an origin never collide */
	namespace?: string;
	storage?: SaveStorage;
}

/**
 * The values a fresh game starts with: full volume, unmuted, zoom 1, default bindings.
 *
 * @example
 * ```ts
 * import { defaultSettings } from '@datamoc/mw_games/core';
 *
 * console.log(defaultSettings().zoom); // 1
 * ```
 */
export function defaultSettings(): GameSettings {
	return {
		musicVolume: 1,
		sfxVolume: 1,
		muted: false,
		zoom: 1,
		bindings: copyBindings(DEFAULT_BINDINGS),
		custom: {},
	};
}

/** what a game hands its own audio objects: 0 while muted, the stored level otherwise */
export function effectiveMusicVolume(settings: Pick<GameSettings, 'musicVolume' | 'muted'>): number {
	return settings.muted ? 0 : settings.musicVolume;
}

/** what a game hands its own sound effects: 0 while muted, the stored level otherwise */
export function effectiveSfxVolume(settings: Pick<GameSettings, 'sfxVolume' | 'muted'>): number {
	return settings.muted ? 0 : settings.sfxVolume;
}

/**
 * Persisted player settings: music and sound-effect levels, master mute, zoom preference,
 * and key bindings, read back on the next launch.
 *
 * The values live in `core` so they stay renderer-free; the wiring stays with the game,
 * which assigns them onto its own `Music`/`Sound`/`Camera` (see the example). Bindings are
 * the exception: they are applied to `Input` on load and on every bindings mutation,
 * since persisted keys that a game must remember to apply would silently do nothing.
 *
 * Corrupt storage reads as defaults rather than throwing: a settings screen should show
 * the defaults, not a crash.
 *
 * @example
 * ```ts
 * import { Settings, effectiveMusicVolume, effectiveSfxVolume } from '@datamoc/mw_games/core';
 *
 * const settings = new Settings({ namespace: 'my-game' });
 * settings.update({ musicVolume: 0.7, zoom: 2 });
 * settings.setCustom('hints', true);
 *
 * const music = { volume: 1 };
 * const camera = { zoom: 1 };
 * music.volume = effectiveMusicVolume(settings.current);
 * camera.zoom = settings.current.zoom;
 * console.log(effectiveSfxVolume(settings.current), settings.getCustom('hints', false));
 * ```
 */
export class Settings {
	private readonly storage: SaveStorage;
	private readonly key: string;
	private value: GameSettings;

	constructor(options: SettingsOptions = {}) {
		this.storage = options.storage ?? defaultStorage();
		this.key = `mwg-settings:${options.namespace ?? 'default'}`;
		this.value = readSettings(this.storage, this.key);
		importBindings(this.value.bindings);
	}

	/** a copy of the current values; mutating it writes nothing back, use the setters */
	get current(): GameSettings {
		return { ...this.value, bindings: copyBindings(this.value.bindings), custom: { ...this.value.custom } };
	}

	/** a game-defined value (`hints`, `violence`, ...), or `fallback` when never set */
	getCustom(key: string, fallback: CustomSettingValue): CustomSettingValue {
		return this.value.custom[key] ?? fallback;
	}

	/** stores a game-defined value and persists it */
	setCustom(key: string, value: CustomSettingValue): void {
		this.value.custom[key] = value;
		writeSettings(this.storage, this.key, this.value);
	}

	setMusicVolume(volume: number): void {
		this.update({ musicVolume: volume });
	}

	setSfxVolume(volume: number): void {
		this.update({ sfxVolume: volume });
	}

	setMuted(muted: boolean): void {
		this.update({ muted });
	}

	setZoom(zoom: number): void {
		this.update({ zoom });
	}

	setBindings(bindings: Readonly<Record<Action, readonly string[]>>): void {
		this.update({ bindings });
	}

	update(patch: {
		musicVolume?: number;
		sfxVolume?: number;
		muted?: boolean;
		zoom?: number;
		bindings?: Readonly<Record<Action, readonly string[]>>;
		custom?: Readonly<Record<string, CustomSettingValue>>;
	}): void {
		if (patch.musicVolume !== undefined) this.value.musicVolume = clampVolume(patch.musicVolume);
		if (patch.sfxVolume !== undefined) this.value.sfxVolume = clampVolume(patch.sfxVolume);
		if (patch.muted !== undefined) this.value.muted = patch.muted;
		if (patch.zoom !== undefined) this.value.zoom = clampZoom(patch.zoom);
		if (patch.bindings !== undefined) {
			this.value.bindings = sanitizeBindings(patch.bindings);
			importBindings(this.value.bindings);
		}
		if (patch.custom !== undefined) this.value.custom = sanitizeCustom(patch.custom);
		writeSettings(this.storage, this.key, this.value);
	}

	/** re-applies the stored bindings to `Input`, for a game that installed its own after this was built */
	applyBindings(): void {
		importBindings(this.value.bindings);
	}

	/** back to full volume, unmuted, zoom 1 and the default bindings, persisted */
	reset(): void {
		this.value = defaultSettings();
		importBindings(this.value.bindings);
		writeSettings(this.storage, this.key, this.value);
	}
}

function clampVolume(value: number): number {
	return Number.isFinite(value) ? clamp(value, 0, 1) : 1;
}

function clampZoom(value: number): number {
	return Number.isFinite(value) ? Math.max(0.01, value) : 1;
}

function copyBindings(bindings: Readonly<Record<Action, readonly string[]>>): Record<Action, string[]> {
	const out: Record<Action, string[]> = {};
	for (const [action, keys] of Object.entries(bindings)) out[action] = [...keys];
	return out;
}

function sanitizeBindings(raw: unknown): Record<Action, string[]> {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return copyBindings(DEFAULT_BINDINGS);
	const out: Record<Action, string[]> = {};
	for (const [action, keys] of Object.entries(raw as Record<string, unknown>)) {
		if (!Array.isArray(keys)) continue;
		const codes = keys.filter((key): key is string => typeof key === 'string');
		if (codes.length > 0) out[action] = codes;
	}
	return Object.keys(out).length > 0 ? out : copyBindings(DEFAULT_BINDINGS);
}

function isCustomValue(raw: unknown): raw is CustomSettingValue {
	const kind = typeof raw;
	return kind === 'string' || kind === 'number' || kind === 'boolean';
}

function sanitizeCustom(raw: unknown): Record<string, CustomSettingValue> {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
	const out: Record<string, CustomSettingValue> = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (isCustomValue(value)) out[key] = value;
	}
	return out;
}

function sanitizeSettings(raw: unknown): GameSettings {
	const defaults = defaultSettings();
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return defaults;
	const candidate = raw as Record<string, unknown>;
	return {
		musicVolume:
			typeof candidate.musicVolume === 'number' ? clampVolume(candidate.musicVolume) : defaults.musicVolume,
		sfxVolume: typeof candidate.sfxVolume === 'number' ? clampVolume(candidate.sfxVolume) : defaults.sfxVolume,
		muted: typeof candidate.muted === 'boolean' ? candidate.muted : defaults.muted,
		zoom: typeof candidate.zoom === 'number' ? clampZoom(candidate.zoom) : defaults.zoom,
		bindings: sanitizeBindings(candidate.bindings),
		custom: sanitizeCustom(candidate.custom),
	};
}

function readSettings(storage: SaveStorage, key: string): GameSettings {
	const raw = storage.read(key);
	if (!raw) return defaultSettings();
	try {
		return sanitizeSettings(JSON.parse(raw) as unknown);
	} catch {
		return defaultSettings();
	}
}

function writeSettings(storage: SaveStorage, key: string, value: GameSettings): void {
	storage.write(key, JSON.stringify(value));
}
