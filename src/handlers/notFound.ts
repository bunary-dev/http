import { createRequestContext } from "../context.js";
import { problem } from "../problem.js";
import { toResponse } from "../response.js";
import type { RequestContext, RouterOptions } from "../types/index.js";

/**
 * Handle 404 Not Found responses.
 * Uses custom onNotFound handler if provided, otherwise returns an RFC 9457
 * `application/problem+json` response.
 */
export async function handleNotFound(
	request: Request,
	_path: string,
	options?: RouterOptions,
): Promise<Response> {
	const url = new URL(request.url);
	const notFoundCtx: RequestContext = createRequestContext(request, {}, url.searchParams);
	if (options?.onNotFound) {
		const result = await options.onNotFound(notFoundCtx);
		return toResponse(result);
	}
	return problem(404, `No route matches ${request.method} ${url.pathname}`, {
		instance: url.pathname,
	});
}
