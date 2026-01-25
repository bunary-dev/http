import type { GroupOptions } from "./groupOptions.js";
import type { RouteBuilder } from "./routeBuilder.js";
import type { RouteHandler } from "./routeHandler.js";

/**
 * Router interface for route groups.
 * Provides the same routing methods as BunaryApp but scoped to a group.
 */
export interface GroupRouter {
	/** Register a GET route */
	get: (path: string, handler: RouteHandler) => RouteBuilder;
	/** Register a POST route */
	post: (path: string, handler: RouteHandler) => RouteBuilder;
	/** Register a PUT route */
	put: (path: string, handler: RouteHandler) => RouteBuilder;
	/** Register a DELETE route */
	delete: (path: string, handler: RouteHandler) => RouteBuilder;
	/** Register a PATCH route */
	patch: (path: string, handler: RouteHandler) => RouteBuilder;
	/** Create a nested route group */
	group: ((prefix: string, callback: GroupCallback) => GroupRouter) &
		((options: GroupOptions, callback: GroupCallback) => GroupRouter);
}

/**
 * Callback function for defining routes within a group.
 */
export type GroupCallback = (router: GroupRouter) => void;
