export interface CycloneDxHash {
	alg: string;
	content: string;
}

export interface CycloneDxLicense {
	license: { id?: string; name?: string };
}

export interface CycloneDxComponent {
	type: 'library' | 'application';
	'bom-ref': string;
	name: string;
	version: string;
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
}

export function purlFor(name: string, version: string): string;
export function hashesFromIntegrity(integrity: unknown): CycloneDxHash[];
export function buildSbom(packageJson: PackageJson, lockfile: Lockfile): CycloneDxBom;
export function serialize(bom: CycloneDxBom): string;
