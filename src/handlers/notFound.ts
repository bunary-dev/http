import { toResponse } from "../response.js";
import type { AppOptions, RequestContext } from "../types/index.js";

/**
 * Handle 404 Not Found responses.
 * Uses custom onNotFound handler if provided, otherwise returns default JSON response.
 */
export async function handleNotFound(
	request: Request,
	_path: string,
	options?: AppOptions,
): Promise<Response> {
	const url = new URL(request.url);
	const notFoundCtx: RequestContext = {
		request,
		params: {},
		query: url.searchParams,
		locals: {},
	};
	if (options?.onNotFound) {
		const result = await options.onNotFound(notFoundCtx);
		return toResponse(result);
	}
	return new Response(JSON.stringify({ error: "Not found" }), {
		status: 404,
		headers: { "Content-Type": "application/json" },
	});
}
