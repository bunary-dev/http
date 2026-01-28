import type { BunaryServer } from "./bunaryServer.js";
import type { GroupOptions } from "./groupOptions.js";
import type { GroupCallback } from "./groupRouter.js";
import type { ListenOptions } from "./listenOptions.js";
import type { Middleware } from "./middleware.js";
import type { RouteBuilder } from "./routeBuilder.js";
import type { RouteHandler } from "./routeHandler.js";
import type { RouteInfo } from "./routeInfo.js";

/**
 * The Bunary application instance for HTTP routing and middleware.
 *
 * @example
 * ```ts
 * const app = createApp();
 *
 * app.get("/", () => ({ message: "Hello!" }));
 * app.get("/users/:id", (ctx) => ({ id: ctx.params.id }));
 *
 * app.listen(3000);
 * ```
 */
export interface BunaryApp {
	/**
	 * Register a GET route.
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param handler - Function to handle requests
	 */
	get: (path: string, handler: RouteHandler) => RouteBuilder;

	/**
	 * Register a POST route.
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param handler - Function to handle requests
	 */
	post: (path: string, handler: RouteHandler) => RouteBuilder;

	/**
	 * Register a PUT route.
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param handler - Function to handle requests
	 */
	put: (path: string, handler: RouteHandler) => RouteBuilder;

	/**
	 * Register a DELETE route.
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param handler - Function to handle requests
	 */
	delete: (path: string, handler: RouteHandler) => RouteBuilder;

	/**
	 * Register a PATCH route.
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param handler - Function to handle requests
	 */
	patch: (path: string, handler: RouteHandler) => RouteBuilder;

	/**
	 * Add middleware to the request pipeline.
	 * Middleware executes in registration order.
	 * @param middleware - Middleware function
	 */
	use: (middleware: Middleware) => BunaryApp;

	/**
	 * Create a route group with shared prefix, middleware, or name prefix.
	 * @param prefix - URL prefix for all routes in the group
	 * @param callback - Function to define routes within the group
	 */
	group: ((prefix: string, callback: GroupCallback) => BunaryApp) &
		((options: GroupOptions, callback: GroupCallback) => BunaryApp);

	/**
	 * Generate a URL for a named route.
	 * @param name - The route name
	 * @param params - Route parameters and query string values
	 * @returns The generated URL path
	 * @throws If route name not found or required params missing
	 */
	route: (name: string, params?: Record<string, string | number>) => string;

	/**
	 * Check if a named route exists.
	 * @param name - The route name to check
	 * @returns True if the route exists
	 */
	hasRoute: (name: string) => boolean;

	/**
	 * Get a list of all registered routes.
	 * @returns Array of route information objects
	 */
	getRoutes: () => RouteInfo[];

	/**
	 * Start the HTTP server.
	 *
	 * Supports two call styles:
	 * - `listen(port?, hostname?)` - positional arguments
	 * - `listen({ port?, hostname? })` - options object
	 *
	 * @param portOrOptions - Port number, or options object with port and hostname
	 * @param hostname - Hostname to bind to (when using positional form)
	 * @returns Server instance with stop() method
	 */
	listen: ((port?: number, hostname?: string) => BunaryServer) &
		((options: ListenOptions) => BunaryServer);

	/**
	 * Handle an incoming request (used internally and for testing).
	 * @param request - The incoming Request object
	 * @returns Response object
	 */
	fetch: (request: Request) => Promise<Response>;
}
