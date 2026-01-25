/**
 * HTTP method types supported by the router.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

/**
 * Query parameters parsed from the URL search string.
 */
export type QueryParams = Record<string, string | string[]>;

/**
 * Path parameters extracted from route patterns (e.g., `/users/:id` → `{ id: "123" }`).
 */
export type PathParams = Record<string, string>;

/**
 * Context object passed to route handlers containing request data.
 *
 * @example
 * ```ts
 * app.get("/users/:id", (ctx) => {
 *   console.log(ctx.params.id);      // "123"
 *   console.log(ctx.query.get("sort")); // "name"
 *   return { id: ctx.params.id };
 * });
 * ```
 */
export interface RequestContext {
	/** The original Bun Request object */
	request: Request;
	/** Path parameters extracted from the route pattern */
	params: PathParams;
	/** Query parameters from the URL search string */
	query: URLSearchParams;
}

/**
 * Return type for route handlers.
 * - Objects/arrays are automatically serialized to JSON.
 * - Response objects are passed through unchanged.
 * - Primitives (string, number) are converted to text responses.
 */
export type HandlerResponse = Response | object | string | number | null | undefined;

/**
 * Route handler function that processes incoming requests.
 *
 * @param ctx - The request context containing request, params, and query
 * @returns Response data (object for JSON, Response for custom, or primitive)
 *
 * @example
 * ```ts
 * const handler: RouteHandler = (ctx) => {
 *   return { message: "Hello, World!" };
 * };
 * ```
 */
export type RouteHandler = (ctx: RequestContext) => HandlerResponse | Promise<HandlerResponse>;

/**
 * Middleware function for processing requests in a pipeline.
 *
 * @param ctx - The request context
 * @param next - Function to call the next middleware or route handler
 * @returns Response data or void (if next() handles it)
 *
 * @example
 * ```ts
 * const logger: Middleware = async (ctx, next) => {
 *   console.log(`${ctx.request.method} ${ctx.request.url}`);
 *   const response = await next();
 *   console.log("Response sent");
 *   return response;
 * };
 * ```
 */
export type Middleware = (
	ctx: RequestContext,
	next: () => Promise<HandlerResponse>,
) => HandlerResponse | Promise<HandlerResponse>;

/**
 * Internal route definition stored by the router.
 */
export interface Route {
	/** HTTP method for this route */
	method: HttpMethod;
	/** Route path pattern (e.g., "/users/:id") */
	path: string;
	/** Compiled regex for matching */
	pattern: RegExp;
	/** Parameter names extracted from path */
	paramNames: string[];
	/** Handler function for this route */
	handler: RouteHandler;
	/** Optional route name for URL generation */
	name?: string;
	/** Parameter constraints (regex patterns) */
	constraints?: Record<string, RegExp>;
	/** Route-specific middleware */
	middleware?: Middleware[];
	/** Names of optional parameters */
	optionalParams?: string[];
}

/**
 * Route information returned by getRoutes().
 */
export interface RouteInfo {
	/** Route name (null if unnamed) */
	name: string | null;
	/** HTTP method */
	method: HttpMethod;
	/** Route path pattern */
	path: string;
}

/**
 * Options for route groups.
 */
export interface GroupOptions {
	/** URL prefix for all routes in the group */
	prefix: string;
	/** Middleware to apply to all routes in the group */
	middleware?: Middleware[];
	/** Name prefix for all routes in the group */
	name?: string;
}

/**
 * Router interface for route groups.
 * Provides the same routing methods as BunaryApp but scoped to a group.
 */
export interface GroupRouter {
	/** Register a GET route */
	get: (path: string, handler: RouteHandler) => RouteBuilder;
	/** Register a POST route */
	post: (path: string, handler: RouteHandler) => RouteBuilder;
	/** Register a PUT route */
	put: (path: string, handler: RouteHandler) => RouteBuilder;
	/** Register a DELETE route */
	delete: (path: string, handler: RouteHandler) => RouteBuilder;
	/** Register a PATCH route */
	patch: (path: string, handler: RouteHandler) => RouteBuilder;
	/** Create a nested route group */
	group: ((prefix: string, callback: (router: GroupRouter) => void) => GroupRouter) &
		((options: GroupOptions, callback: (router: GroupRouter) => void) => GroupRouter);
}

/**
 * Callback function for defining routes within a group.
 */
export type GroupCallback = (router: GroupRouter) => void;

/**
 * Fluent builder for route configuration.
 * Allows chaining methods like name(), where(), etc.
 */
export interface RouteBuilder extends BunaryApp {
	/** Assign a name to the route for URL generation */
	name: (name: string) => RouteBuilder;
	/** Add a regex constraint to a route parameter */
	where: ((param: string, pattern: RegExp | string) => RouteBuilder) &
		((constraints: Record<string, RegExp | string>) => RouteBuilder);
	/** Constrain parameter to digits only */
	whereNumber: (param: string) => RouteBuilder;
	/** Constrain parameter to letters only */
	whereAlpha: (param: string) => RouteBuilder;
	/** Constrain parameter to letters and digits only */
	whereAlphaNumeric: (param: string) => RouteBuilder;
	/** Constrain parameter to UUID format */
	whereUuid: (param: string) => RouteBuilder;
	/** Constrain parameter to ULID format */
	whereUlid: (param: string) => RouteBuilder;
	/** Constrain parameter to specific allowed values */
	whereIn: (param: string, values: string[]) => RouteBuilder;
}

/**
 * Configuration options for creating a Bunary app.
 */
export interface AppOptions {
	/** Base path prefix for all routes (default: "") */
	basePath?: string;
}

/**
 * Server instance returned by app.listen().
 */
export interface BunaryServer {
	/** The underlying Bun server */
	server: ReturnType<typeof Bun.serve>;
	/** Stop the server */
	stop: () => void;
	/** Port the server is listening on */
	port: number;
	/** Hostname the server is bound to */
	hostname: string;
}

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
