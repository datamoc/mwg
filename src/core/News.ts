import { defaultStorage, type SaveStorage } from './Save.ts';
import { sanitizeInboundText } from './Sanitize.ts';

/**
 * Fetches a game's own news/announcements feed - the inbound counterpart to
 * `FeedbackClient`, following the same injectable-transport shape (a game's own HTTPS
 * endpoint, no backend shipped or assumed) rather than a second pattern.
 */
export interface NewsItem {
	id: string;
	title: string;
	body: string;
	publishedAt?: number;
}

export interface NewsOptions {
	endpoint: string;
	timeoutMs?: number;
	fetch?: typeof globalThis.fetch;
}

export class NewsClient {
	private readonly endpoint: string;
	private readonly timeoutMs: number;
	private readonly fetchFn: typeof globalThis.fetch;

	constructor(options: NewsOptions) {
		if (!options.endpoint) throw new Error('news endpoint is required');
		this.endpoint = options.endpoint;
		this.timeoutMs = options.timeoutMs ?? 10000;
		if (!(this.timeoutMs > 0)) throw new Error('news timeout must be positive');
		this.fetchFn = options.fetch ?? globalThis.fetch;
		if (!this.fetchFn) throw new Error('fetch is unavailable; provide NewsOptions.fetch');
	}

	/**
	 * Fetches and validates the feed; a malformed item throws rather than reaching a game as
	 * trusted data. The response is read as text and run through `sanitizeInboundText`
	 * (a size cap, no embedded control characters) before `JSON.parse` ever sees it, ahead of
	 * `normalizeItem`'s own per-field shape check below.
	 */
	async fetchItems(): Promise<NewsItem[]> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const response = await this.fetchFn(this.endpoint, { signal: controller.signal });
			if (!response.ok) throw new Error(`news request failed with HTTP ${response.status}`);
			const data: unknown = JSON.parse(sanitizeInboundText(await response.text()));
			if (!Array.isArray(data)) throw new Error('news response was not an array');
			return data.map((raw, index) => normalizeItem(raw, index));
		} finally {
			clearTimeout(timer);
		}
	}
}

function normalizeItem(raw: unknown, index: number): NewsItem {
	if (typeof raw !== 'object' || raw === null) throw new Error(`news item ${index} was not an object`);
	const item = raw as Record<string, unknown>;
	if (typeof item.id !== 'string' || !item.id) throw new Error(`news item ${index} is missing a string id`);
	if (typeof item.title !== 'string') throw new Error(`news item ${index} is missing a string title`);
	if (typeof item.body !== 'string') throw new Error(`news item ${index} is missing a string body`);
	return {
		id: item.id,
		title: item.title,
		body: item.body,
		publishedAt: typeof item.publishedAt === 'number' ? item.publishedAt : undefined,
	};
}

export interface NewsSeenOptions {
	namespace: string;
	storage?: SaveStorage;
}

/** which news items a player has already dismissed, so a returning player is not shown the same announcement forever */
export class NewsSeenTracker {
	private readonly storage: SaveStorage;
	private readonly key: string;

	constructor(options: NewsSeenOptions) {
		this.storage = options.storage ?? defaultStorage();
		this.key = `mwg-news-seen:${options.namespace}`;
	}

	private readSeen(): Set<string> {
		const raw = this.storage.read(this.key);
		return new Set(raw ? (JSON.parse(raw) as string[]) : []);
	}

	isSeen(id: string): boolean {
		return this.readSeen().has(id);
	}

	markSeen(id: string): void {
		const seen = this.readSeen();
		seen.add(id);
		this.storage.write(this.key, JSON.stringify([...seen]));
	}

	/** `items` filtered down to whichever have not been marked seen yet */
	unseen(items: readonly NewsItem[]): NewsItem[] {
		const seen = this.readSeen();
		return items.filter((item) => !seen.has(item.id));
	}
}
