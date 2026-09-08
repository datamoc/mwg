import { defaultStorage, type SaveStorage } from './Save.ts';
import { sanitizeInboundText } from './Sanitize.ts';
import { StoredValue } from './StoredValue.ts';
import { HttpTransport, type HttpTransportOptions } from './HttpTransport.ts';

/**
 * Fetches a game's own news/announcements feed - the inbound counterpart to
 * `FeedbackClient`, built on the shared `HttpTransport` like every other client here
 * (a game's own HTTPS endpoint, no backend shipped or assumed).
 *
 * @example
 * ```ts
 * import { NewsClient, NewsSeenTracker } from '@datamoc/mw_games/core';
 *
 * const news = new NewsClient({ endpoint: 'https://example.com/api/news' });
 * const seen = new NewsSeenTracker({ namespace: 'my-game' });
 *
 * const items = await news.fetchItems();
 * const unread = items.filter((item) => !seen.isSeen(item.id));
 * for (const item of unread) seen.markSeen(item.id);
 * ```
 */
export interface NewsItem {
	id: string;
	title: string;
	body: string;
	publishedAt?: number;
}

export type NewsOptions = HttpTransportOptions;

export class NewsClient extends HttpTransport {
	constructor(options: NewsOptions) {
		super(options, 'news');
	}

	/**
	 * Fetches and validates the feed; a malformed item throws rather than reaching a game as
	 * trusted data. The response is read as text and run through `sanitizeInboundText`
	 * (a size cap, no embedded control characters) before `JSON.parse` ever sees it, ahead of
	 * `normalizeItem`'s own per-field shape check below.
	 */
	async fetchItems(): Promise<NewsItem[]> {
		return this.withTimeout(async (signal) => {
			const response = await this.fetchFn(this.endpoint, { signal });
			if (!response.ok) throw new Error(`news request failed with HTTP ${response.status}`);
			const data: unknown = JSON.parse(sanitizeInboundText(await response.text()));
			if (!Array.isArray(data)) throw new Error('news response was not an array');
			return data.map((raw, index) => normalizeItem(raw, index));
		});
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
	private readonly store: StoredValue<string[]>;

	constructor(options: NewsSeenOptions) {
		this.store = new StoredValue<string[]>(
			options.storage ?? defaultStorage(),
			`mwg-news-seen:${options.namespace}`
		);
	}

	private readSeen(): Set<string> {
		return new Set(this.store.read([]));
	}

	isSeen(id: string): boolean {
		return this.readSeen().has(id);
	}

	markSeen(id: string): void {
		const seen = this.readSeen();
		seen.add(id);
		this.store.write([...seen]);
	}

	/** `items` filtered down to whichever have not been marked seen yet */
	unseen(items: readonly NewsItem[]): NewsItem[] {
		const seen = this.readSeen();
		return items.filter((item) => !seen.has(item.id));
	}
}
