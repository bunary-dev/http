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
	HandlerResponse,
	HttpMethod,
	Middleware,
	RequestContext,
	Route,
	RouteHandler,
} from "./types.js";

/**
 * Compile a path pattern into a regex and extract parameter names.
 *
 * @param path - Route path pattern (e.g., "/users/:id")
 * @returns Object with regex pattern and parameter names
 *
 * @example
 * ```ts
 * const { pattern, paramNames } = compilePath("/users/:id/posts/:postId");
 * // pattern matches "/users/123/posts/456"
 * // paramNames = ["id", "postId"]
 * ```
 */
function compilePath(path: string): { pattern: RegExp; paramNames: string[] } {
	const paramNames: string[] = [];

	// Escape special regex chars except : which we use for params
	const regexString = path
		.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, paramName) => {
			paramNames.push(paramName);
			return "([^/]+)";
		});

	return {
		pattern: new RegExp(`^${regexString}$`),
		paramNames,
	};
}

/**
 * Extract path parameters from a matched route.
 *
 * @param path - The request path
 * @param route - The matched route
 * @returns Record of parameter names to values
 */
function extractParams(path: string, route: Route): Record<string, string> {
	const match = path.match(route.pattern);
	if (!match) return {};

	const params: Record<string, string> = {};
	for (let i = 0; i < route.paramNames.length; i++) {
		params[route.paramNames[i]] = match[i + 1];
	}
	return params;
}

/**
 * Convert a handler response to a proper Response object.
 *
 * @param result - The handler return value
 * @returns A proper Response object
 */
function toResponse(result: HandlerResponse): Response {
	// Already a Response
	if (result instanceof Response) {
		return result;
	}

	// Null/undefined → 204 No Content
	if (result === null || result === undefined) {
		return new Response(null, { status: 204 });
	}

	// String → text/plain
	if (typeof result === "string") {
		return new Response(result, {
			status: 200,
			headers: { "Content-Type": "text/plain;charset=utf-8" },
		});
	}

	// Number → text/plain
	if (typeof result === "number") {
		return new Response(String(result), {
			status: 200,
			headers: { "Content-Type": "text/plain;charset=utf-8" },
		});
	}

	// Object/array → JSON
	return new Response(JSON.stringify(result), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

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
 * // Query parameters
 * app.get("/search", (ctx) => {
 *   return { query: ctx.query.get("q") };
 * });
 *
 * // Custom Response
 * app.get("/custom", () => {
 *   return new Response("Custom", { status: 201 });
 * });
 *
 * app.listen(3000);
 * ```
 */
export function createApp(): BunaryApp {
	const routes: Route[] = [];
	const middlewares: Middleware[] = [];

	/**
	 * Register a route for a specific HTTP method.
	 */
	function addRoute(method: HttpMethod, path: string, handler: RouteHandler): BunaryApp {
		const { pattern, paramNames } = compilePath(path);
		routes.push({ method, path, pattern, paramNames, handler });
		return app;
	}

	/**
	 * Find a matching route for the given method and path.
	 */
	function findRoute(
		method: string,
		path: string,
	): { route: Route; params: Record<string, string> } | null {
		for (const route of routes) {
			if (route.pattern.test(path)) {
				if (route.method === method) {
					return { route, params: extractParams(path, route) };
				}
			}
		}
		return null;
	}

	/**
	 * Check if any route matches the path (regardless of method).
	 */
	function hasMatchingPath(path: string): boolean {
		return routes.some((route) => route.pattern.test(path));
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
			params: match.params,
			query: url.searchParams,
		};

		try {
			// Execute middleware chain and handler
			let index = 0;

			const next = async (): Promise<HandlerResponse> => {
				if (index < middlewares.length) {
					const middleware = middlewares[index++];
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

	const app: BunaryApp = {
		/**
		 * Register a GET route.
		 *
		 * @param path - URL path pattern (supports :param syntax)
		 * @param handler - Function to handle requests
		 * @returns The app instance for chaining
		 *
		 * @example
		 * ```ts
		 * app.get("/users/:id", (ctx) => {
		 *   return { id: ctx.params.id };
		 * });
		 * ```
		 */
		get: (path: string, handler: RouteHandler) => addRoute("GET", path, handler),

		/**
		 * Register a POST route.
		 *
		 * @param path - URL path pattern (supports :param syntax)
		 * @param handler - Function to handle requests
		 * @returns The app instance for chaining
		 *
		 * @example
		 * ```ts
		 * app.post("/users", async (ctx) => {
		 *   const body = await ctx.request.json();
		 *   return { created: true, data: body };
		 * });
		 * ```
		 */
		post: (path: string, handler: RouteHandler) => addRoute("POST", path, handler),

		/**
		 * Register a PUT route.
		 *
		 * @param path - URL path pattern (supports :param syntax)
		 * @param handler - Function to handle requests
		 * @returns The app instance for chaining
		 */
		put: (path: string, handler: RouteHandler) => addRoute("PUT", path, handler),

		/**
		 * Register a DELETE route.
		 *
		 * @param path - URL path pattern (supports :param syntax)
		 * @param handler - Function to handle requests
		 * @returns The app instance for chaining
		 */
		delete: (path: string, handler: RouteHandler) => addRoute("DELETE", path, handler),

		/**
		 * Register a PATCH route.
		 *
		 * @param path - URL path pattern (supports :param syntax)
		 * @param handler - Function to handle requests
		 * @returns The app instance for chaining
		 */
		patch: (path: string, handler: RouteHandler) => addRoute("PATCH", path, handler),

		/**
		 * Add middleware to the request pipeline.
		 *
		 * Middleware executes in registration order before route handlers.
		 * Call `next()` to continue the chain.
		 *
		 * @param middleware - Middleware function
		 * @returns The app instance for chaining
		 *
		 * @example
		 * ```ts
		 * app.use(async (ctx, next) => {
		 *   console.log(`${ctx.request.method} ${ctx.request.url}`);
		 *   const result = await next();
		 *   console.log("Response sent");
		 *   return result;
		 * });
		 * ```
		 */
		use: (middleware: Middleware) => {
			middlewares.push(middleware);
			return app;
		},

		/**
		 * Start the HTTP server using Bun.serve.
		 *
		 * @param port - Port number to listen on (default: 3000)
		 * @param hostname - Hostname to bind to (default: "localhost")
		 * @returns Server instance with stop() method
		 *
		 * @example
		 * ```ts
		 * const server = app.listen(3000);
		 * console.log(`Server running on http://localhost:${server.port}`);
		 *
		 * // Later...
		 * server.stop();
		 * ```
		 */
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

		/**
		 * Handle an incoming request directly.
		 *
		 * Useful for testing without starting a server.
		 *
		 * @param request - The incoming Request object
		 * @returns Response object
		 *
		 * @example
		 * ```ts
		 * const response = await app.fetch(
		 *   new Request("http://localhost/users/123")
		 * );
		 * const data = await response.json();
		 * ```
		 */
		fetch: handleRequest,
	};

	return app;
}
