import type { CspOptions } from './emit-page.mjs';

/** the policy `emitPage` writes, for a page's HTML; `scripts` are extra script texts allowed by hash */
export function contentSecurityPolicy(html: string, options?: CspOptions & { scripts?: string[] }): string;

/** `html` with that policy as the first element of `<head>`, replacing an earlier one */
export function withContentSecurityPolicy(html: string, options?: CspOptions & { scripts?: string[] }): string;
