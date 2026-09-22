import { toResponse } from "../response.js";
import type { RouteMatch } from "../routes/index.js";
import type { HandlerResponse, Middleware, RequestContext } from "../types/index.js";
import { applyRouteValidation } from "../validation.js";

/**
 * Run a middleware chain, ending in `terminal`.
 *
 * Each middleware receives a `next` that advances the chain; calling it more
 * than once advances it further, and not calling it short-circuits the rest.
 * The router uses this twice per request: once for the global chain and once
 * for a route's group middleware.
 *
 * @param middleware - Middleware to run, in order
 * @param ctx - The request context shared by the whole chain
 * @param terminal - What to run once the chain is exhausted
 * @returns Whatever the chain or the terminal produced
 */
export function runMiddlewareChain(
	middleware: readonly Middleware[],
	ctx: RequestContext,
	terminal: () => HandlerResponse | Promise<HandlerResponse>,
): Promise<HandlerResponse> {
	let index = 0;
	const next = async (): Promise<HandlerResponse> => {
		const current = middleware[index++];
		if (current) {
			return await current(ctx, next);
		}
		return await terminal();
	};
	return next();
}

/**
 * Execute a matched route: its group middleware, then validation, then its
 * handler.
 *
 * Global middleware is *not* included — the router runs that around the whole
 * dispatcher so it also wraps 404/405/OPTIONS and error responses (#65).
 *
 * Route validation (#78) sits between the middleware chain and the handler, so
 * middleware still sees the raw `ctx.params`, `ctx.query` and `ctx.body`, while
 * the handler sees whatever the schemas produced. A rejected schema throws
 * core's `ValidationError` from here, and the error boundary maps it to 422.
 *
 * @param match - The resolved route and its params
 * @param ctx - The request context
 * @param middleware - The route's group middleware
 * @returns The handler's response
 */
export async function executeRoute(
	match: RouteMatch,
	ctx: RequestContext,
	middleware: readonly Middleware[],
): Promise<Response> {
	const { handler, schemas } = match.route;
	const result = await runMiddlewareChain(middleware, ctx, async () => {
		if (schemas) await applyRouteValidation(ctx, schemas);
		return await handler(ctx);
	});
	return toResponse(result);
}
