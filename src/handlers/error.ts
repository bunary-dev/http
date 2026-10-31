import { problemResponse } from "../problem.js";
import { toResponse } from "../response.js";
import type { RequestContext, RouterOptions } from "../types/index.js";

/** Environments in which the default error handler exposes `error.message`. */
const DEBUG_ENVIRONMENTS: ReadonlySet<string> = new Set(["development", "test"]);

/**
 * Handle 500 Internal Server Error responses.
 * Uses custom onError handler if provided, otherwise returns an RFC 9457
 * `application/problem+json` response.
 *
 * The default handler only includes the error message as `detail` when the
 * router's `debug` option is `true`, or — with `debug` unset — when the
 * environment is explicitly `development` or `test`. Anything else, including
 * no environment at all (common in containers), gets the generic
 * "Internal Server Error" so database errors and file paths never leak (#121).
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
	const debug =
		options?.debug ?? (environment !== undefined && DEBUG_ENVIRONMENTS.has(environment));
	return problemResponse(error, {
		debug,
		instance: new URL(ctx.request.url).pathname,
	});
}
