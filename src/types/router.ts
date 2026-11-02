import type { BunaryServer } from "./bunaryServer.js";
import type { GroupOptions } from "./groupOptions.js";
import type { GroupCallback } from "./groupRouter.js";
import type { ListenOptions } from "./listenOptions.js";
import type { Middleware } from "./middleware.js";
import type { RouteInfo } from "./routeInfo.js";
import type { RouteRegistration } from "./routeRegistration.js";
import type { RouterWebSocketHandler, WebSocketRegistration } from "./websocket.js";

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
	 * validated slots retype `ctx` (#78). `bind` resolves path params to values
	 * on `ctx.bound` after validation (#158).
	 *
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param schemas - Optional `{ params?, query?, body?, bind? }` validators and bindings
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
	get: RouteRegistration<TLocals>;

	/**
	 * Register a POST route.
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param handler - Function to handle requests
	 */
	post: RouteRegistration<TLocals>;

	/**
	 * Register a PUT route.
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param handler - Function to handle requests
	 */
	put: RouteRegistration<TLocals>;

	/**
	 * Register a DELETE route.
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param handler - Function to handle requests
	 */
	delete: RouteRegistration<TLocals>;

	/**
	 * Register a PATCH route.
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param handler - Function to handle requests
	 */
	patch: RouteRegistration<TLocals>;

	/**
	 * Register a WebSocket route (#128).
	 *
	 * The route answers GET. Params, constraints, and global and group
	 * middleware run first, so middleware can reject the request (e.g. 401)
	 * before anything is upgraded; then the request is upgraded and `ws.data`
	 * holds `{ params, locals }` plus whatever `options.upgrade` returned. A
	 * request without `Upgrade: websocket` gets 426 Upgrade Required.
	 *
	 * `listen()` wires the events up for you; with your own `Bun.serve`, pass
	 * `websocket: router.websocket`.
	 *
	 * @param path - URL path pattern (supports :param and :param? syntax)
	 * @param handlers - `{ open?, message?, close?, drain? }`
	 * @param options - Optional `upgrade(ctx)` for extra `ws.data`, `headers`,
	 *   and `bind` to resolve path params onto `ws.data.bound` before the
	 *   upgrade, as for HTTP routes (#159)
	 *
	 * @example
	 * ```ts
	 * router.ws<{ room: string }>("/rooms/:room", {
	 *   message(ws, message) {
	 *     ws.send(`${ws.data.params.room}: ${message}`);
	 *   },
	 * });
	 * ```
	 */
	ws: WebSocketRegistration<TLocals>;

	/**
	 * The `websocket` handler for `Bun.serve`, dispatching to the matching
	 * `router.ws()` route. Only needed when you call `Bun.serve` yourself:
	 * `Bun.serve({ fetch: router.fetch, websocket: router.websocket })`.
	 */
	websocket: RouterWebSocketHandler;

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
	 * @param server - Optional server that received the request (`Bun.serve`
	 *   passes its own); used to look up the client's socket address
	 * @returns Response object
	 */
	fetch: (
		request: Request,
		server?: { requestIP(request: Request): { address: string } | null },
	) => Promise<Response>;
}
