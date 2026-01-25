import type { HttpMethod } from "./httpMethod.js";

/**
 * Route information returned by getRoutes().
 */
export interface RouteInfo {
	/** Route name (null if unnamed) */
	name: string | null;
	/** HTTP method */
	method: HttpMethod;
	/** Route path pattern */
	path: string;
}
