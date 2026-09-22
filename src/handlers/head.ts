/**
 * Convert a response to HEAD format: the body is discarded while status,
 * statusText and headers are preserved.
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
		const body = await response.arrayBuffer();
		headers.set("Content-Length", String(body.byteLength));
	}

	return new Response(null, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
