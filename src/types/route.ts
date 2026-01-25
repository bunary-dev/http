import type { HttpMethod } from "./httpMethod.js";
import type { Middleware } from "./middleware.js";
import type { RouteHandler } from "./routeHandler.js";

/**
 * Internal route definition stored by the router.
 */
export interface Route {
	/** HTTP method for this route */
	method: HttpMethod;
	/** Route path pattern (e.g., "/users/:id") */
	path: string;
	/** Compiled regex for matching */
	pattern: RegExp;
	/** Parameter names extracted from path */
	paramNames: string[];
	/** Handler function for this route */
	handler: RouteHandler;
	/** Optional route name for URL generation */
	name?: string;
	/** Parameter constraints (regex patterns) */
	constraints?: Record<string, RegExp>;
	/** Route-specific middleware */
	middleware?: Middleware[];
	/** Names of optional parameters */
	optionalParams?: string[];
}
