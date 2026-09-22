import { toResponse } from "../response.js";
import type { RequestContext, RouterOptions } from "../types/index.js";

/**
 * Handle 404 Not Found responses.
 * Uses custom onNotFound handler if provided, otherwise returns default JSON response.
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
	return new Response(JSON.stringify({ error: "Not found" }), {
		status: 404,
		headers: { "Content-Type": "application/json" },
	});
}
