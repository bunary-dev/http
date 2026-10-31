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
 * The default handler decides whether to include the error message as
 * `detail` in this order:
 *
 * 1. The router's `debug` option, when set.
 * 2. Mounted on a `@bunary/core` Application (`ctx.app`): core's resolved
 *    `app.debug` (`config.app.debug`, then `APP_DEBUG`, then `DEBUG`,
 *    default `false`). Core's `env` is not consulted, since it falls back to
 *    `development` when nothing is configured (#131).
 * 3. Standalone router: only when `APP_ENV` (then `NODE_ENV`) is explicitly
 *    `development` or `test`.
 *
 * Anything else, including no environment at all (common in containers), gets
 * the generic "Internal Server Error" so database errors and file paths never
 * leak (#121).
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
	const debug = options?.debug ?? defaultDebug(ctx.app);
	return problemResponse(error, {
		debug,
		instance: new URL(ctx.request.url).pathname,
	});
}

/**
 * Read only what the default debug decision needs from a core Application,
 * structurally, so this module never imports `@bunary/core` at runtime.
 */
interface DebugSource {
	config: { get(): { app?: { debug?: unknown } } };
}

function defaultDebug(app: DebugSource | undefined): boolean {
	if (app) {
		return app.config.get().app?.debug === true;
	}
	const environment = Bun.env.APP_ENV ?? Bun.env.NODE_ENV;
	return environment !== undefined && DEBUG_ENVIRONMENTS.has(environment);
}
