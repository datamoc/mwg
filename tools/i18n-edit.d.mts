import type { Catalog } from '../src/i18n/index.ts';
import type { MarkdownSpan } from '../src/two-d/ui/markdown.ts';

export interface LoadedCatalogFile {
	catalog: Catalog;
	format: 'json' | 'ftl';
	typography: boolean | undefined;
}

export interface SerializedTarget {
	text: string;
	flattened: number;
}

export function loadCatalogFile(path: string): Promise<LoadedCatalogFile>;
export function serializeTarget(targetPath: string, catalog: Catalog): SerializedTarget;
export function spansToAnsi(spans: readonly MarkdownSpan[]): string;
export function truncateAnsi(ansi: string, width: number): string;
export function placeholderSummary(baseText: string, targetText: string): string;
export function expectedPlaceholders(baseText: string): string;

export interface PlayerCandidate {
	cmd: string;
	args: string[];
	shell?: boolean;
}

export function playerCandidates(cuePath: string, platform?: NodeJS.Platform): PlayerCandidate[];
export function main(argv?: string[]): Promise<void>;
