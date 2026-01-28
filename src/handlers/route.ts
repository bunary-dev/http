import { toResponse } from "../response.js";
import type { RouteMatch } from "../routes/index.js";
import type { HandlerResponse, Middleware, RequestContext, Route } from "../types/index.js";

/**
 * Execute route handler with middleware chain.
 * Returns the response from the handler or middleware.
 */
export async function executeRoute(
	match: RouteMatch,
	ctx: RequestContext,
	getMiddlewareChain: (route: Route) => Middleware[],
): Promise<Response> {
	// Get cached middleware chain for this route
	const allMiddleware = getMiddlewareChain(match.route);

	let index = 0;
	const next = async (): Promise<HandlerResponse> => {
		if (index < allMiddleware.length) {
			const middleware = allMiddleware[index++];
			return await middleware(ctx, next);
		}
		// All middleware done, call handler
		return await match.route.handler(ctx);
	};

	const result = await next();
	return toResponse(result);
}
