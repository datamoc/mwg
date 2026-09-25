export interface MeasurePageOptions {
	/** a `file://` url of the built page */
	url: string;
	/** frame intervals timed; at least 30, default 180 */
	frames?: number;
	/** fails below this mean fps; default 45 */
	minFps?: number;
	/** fails above this 95th-percentile frame time; default 40 ms */
	maxP95FrameMs?: number;
	/** a JSON history the run is appended to and compared with; none by default */
	historyPath?: string | null;
	/** how far below the history's best fps a run may fall; default 0.15 */
	maxFpsRegression?: number;
	screenshot?: string;
}

export interface MeasurePageResult {
	page: string;
	gameReady: boolean;
	canvas: { width: number; height: number };
	renderer: string;
	fps: number;
	averageMs: number;
	p95FrameMs: number;
	frames: number;
	memoryMB: number | null;
	screenshot: string;
	pageErrors: string[];
	thresholds: { minFps: number; maxP95FrameMs: number };
}

/** measures a built page's frame rate in headless Chrome and throws past its thresholds */
export function measurePage(options: MeasurePageOptions): Promise<MeasurePageResult>;
