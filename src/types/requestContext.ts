import type { PathParams } from "./pathParams.js";

/**
 * Context object passed to route handlers containing request data.
 *
 * @example
 * ```ts
 * app.get("/users/:id", (ctx) => {
 *   console.log(ctx.params.id);      // "123"
 *   console.log(ctx.query.get("sort")); // "name"
 *   return { id: ctx.params.id };
 * });
 * ```
 */
export interface RequestContext {
	/** The original Bun Request object */
	request: Request;
	/** Path parameters extracted from the route pattern */
	params: PathParams;
	/** Query parameters from the URL search string */
	query: URLSearchParams;
	/**
	 * Per-request storage for middleware and handlers.
	 *
	 * This object is **initialized per request** (never shared across requests).
	 *
	 * @example
	 * ```ts
	 * app.use(async (ctx, next) => {
	 *   ctx.locals.userId = "123";
	 *   return await next();
	 * });
	 * ```
	 */
	locals: Record<string, unknown>;
}
