import type { Middleware } from "./middleware.js";

/**
 * Options for route groups.
 */
export interface GroupOptions {
	/** URL prefix for all routes in the group */
	prefix: string;
	/** Middleware to apply to all routes in the group */
	middleware?: Middleware[];
	/** Name prefix for all routes in the group */
	name?: string;
}
