import type { PathParams } from "./pathParams.js";

/**
 * Context object passed to route handlers containing request data.
 *
 * @typeParam TLocals — Shape of the per-request `locals` store. Defaults to
 *   `Record<string, unknown>` for backward compatibility. Narrow it via
 *   `createApp<TLocals>()` to get type-safe middleware→handler data passing.
 * @typeParam TParams — Shape of the route parameters. Defaults to `PathParams`
 *   (`Record<string, string | undefined>`). Narrow it per-route via
 *   `app.get<TParams>()` to get typed parameter access.
 *
 * @example
 * ```ts
 * interface Locals { user: User; requestId: string }
 *
 * const app = createApp<Locals>();
 *
 * app.get<{ id: string }>("/users/:id", (ctx) => {
 *   ctx.params.id;        // string
 *   ctx.locals.user;      // User
 *   ctx.locals.requestId; // string
 * });
 * ```
 */
export interface RequestContext<
	TLocals extends object = Record<string, unknown>,
	TParams extends PathParams = PathParams,
> {
	/** The original Bun Request object */
	request: Request;
	/** Path parameters extracted from the route pattern */
	params: TParams;
	/** Query parameters from the URL search string */
	query: URLSearchParams;
	/**
	 * Per-request storage for middleware and handlers.
	 *
	 * This object is **initialized per request** (never shared across requests).
	 *
	 * @example
	 * ```ts
	 * app.use(async (ctx, next) => {
	 *   ctx.locals.userId = "123";
	 *   return await next();
	 * });
	 * ```
	 */
	locals: TLocals;

	/**
	 * Parse the request body as JSON.
	 *
	 * Thin wrapper around `request.json()` with error handling.
	 * Throws `BodyParseError` if the body is not valid JSON.
	 *
	 * @typeParam T — Expected shape of the parsed JSON body
	 * @returns The parsed JSON body
	 * @throws {BodyParseError} If the body cannot be parsed as JSON
	 *
	 * @example
	 * ```ts
	 * app.post("/users", async (ctx) => {
	 *   const body = await ctx.json<{ name: string }>();
	 *   return { id: 1, name: body.name };
	 * });
	 * ```
	 */
	json: <T = unknown>() => Promise<T>;

	/**
	 * Get the request body as a string.
	 *
	 * Thin wrapper around `request.text()`.
	 *
	 * @returns The request body as text
	 *
	 * @example
	 * ```ts
	 * app.post("/echo", async (ctx) => {
	 *   const text = await ctx.text();
	 *   return { echo: text };
	 * });
	 * ```
	 */
	text: () => Promise<string>;

	/**
	 * Parse the request body as FormData.
	 *
	 * Thin wrapper around `request.formData()` with error handling.
	 * Throws `BodyParseError` if the body cannot be parsed as form data.
	 *
	 * @returns The parsed FormData
	 * @throws {BodyParseError} If the body cannot be parsed as form data
	 *
	 * @example
	 * ```ts
	 * app.post("/upload", async (ctx) => {
	 *   const form = await ctx.formData();
	 *   const name = form.get("name");
	 *   return { name };
	 * });
	 * ```
	 */
	formData: () => ReturnType<Request["formData"]>;
}
