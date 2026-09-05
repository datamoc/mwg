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
}

export interface TickEvent {
	tick: number;
	/** this room's every client id mapped to its input for `tick`, or `null` if it missed the deadline */
	inputs: Record<string, unknown>;
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
 */
export class LockstepClient {
	readonly onWelcome = new Signal<{ id: string }>();
	readonly onTick = new Signal<TickEvent>();
	readonly onClose = new Signal<void>();

	private socket: WebSocketLike | null = null;
	private readonly url: string;
	private readonly createSocket: (url: string) => WebSocketLike;
	private _id: string | null = null;

	constructor(options: LockstepClientOptions) {
		if (!options.url) throw new Error('lockstep client url is required');
		this.url = options.url;
		this.createSocket = options.create ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
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
	submitInput(payload: unknown): void {
		if (!this.connected) return;
		this.socket?.send(JSON.stringify({ type: 'input', payload }));
	}

	close(): void {
		this.socket?.close();
	}

	private handleMessage(raw: string): void {
		const message = JSON.parse(raw) as { type: string; id?: string; tick?: number; inputs?: Record<string, unknown> };
		if (message.type === 'welcome' && message.id !== undefined) {
			this._id = message.id;
			this.onWelcome.dispatch({ id: message.id });
		} else if (message.type === 'tick' && message.tick !== undefined && message.inputs !== undefined) {
			this.onTick.dispatch({ tick: message.tick, inputs: message.inputs });
		}
	}
}
