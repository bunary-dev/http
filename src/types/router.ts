import type { BunaryServer } from "./bunaryServer.js";
import type { GroupOptions } from "./groupOptions.js";
import type { GroupCallback } from "./groupRouter.js";
import type { ListenOptions } from "./listenOptions.js";
import type { Middleware } from "./middleware.js";
import type { PathParams } from "./pathParams.js";
import type { RouteBuilder } from "./routeBuilder.js";
import type { RouteHandler } from "./routeHandler.js";
import type { RouteInfo } from "./routeInfo.js";
import type { RouteSchemas, ValidatedRouteHandler } from "./validation.js";

/**
 * The Bunary router instance for HTTP routing and middleware.
 *
 * @typeParam TLocals — Shape of the per-request `locals` store. Set via
 *   `createRouter<TLocals>()` and propagated to all handlers and middleware.
 *
 * @example
 * ```ts
 * interface Locals { user: User }
 *
 * const router = createRouter<Locals>();
 *
 * router.get("/", () => ({ message: "Hello!" }));
 * router.get<{ id: string }>("/users/:id", (ctx) => ({
 *   id: ctx.params.id,        // string
 *   user: ctx.locals.user,    // User
 * }));
 *
 * router.listen(3000);
 * ```
 */
export interface Router<TLocals extends object = Record<string, unknown>> {
	/**
	 * Register a GET route.
	 *
	 * An options object between the path and the handler declares validators
	 * for `params`, `query` and `body`. Each is a Standard Schema object or a
	 * plain function; a failure becomes a 422 problem document, and the
	 * validated slots retype `ctx` (#78).
	 *
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param schemas - Optional `{ params?, query?, body? }` validators
	 * @param handler - Function to handle requests
	 *
	 * @example
	 * ```ts
	 * import { z } from "zod";
	 *
	 * router.get(
	 *   "/users/:id",
	 *   { params: z.object({ id: z.coerce.number() }) },
	 *   (ctx) => ctx.json({ id: ctx.params.id }), // number
	 * );
	 * ```
	 */
	get: {
		<P extends PathParams = PathParams>(
			path: string,
			handler: RouteHandler<TLocals, P>,
		): RouteBuilder<TLocals>;
		<S extends RouteSchemas>(
			path: string,
			schemas: S,
			handler: ValidatedRouteHandler<TLocals, S>,
		): RouteBuilder<TLocals>;
	};

	/**
	 * Register a POST route.
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param handler - Function to handle requests
	 */
	post: {
		<P extends PathParams = PathParams>(
			path: string,
			handler: RouteHandler<TLocals, P>,
		): RouteBuilder<TLocals>;
		<S extends RouteSchemas>(
			path: string,
			schemas: S,
			handler: ValidatedRouteHandler<TLocals, S>,
		): RouteBuilder<TLocals>;
	};

	/**
	 * Register a PUT route.
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param handler - Function to handle requests
	 */
	put: {
		<P extends PathParams = PathParams>(
			path: string,
			handler: RouteHandler<TLocals, P>,
		): RouteBuilder<TLocals>;
		<S extends RouteSchemas>(
			path: string,
			schemas: S,
			handler: ValidatedRouteHandler<TLocals, S>,
		): RouteBuilder<TLocals>;
	};

	/**
	 * Register a DELETE route.
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param handler - Function to handle requests
	 */
	delete: {
		<P extends PathParams = PathParams>(
			path: string,
			handler: RouteHandler<TLocals, P>,
		): RouteBuilder<TLocals>;
		<S extends RouteSchemas>(
			path: string,
			schemas: S,
			handler: ValidatedRouteHandler<TLocals, S>,
		): RouteBuilder<TLocals>;
	};

	/**
	 * Register a PATCH route.
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param handler - Function to handle requests
	 */
	patch: {
		<P extends PathParams = PathParams>(
			path: string,
			handler: RouteHandler<TLocals, P>,
		): RouteBuilder<TLocals>;
		<S extends RouteSchemas>(
			path: string,
			schemas: S,
			handler: ValidatedRouteHandler<TLocals, S>,
		): RouteBuilder<TLocals>;
	};

	/**
	 * Add middleware to the request pipeline.
	 * Middleware executes in registration order.
	 * @param middleware - Middleware function
	 */
	use: (middleware: Middleware<TLocals>) => Router<TLocals>;

	/**
	 * Create a route group with shared prefix, middleware, or name prefix.
	 * @param prefix - URL prefix for all routes in the group
	 * @param callback - Function to define routes within the group
	 */
	group: ((prefix: string, callback: GroupCallback<TLocals>) => Router<TLocals>) &
		((options: GroupOptions<TLocals>, callback: GroupCallback<TLocals>) => Router<TLocals>);

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
