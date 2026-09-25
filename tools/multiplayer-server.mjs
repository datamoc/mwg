#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

//the inbound pipeline every client-side reader uses: the TypeScript source inside this
//repository, the built `dist` inside an installed package, which ships no `src`
const { parseInbound } = await import(
	existsSync(new URL('../src/core/Sanitize.ts', import.meta.url))
		? '../src/core/Sanitize.ts'
		: '../dist/core/index.js'
);

/** `ws`, an optional peer of the published package: only a game running this server needs it */
const { WebSocketServer } = await import('ws').catch(() => {
	throw new Error('the lockstep server needs ws: npm install ws');
});

/** a room name a client can choose: short, printable, so one client cannot mint unbounded keys */
const ROOM_NAME = /^[\w-]{1,64}$/;

/**
 * A reference lockstep server for `core.LockstepClient` (item 129 of ROADMAP.md).
 *
 * `mwg` ships no backend anywhere else - `FeedbackClient`/`NewsClient`/`SaveSyncClient` all
 * assume a game brings its own - but real-time multiplayer has no one-shot request/response
 * shape to hide a server behind, so this is a genuine exception, not a precedent for the rest
 * of the project: a game using this either runs it as-is or replaces it with its own server
 * speaking the same three-message protocol (`welcome`/`input`/`tick`).
 *
 * Model: each `room` (a `?room=` query string, default `"default"`) advances one shared tick
 * counter. A client's `{type: 'input', payload}` is buffered for the room's current tick; once
 * every currently-connected client in the room has submitted one, the server broadcasts
 * `{type: 'tick', tick, inputs}` (every client id mapped to its input, or `null` for anyone
 * who missed the deadline) and starts the next tick. A per-room timer also forces the
 * broadcast after `tickTimeoutMs` regardless of who has submitted, so one slow or dropped
 * client cannot stall everyone else forever - the reconciliation rule item 129 asked for,
 * kept as simple as a rule can be while still being real: nothing here guesses a missing
 * input, it is reported as `null` and left to the game's own rules to interpret (skip that
 * actor's turn, repeat its last input, whatever the game decides).
 */
export function createLockstepServer(options = {}) {
	const {
		port = 0,
		host,
		tickTimeoutMs = 200,
		seed,
		initialState,
		validateInput,
		maxMessageBytes = 64 * 1024,
		maxClientsPerRoom = 64,
	} = options;
	//ws accepts 100 MiB messages unless told otherwise; an input is a few bytes
	const wss = new WebSocketServer({ port, host, maxPayload: maxMessageBytes });

	const rooms = new Map();
	let nextId = 1;

	function room(name) {
		let entry = rooms.get(name);
		if (!entry) {
			//submittedCount tracks how many of entry.clients currently have hasSubmitted set,
			//kept in step by every place that changes hasSubmitted, rather than counting the
			//whole client map on every single input message (checked on every message, not
			//just once per tick, so it is worth not being O(clients) each time)
			entry = { clients: new Map(), tick: 0, timer: null, submittedCount: 0 };
			rooms.set(name, entry);
		}
		return entry;
	}

	function scheduleTimeout(entry) {
		if (entry.timer) clearTimeout(entry.timer);
		entry.timer = entry.clients.size > 0 ? setTimeout(() => advance(entry), tickTimeoutMs) : null;
	}

	function advance(entry) {
		const inputs = {};
		const checksums = {};
		for (const [id, client] of entry.clients) {
			inputs[id] = client.hasSubmitted ? client.pendingInput : null;
			if (client.hasSubmitted && Number.isSafeInteger(client.pendingChecksum))
				checksums[id] = client.pendingChecksum;
			client.pendingInput = null;
			client.pendingChecksum = null;
			client.hasSubmitted = false;
		}
		entry.submittedCount = 0;
		const message = JSON.stringify({
			type: 'tick',
			tick: entry.tick,
			inputs,
			...(Object.keys(checksums).length === 0 ? {} : { checksums }),
		});
		for (const client of entry.clients.values()) client.socket.send(message);
		entry.tick += 1;
		scheduleTimeout(entry);
	}

	function maybeAdvanceEarly(entry) {
		if (entry.clients.size > 0 && entry.submittedCount === entry.clients.size) advance(entry);
	}

	wss.on('connection', (socket, request) => {
		const url = new URL(request.url ?? '/', 'http://localhost');
		const roomName = url.searchParams.get('room') ?? 'default';
		if (!ROOM_NAME.test(roomName)) return socket.close(1008, 'invalid room name');
		if ((rooms.get(roomName)?.clients.size ?? 0) >= maxClientsPerRoom) return socket.close(1013, 'room is full');
		const id = `p${nextId++}`;
		const entry = room(roomName);
		entry.clients.set(id, { socket, pendingInput: null, hasSubmitted: false });

		socket.send(
			JSON.stringify({
				type: 'welcome',
				id,
				...(seed === undefined ? {} : { seed }),
				...(initialState === undefined ? {} : { initialState }),
			}),
		);
		if (!entry.timer) scheduleTimeout(entry);

		//ws reports an oversized or malformed frame as an 'error' event and closes the socket itself;
		//with no listener, that event would throw and stop the whole server, every room with it
		socket.on('error', () => {});

		socket.on('message', (raw) => {
			let message;
			try {
				message = parseInbound(String(raw), { maxBytes: maxMessageBytes, label: 'lockstep input' });
			} catch {
				return; //malformed input from one client must not take the room down
			}
			if (message?.type !== 'input') return;
			const client = entry.clients.get(id);
			if (!client) return;
			const validation = validateInput?.(message.payload);
			if (validation === false || typeof validation === 'string') {
				socket.send(
					JSON.stringify({
						type: 'rejected',
						reason: validation === false ? 'input rejected by server validation' : validation,
					}),
				);
				return;
			}
			client.pendingInput = message.payload ?? null;
			client.pendingChecksum = message.checksum;
			if (!client.hasSubmitted) {
				client.hasSubmitted = true;
				entry.submittedCount += 1;
			}
			maybeAdvanceEarly(entry);
		});

		socket.on('close', () => {
			const client = entry.clients.get(id);
			if (client?.hasSubmitted) entry.submittedCount -= 1;
			entry.clients.delete(id);
			if (entry.clients.size === 0) {
				if (entry.timer) clearTimeout(entry.timer);
				rooms.delete(roomName);
			} else {
				maybeAdvanceEarly(entry);
			}
		});
	});

	return {
		wss,
		/** resolves once the server is actually listening; `address().port` is only valid after this */
		ready: new Promise((resolve) => wss.once('listening', resolve)),
		address: () => wss.address(),
		close: () =>
			new Promise((resolve) => {
				for (const entry of rooms.values()) if (entry.timer) clearTimeout(entry.timer);
				wss.close(() => resolve());
			}),
	};
}

/**
 * `mwg-lockstep-server [port] [--host=<address>]`: listens on 127.0.0.1 unless `--host` names
 * another address, so running it never exposes a port by accident. It speaks plain `ws:`, and
 * `LockstepClient` refuses `ws:` to anything but this machine: a deployment puts it behind a TLS
 * reverse proxy and connects with `wss:`.
 */
//realpath, since an npm `bin` shim reaches this file through a symlink
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const args = process.argv.slice(2);
	const port = Number(args.find((arg) => !arg.startsWith('--')) ?? 8787);
	const host = args.find((arg) => arg.startsWith('--host='))?.slice(7) ?? '127.0.0.1';
	const server = createLockstepServer({ port, host });
	await server.ready;
	console.log(`mwg reference lockstep server listening on ws://${host}:${server.address().port}`);
}
