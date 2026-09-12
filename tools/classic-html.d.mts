export interface ClassicScriptResult {
	html: string;
	src: string;
}

export function toClassicScript(html: string): ClassicScriptResult | null;
