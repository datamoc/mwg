export interface ToWebpOptions {
	lossless?: boolean;
	quality?: number;
}

export function toWebp(buffer: Buffer, options?: ToWebpOptions): Promise<Buffer>;

export const WEBP_CONVERTIBLE_EXTENSIONS: Set<string>;
