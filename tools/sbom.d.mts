export interface CycloneDxHash {
	alg: string;
	content: string;
}

export interface CycloneDxLicense {
	license: { id?: string; name?: string };
}

export interface CycloneDxComponent {
	type: 'library' | 'application' | 'file';
	'bom-ref': string;
	name: string;
	/** absent on a `file` component, which is identified by its hash */
	version?: string;
	purl?: string;
	scope?: 'required' | 'optional' | 'excluded';
	hashes?: CycloneDxHash[];
	licenses?: CycloneDxLicense[];
	description?: string;
}

export interface CycloneDxBom {
	bomFormat: 'CycloneDX';
	specVersion: string;
	serialNumber: string;
	version: number;
	metadata: {
		tools: { components: CycloneDxComponent[] };
		component: CycloneDxComponent;
	};
	components: CycloneDxComponent[];
	dependencies: Array<{ ref: string; dependsOn: string[] }>;
}

export interface LockfilePackage {
	version?: string;
	integrity?: string;
	license?: string;
	name?: string;
	dev?: boolean;
	optional?: boolean;
	link?: boolean;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
}

export interface Lockfile {
	packages?: Record<string, LockfilePackage>;
}

export interface PackageJson {
	name: string;
	version: string;
	description?: string;
	license?: string;
	private?: boolean;
}

export function purlFor(name: string, version: string): string;
export function hashesFromIntegrity(integrity: unknown): CycloneDxHash[];
/** `type`: `'library'` (the default) or `'application'` for a game */
export function buildSbom(
	packageJson: PackageJson,
	lockfile: Lockfile,
	options?: { type?: 'library' | 'application' },
): CycloneDxBom;
export function serialize(bom: CycloneDxBom): string;

/** the npm package a bundled module id belongs to, or null for the game's own source */
export function packageOfModule(id: string): { name: string; dir: string } | null;

/** the SBOM of what a build ships: the packages its modules came from, and its files with their SHA-256 */
export function buildArtifactSbom(input: {
	packageJson: PackageJson;
	modules: string[];
	files: Array<{ path: string; sha256: string }>;
}): CycloneDxBom;

/** SHA-256 of every shipped file under `dist`, precompressed siblings and SBOMs left out */
export function shippedFiles(dist: string): Promise<Array<{ path: string; sha256: string }>>;
