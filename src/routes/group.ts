import { joinPaths } from "../pathUtils.js";
import type {
	GroupCallback,
	GroupOptions,
	GroupRouter,
	Middleware,
	RouteBuilder,
	RouteHandler,
} from "../types/index.js";
import { wrapBuilderWithNamePrefix } from "./builder.js";

export type AddRouteFn = (
	method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
	path: string,
	handler: RouteHandler,
	groupMiddleware?: Middleware[],
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
	// Internal implementation uses non-generic RouteHandler for storage.
	// The cast to GroupRouter is safe — handler generics only exist at the
	// public API boundary and are erased at runtime.
	const router = {
		get: (path: string, handler: RouteHandler) => {
			const fullPath = joinPaths(prefix, path);
			const builder = addRoute("GET", fullPath, handler, groupMiddleware);
			return wrapBuilderWithNamePrefix(builder, namePrefix);
		},
		post: (path: string, handler: RouteHandler) => {
			const fullPath = joinPaths(prefix, path);
			return wrapBuilderWithNamePrefix(
				addRoute("POST", fullPath, handler, groupMiddleware),
				namePrefix,
			);
		},
		put: (path: string, handler: RouteHandler) => {
			const fullPath = joinPaths(prefix, path);
			return wrapBuilderWithNamePrefix(
				addRoute("PUT", fullPath, handler, groupMiddleware),
				namePrefix,
			);
		},
		delete: (path: string, handler: RouteHandler) => {
			const fullPath = joinPaths(prefix, path);
			return wrapBuilderWithNamePrefix(
				addRoute("DELETE", fullPath, handler, groupMiddleware),
				namePrefix,
			);
		},
		patch: (path: string, handler: RouteHandler) => {
			const fullPath = joinPaths(prefix, path);
			return wrapBuilderWithNamePrefix(
				addRoute("PATCH", fullPath, handler, groupMiddleware),
				namePrefix,
			);
		},
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
