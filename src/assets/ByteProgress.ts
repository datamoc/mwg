/**
 * Real transferred-byte progress for a real origin - a server, a dev server, or a desktop
 * host serving through a virtual origin rather than raw `file://` (see `desktop/`'s own
 * `SetVirtualHostNameToFolderMapping` for why that distinction matters). This is deliberately
 * separate from `load`'s own `AssetProgress`: that one reports a fraction of assets finished
 * because, as its own doc comment says, "Pixi's own loaders do not expose bytes transferred
 * across every asset type uniformly" - reporting a number this project cannot actually back
 * would be exactly the kind of silent-fallback dishonesty this project's own conventions rule
 * out elsewhere. `fetch()` itself is blocked from `file://` entirely, so calling this from a
 * compiled data-URI build throws the same way any other `fetch()` there would; it exists for
 * item 137's "a server or standalone WebView2/Chromium host can stream/cache assets
 * incrementally and report byte progress" capability tier, not the `file://` one.
 */

export interface ByteProgress {
	loaded: number;
	/** null when the server never sent a Content-Length (chunked transfer, some dev servers) - a caller only gets a real fraction when this is known */
	total: number | null;
}

export type OnByteProgress = (progress: ByteProgress) => void;

/**
 * Fetches `url`, reporting real bytes transferred as they arrive, and resolves to the
 * complete body as a `Blob` - handed to `URL.createObjectURL` to become something
 * `assets.load`'s own texture/audio/JSON decoding can take from there, the same as any other
 * resolved asset URL.
 */
export async function fetchWithByteProgress(
	url: string,
	onProgress?: OnByteProgress,
	fetchFn: typeof fetch = fetch
): Promise<Blob> {
	const response = await fetchFn(url);
	if (!response.ok) throw new Error(`fetchWithByteProgress: ${url} responded ${response.status}`);

	const totalHeader = response.headers.get('content-length');
	const total = totalHeader !== null && totalHeader !== '' ? Number(totalHeader) : null;

	if (!response.body) {
		const blob = await response.blob();
		onProgress?.({ loaded: blob.size, total: total ?? blob.size });
		return blob;
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let loaded = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		loaded += value.byteLength;
		onProgress?.({ loaded, total });
	}
	return new Blob(chunks as BlobPart[]);
}
