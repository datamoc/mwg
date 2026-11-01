import { Container } from 'pixi.js';
import type { Texture2D } from './Types2D.ts';
import { ParticleEmitter, type ParticleSpawnArea } from './Particles.ts';

/**
 * The weather a screen shows. `clear` stops emission and lets the last particles fall out.
 */
export type WeatherKind = 'clear' | 'rain' | 'storm' | 'snow';

/** the kinds that emit anything, which is what `weatherPreset` accepts after `clear` is handled */
export type EmittingWeather = Exclude<WeatherKind, 'clear'>;

export interface WeatherPresetOptions {
	/** the screen or map area to cover, in world units */
	width: number;
	height: number;

	/**
	 * How hard it comes down, 0 to 1: scales the emission rate, the pool size and the
	 * opacity together, so a drizzle and a downpour are the same preset at two settings
	 * rather than two hand-tuned emitters. 1 when omitted.
	 */
	power?: number;

	/**
	 * Sideways drift, in radians, added to the preset's own fall angle - positive leans
	 * the fall to the right. A storm preset already carries its own lean; this is for a
	 * game that wants the wind to change with the map.
	 */
	wind?: number;
}

/** the resulting emitter options, including the spawn strip above the visible area */
export interface WeatherPreset {
	/** the screen the preset was built for, so `WeatherLayer` can rebuild on resize */
	readonly width: number;
	readonly height: number;
	readonly spawn: ParticleSpawnArea;
	readonly rate: number;
	readonly max: number;
	readonly life: readonly [number, number];
	readonly speed: readonly [number, number];
	readonly angle: readonly [number, number];
	readonly gravity: { readonly x: number; readonly y: number };
	readonly scale: readonly [number, number];
	readonly alpha: readonly [number, number];
	readonly tint: number;
	texture?: Texture2D;
}

const halfPi = Math.PI / 2;

/** the spawn strip's own height, used to sit the emitter just above the visible area */
function spawnHeightOf(preset: WeatherPreset): number {
	return preset.spawn?.height ?? Math.max(8, preset.height * 0.06);
}

/**
 * The emitter settings behind one weather kind, without an emitter or a texture: pure data a
 * test can compare and a game can tweak before building its own `ParticleEmitter`.
 *
 * `power` scales count and opacity, never speed, so lowering it makes less weather rather
 * than slower weather. Particles are born in a strip just above the top edge and live long
 * enough to cross the screen, so the emission never starts abruptly at the top edge.
 *
 * @example
 * ```ts
 * import { weatherPreset } from '@datamoc/mwg/two-d/render';
 *
 * const rain = weatherPreset('rain', { width: 960, height: 540, power: 0.5 });
 * console.log(rain?.rate, rain?.max); // half the particles of a full downpour
 * ```
 */
export function weatherPreset(kind: WeatherKind, options: WeatherPresetOptions): WeatherPreset | null {
	if (kind === 'clear') return null;
	if (!(options.width > 0) || !(options.height > 0)) {
		throw new Error('weather needs a positive width and height to cover');
	}

	const power = Math.min(1, Math.max(0, options.power ?? 1));
	if (power === 0) return null;

	const wind = options.wind ?? 0;
	const width = options.width;
	const height = options.height;
	const spawnHeight = Math.max(8, height * 0.06);

	type Shape = {
		rate: number;
		max: number;
		speed: readonly [number, number];
		angle: readonly [number, number];
		gravity: { x: number; y: number };
		scale: readonly [number, number];
		alpha: readonly [number, number];
		tint: number;
		/** how many seconds a particle needs to cross the screen at the middle of its speed range */
		crossing: number;
	};

	const shapes: Record<EmittingWeather, Shape> = {
		rain: {
			rate: 220,
			max: 900,
			speed: [520, 760],
			angle: [halfPi - 0.06, halfPi + 0.06],
			gravity: { x: 0, y: 260 },
			scale: [1, 1],
			alpha: [0.55, 0.35],
			tint: 0xbcd4ff,
			crossing: 0.9,
		},
		storm: {
			rate: 420,
			max: 1400,
			speed: [760, 1100],
			angle: [halfPi - 0.28, halfPi - 0.12],
			gravity: { x: -260, y: 420 },
			scale: [1.1, 1.1],
			alpha: [0.7, 0.45],
			tint: 0x9fb0d0,
			crossing: 0.7,
		},
		snow: {
			rate: 60,
			max: 500,
			speed: [28, 72],
			angle: [halfPi - 0.5, halfPi + 0.5],
			gravity: { x: 0, y: 18 },
			scale: [0.5, 0.9],
			alpha: [0.9, 0.15],
			tint: 0xffffff,
			crossing: 8,
		},
	};

	const shape = shapes[kind];
	const spawn: ParticleSpawnArea = {
		shape: 'rect',
		width: kind === 'snow' ? width * 1.1 : width * 1.25,
		height: spawnHeight,
	};
	//the strip starts above the top edge, so a particle is already moving when it enters view
	//(drifting snow spreads wider as it falls, which the spawn width above allows for)
	const life: readonly [number, number] =
		kind === 'snow' ? [shape.crossing * 0.7, shape.crossing * 1.4] : [shape.crossing * 0.75, shape.crossing * 1.15];

	return {
		width,
		height,
		spawn,
		rate: shape.rate * power,
		max: Math.max(1, Math.ceil(shape.max * power)),
		life,
		speed: shape.speed,
		angle: [shape.angle[0] + wind, shape.angle[1] + wind],
		gravity: shape.gravity,
		scale: shape.scale,
		alpha: [shape.alpha[0] * (0.45 + 0.55 * power), shape.alpha[1] * (0.45 + 0.55 * power)],
		tint: shape.tint,
	};
}

export interface WeatherLayerOptions {
	/** the area to cover, in world units; call `setBounds` when the screen size changes */
	width: number;
	height: number;

	/** a raindrop streak, a snowflake, nothing for a weather simulation only tests drive */
	texture?: Texture2D;
}

/**
 * Rain, storm and snow over a screen, as one emitter an RPG-style `changeWeather` command can
 * retarget rather than a new `ParticleEmitter` per kind. The presets live in `weatherPreset`,
 * so a game that wants a different look can read one and adjust it before building its own.
 *
 * `power` scales both how many particles fall and how visible they are, and `clear` stops
 * emission at once while the particles already in the air finish their fall. The layer is a
 * plain container: put it above the map and below the UI, sized to the camera's world view.
 *
 * @example
 * ```ts
 * import { WeatherLayer } from '@datamoc/mwg/two-d/render';
 * import type { Texture2D } from '@datamoc/mwg/two-d/render';
 *
 * declare const raindrop: Texture2D;
 *
 * const weather = new WeatherLayer({ width: 960, height: 540, texture: raindrop });
 * weather.setWeather('rain', { power: 0.7, wind: -0.1 });
 *
 * function onFrame(dt: number): void {
 * 	weather.update(dt);
 * }
 * ```
 */
export class WeatherLayer extends Container {
	private areaWidth: number;
	private areaHeight: number;
	private readonly texture?: Texture2D;
	private emitter: ParticleEmitter | null = null;
	private kind: WeatherKind = 'clear';
	private power = 1;
	private wind = 0;

	constructor(options: WeatherLayerOptions) {
		super();
		this.areaWidth = options.width;
		this.areaHeight = options.height;
		this.texture = options.texture;
	}

	/** the weather currently falling, `clear` once it has been turned off */
	get weather(): WeatherKind {
		return this.kind;
	}

	/** how hard it falls, 0 to 1 */
	get intensity(): number {
		return this.power;
	}

	/** particles currently in the air, useful for a soak test or an adaptive-quality step */
	get activeCount(): number {
		return this.emitter?.activeCount ?? 0;
	}

	/**
	 * Changes the weather, rebuilding the emitter only when the kind or the settings move.
	 * `clear` stops emission and keeps the last particles until they finish, then removes the
	 * emitter; `power` 0 behaves the same way.
	 */
	setWeather(kind: WeatherKind, options: { power?: number; wind?: number } = {}): void {
		const power = Math.min(1, Math.max(0, options.power ?? 1));
		const wind = options.wind ?? 0;
		this.kind = kind;
		this.power = power;
		this.wind = wind;

		if (kind === 'clear' || power === 0) {
			this.stopEmitting();
			return;
		}

		this.freeEmitter();
		const preset = weatherPreset(kind, { width: this.areaWidth, height: this.areaHeight, power, wind });
		if (!preset) return;
		preset.texture = this.texture;
		const emitter = new ParticleEmitter(preset);
		//born across the top edge: the strip is centred on the emitter's origin
		emitter.x = this.areaWidth / 2;
		emitter.y = -(spawnHeightOf(preset) / 2);
		this.emitter = emitter;
		this.addChild(emitter);
		emitter.start();
	}

	/** resizes the area covered, rebuilding an active emitter for the new size */
	setBounds(width: number, height: number): void {
		if (!(width > 0) || !(height > 0)) throw new Error('weather bounds must be positive');
		if (width === this.areaWidth && height === this.areaHeight) return;
		this.areaWidth = width;
		this.areaHeight = height;
		if (this.kind !== 'clear' && this.power > 0) this.setWeather(this.kind, { power: this.power, wind: this.wind });
	}

	/** steps the particles; the layer owns no clock of its own, like every other renderable */
	update(dt: number): void {
		this.emitter?.update(dt);
	}

	/** drops every particle and the emitter, as if the weather had never started */
	clear(): void {
		this.kind = 'clear';
		this.power = 0;
		this.freeEmitter();
	}

	/** stops new particles while the ones in the air finish their fall */
	private stopEmitting(): void {
		this.emitter?.stop();
	}

	private freeEmitter(): void {
		if (!this.emitter) return;
		this.removeChild(this.emitter);
		this.emitter.destroy({ children: true });
		this.emitter = null;
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		this.freeEmitter();
		super.destroy(options);
	}
}
