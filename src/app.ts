import {
	executeRoute,
	handleError,
	handleMethodNotAllowed,
	handleNotFound,
	handleOptions,
	toHeadResponse,
} from "./handlers/index.js";
import { joinPaths, normalizePrefix } from "./pathUtils.js";
import { compilePath } from "./router.js";
import { createGroupRouter, createRouteBuilder, resolveRoute } from "./routes/index.js";
import type {
	AppOptions,
	BunaryApp,
	BunaryServer,
	GroupCallback,
	GroupOptions,
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
 *
 * @param options - Optional configuration
 * @param options.basePath - Base path prefix for all routes (e.g., "/api")
 * @typeParam TLocals — Shape of `ctx.locals`. Defaults to `Record<string, unknown>`.
 * @returns BunaryApp instance
 *
 * @example
 * ```ts
 * // Without basePath
 * const app = createApp();
 * app.get("/users", () => ({})); // Matches /users
 *
 * // With basePath
 * const apiApp = createApp({ basePath: "/api" });
 * apiApp.get("/users", () => ({})); // Matches /api/users
 *
 * // With typed locals
 * interface Locals { user: User; requestId: string }
 * const typedApp = createApp<Locals>();
 * typedApp.get("/me", (ctx) => ({ user: ctx.locals.user })); // typed
 * ```
 */
export function createApp<TLocals extends object = Record<string, unknown>>(
	options?: AppOptions<TLocals>,
): BunaryApp<TLocals> {
	// Cast options to internal type — TLocals generic only affects compile-time
	// type checking at the public API boundary, not runtime behaviour.
	const internalOpts = options as AppOptions | undefined;

	const routes: Route[] = [];
	const middlewares: Middleware[] = [];
	const namedRoutes: Map<string, Route> = new Map();
	// Normalize basePath: "/" is treated as empty (no prefix)
	const normalizedBasePath = internalOpts?.basePath ? normalizePrefix(internalOpts.basePath) : "";
	const basePath = normalizedBasePath === "/" ? "" : normalizedBasePath;

	// Cache for combined middleware chains per route
	// Invalidated when global middleware changes
	let globalMiddlewareVersion = 0;
	const middlewareCache = new WeakMap<Route, { version: number; chain: Middleware[] }>();

	/**
	 * Get the combined middleware chain for a route (cached).
	 */
	function getMiddlewareChain(route: Route): Middleware[] {
		const cached = middlewareCache.get(route);
		if (cached && cached.version === globalMiddlewareVersion) {
			return cached.chain;
		}

		// Build and cache the chain
		const chain = route.middleware
			? [...middlewares, ...route.middleware]
			: middlewares.length > 0
				? [...middlewares]
				: [];

		middlewareCache.set(route, { version: globalMiddlewareVersion, chain });
		return chain;
	}

	/**
	 * Register a route for a specific HTTP method.
	 */
	function addRoute(
		method: HttpMethod,
		path: string,
		handler: RouteHandler,
		groupMiddleware: Middleware[] = [],
	): RouteBuilder {
		// Apply basePath prefix to the route path
		const fullPath = basePath ? joinPaths(basePath, path) : path;
		const { pattern, paramNames, optionalParams } = compilePath(fullPath);
		const route: Route = {
			method,
			path: fullPath,
			pattern,
			paramNames,
			handler,
			optionalParams: optionalParams.length > 0 ? optionalParams : undefined,
			middleware: groupMiddleware.length > 0 ? [...groupMiddleware] : undefined,
		};
		routes.push(route);
		return createRouteBuilder(route, namedRoutes, app);
	}

	/**
	 * Handle an incoming request.
	 */
	async function handleRequest(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		const method = request.method as HttpMethod;

		// Handle OPTIONS requests — single pass via resolveRoute
		if (method === "OPTIONS") {
			return await handleOptions(request, path, routes, internalOpts);
		}

		// Single-pass route resolution: finds match, handles HEAD→GET
		// fallback, and collects allowed methods for 405 — all in one scan.
		const { match, allowedMethods } = resolveRoute(routes, method, path);

		if (!match) {
			if (allowedMethods.length > 0) {
				// Path exists for other methods → 405
				return await handleMethodNotAllowed(request, path, routes, internalOpts, allowedMethods);
			}
			// No route at all → 404
			return await handleNotFound(request, path, internalOpts);
		}

		// Build request context
		const ctx: RequestContext = {
			request,
			params: match.params,
			query: url.searchParams,
			locals: {},
		};

		try {
			const response = await executeRoute(match, ctx, getMiddlewareChain);

			// For HEAD requests, return response with empty body
			if (method === "HEAD") {
				return toHeadResponse(response);
			}

			return response;
		} catch (error) {
			// Error handling - return 500
			return await handleError(ctx, error, internalOpts);
		}
	}

	// Internal implementation uses non-generic RouteHandler for storage.
	// The cast to BunaryApp is safe — handler generics only exist at the
	// public API boundary and are erased at runtime.
	const app = {
		get: (path: string, handler: RouteHandler) => addRoute("GET", path, handler),
		post: (path: string, handler: RouteHandler) => addRoute("POST", path, handler),
		put: (path: string, handler: RouteHandler) => addRoute("PUT", path, handler),
		delete: (path: string, handler: RouteHandler) => addRoute("DELETE", path, handler),
		patch: (path: string, handler: RouteHandler) => addRoute("PATCH", path, handler),

		use: (middleware: Middleware) => {
			middlewares.push(middleware);
			// Invalidate cached middleware chains
			globalMiddlewareVersion++;
			return app;
		},

		group: ((prefixOrOptions: string | GroupOptions, callback: GroupCallback) => {
			const groupOpts =
				typeof prefixOrOptions === "string" ? { prefix: prefixOrOptions } : prefixOrOptions;
			// Groups work relative to basePath - createGroupRouter will call addRoute
			// which applies basePath, so we pass the group prefix as-is
			const groupRouter = createGroupRouter(
				groupOpts.prefix,
				groupOpts.middleware ?? [],
				groupOpts.name ?? "",
				addRoute,
			);
			callback(groupRouter);
			return app;
		}) as BunaryApp["group"],

		route: (name: string, params?: Record<string, string | number>) => {
			const route = namedRoutes.get(name);
			if (!route) {
				throw new Error(`Route "${name}" not found`);
			}

			// Validate parameter values to prevent injection attacks
			// Reject control characters that could cause HTTP header injection
			if (params) {
				for (const [key, value] of Object.entries(params)) {
					const strValue = String(value);
					// Check for CR, LF, or NUL characters (HTTP header injection vectors)
					if (strValue.includes("\r") || strValue.includes("\n") || strValue.includes("\0")) {
						throw new Error(
							`Invalid character in parameter "${key}": control characters are not allowed`,
						);
					}
				}
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

		listen: (
			portOrOptions?: number | { port?: number; hostname?: string },
			hostnameArg?: string,
		): BunaryServer => {
			let port: number;
			let hostname: string;
			const isOptionsObject =
				portOrOptions !== undefined && portOrOptions !== null && typeof portOrOptions === "object";
			if (isOptionsObject) {
				port = portOrOptions.port ?? 3000;
				hostname = portOrOptions.hostname ?? "localhost";
			} else {
				port = typeof portOrOptions === "number" ? portOrOptions : 3000;
				hostname = hostnameArg ?? "localhost";
			}

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
	} as unknown as BunaryApp;

	// The cast is safe: TLocals only narrows handler/middleware context types
	// at compile time. At runtime, ctx.locals starts as {} and is populated
	// by middleware before handlers run — no generic information is needed.
	return app as unknown as BunaryApp<TLocals>;
}
