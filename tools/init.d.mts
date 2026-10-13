/** the starter project's files as `{ path: content }`, for a package called `name` */
export function initFiles(name: string): Record<string, string>;

/** writes the starter project into an empty or missing `folder`; throws if it already holds files */
export function initProject(folder: string): { folder: string; files: string[] };
