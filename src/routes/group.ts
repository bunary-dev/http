import { joinPaths } from "../pathUtils.js";
import type {
	GroupCallback,
	GroupOptions,
	GroupRouter,
	HttpMethod,
	Middleware,
	RouteBuilder,
	RouteHandler,
	RouteSchemas,
} from "../types/index.js";
import { normalizeRouteArgs } from "../validation.js";
import { wrapBuilderWithNamePrefix } from "./builder.js";

export type AddRouteFn = (
	method: HttpMethod,
	path: string,
	handler: RouteHandler,
	groupMiddleware?: Middleware[],
	schemas?: RouteSchemas,
) => RouteBuilder;

/**
 * Create a group router for defining routes within a group.
 */
export function createGroupRouter(
	prefix: string,
	groupMiddleware: Middleware[],
	namePrefix: string,
	addRoute: AddRouteFn,
): GroupRouter {
	/**
	 * Build one group route-registration method, in both the `(path, handler)`
	 * and `(path, schemas, handler)` shapes (#78).
	 */
	function register(method: HttpMethod) {
		return (
			path: string,
			schemasOrHandler: RouteSchemas | RouteHandler,
			maybeHandler?: RouteHandler,
		): RouteBuilder => {
			const { schemas, handler } = normalizeRouteArgs(schemasOrHandler, maybeHandler);
			const builder = addRoute(method, joinPaths(prefix, path), handler, groupMiddleware, schemas);
			return wrapBuilderWithNamePrefix(builder, namePrefix);
		};
	}

	// Internal implementation uses non-generic RouteHandler for storage.
	// The cast to GroupRouter is safe — handler generics only exist at the
	// public API boundary and are erased at runtime.
	const router = {
		get: register("GET"),
		post: register("POST"),
		put: register("PUT"),
		delete: register("DELETE"),
		patch: register("PATCH"),
		group: ((prefixOrOptions: string | GroupOptions, callback: GroupCallback) => {
			const opts =
				typeof prefixOrOptions === "string" ? { prefix: prefixOrOptions } : prefixOrOptions;
			const nestedPrefix = joinPaths(prefix, opts.prefix);
			const nestedMiddleware = [...groupMiddleware, ...(opts.middleware ?? [])];
			const nestedNamePrefix = namePrefix + (opts.name ?? "");
			const nestedRouter = createGroupRouter(
				nestedPrefix,
				nestedMiddleware,
				nestedNamePrefix,
				addRoute,
			);
			callback(nestedRouter);
			return router;
		}) as GroupRouter["group"],
	} as unknown as GroupRouter;
	return router;
}
