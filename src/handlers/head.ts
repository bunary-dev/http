const MAX_MEASURE_BYTES = 64 * 1024;
const MAX_MEASURE_MS = 50;

const TIMED_OUT = Symbol("timed out");

/**
 * Byte length of a body, or null (body cancelled) once it exceeds the size
 * cap or does not finish within the time budget.
 */
async function measureBody(body: ReadableStream<Uint8Array>): Promise<number | null> {
	const reader = body.getReader();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
		timer = setTimeout(() => resolve(TIMED_OUT), MAX_MEASURE_MS);
	});
	let total = 0;
	try {
		for (;;) {
			const result = await Promise.race([reader.read(), deadline]);
			if (result === TIMED_OUT) {
				// Cancelling settles the pending read, so the lock can be released.
				await reader.cancel();
				return null;
			}
			const { done, value } = result;
			if (done) return total;
			total += value.byteLength;
			if (total > MAX_MEASURE_BYTES) {
				await reader.cancel();
				return null;
			}
		}
	} finally {
		clearTimeout(timer);
		reader.releaseLock();
	}
}

/**
 * Convert a response to HEAD format: the body is discarded while status,
 * statusText and headers are preserved.
 *
 * Only bodies up to 64 KiB that finish within 50 ms are measured; larger,
 * slow or endless streams (SSE, long-poll) are cancelled and sent without
 * `Content-Length` instead of being buffered or awaited.
 *
 * Per RFC 9110 §9.3.2 a HEAD response SHOULD carry the same `Content-Length`
 * the equivalent GET would have sent, so the discarded body is measured and
 * the header set when the origin response did not already provide one.
 * Responses that have no body at all (204, 304, …) are left untouched.
 *
 * @param response - The response whose body should be stripped
 * @returns A bodyless response with `Content-Length` filled in
 *
 * @example
 * ```ts
 * const head = await toHeadResponse(new Response("hello"));
 * head.headers.get("Content-Length"); // "5"
 * await head.text();                  // ""
 * ```
 */
export async function toHeadResponse(response: Response): Promise<Response> {
	const headers = new Headers(response.headers);

	if (response.body !== null && !headers.has("Content-Length")) {
		const length = await measureBody(response.body);
		if (length !== null) headers.set("Content-Length", String(length));
	}

	return new Response(null, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
