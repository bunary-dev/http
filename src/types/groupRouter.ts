import type { GroupOptions } from "./groupOptions.js";
import type { PathParams } from "./pathParams.js";
import type { RouteBuilder } from "./routeBuilder.js";
import type { RouteHandler } from "./routeHandler.js";
import type { RouteSchemas, ValidatedRouteHandler } from "./validation.js";
import type { WebSocketData, WebSocketHandlers, WebSocketRouteOptions } from "./websocket.js";

/**
 * Router interface for route groups.
 * Provides the same routing methods as Router but scoped to a group.
 *
 * @typeParam TLocals — Shape of `ctx.locals` (inherited from `createRouter<TLocals>()`)
 */
export interface GroupRouter<TLocals extends object = Record<string, unknown>> {
	/** Register a GET route, optionally with `{ params?, query?, body? }` schemas (#78) */
	get: {
		<P extends PathParams = PathParams>(
			path: string,
			handler: RouteHandler<TLocals, P>,
		): RouteBuilder<TLocals>;
		<S extends RouteSchemas>(
			path: string,
			schemas: S,
			handler: ValidatedRouteHandler<TLocals, S>,
		): RouteBuilder<TLocals>;
	};
	/** Register a POST route, optionally with `{ params?, query?, body? }` schemas (#78) */
	post: {
		<P extends PathParams = PathParams>(
			path: string,
			handler: RouteHandler<TLocals, P>,
		): RouteBuilder<TLocals>;
		<S extends RouteSchemas>(
			path: string,
			schemas: S,
			handler: ValidatedRouteHandler<TLocals, S>,
		): RouteBuilder<TLocals>;
	};
	/** Register a PUT route, optionally with `{ params?, query?, body? }` schemas (#78) */
	put: {
		<P extends PathParams = PathParams>(
			path: string,
			handler: RouteHandler<TLocals, P>,
		): RouteBuilder<TLocals>;
		<S extends RouteSchemas>(
			path: string,
			schemas: S,
			handler: ValidatedRouteHandler<TLocals, S>,
		): RouteBuilder<TLocals>;
	};
	/** Register a DELETE route, optionally with `{ params?, query?, body? }` schemas (#78) */
	delete: {
		<P extends PathParams = PathParams>(
			path: string,
			handler: RouteHandler<TLocals, P>,
		): RouteBuilder<TLocals>;
		<S extends RouteSchemas>(
			path: string,
			schemas: S,
			handler: ValidatedRouteHandler<TLocals, S>,
		): RouteBuilder<TLocals>;
	};
	/** Register a PATCH route, optionally with `{ params?, query?, body? }` schemas (#78) */
	patch: {
		<P extends PathParams = PathParams>(
			path: string,
			handler: RouteHandler<TLocals, P>,
		): RouteBuilder<TLocals>;
		<S extends RouteSchemas>(
			path: string,
			schemas: S,
			handler: ValidatedRouteHandler<TLocals, S>,
		): RouteBuilder<TLocals>;
	};
	/** Register a WebSocket route; group middleware runs before the upgrade (#128) */
	ws: <P extends PathParams = PathParams, TExtra extends object = Record<never, never>>(
		path: string,
		handlers: WebSocketHandlers<WebSocketData<TLocals, P, TExtra>>,
		options?: WebSocketRouteOptions<TLocals, P, TExtra>,
	) => RouteBuilder<TLocals>;
	/** Create a nested route group */
	group: ((prefix: string, callback: GroupCallback<TLocals>) => GroupRouter<TLocals>) &
		((options: GroupOptions<TLocals>, callback: GroupCallback<TLocals>) => GroupRouter<TLocals>);
}

/**
 * Callback function for defining routes within a group.
 *
 * @typeParam TLocals — Shape of `ctx.locals` (inherited from `createRouter<TLocals>()`)
 */
export type GroupCallback<TLocals extends object = Record<string, unknown>> = (
	router: GroupRouter<TLocals>,
) => void;
