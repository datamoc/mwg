import { WebSocketServer } from 'ws';
import { pathToFileURL } from 'node:url';

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
	const { port = 0, tickTimeoutMs = 200 } = options;
	const wss = new WebSocketServer({ port });

	const rooms = new Map();
	let nextId = 1;

	function room(name) {
		let entry = rooms.get(name);
		if (!entry) {
			entry = { clients: new Map(), tick: 0, timer: null };
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
		for (const [id, client] of entry.clients) {
			inputs[id] = client.hasSubmitted ? client.pendingInput : null;
			client.pendingInput = null;
			client.hasSubmitted = false;
		}
		const message = JSON.stringify({ type: 'tick', tick: entry.tick, inputs });
		for (const client of entry.clients.values()) client.socket.send(message);
		entry.tick += 1;
		scheduleTimeout(entry);
	}

	function maybeAdvanceEarly(entry) {
		if (entry.clients.size > 0 && [...entry.clients.values()].every((client) => client.hasSubmitted)) {
			advance(entry);
		}
	}

	wss.on('connection', (socket, request) => {
		const url = new URL(request.url ?? '/', 'http://localhost');
		const roomName = url.searchParams.get('room') ?? 'default';
		const id = `p${nextId++}`;
		const entry = room(roomName);
		entry.clients.set(id, { socket, pendingInput: null, hasSubmitted: false });

		socket.send(JSON.stringify({ type: 'welcome', id }));
		if (!entry.timer) scheduleTimeout(entry);

		socket.on('message', (raw) => {
			let message;
			try {
				message = JSON.parse(String(raw));
			} catch {
				return; //malformed input from one client must not take the room down
			}
			if (message?.type !== 'input') return;
			const client = entry.clients.get(id);
			if (!client) return;
			client.pendingInput = message.payload ?? null;
			client.hasSubmitted = true;
			maybeAdvanceEarly(entry);
		});

		socket.on('close', () => {
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const port = Number(process.argv[2] ?? 8787);
	const server = createLockstepServer({ port });
	await server.ready;
	console.log(`mwg reference lockstep server listening on ws://localhost:${server.address().port}`);
}
