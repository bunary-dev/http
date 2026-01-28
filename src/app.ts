import { joinPaths, normalizePrefix } from "./pathUtils.js";
import { toResponse } from "./response.js";
import { compilePath } from "./router.js";
import {
	createGroupRouter,
	createRouteBuilder,
	findRoute,
	getAllowedMethods,
	hasMatchingPath,
} from "./routes/index.js";
import type {
	AppOptions,
	BunaryApp,
	BunaryServer,
	GroupCallback,
	GroupOptions,
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
 *
 * @param options - Optional configuration
 * @param options.basePath - Base path prefix for all routes (e.g., "/api")
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
 * ```
 */
export function createApp(options?: AppOptions): BunaryApp {
	const routes: Route[] = [];
	const middlewares: Middleware[] = [];
	const namedRoutes: Map<string, Route> = new Map();
	// Normalize basePath: "/" is treated as empty (no prefix)
	const normalizedBasePath = options?.basePath ? normalizePrefix(options.basePath) : "";
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

		// Handle OPTIONS requests
		if (method === "OPTIONS") {
			if (hasMatchingPath(routes, path)) {
				const allowedMethods = getAllowedMethods(routes, path);
				return new Response(null, {
					status: 204,
					headers: { Allow: allowedMethods.join(", ") },
				});
			}
			// No route at all → 404
			const notFoundCtx: RequestContext = {
				request,
				params: {},
				query: url.searchParams,
				locals: {},
			};
			if (options?.onNotFound) {
				return toResponse(options.onNotFound(notFoundCtx));
			}
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Handle HEAD requests - treat as GET but with empty body
		let actualMethod = method;
		if (method === "HEAD") {
			// First check if there's an explicit HEAD route
			const headMatch = findRoute(routes, "HEAD", path);
			if (headMatch) {
				actualMethod = "HEAD";
			} else {
				// Fall back to GET route
				const getMatch = findRoute(routes, "GET", path);
				if (getMatch) {
					actualMethod = "GET";
				}
			}
		}

		// Find matching route
		const match = findRoute(routes, actualMethod, path);

		if (!match) {
			// Check if path exists with different method → 405
			if (hasMatchingPath(routes, path)) {
				const allowedMethods = getAllowedMethods(routes, path);
				const methodNotAllowedCtx: RequestContext = {
					request,
					params: {},
					query: url.searchParams,
					locals: {},
				};
				if (options?.onMethodNotAllowed) {
					const response = toResponse(
						options.onMethodNotAllowed(methodNotAllowedCtx, allowedMethods),
					);
					// Ensure Allow header is present even with custom handler
					const allowHeader = response.headers.get("Allow");
					if (!allowHeader) {
						const headers = new Headers(response.headers);
						headers.set("Allow", allowedMethods.join(", "));
						return new Response(response.body, {
							status: response.status,
							statusText: response.statusText,
							headers,
						});
					}
					return response;
				}
				return new Response(JSON.stringify({ error: "Method not allowed" }), {
					status: 405,
					headers: {
						"Content-Type": "application/json",
						Allow: allowedMethods.join(", "),
					},
				});
			}
			// No route at all → 404
			const notFoundCtx: RequestContext = {
				request,
				params: {},
				query: url.searchParams,
				locals: {},
			};
			if (options?.onNotFound) {
				return toResponse(options.onNotFound(notFoundCtx));
			}
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Build request context
		const ctx: RequestContext = {
			request,
			params: match.params,
			query: url.searchParams,
			locals: {},
		};

		try {
			// Get cached middleware chain for this route
			const allMiddleware = getMiddlewareChain(match.route);

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
			const response = toResponse(result);

			// For HEAD requests, return response with empty body
			if (method === "HEAD") {
				return new Response(null, {
					status: response.status,
					statusText: response.statusText,
					headers: response.headers,
				});
			}

			return response;
		} catch (error) {
			// Error handling - return 500
			const errorCtx: RequestContext = {
				request,
				params: match.params,
				query: url.searchParams,
				locals: {},
			};
			if (options?.onError) {
				return toResponse(options.onError(errorCtx, error));
			}
			const message = error instanceof Error ? error.message : "Internal server error";
			return new Response(JSON.stringify({ error: message }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}
	}

	const app: BunaryApp = {
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
			const opts =
				typeof prefixOrOptions === "string" ? { prefix: prefixOrOptions } : prefixOrOptions;
			// Groups work relative to basePath - createGroupRouter will call addRoute
			// which applies basePath, so we pass the group prefix as-is
			const groupRouter = createGroupRouter(
				opts.prefix,
				opts.middleware ?? [],
				opts.name ?? "",
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
	};

	return app;
}
