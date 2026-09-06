import { HttpTransport, type HttpTransportOptions } from './HttpTransport.ts';

export interface FeedbackRequest {
	message: string;
	contact?: string;
	context?: Record<string, string | number | boolean>;
}

export type FeedbackOptions = HttpTransportOptions;

export interface FeedbackResponse {
	ok: boolean;
	status: number;
}

/**
 * Small, injectable transport for a game's own feedback endpoint.
 *
 * @example
 * ```ts
 * import { FeedbackClient } from '@datamoc/mw_games/core';
 *
 * const feedback = new FeedbackClient({ endpoint: 'https://example.com/api/feedback' });
 * await feedback.submit({ message: 'the boss fight softlocks on floor 5', contact: 'a@b.com' });
 * ```
 */
export class FeedbackClient extends HttpTransport {
	constructor(options: FeedbackOptions) {
		super(options, 'feedback');
	}

	async submit(request: FeedbackRequest): Promise<FeedbackResponse> {
		if (!request.message?.trim()) throw new Error('feedback message cannot be empty');
		return this.withTimeout(async (signal) => {
			const response = await this.fetchFn(this.endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(request),
				signal,
			});
			if (!response.ok) throw new Error(`feedback request failed with HTTP ${response.status}`);
			return { ok: true, status: response.status };
		});
	}
}
