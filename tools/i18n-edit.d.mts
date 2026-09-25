import type { Catalog } from '@datamoc/mw_games/i18n';
import type { MarkdownSpan } from '@datamoc/mw_games/two-d/ui';

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
