import type { BunaryServer } from "./bunaryServer.js";
import type { Middleware } from "./middleware.js";
import type { RouteHandler } from "./routeHandler.js";

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
	 * @param path - URL path pattern (supports :param syntax)
	 * @param handler - Function to handle requests
	 */
	get: (path: string, handler: RouteHandler) => BunaryApp;

	/**
	 * Register a POST route.
	 * @param path - URL path pattern (supports :param syntax)
	 * @param handler - Function to handle requests
	 */
	post: (path: string, handler: RouteHandler) => BunaryApp;

	/**
	 * Register a PUT route.
	 * @param path - URL path pattern (supports :param syntax)
	 * @param handler - Function to handle requests
	 */
	put: (path: string, handler: RouteHandler) => BunaryApp;

	/**
	 * Register a DELETE route.
	 * @param path - URL path pattern (supports :param syntax)
	 * @param handler - Function to handle requests
	 */
	delete: (path: string, handler: RouteHandler) => BunaryApp;

	/**
	 * Register a PATCH route.
	 * @param path - URL path pattern (supports :param syntax)
	 * @param handler - Function to handle requests
	 */
	patch: (path: string, handler: RouteHandler) => BunaryApp;

	/**
	 * Add middleware to the request pipeline.
	 * Middleware executes in registration order.
	 * @param middleware - Middleware function
	 */
	use: (middleware: Middleware) => BunaryApp;

	/**
	 * Start the HTTP server.
	 * @param port - Port number to listen on (default: 3000)
	 * @param hostname - Hostname to bind to (default: "localhost")
	 * @returns Server instance with stop() method
	 */
	listen: (port?: number, hostname?: string) => BunaryServer;

	/**
	 * Handle an incoming request (used internally and for testing).
	 * @param request - The incoming Request object
	 * @returns Response object
	 */
	fetch: (request: Request) => Promise<Response>;
}
