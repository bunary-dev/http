import { problem } from "../problem.js";
import { toResponse } from "../response.js";
import type { RequestContext, RouterOptions } from "../types/index.js";

/**
 * Handle 404 Not Found responses.
 * Uses custom onNotFound handler if provided, otherwise returns an RFC 9457
 * `application/problem+json` response.
 *
 * Receives the request's own context, so anything global middleware put on
 * `ctx.locals` is visible to a custom `onNotFound` handler.
 *
 * @param ctx - The request context
 * @param options - Router options carrying an optional `onNotFound`
 */
export async function handleNotFound(
	ctx: RequestContext,
	options?: RouterOptions,
): Promise<Response> {
	if (options?.onNotFound) {
		const result = await options.onNotFound(ctx);
		return toResponse(result);
	}
	const pathname = new URL(ctx.request.url).pathname;
	return problem(404, `No route matches ${ctx.request.method} ${pathname}`, {
		instance: pathname,
	});
}
