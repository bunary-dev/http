import type { BodyReader } from "./bodyReader.js";
import type { PathParams } from "./pathParams.js";

/**
 * Context object passed to route handlers containing request data and response
 * helpers.
 *
 * @typeParam TLocals — Shape of the per-request `locals` store. Defaults to
 *   `Record<string, unknown>` for backward compatibility. Narrow it via
 *   `createRouter<TLocals>()` to get type-safe middleware→handler data passing.
 * @typeParam TParams — Shape of the route parameters. Defaults to `PathParams`
 *   (`Record<string, string | undefined>`). Narrow it per-route via
 *   `router.get<TParams>()`, or let a `params` schema type it (#78).
 * @typeParam TQuery — Shape of `ctx.query`. Defaults to `URLSearchParams`; a
 *   route's `query` schema replaces it with the schema's output type.
 * @typeParam TBody — Shape of `ctx.body`. Defaults to {@link BodyReader}; a
 *   route's `body` schema replaces it with the validated value.
 *
 * @example
 * ```ts
 * interface Locals { user: User; requestId: string }
 *
 * const router = createRouter<Locals>();
 *
 * router.get<{ id: string }>("/users/:id", (ctx) => {
 *   ctx.params.id;        // string
 *   ctx.locals.user;      // User
 *   ctx.locals.requestId; // string
 *   return ctx.json({ id: ctx.params.id });
 * });
 * ```
 */
export interface RequestContext<
	TLocals extends object = Record<string, unknown>,
	TParams = PathParams,
	TQuery = URLSearchParams,
	TBody = BodyReader,
> {
	/**
	 * The underlying Web `Request`.
	 *
	 * @example
	 * ```ts
	 * router.get("/whoami", (ctx) => ctx.json({
	 *   method: ctx.request.method,
	 *   agent: ctx.request.headers.get("user-agent"),
	 * }));
	 * ```
	 */
	request: Request;
	/** Path parameters extracted from the route pattern */
	params: TParams;
	/**
	 * Query parameters from the URL search string.
	 *
	 * A `URLSearchParams` unless the route declares a `query` schema, in which
	 * case it is that schema's validated output (#78).
	 */
	query: TQuery;
	/**
	 * Per-request storage for middleware and handlers.
	 *
	 * This object is **initialized per request** (never shared across requests).
	 *
	 * @example
	 * ```ts
	 * router.use(async (ctx, next) => {
	 *   ctx.locals.userId = "123";
	 *   return await next();
	 * });
	 * ```
	 */
	locals: TLocals;

	/**
	 * Lazy readers for the request body: `ctx.body.json()`,
	 * `ctx.body.text()` and `ctx.body.formData()`.
	 *
	 * @example
	 * ```ts
	 * router.post("/users", async (ctx) => {
	 *   const user = await ctx.body.json<{ name: string }>();
	 *   return ctx.json({ id: 1, name: user.name }, { status: 201 });
	 * });
	 * ```
	 *
	 * A route with a `body` schema replaces this reader with the validated body
	 * value instead of wrapping it (#78).
	 */
	body: TBody;

	/**
	 * Build a JSON `Response`.
	 *
	 * Delegates to the standalone `json()` helper: sets
	 * `content-type: application/json; charset=utf-8` unless `init` overrides it.
	 *
	 * @typeParam T — Type of the value being serialized
	 * @param data - Value to serialize
	 * @param init - Optional `ResponseInit`; its headers are merged in
	 * @returns A JSON `Response`
	 *
	 * @example
	 * ```ts
	 * router.post("/users", (ctx) => ctx.json({ id: 1 }, { status: 201 }));
	 * ```
	 */
	json: <T>(data: T, init?: ResponseInit) => Response;

	/**
	 * Build a plain-text `Response`.
	 *
	 * Delegates to the standalone `text()` helper.
	 *
	 * @param body - The response body
	 * @param init - Optional `ResponseInit`; its headers are merged in
	 * @returns A `text/plain` `Response`
	 *
	 * @example
	 * ```ts
	 * router.get("/ping", (ctx) => ctx.text("pong"));
	 * ```
	 */
	text: (body: string, init?: ResponseInit) => Response;

	/**
	 * Build an HTML `Response`.
	 *
	 * Delegates to the standalone `html()` helper.
	 *
	 * @param body - The HTML markup
	 * @param init - Optional `ResponseInit`; its headers are merged in
	 * @returns A `text/html` `Response`
	 *
	 * @example
	 * ```ts
	 * router.get("/", (ctx) => ctx.html("<h1>Hello</h1>"));
	 * ```
	 */
	html: (body: string, init?: ResponseInit) => Response;

	/**
	 * Build a redirect `Response`.
	 *
	 * Delegates to the standalone `redirect()` helper.
	 *
	 * @param url - Target URL, absolute or relative
	 * @param status - Redirect status code (default: `302`)
	 * @returns A redirect `Response`
	 *
	 * @example
	 * ```ts
	 * router.get("/old", (ctx) => ctx.redirect("/new", 301));
	 * ```
	 */
	redirect: (url: string, status?: number) => Response;

	/**
	 * Build an empty `Response` carrying only a status code.
	 *
	 * Delegates to the standalone `status()` helper.
	 *
	 * @param code - HTTP status code
	 * @param init - Optional `ResponseInit` for `statusText` and headers
	 * @returns An empty `Response` with the given status
	 *
	 * @example
	 * ```ts
	 * router.delete("/users/:id", (ctx) => ctx.status(204));
	 * ```
	 */
	status: (code: number, init?: ResponseInit) => Response;
}
