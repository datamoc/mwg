/** where an archive entry lands under `outDir`; throws when its name would escape `outDir` */
export function entryPath(outDir: string, fileName: string): string;

/** extracts every entry of an RPG Maker XP/VX `.rgssad` archive under `outDir`; resolves to the file count */
export function extractRgssad(archivePath: string, outDir: string): Promise<number>;
