import type { BindingsFor, BoundRouteHandler, BoundRouteSchemas } from "./binding.js";
import type { PathParams } from "./pathParams.js";
import type { QueryParams } from "./queryParams.js";
import type { RouteBuilder } from "./routeBuilder.js";
import type { RouteHandler } from "./routeHandler.js";
import type { RouteSchema, UnboundRouteSchemas, ValidatedRouteHandler } from "./validation.js";

/**
 * A route-registration method (`get`, `post`, `put`, `delete`, `patch`) on a
 * `Router` or `GroupRouter`.
 *
 * - `(path, handler)` — `ctx.params` is `PathParams`, or `P` when given
 * - `(path, { params?, query?, body? }, handler)` — validated slots (#78)
 * - `(path, { params?, query?, body?, bind }, handler)` — validated slots plus
 *   a typed `ctx.bound` (#158)
 *
 * @typeParam TLocals — Shape of `ctx.locals`
 */
export interface RouteRegistration<TLocals extends object> {
	<P extends PathParams = PathParams>(
		path: string,
		handler: RouteHandler<TLocals, P>,
	): RouteBuilder<TLocals>;
	<S extends UnboundRouteSchemas>(
		path: string,
		schemas: S,
		handler: ValidatedRouteHandler<TLocals, S>,
	): RouteBuilder<TLocals>;
	<
		TParams extends RouteSchema<PathParams> | undefined = undefined,
		TQuery extends RouteSchema<QueryParams> | undefined = undefined,
		TBody extends RouteSchema<unknown> | undefined = undefined,
		TBindings extends BindingsFor<TParams> = BindingsFor<TParams>,
	>(
		path: string,
		schemas: BoundRouteSchemas<TParams, TQuery, TBody, TBindings>,
		handler: BoundRouteHandler<TLocals, TParams, TQuery, TBody, TBindings>,
	): RouteBuilder<TLocals>;
}
