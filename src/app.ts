import { joinPaths } from "./pathUtils.js";
import { toResponse } from "./response.js";
import { checkConstraints, compilePath, extractParams } from "./router.js";
/**
 * Create a new Bunary HTTP application instance.
 *
 * @returns BunaryApp instance with routing and middleware support
 *
 * @example
 * ```ts
 * import { createApp } from "@bunary/http";
 *
 * const app = createApp();
 *
 * app.get("/", () => ({ message: "Hello!" }));
 * app.get("/users/:id", (ctx) => ({ id: ctx.params.id }));
 *
 * app.listen(3000);
 * ```
 */
import type {
	BunaryApp,
	BunaryServer,
	GroupCallback,
	GroupOptions,
	GroupRouter,
	HandlerResponse,
	HttpMethod,
	Middleware,
	RequestContext,
	Route,
	RouteBuilder,
	RouteHandler,
	RouteInfo,
} from "./types/index.js";

/**
 * Create a new Bunary HTTP application instance.
 *
 * Provides a simple, chainable API for defining routes and middleware.
 * Objects returned from handlers are automatically serialized to JSON.
 *
 * @returns BunaryApp instance
 *
 * @example
 * ```ts
 * import { createApp } from "@bunary/http";
 *
 * const app = createApp();
 *
 * // Simple JSON response
 * app.get("/", () => ({ message: "Hello, Bunary!" }));
 *
 * // Path parameters
 * app.get("/users/:id", (ctx) => {
 *   return { id: ctx.params.id };
 * });
 *
 * // Route groups
 * app.group("/api", (router) => {
 *   router.get("/users", () => ({ users: [] }));
 * });
 *
 * // Named routes
 * app.get("/users/:id", (ctx) => ({ id: ctx.params.id })).name("users.show");
 * const url = app.route("users.show", { id: 123 });
 *
 * app.listen(3000);
 * ```
 */
export function createApp(): BunaryApp {
	const routes: Route[] = [];
	const middlewares: Middleware[] = [];
	const namedRoutes: Map<string, Route> = new Map();

	// Track the last registered route for chaining (name, where, etc.)
	let lastRoute: Route | null = null;

	/**
	 * Register a route for a specific HTTP method.
	 */
	function addRoute(
		method: HttpMethod,
		path: string,
		handler: RouteHandler,
		groupMiddleware: Middleware[] = [],
	): RouteBuilder {
		const { pattern, paramNames, optionalParams } = compilePath(path);
		const route: Route = {
			method,
			path,
			pattern,
			paramNames,
			handler,
			optionalParams,
			middleware: groupMiddleware.length > 0 ? [...groupMiddleware] : undefined,
		};
		routes.push(route);
		lastRoute = route;
		return routeBuilder;
	}

	/**
	 * Find a matching route for the given method and path.
	 */
	function findRoute(
		method: string,
		path: string,
	): { route: Route; params: Record<string, string | undefined> } | null {
		for (const route of routes) {
			if (route.pattern.test(path)) {
				if (route.method === method) {
					const params = extractParams(path, route);
					// Check constraints
					if (!checkConstraints(params, route.constraints)) {
						continue;
					}
					return { route, params };
				}
			}
		}
		return null;
	}

	/**
	 * Check if any route matches the path (regardless of method).
	 */
	function hasMatchingPath(path: string): boolean {
		return routes.some((route) => {
			if (!route.pattern.test(path)) return false;
			const params = extractParams(path, route);
			return checkConstraints(params, route.constraints);
		});
	}

	/**
	 * Handle an incoming request.
	 */
	async function handleRequest(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		const method = request.method as HttpMethod;

		// Find matching route
		const match = findRoute(method, path);

		if (!match) {
			// Check if path exists with different method → 405
			if (hasMatchingPath(path)) {
				return new Response(JSON.stringify({ error: "Method not allowed" }), {
					status: 405,
					headers: { "Content-Type": "application/json" },
				});
			}
			// No route at all → 404
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Build request context
		const ctx: RequestContext = {
			request,
			params: match.params as Record<string, string>,
			query: url.searchParams,
		};

		try {
			// Build middleware chain: global -> route-specific
			const allMiddleware = [...middlewares];
			if (match.route.middleware) {
				allMiddleware.push(...match.route.middleware);
			}

			let index = 0;
			const next = async (): Promise<HandlerResponse> => {
				if (index < allMiddleware.length) {
					const middleware = allMiddleware[index++];
					return await middleware(ctx, next);
				}
				// All middleware done, call handler
				return await match.route.handler(ctx);
			};

			const result = await next();
			return toResponse(result);
		} catch (error) {
			// Error handling - return 500
			const message = error instanceof Error ? error.message : "Internal server error";
			return new Response(JSON.stringify({ error: message }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}
	}

	/**
	 * Create a group router for defining routes within a group.
	 */
	function createGroupRouter(
		prefix: string,
		groupMiddleware: Middleware[],
		namePrefix: string,
	): GroupRouter {
		const router: GroupRouter = {
			get: (path, handler) => {
				const fullPath = joinPaths(prefix, path);
				const builder = addRoute("GET", fullPath, handler, groupMiddleware);
				// Auto-apply name prefix if route gets named
				return wrapBuilderWithNamePrefix(builder, namePrefix);
			},
			post: (path, handler) => {
				const fullPath = joinPaths(prefix, path);
				return wrapBuilderWithNamePrefix(
					addRoute("POST", fullPath, handler, groupMiddleware),
					namePrefix,
				);
			},
			put: (path, handler) => {
				const fullPath = joinPaths(prefix, path);
				return wrapBuilderWithNamePrefix(
					addRoute("PUT", fullPath, handler, groupMiddleware),
					namePrefix,
				);
			},
			delete: (path, handler) => {
				const fullPath = joinPaths(prefix, path);
				return wrapBuilderWithNamePrefix(
					addRoute("DELETE", fullPath, handler, groupMiddleware),
					namePrefix,
				);
			},
			patch: (path, handler) => {
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
				const nestedRouter = createGroupRouter(nestedPrefix, nestedMiddleware, nestedNamePrefix);
				callback(nestedRouter);
				return router;
			}) as GroupRouter["group"],
		};
		return router;
	}

	/**
	 * Wrap a route builder to auto-apply name prefix.
	 */
	function wrapBuilderWithNamePrefix(builder: RouteBuilder, namePrefix: string): RouteBuilder {
		if (!namePrefix) return builder;

		const originalName = builder.name;
		return {
			...builder,
			name: (name: string) => {
				return originalName(namePrefix + name);
			},
		};
	}

	/**
	 * Add a constraint to a route parameter.
	 */
	function addConstraint(param: string, pattern: RegExp): void {
		if (!lastRoute) return;
		if (!lastRoute.constraints) {
			lastRoute.constraints = {};
		}
		lastRoute.constraints[param] = pattern;
	}

	// Route builder provides fluent methods for the last registered route
	const routeBuilder: RouteBuilder = {
		// Forward all BunaryApp methods
		get get() {
			return app.get;
		},
		get post() {
			return app.post;
		},
		get put() {
			return app.put;
		},
		get delete() {
			return app.delete;
		},
		get patch() {
			return app.patch;
		},
		get use() {
			return app.use;
		},
		get group() {
			return app.group;
		},
		get route() {
			return app.route;
		},
		get hasRoute() {
			return app.hasRoute;
		},
		get getRoutes() {
			return app.getRoutes;
		},
		get listen() {
			return app.listen;
		},
		get fetch() {
			return app.fetch;
		},

		// Route-specific methods
		name: (name: string) => {
			if (!lastRoute) {
				throw new Error("No route to name");
			}
			if (namedRoutes.has(name)) {
				throw new Error(`Route name "${name}" is already defined`);
			}
			lastRoute.name = name;
			namedRoutes.set(name, lastRoute);
			return routeBuilder;
		},

		where: ((
			paramOrConstraints: string | Record<string, RegExp | string>,
			pattern?: RegExp | string,
		) => {
			if (typeof paramOrConstraints === "string") {
				// Single constraint: where("id", /^\d+$/)
				if (!pattern) {
					throw new Error(`Pattern is required for constraint on "${paramOrConstraints}"`);
				}
				const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
				addConstraint(paramOrConstraints, regex);
			} else {
				// Multiple constraints: where({ id: /^\d+$/, slug: /^[a-z-]+$/ })
				for (const [param, pat] of Object.entries(paramOrConstraints)) {
					const regex = typeof pat === "string" ? new RegExp(pat) : pat;
					addConstraint(param, regex);
				}
			}
			return routeBuilder;
		}) as RouteBuilder["where"],

		whereNumber: (param: string) => {
			addConstraint(param, /^\d+$/);
			return routeBuilder;
		},

		whereAlpha: (param: string) => {
			addConstraint(param, /^[a-zA-Z]+$/);
			return routeBuilder;
		},

		whereAlphaNumeric: (param: string) => {
			addConstraint(param, /^[a-zA-Z0-9]+$/);
			return routeBuilder;
		},

		whereUuid: (param: string) => {
			addConstraint(param, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
			return routeBuilder;
		},

		whereUlid: (param: string) => {
			addConstraint(param, /^[0-9A-HJKMNP-TV-Z]{26}$/);
			return routeBuilder;
		},

		whereIn: (param: string, values: string[]) => {
			const escaped = values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
			addConstraint(param, new RegExp(`^(${escaped.join("|")})$`));
			return routeBuilder;
		},
	};

	const app: BunaryApp = {
		get: (path: string, handler: RouteHandler) => addRoute("GET", path, handler),
		post: (path: string, handler: RouteHandler) => addRoute("POST", path, handler),
		put: (path: string, handler: RouteHandler) => addRoute("PUT", path, handler),
		delete: (path: string, handler: RouteHandler) => addRoute("DELETE", path, handler),
		patch: (path: string, handler: RouteHandler) => addRoute("PATCH", path, handler),

		use: (middleware: Middleware) => {
			middlewares.push(middleware);
			return app;
		},

		group: ((prefixOrOptions: string | GroupOptions, callback: GroupCallback) => {
			const opts =
				typeof prefixOrOptions === "string" ? { prefix: prefixOrOptions } : prefixOrOptions;
			const groupRouter = createGroupRouter(opts.prefix, opts.middleware ?? [], opts.name ?? "");
			callback(groupRouter);
			return app;
		}) as BunaryApp["group"],

		route: (name: string, params?: Record<string, string | number>) => {
			const route = namedRoutes.get(name);
			if (!route) {
				throw new Error(`Route "${name}" not found`);
			}

			let url = route.path;
			const queryParams: Record<string, string> = {};
			const usedParams = new Set<string>();

			// Replace path parameters
			for (const paramName of route.paramNames) {
				const isOptional = route.optionalParams?.includes(paramName);
				const value = params?.[paramName];

				if (value !== undefined) {
					url = url.replace(new RegExp(`:${paramName}\\??`), encodeURIComponent(String(value)));
					usedParams.add(paramName);
				} else if (isOptional) {
					// Remove optional param placeholder
					url = url.replace(new RegExp(`/:${paramName}\\?`), "");
				} else {
					throw new Error(`Missing required param "${paramName}" for route "${name}"`);
				}
			}

			// Add extra params as query string
			if (params) {
				for (const [key, value] of Object.entries(params)) {
					if (!usedParams.has(key)) {
						queryParams[key] = String(value);
					}
				}
			}

			if (Object.keys(queryParams).length > 0) {
				const qs = new URLSearchParams(queryParams).toString();
				url += `?${qs}`;
			}

			return url;
		},

		hasRoute: (name: string) => {
			return namedRoutes.has(name);
		},

		getRoutes: (): RouteInfo[] => {
			return routes.map((route) => ({
				name: route.name ?? null,
				method: route.method,
				path: route.path,
			}));
		},

		listen: (port = 3000, hostname = "localhost"): BunaryServer => {
			const server = Bun.serve({
				port,
				hostname,
				fetch: handleRequest,
			});

			return {
				server,
				port: server.port ?? port,
				hostname: server.hostname ?? hostname,
				stop: () => server.stop(),
			};
		},

		fetch: handleRequest,
	};

	return app;
}
