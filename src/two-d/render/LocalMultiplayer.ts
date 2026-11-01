import { Hotseat } from '../../core/Hotseat.ts';
import { PlayerInput } from '../../core/PlayerInput.ts';
import { Game } from '../Game.ts';
import { Viewport, createViewports, type CreateViewportsOptions } from './Viewport.ts';

/** the canvas size a local multiplayer screen is laid out in */
export type LocalMultiplayerLayout = CreateViewportsOptions;

export interface LocalMultiplayerOptions {
	/** one player id per participant, in the order their viewport (and input) is created */
	players: readonly string[];

	/**
	 * `'split'` (the default) gives every player their own rectangle of the screen and their
	 * own input, all at once. `'hotseat'` gives one full-screen viewport, one input per player,
	 * and a `Hotseat` turn order deciding which of them may act.
	 */
	mode?: 'hotseat' | 'split';

	/** required while a `Game` is running as the default source of the canvas size */
	layout?: LocalMultiplayerLayout;

	/**
	 * Where each player's camera should look, by player id. Called once per `update`, so it
	 * can read a moving entity's position every frame; a player with no entry keeps whatever
	 * camera position the game gives it.
	 */
	follow?: Record<string, () => { x: number; y: number }>;

	/** this player's gamepad index; defaults to their position in `players`, 0 to n-1 */
	padIndexFor?: (player: string, index: number) => number;

	/** hotseat mode only: fires as each player's turn begins after the first */
	onTurnStart?: (player: string, index: number) => void;

	/** hotseat mode only: fires as each player's turn ends */
	onTurnEnd?: (player: string, index: number) => void;

	/** hotseat mode only: seconds per turn, when the game runs a turn clock */
	turnSeconds?: number;

	/** hotseat mode only: whether an expired clock moves to the next player by itself */
	autoAdvance?: boolean;

	/** hotseat mode only: a "pass the controller" screen to await between turns */
	requestHandOver?: (from: string, to: string) => Promise<void> | void;
}

export interface LocalMultiplayer {
	readonly mode: 'hotseat' | 'split';
	/** one per player in split mode, exactly one (full-screen) in hotseat mode */
	readonly viewports: Viewport[];
	/** one per player in both modes, ready to bind */
	readonly inputs: PlayerInput[];
	/** the turn order in hotseat mode, null in split mode */
	readonly hotseat: Hotseat | null;
	update(dt: number): void;
}

function layoutFallback(): LocalMultiplayerLayout {
	const game = Game.active;
	if (!game) throw new Error('createLocalMultiplayer needs a layout when no Game is running');
	return { width: game.width, height: game.height };
}

/**
 * A same-screen local multiplayer session in one call: the viewports, the per-player inputs,
 * and (in hotseat mode) the turn order, updated together.
 *
 * Split mode is the four-players-one-screen case: each player gets their own rectangle from
 * `splitScreenLayout` and their own `PlayerInput`, and `update` follows each player's own
 * `follow` thunk, so four cameras track four characters at once. Hotseat mode is the
 * one-controller case: one full-screen viewport, an input per player, and a `Hotseat` that
 * decides whose turn it is - the camera follows whichever player is currently active, and the
 * turn moves on through `hotseat.next()` or the optional turn clock.
 *
 * @example
 * ```ts
 * import { createLocalMultiplayer } from '@datamoc/mwg/two-d/render';
 *
 * const local = createLocalMultiplayer({
 * 	players: ['p1', 'p2'],
 * 	mode: 'split',
 * 	layout: { width: 1280, height: 720, zoom: 2 },
 * 	follow: {
 * 		p1: () => ({ x: 100, y: 100 }),
 * 		p2: () => ({ x: 900, y: 100 }),
 * 	},
 * });
 *
 * // in the frame update, after each hero has moved:
 * local.update(1 / 60);
 * if (local.inputs[0].justPressed('confirm')) console.log('player 1 confirmed');
 * ```
 */
export function createLocalMultiplayer(options: LocalMultiplayerOptions): LocalMultiplayer {
	const players = [...options.players];
	if (players.length === 0) throw new Error('createLocalMultiplayer needs at least one player');
	const seen = new Set<string>();
	for (const player of players) {
		if (typeof player !== 'string' || player.length === 0)
			throw new Error('every local multiplayer player needs a non-empty id');
		if (seen.has(player)) throw new Error(`local multiplayer player "${player}" is listed twice`);
		seen.add(player);
	}

	const mode = options.mode ?? 'split';
	if (mode !== 'split' && mode !== 'hotseat')
		throw new Error(`local multiplayer mode must be "split" or "hotseat", not "${mode}"`);
	if (mode === 'split' && players.length > 4)
		throw new Error(`local multiplayer split mode supports 1 to 4 players, not ${players.length}`);

	const layout = options.layout ?? layoutFallback();
	const inputs = players.map(
		(player, index) => new PlayerInput(player, { padIndex: options.padIndexFor?.(player, index) ?? index }),
	);

	return mode === 'hotseat'
		? hotseatSession(players, inputs, layout, options)
		: splitSession(players, inputs, layout, options);
}

function splitSession(
	players: readonly string[],
	inputs: PlayerInput[],
	layout: LocalMultiplayerLayout,
	options: LocalMultiplayerOptions,
): LocalMultiplayer {
	const viewports = createViewports(players.length as 1 | 2 | 3 | 4, layout);

	return {
		mode: 'split',
		viewports,
		inputs,
		hotseat: null,
		update(dt: number): void {
			for (let i = 0; i < viewports.length; i++) {
				const target = options.follow?.[players[i]];
				if (target) viewports[i].camera.follow(target());
				viewports[i].update(dt);
			}
		},
	};
}

function hotseatSession(
	players: readonly string[],
	inputs: PlayerInput[],
	layout: LocalMultiplayerLayout,
	options: LocalMultiplayerOptions,
): LocalMultiplayer {
	const viewports = createViewports(1, layout);
	const hotseat = new Hotseat(players, {
		turnSeconds: options.turnSeconds,
		autoAdvance: options.autoAdvance,
		onTurnStart: options.onTurnStart,
		onTurnEnd: options.onTurnEnd,
		requestHandOver: options.requestHandOver,
	});
	//the first turn starts as soon as the session exists, so an active player always exists
	hotseat.begin();

	return {
		mode: 'hotseat',
		viewports,
		inputs,
		hotseat,
		update(dt: number): void {
			//the clock first: it may hand the turn over, and the camera should already be
			//following whoever that made active rather than the player who just finished
			hotseat.update(dt);
			const active = hotseat.active;
			const target = active === null ? undefined : options.follow?.[active];
			if (target) viewports[0].camera.follow(target());
			viewports[0].update(dt);
		},
	};
}
