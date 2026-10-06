export interface ManifestEntry {
	name: string;
	kind: string;
	subpath: string;
	declaringModule: string;
}

export interface ConsumerImport {
	file: string;
	line: number;
	subpath: string;
	names: string[];
	typeOnly: boolean;
}

export interface LocalDefinition {
	name: string;
	file: string;
	line: number;
}

export interface SourceFile {
	path: string;
	text: string;
}

export interface AdoptionBudget {
	match: string;
	limit: number;
	reason: string;
}

export interface AuditorConfig {
	reasons: Record<string, string>;
	denySubpaths?: string[];
	typeOnlyDirs?: string[];
	budgets?: AdoptionBudget[];
}

export interface AdoptionFinding {
	rule: 'unadopted' | 'stale-reason' | 'collision' | 'denied-subpath' | 'type-only' | 'budget';
	message: string;
	file?: string;
	line?: number;
}

/** `<subpath> :: <name>`, the key reasons and adoption are tracked by */
export function adoptionKey(subpath: string, name: string): string;

/** every `@datamoc/mw_games/<sub>` import row in the given files */
export function scanImports(files: SourceFile[]): ConsumerImport[];

/** every top-level interface/type/class/function/const/enum the consumer defines */
export function scanLocals(files: SourceFile[]): LocalDefinition[];

/** every rule over the manifest, the import rows and locals, and the config; empty means fully accounted for */
export function auditAdoptions(
	manifest: ManifestEntry[],
	imports: ConsumerImport[],
	locals: LocalDefinition[],
	config: AuditorConfig,
): AdoptionFinding[];

/** `file:line: [rule] message`, or `[rule] message` for manifest-level findings */
export function formatFindings(findings: AdoptionFinding[]): string[];
