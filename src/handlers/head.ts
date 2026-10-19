const MAX_MEASURE_BYTES = 64 * 1024;

/** Byte length of a body, or null (body cancelled) once it exceeds the cap. */
async function measureBody(body: ReadableStream<Uint8Array>): Promise<number | null> {
	const reader = body.getReader();
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) return total;
			total += value.byteLength;
			if (total > MAX_MEASURE_BYTES) {
				await reader.cancel();
				return null;
			}
		}
	} finally {
		reader.releaseLock();
	}
}

/**
 * Convert a response to HEAD format: the body is discarded while status,
 * statusText and headers are preserved.
 *
 * Only bodies up to 64 KiB are measured; larger or endless streams are
 * cancelled and sent without `Content-Length` instead of being buffered.
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
