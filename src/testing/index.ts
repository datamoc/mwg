import { MemoryStorage, type SaveStorage } from '../core/Save.ts';
import type { WebSocketLike } from '../core/Multiplayer.ts';
import type { Playable } from '../audio/Playable.ts';

/**
 * Test doubles for the seams mwg already takes by injection, so a game's tests (and this
 * repository's own) do not each rewrite them: a storage for `SaveSystem`, `Settings`,
 * `Collection` and the stored counters, a `Playable` for `Sound`/`Music`'s `create`, a socket for
 * `LockstepClient`'s `create`, and a `fetch` for every `HttpTransport` client. Renderer-free and
 * dependency-free, and kept off the root barrel, so nothing here reaches a shipped game unless
 * a test imports it.
 *
 * @example
 * ```ts
 * import { SaveSystem } from '@datamoc/mw_games/core';
 * import { memoryStorage } from '@datamoc/mw_games/testing';
 *
 * const saves = new SaveSystem<{ gold: number }>({ namespace: 'test', version: 1, storage: memoryStorage() });
 * saves.save('slot1', { gold: 3 });
 * ```
 */
export function memoryStorage(): SaveStorage {
	return new MemoryStorage();
}

/** a `Playable` that records how often it was played */
export interface FakePlayable extends Playable {
	playCount: number;
	paused: boolean;
}

/**
 * A `Playable` for `Sound`/`Music`'s `create` option (`create: fakeAudio` works as is):
 * `play()` counts and unpauses, `pause()` pauses.
 *
 * @example
 * ```ts
 * import { Sound } from '@datamoc/mw_games/audio';
 * import { fakeAudio } from '@datamoc/mw_games/testing';
 *
 * const audio = fakeAudio();
 * const sound = new Sound('hit.wav', { poolSize: 1, create: () => audio });
 * sound.play();
 * console.log(audio.playCount); // 1
 * ```
 */
export function fakeAudio(): FakePlayable {
	return {
		playCount: 0,
		paused: true,
		volume: 1,
		currentTime: 0,
		loop: false,
		play() {
			this.playCount++;
			this.paused = false;
		},
		pause() {
			this.paused = true;
		},
	};
}

/**
 * `fakeAudio` with an `onended` slot, which is how a backend that reports the end of a track
 * looks to the audio classes; `audio.onended?.(new Event('ended'))` ends it.
 */
export function fakeAudioWithEnded(): FakePlayable {
	return { ...fakeAudio(), onended: null };
}

/**
 * A `WebSocketLike` for `LockstepClient`'s `create` option: `sent` holds what the client sent,
 * `receive(message)` delivers a server message as JSON (`receiveRaw` delivers text as is), and
 * `close()` fires `onclose`.
 *
 * @example
 * ```ts
 * import { LockstepClient } from '@datamoc/mw_games/core';
 * import { FakeSocket } from '@datamoc/mw_games/testing';
 *
 * const socket = new FakeSocket();
 * const client = new LockstepClient({ url: 'wss://example.test', create: () => socket });
 * client.connect();
 * socket.receive({ type: 'welcome', id: 'p1' });
 * ```
 */
export class FakeSocket implements WebSocketLike {
	readyState = 1;
	readonly sent: string[] = [];
	onopen: ((event: unknown) => void) | null = null;
	onclose: ((event: unknown) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		this.readyState = 3;
		this.onclose?.(undefined);
	}

	receive(message: unknown): void {
		this.receiveRaw(JSON.stringify(message));
	}

	receiveRaw(data: string): void {
		this.onmessage?.({ data });
	}
}

/** one request a `fakeFetch` received */
export interface FakeFetchCall {
	url: string;
	init?: RequestInit;
}

/**
 * A `fetch` for any `HttpTransport` client's `fetch` option: `respond` answers each request,
 * with a `Response` or with a plain value sent as a JSON body, and `calls` records them in order.
 *
 * @example
 * ```ts
 * import { NewsClient } from '@datamoc/mw_games/core';
 * import { fakeFetch } from '@datamoc/mw_games/testing';
 *
 * const fetch = fakeFetch(() => [{ id: '1', title: 'Patch notes', body: 'Fixed things.' }]);
 * const news = new NewsClient({ endpoint: 'https://example.test/news', fetch });
 * ```
 */
export function fakeFetch(
	respond: (url: string, init?: RequestInit) => unknown,
): typeof globalThis.fetch & { calls: FakeFetchCall[] } {
	const calls: FakeFetchCall[] = [];
	const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, init });
		const answer = await respond(url, init);
		return answer instanceof Response ? answer : new Response(JSON.stringify(answer), { status: 200 });
	};
	return Object.assign(fetch as typeof globalThis.fetch, { calls });
}

/**
 * A `Gamepad` for `Input`/`PlayerInput` tests: `buttons` are values from 0 to 1 (pressed above
 * 0.5), `axes` from -1 to 1. Hand it to the code under test the way `navigator.getGamepads()`
 * would.
 */
export function fakeGamepad(index: number, buttons: number[] = [], axes: number[] = []): Gamepad {
	return {
		index,
		buttons: buttons.map((value) => ({ pressed: value > 0.5, touched: value > 0.5, value })),
		axes,
	} as unknown as Gamepad;
}
