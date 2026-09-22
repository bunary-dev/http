import { problemResponse } from "../problem.js";
import { toResponse } from "../response.js";
import type { RequestContext, RouterOptions } from "../types/index.js";

/**
 * Handle 500 Internal Server Error responses.
 * Uses custom onError handler if provided, otherwise returns an RFC 9457
 * `application/problem+json` response.
 *
 * In production the default handler returns a generic "Internal Server Error"
 * message to avoid leaking sensitive information; in development and test the
 * full error message is included as `detail`.
 *
 * The environment is resolved the way `@bunary/core` resolves it: the mounted
 * Application's own `env` first (so `config.app.env` and `APP_ENV` are both
 * honoured), then `APP_ENV`, then `NODE_ENV`. A standalone router still reads
 * the two variables only.
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
	const environment = ctx.app?.env ?? Bun.env.APP_ENV ?? Bun.env.NODE_ENV;
	const isProduction = environment === "production";
	return problemResponse(error, {
		debug: !isProduction,
		instance: new URL(ctx.request.url).pathname,
	});
}
