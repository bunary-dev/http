import { toResponse } from "../response.js";
import type { AppOptions, RequestContext } from "../types/index.js";

/**
 * Handle 500 Internal Server Error responses.
 * Uses custom onError handler if provided, otherwise returns default JSON response.
 *
 * In production (`NODE_ENV=production`), the default handler returns a generic
 * "Internal Server Error" message to avoid leaking sensitive information.
 * In development and test, the full error message is included.
 */
export async function handleError(
	ctx: RequestContext,
	error: unknown,
	options?: AppOptions,
): Promise<Response> {
	if (options?.onError) {
		const result = await options.onError(ctx, error);
		return toResponse(result);
	}
	const isProduction = Bun.env.NODE_ENV === "production";
	const message = isProduction
		? "Internal Server Error"
		: error instanceof Error
			? error.message
			: "Internal server error";
	return new Response(JSON.stringify({ error: message }), {
		status: 500,
		headers: { "Content-Type": "application/json" },
	});
}
