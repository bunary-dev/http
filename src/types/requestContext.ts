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
}
