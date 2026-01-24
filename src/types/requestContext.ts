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
}
