import type { GroupOptions } from "./groupOptions.js";
import type { PathParams } from "./pathParams.js";
import type { RouteBuilder } from "./routeBuilder.js";
import type { RouteHandler } from "./routeHandler.js";

/**
 * Router interface for route groups.
 * Provides the same routing methods as BunaryApp but scoped to a group.
 *
 * @typeParam TLocals — Shape of `ctx.locals` (inherited from `createApp<TLocals>()`)
 */
export interface GroupRouter<TLocals extends object = Record<string, unknown>> {
	/** Register a GET route */
	get: <P extends PathParams = PathParams>(
		path: string,
		handler: RouteHandler<TLocals, P>,
	) => RouteBuilder<TLocals>;
	/** Register a POST route */
	post: <P extends PathParams = PathParams>(
		path: string,
		handler: RouteHandler<TLocals, P>,
	) => RouteBuilder<TLocals>;
	/** Register a PUT route */
	put: <P extends PathParams = PathParams>(
		path: string,
		handler: RouteHandler<TLocals, P>,
	) => RouteBuilder<TLocals>;
	/** Register a DELETE route */
	delete: <P extends PathParams = PathParams>(
		path: string,
		handler: RouteHandler<TLocals, P>,
	) => RouteBuilder<TLocals>;
	/** Register a PATCH route */
	patch: <P extends PathParams = PathParams>(
		path: string,
		handler: RouteHandler<TLocals, P>,
	) => RouteBuilder<TLocals>;
	/** Create a nested route group */
	group: ((prefix: string, callback: GroupCallback<TLocals>) => GroupRouter<TLocals>) &
		((options: GroupOptions<TLocals>, callback: GroupCallback<TLocals>) => GroupRouter<TLocals>);
}

/**
 * Callback function for defining routes within a group.
 *
 * @typeParam TLocals — Shape of `ctx.locals` (inherited from `createApp<TLocals>()`)
 */
export type GroupCallback<TLocals extends object = Record<string, unknown>> = (
	router: GroupRouter<TLocals>,
) => void;
