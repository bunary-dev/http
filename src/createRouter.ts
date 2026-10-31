import { bindApp, getBoundApp } from "./appBinding.js";
import { createRequestContext } from "./context.js";
import {
	executeRoute,
	expandAllowedMethods,
	handleError,
	handleMethodNotAllowed,
	handleNotFound,
	handleOptions,
	type RequestIPSource,
	runMiddlewareChain,
	setPreflightAllowMethods,
	setRequestServer,
	toHeadResponse,
} from "./handlers/index.js";
import { joinPaths, normalizePrefix } from "./pathUtils.js";
import { problem } from "./problem.js";
import { toResponse } from "./response.js";
import { compilePath } from "./router.js";
import {
	createGroupRouter,
	createRouteBuilder,
	findRouteByPath,
	getAllowedMethods,
	RouteIndex,
	resolveRoute,
} from "./routes/index.js";
import type {
	BunaryServer,
	GroupCallback,
	GroupOptions,
	HandlerResponse,
	HttpMethod,
	ListenOptions,
	Middleware,
	RequestContext,
	Route,
	RouteBuilder,
	RouteHandler,
	RouteInfo,
	Router,
	RouterOptions,
	RouteSchemas,
	WebSocketHandlers,
	WebSocketRouteOptions,
} from "./types/index.js";
import { normalizeRouteArgs } from "./validation.js";
import { createWebSocketRoute, websocketHandler } from "./websocket.js";

/**
 * Append queued `Set-Cookie` header values onto a `Response`.
 *
 * Appends in place when the `Response`'s headers are mutable. Some `Response`
 * instances (e.g. `Response.redirect()`) carry an immutable header list per
 * the Fetch spec, so a mutating `append()` throws; when it does, this clones
 * the response with a fresh, mutable `Headers` instead.
 *
 * @internal
 */
function withQueuedCookies(response: Response, cookieHeaders: readonly string[]): Response {
	if (cookieHeaders.length === 0) {
		return response;
	}

	try {
		for (const value of cookieHeaders) {
			response.headers.append("set-cookie", value);
		}
		return response;
	} catch {
		const headers = new Headers(response.headers);
		for (const value of cookieHeaders) {
			headers.append("set-cookie", value);
		}
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	}
}

/**
 * Create a new Bunary HTTP router instance.
 *
 * Provides a simple, chainable API for defining routes and middleware.
 * Objects returned from handlers are automatically serialized to JSON.
 *
 * @returns Router instance
 *
 * @example
 * ```ts
 * import { createRouter } from "@bunary/http";
 *
 * const router = createRouter();
 *
 * // Simple JSON response
 * router.get("/", () => ({ message: "Hello, Bunary!" }));
 *
 * // Path parameters
 * router.get("/users/:id", (ctx) => {
 *   return { id: ctx.params.id };
 * });
 *
 * // Route groups
 * router.group("/api", (api) => {
 *   api.get("/users", () => ({ users: [] }));
 * });
 *
 * // Named routes
 * router.get("/users/:id", (ctx) => ({ id: ctx.params.id })).name("users.show");
 * const url = router.route("users.show", { id: 123 });
 *
 * router.listen(3000);
 * ```
 *
 * @param options - Optional configuration
 * @param options.basePath - Base path prefix for all routes (e.g., "/api")
 * @typeParam TLocals — Shape of `ctx.locals`. Defaults to `Record<string, unknown>`.
 * @returns Router instance
 *
 * @example
 * ```ts
 * // Without basePath
 * const router = createRouter();
 * router.get("/users", () => ({})); // Matches /users
 *
 * // With basePath
 * const apiApp = createRouter({ basePath: "/api" });
 * apiApp.get("/users", () => ({})); // Matches /api/users
 *
 * // With typed locals
 * interface Locals { user: User; requestId: string }
 * const typedApp = createRouter<Locals>();
 * typedApp.get("/me", (ctx) => ({ user: ctx.locals.user })); // typed
 * ```
 */
export function createRouter<TLocals extends object = Record<string, unknown>>(
	options?: RouterOptions<TLocals>,
): Router<TLocals> {
	// Cast options to internal type — TLocals generic only affects compile-time
	// type checking at the public API boundary, not runtime behaviour.
	const internalOpts = options as RouterOptions | undefined;

	// Indexed by first static path segment at registration time (#12)
	const routes = new RouteIndex();
	const middlewares: Middleware[] = [];
	const namedRoutes: Map<string, Route> = new Map();
	// Normalize basePath: "/" is treated as empty (no prefix)
	const normalizedBasePath = internalOpts?.basePath ? normalizePrefix(internalOpts.basePath) : "";
	const basePath = normalizedBasePath === "/" ? "" : normalizedBasePath;

	const maxBodySize = internalOpts?.maxBodySize;

	const NO_MIDDLEWARE: readonly Middleware[] = [];

	/**
	 * Register a route for a specific HTTP method.
	 */
	function addRoute(
		method: HttpMethod,
		path: string,
		handler: RouteHandler,
		groupMiddleware: Middleware[] = [],
		schemas?: RouteSchemas,
	): RouteBuilder {
		// Apply basePath prefix to the route path
		const fullPath = basePath ? joinPaths(basePath, path) : path;
		const { pattern, paramNames, optionalParams, isWildcard } = compilePath(fullPath);
		const route: Route = {
			method,
			path: fullPath,
			pattern,
			paramNames,
			handler,
			optionalParams: optionalParams.length > 0 ? optionalParams : undefined,
			middleware: groupMiddleware.length > 0 ? [...groupMiddleware] : undefined,
			isWildcard: isWildcard || undefined,
			schemas,
		};
		routes.add(route);
		return createRouteBuilder(route, namedRoutes, router);
	}

	/**
	 * A resolved request: the context every layer shares, and the dispatcher
	 * that produces the response once global middleware has had its say.
	 */
	interface Dispatch {
		ctx: RequestContext;
		run: () => Promise<HandlerResponse>;
	}

	/**
	 * Resolve a request into its dispatcher.
	 *
	 * The dispatcher is whatever terminates the pipeline: a matched route
	 * (behind its group middleware), or one of the 404 / 405 / OPTIONS
	 * handlers. It deliberately does not include global middleware, which the
	 * caller wraps around it so every outcome is covered (#65).
	 */
	function prepareDispatch(request: Request, url: URL, method: HttpMethod): Dispatch {
		const path = url.pathname;
		// Read per-request: httpProvider binds the Application during register(),
		// which happens after createRouter() has returned.
		const app = getBoundApp(router);

		if (method === "OPTIONS") {
			const allowedMethods = getAllowedMethods(routes, path);

			// Hand cors() the Allow set so a preflight advertises the methods
			// this path really serves. An empty set means "no such path", and
			// cors() then steps aside so the 404 surfaces (#66).
			setPreflightAllowMethods(
				request,
				allowedMethods.length > 0 ? expandAllowedMethods(allowedMethods) : [],
			);

			// Prefer the route matching Access-Control-Request-Method, so group
			// middleware comes from the route the preflight is actually for
			// rather than whichever route was registered first at this path (#66).
			const requestedMethod = request.headers.get("Access-Control-Request-Method");
			const target =
				(requestedMethod
					? resolveRoute(routes, requestedMethod.trim().toUpperCase(), path).match
					: null) ?? findRouteByPath(routes, path);

			const ctx = createRequestContext(
				request,
				target?.params ?? {},
				url.searchParams,
				app,
				maxBodySize,
			);
			return {
				ctx,
				run: () =>
					runMiddlewareChain(target?.route.middleware ?? NO_MIDDLEWARE, ctx, () =>
						handleOptions(ctx, allowedMethods, internalOpts),
					),
			};
		}

		// Single-pass route resolution: finds match, handles HEAD→GET
		// fallback, and collects allowed methods for 405 — all in one scan.
		const { match, allowedMethods } = resolveRoute(routes, method, path);

		if (!match) {
			const ctx = createRequestContext(request, {}, url.searchParams, app, maxBodySize);
			return {
				ctx,
				run: () =>
					allowedMethods.length > 0
						? // Path exists for other methods → 405
							handleMethodNotAllowed(ctx, allowedMethods, internalOpts)
						: // No route at all → 404
							handleNotFound(ctx, internalOpts),
			};
		}

		const ctx = createRequestContext(request, match.params, url.searchParams, app, maxBodySize);
		return {
			ctx,
			run: () => executeRoute(match, ctx, match.route.middleware ?? NO_MIDDLEWARE),
		};
	}

	/**
	 * Handle an incoming request.
	 *
	 * The pipeline is: global middleware → error boundary → dispatcher. Putting
	 * the error boundary *inside* the global chain means global middleware sees
	 * the error response as an ordinary response, so `cors()` and logging run
	 * for 500s just as they do for 200s. A global middleware that throws is
	 * outside that boundary, so the outer `catch` hands it to the same error
	 * handler (#65).
	 */
	async function handleRequest(request: Request, server?: RequestIPSource): Promise<Response> {
		// Bun.serve passes its server as the second argument; keep it so
		// middleware such as rateLimit() can read the socket address (#125).
		if (server && typeof server.requestIP === "function") {
			setRequestServer(request, server);
		}
		const url = new URL(request.url);
		const method = request.method as HttpMethod;
		let ctx: RequestContext | undefined;
		let run: Dispatch["run"] | undefined;
		let setupError: unknown;
		try {
			({ ctx, run } = prepareDispatch(request, url, method));
		} catch (error) {
			setupError = error;
		}

		// Never let the error handler's own failure escape the router: fall
		// back to a bare 500 problem document (#105). A throwing `onError` is
		// absorbed here rather than rethrown, so it runs at most once per
		// failure and global middleware still sees the fallback 500 (#119).
		const safeHandleError = async (c: RequestContext | undefined, error: unknown) => {
			try {
				if (c) {
					return await handleError(c, error, internalOpts);
				}
			} catch {
				// fall through to the generic response
			}
			return problem(500);
		};

		const guarded = async (): Promise<HandlerResponse> => {
			try {
				return await (run as Dispatch["run"])();
			} catch (error) {
				return await safeHandleError(ctx, error);
			}
		};

		let response: Response;
		if (!ctx || !run) {
			response = await safeHandleError(ctx, setupError);
		} else {
			try {
				response = toResponse(await runMiddlewareChain(middlewares, ctx, guarded), ctx.request);
			} catch (error) {
				response = await safeHandleError(ctx, error);
			}
		}

		// `ctx.cookies.set()`/`delete()` only queue Set-Cookie values; applying
		// them here, after global middleware has produced the final Response,
		// covers every outcome — matched routes, 404/405, OPTIONS, and error
		// responses alike (#79).
		if (ctx) {
			response = withQueuedCookies(response, ctx.cookies.headers());
		}

		// HEAD is answered from the GET route, so the body is stripped last —
		// after global middleware has seen the full response.
		return method === "HEAD" ? await toHeadResponse(response) : response;
	}

	/**
	 * Build one route-registration method, in both the `(path, handler)` and
	 * `(path, schemas, handler)` shapes (#78).
	 */
	function register(method: HttpMethod) {
		return (
			path: string,
			schemasOrHandler: RouteSchemas | RouteHandler,
			maybeHandler?: RouteHandler,
		): RouteBuilder => {
			const { schemas, handler } = normalizeRouteArgs(schemasOrHandler, maybeHandler);
			return addRoute(method, path, handler, [], schemas);
		};
	}

	// Internal implementation uses non-generic RouteHandler for storage.
	// The cast to Router is safe — handler generics only exist at the
	// public API boundary and are erased at runtime.
	const router = {
		get: register("GET"),
		post: register("POST"),
		put: register("PUT"),
		delete: register("DELETE"),
		patch: register("PATCH"),

		ws: (
			path: string,
			handlers: WebSocketHandlers<unknown>,
			options?: WebSocketRouteOptions<object, unknown, object>,
		) => addRoute("GET", path, createWebSocketRoute(handlers, options)),

		websocket: websocketHandler,

		use: (middleware: Middleware) => {
			middlewares.push(middleware);
			return router;
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
			return router;
		}) as Router["group"],

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
				// Wildcard param ("*") — replace trailing /* or /** in the stored path
				if (paramName === "*") {
					const wildcardValue = params?.["*"];
					if (wildcardValue !== undefined) {
						// Encode each segment individually, preserving "/" as separator
						const encoded = String(wildcardValue).split("/").map(encodeURIComponent).join("/");
						url = url.replace(/\/\*{1,2}$/, `/${encoded}`);
						usedParams.add("*");
					} else {
						// No value — remove the wildcard suffix
						url = url.replace(/\/\*{1,2}$/, "");
					}
					continue;
				}

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
			return routes.routes.map((route) => ({
				name: route.name ?? null,
				method: route.method,
				path: route.path,
			}));
		},

		listen: (portOrOptions?: number | ListenOptions, hostnameArg?: string): BunaryServer => {
			let port: number;
			let hostname: string;
			let listenOpts: ListenOptions = {};
			const isOptionsObject =
				portOrOptions !== undefined && portOrOptions !== null && typeof portOrOptions === "object";
			if (isOptionsObject) {
				listenOpts = portOrOptions;
				port = portOrOptions.port ?? 3000;
				hostname = portOrOptions.hostname ?? "localhost";
			} else {
				port = typeof portOrOptions === "number" ? portOrOptions : 3000;
				hostname = hostnameArg ?? "localhost";
			}

			// Serve options are passed straight through to Bun.serve,
			// and only when supplied, so Bun's own defaults still apply (#68).
			const server = Bun.serve({
				port,
				hostname,
				fetch: handleRequest,
				// One handler for every router.ws() route; it dispatches on ws.data (#128).
				websocket: websocketHandler,
				...(listenOpts.development !== undefined && { development: listenOpts.development }),
				...(listenOpts.error !== undefined && { error: listenOpts.error }),
				...(listenOpts.maxRequestBodySize !== undefined && {
					maxRequestBodySize: listenOpts.maxRequestBodySize,
				}),
				...(listenOpts.idleTimeout !== undefined && { idleTimeout: listenOpts.idleTimeout }),
				...(listenOpts.tls !== undefined && { tls: listenOpts.tls }),
			});

			return {
				server,
				port: server.port ?? port,
				hostname: server.hostname ?? hostname,
				stop: () => server.stop(),
			};
		},

		fetch: handleRequest,
	} as unknown as Router;

	// `createRouter({ app })` is the manual mount; `httpProvider()` is the
	// recommended one and binds the same way during register().
	if (internalOpts?.app) {
		bindApp(router, internalOpts.app);
	}

	// The cast is safe: TLocals only narrows handler/middleware context types
	// at compile time. At runtime, ctx.locals starts as {} and is populated
	// by middleware before handlers run — no generic information is needed.
	return router as unknown as Router<TLocals>;
}
