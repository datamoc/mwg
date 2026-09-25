/** writes the generated placeholder tileset, backdrop, characters, sounds, tunes and icon into `out`; refuses to replace existing files unless `force` */
export function writePlaceholderAssets(out: string, options?: { force?: boolean }): Promise<void>;
