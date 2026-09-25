import { parseInbound } from './Sanitize.ts';
import { Signal } from './Signal.ts';

/** the subset of the DOM/Node `WebSocket` this needs - injectable so a test never opens a real socket */
export interface WebSocketLike {
	readyState: number;
	send(data: string): void;
	close(): void;
	onopen: ((event: unknown) => void) | null;
	onclose: ((event: unknown) => void) | null;
	onerror: ((event: unknown) => void) | null;
	onmessage: ((event: { data: string }) => void) | null;
}

const OPEN = 1; //WebSocket.OPEN, kept as a literal so this file needs no DOM/Node WebSocket type import

export interface LockstepClientOptions {
	url: string;
	/** defaults to the global `WebSocket`; inject a fake in tests, or `ws`'s own client in Node */
	create?: (url: string) => WebSocketLike;
	/** Optional client-side command contract. Returning a string rejects with that reason. */
	validateInput?: (payload: unknown) => boolean | string;
	/** largest server message accepted, in bytes; defaults to 1 MB */
	maxMessageBytes?: number;
}

export interface LockstepWelcome {
	id: string;
	/** The room seed, when the server configured one. */
	seed?: number;
	/** The JSON-safe state from which every peer must start, when configured. */
	initialState?: unknown;
}

export interface TickEvent {
	tick: number;
	/** this room's every client id mapped to its input for `tick`, or `null` if it missed the deadline */
	inputs: Record<string, unknown>;
	/** state checksums reported by peers after applying this tick, when supplied */
	checksums?: Record<string, number>;
}

/**
 * A client for this project's own reference lockstep server (`tools/multiplayer-server.mjs`):
 * the transport, identity, and tick-authority piece item 129 asked for, without `mwg`
 * inventing a full prediction/rollback netcode a real game would likely want to replace
 * anyway. Every connected client submits at most one input per tick; the server broadcasts a
 * `tick` message once every client in its room has submitted for that tick, or once a
 * configured timeout elapses, substituting `null` for whoever is still missing - lockstep,
 * the model turn-driven and RTS-shaped games have used for this for decades, chosen because
 * it needs no client-side prediction to already be correct. A game wanting prediction or
 * interpolation on top of this still can: `onTick` hands over the same ordered, authoritative
 * input stream a prediction layer would reconcile against.
 *
 * This is deliberately the only network surface in `mwg` that assumes a server exists rather
 * than a game's own endpoint - `FeedbackClient`/`NewsClient`/`SaveSyncClient` all assume the
 * opposite, a one-shot request/response a game points at its own backend. Real-time
 * multiplayer has no one-shot shape to hide a server behind, which is why `mwg` ships a
 * reference one (`tools/multiplayer-server.mjs`) rather than assuming a game brings its own,
 * the same reasoning that decided this the moment the item was sized.
 *
 * @example
 * ```ts
 * import { LockstepClient } from '@datamoc/mw_games/core';
 *
 * const client = new LockstepClient({ url: 'wss://example.com/room/1' });
 * client.onTick.add(({ tick, inputs }) => console.log('tick', tick, inputs));
 * client.connect();
 *
 * // each frame this client has an input for:
 * client.submitInput({ move: 'left' });
 * ```
 */
export class LockstepClient {
	readonly onWelcome = new Signal<LockstepWelcome>();
	readonly onTick = new Signal<TickEvent>();
	readonly onReject = new Signal<{ reason: string }>();
	readonly onDesync = new Signal<{ tick: number; checksums: Record<string, number> }>();
	readonly onClose = new Signal<void>();
	/** a server message that was oversized, not JSON, or not a well-formed protocol message; it is dropped */
	readonly onProtocolError = new Signal<{ reason: string }>();

	private socket: WebSocketLike | null = null;
	private readonly url: string;
	private readonly createSocket: (url: string) => WebSocketLike;
	private readonly validateInput?: (payload: unknown) => boolean | string;
	private readonly maxMessageBytes: number;
	private _id: string | null = null;

	constructor(options: LockstepClientOptions) {
		if (!options.url) throw new Error('lockstep client url is required');
		this.url = options.url;
		this.createSocket = options.create ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
		this.validateInput = options.validateInput;
		this.maxMessageBytes = options.maxMessageBytes ?? 1024 * 1024;
	}

	/** this client's own id, assigned by the server's `welcome` message; `null` before it arrives */
	get id(): string | null {
		return this._id;
	}

	get connected(): boolean {
		return this.socket !== null && this.socket.readyState === OPEN;
	}

	connect(): void {
		if (this.socket) throw new Error('lockstep client is already connected');
		const socket = this.createSocket(this.url);
		socket.onmessage = (event) => this.handleMessage(event.data);
		socket.onclose = () => {
			this.socket = null;
			this._id = null;
			this.onClose.dispatch();
		};
		this.socket = socket;
	}

	/** submits this client's input for the current tick; a no-op before the connection is open */
	submitInput(payload: unknown, checksum?: number): void {
		if (!this.connected) return;
		const validation = this.validateInput?.(payload);
		if (validation === false || typeof validation === 'string') {
			this.onReject.dispatch({
				reason: validation === false ? 'input rejected by client validation' : validation,
			});
			return;
		}
		this.socket?.send(JSON.stringify({ type: 'input', payload, ...(checksum === undefined ? {} : { checksum }) }));
	}

	close(): void {
		this.socket?.close();
	}

	private handleMessage(raw: unknown): void {
		let message: ServerMessage;
		try {
			if (typeof raw !== 'string') throw new Error('lockstep message is not text');
			message = readServerMessage(
				parseInbound(raw, { maxBytes: this.maxMessageBytes, label: 'lockstep message' }),
			);
		} catch (error) {
			this.onProtocolError.dispatch({ reason: error instanceof Error ? error.message : String(error) });
			return;
		}
		if (message.type === 'welcome') {
			this._id = message.id;
			this.onWelcome.dispatch({
				id: message.id,
				...(message.seed === undefined ? {} : { seed: message.seed }),
				...(message.initialState === undefined ? {} : { initialState: message.initialState }),
			});
		} else if (message.type === 'tick') {
			const event = {
				tick: message.tick,
				inputs: message.inputs,
				...(message.checksums === undefined ? {} : { checksums: message.checksums }),
			};
			this.onTick.dispatch(event);
			if (message.checksums) {
				const checksums = Object.values(message.checksums);
				if (checksums.some((checksum) => checksum !== checksums[0]))
					this.onDesync.dispatch({ tick: message.tick, checksums: message.checksums });
			}
		} else {
			this.onReject.dispatch({ reason: message.reason ?? 'input rejected by server' });
		}
	}
}

type ServerMessage =
	({ type: 'welcome' } & LockstepWelcome) | ({ type: 'tick' } & TickEvent) | { type: 'rejected'; reason?: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** checks the three server messages' field types, so a listener only ever sees the documented shapes */
function readServerMessage(value: unknown): ServerMessage {
	if (!isRecord(value) || typeof value.type !== 'string') throw new Error('lockstep message has no type');
	switch (value.type) {
		case 'welcome':
			if (typeof value.id !== 'string' || value.id === '') throw new Error('welcome needs a string id');
			if (value.seed !== undefined && !Number.isSafeInteger(value.seed))
				throw new Error('welcome seed must be an integer');
			return value as ServerMessage;
		case 'tick':
			if (!Number.isSafeInteger(value.tick) || (value.tick as number) < 0)
				throw new Error('tick needs a non-negative integer tick');
			if (!isRecord(value.inputs)) throw new Error('tick needs an inputs object');
			if (
				value.checksums !== undefined &&
				(!isRecord(value.checksums) || Object.values(value.checksums).some((sum) => typeof sum !== 'number'))
			)
				throw new Error('tick checksums must map ids to numbers');
			return value as ServerMessage;
		case 'rejected':
			if (value.reason !== undefined && typeof value.reason !== 'string')
				throw new Error('rejected reason must be a string');
			return value as ServerMessage;
		default:
			throw new Error(`unknown lockstep message type "${value.type}"`);
	}
}
