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
