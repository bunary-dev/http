import { problemResponse } from "../problem.js";
import { toResponse } from "../response.js";
import type { RequestContext, RouterOptions } from "../types/index.js";

/**
 * Handle 500 Internal Server Error responses.
 * Uses custom onError handler if provided, otherwise returns an RFC 9457
 * `application/problem+json` response.
 *
 * In production (`NODE_ENV=production`), the default handler returns a generic
 * "Internal Server Error" message to avoid leaking sensitive information.
 * In development and test, the full error message is included as `detail`.
 */
export async function handleError(
	ctx: RequestContext,
	error: unknown,
	options?: RouterOptions,
): Promise<Response> {
	if (options?.onError) {
		const result = await options.onError(ctx, error);
		return toResponse(result);
	}
	const isProduction = Bun.env.NODE_ENV === "production";
	return problemResponse(error, {
		debug: !isProduction,
		instance: new URL(ctx.request.url).pathname,
	});
}
