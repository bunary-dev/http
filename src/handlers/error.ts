import { toResponse } from "../response.js";
import type { AppOptions, RequestContext } from "../types/index.js";

/**
 * Handle 500 Internal Server Error responses.
 * Uses custom onError handler if provided, otherwise returns default JSON response.
 */
export function handleError(ctx: RequestContext, error: unknown, options?: AppOptions): Response {
	if (options?.onError) {
		return toResponse(options.onError(ctx, error));
	}
	const message = error instanceof Error ? error.message : "Internal server error";
	return new Response(JSON.stringify({ error: message }), {
		status: 500,
		headers: { "Content-Type": "application/json" },
	});
}
