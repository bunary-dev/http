import type { Application } from "@bunary/core";
import type { HandlerResponse } from "./handlerResponse.js";
import type { RequestContext } from "./requestContext.js";

/**
 * Configuration options for creating a Bunary router.
 *
 * @typeParam TLocals — Shape of `ctx.locals` (must match `createRouter<TLocals>()`)
 */
export interface RouterOptions<TLocals extends object = Record<string, unknown>> {
	/** Base path prefix for all routes (default: "") */
	basePath?: string;
	/**
	 * The `@bunary/core` Application to expose to handlers as `ctx.app`.
	 *
	 * The manual alternative to mounting the router with `httpProvider()`,
	 * which binds the same Application during `register()`. Leave it unset for
	 * a standalone router: `ctx.app` is then `undefined` and nothing imports
	 * `@bunary/core` at runtime.
	 *
	 * @example
	 * ```ts
	 * import { createApp } from "@bunary/core";
	 * import { createRouter } from "@bunary/http";
	 *
	 * const app = createApp({ config: { app: { name: "my-api" } } });
	 * const router = createRouter({ app });
	 *
	 * router.get("/", (ctx) => ctx.json({ name: ctx.app?.config.get("app.name") }));
	 * ```
	 */
	app?: Application;
	/**
	 * Whether the default error handler includes `error.message` as the
	 * problem document's `detail`.
	 *
	 * When unset, a router mounted on a `@bunary/core` Application follows
	 * core's resolved `app.debug` (`config.app.debug`, `APP_DEBUG`, `DEBUG`,
	 * default `false`); core's `env` is not consulted. A standalone router only
	 * includes detail if `APP_ENV` (then `NODE_ENV`) is explicitly
	 * `development` or `test`. Has no effect when `onError` is set.
	 *
	 * @example
	 * ```ts
	 * const router = createRouter({ debug: Bun.env.APP_DEBUG === "true" });
	 * ```
	 */
	debug?: boolean;
	/**
	 * Maximum request body size, in bytes, that `ctx.body.json()`,
	 * `ctx.body.text()` and `ctx.body.formData()` will read.
	 *
	 * A larger body makes the reader throw an `HttpError` with status 413
	 * (Content Too Large), which the default error handler turns into a 413
	 * problem response. A `Content-Length` over the limit is rejected before
	 * anything is read; streamed bodies are cut off as soon as they exceed it.
	 * Unset means no router-level limit (Bun's own `maxRequestBodySize`
	 * still applies; see `listen()`).
	 *
	 * @example
	 * ```ts
	 * const router = createRouter({ maxBodySize: 1024 * 1024 }); // 1 MiB
	 * ```
	 */
	maxBodySize?: number;
	/**
	 * Custom handler for 404 Not Found responses.
	 * Called when no route matches the request path.
	 *
	 * @param ctx - Request context (params will be empty, query available)
	 * @returns Response, HandlerResponse, or Promise of either (will be converted to Response)
	 *
	 * @example
	 * ```ts
	 * const router = createRouter({
	 *   onNotFound: async (ctx) => {
	 *     await logToExternalService(ctx.request.url);
	 *     return new Response("Custom 404", { status: 404 });
	 *   }
	 * });
	 * ```
	 */
	onNotFound?: (
		ctx: RequestContext<TLocals>,
	) => Response | HandlerResponse | Promise<Response | HandlerResponse>;
	/**
	 * Custom handler for 405 Method Not Allowed responses.
	 * Called when a route matches the path but not the HTTP method.
	 *
	 * @param ctx - Request context (params will be empty, query available)
	 * @param allowedMethods - Array of allowed HTTP methods for this path
	 * @returns Response, HandlerResponse, or Promise of either (will be converted to Response)
	 *
	 * @example
	 * ```ts
	 * const router = createRouter({
	 *   onMethodNotAllowed: async (ctx, allowed) => {
	 *     await logMethodNotAllowed(ctx.request.url, allowed);
	 *     return new Response(
	 *       JSON.stringify({ error: "Method not allowed", allowed }),
	 *       { status: 405, headers: { "Content-Type": "application/json" } }
	 *     );
	 *   }
	 * });
	 * ```
	 */
	onMethodNotAllowed?: (
		ctx: RequestContext<TLocals>,
		allowedMethods: string[],
	) => Response | HandlerResponse | Promise<Response | HandlerResponse>;
	/**
	 * Custom handler for 500 Internal Server Error responses.
	 * Called when a route handler or middleware throws an error.
	 *
	 * @param ctx - Request context
	 * @param error - The error that was thrown
	 * @returns Response, HandlerResponse, or Promise of either (will be converted to Response)
	 *
	 * @example
	 * ```ts
	 * const router = createRouter({
	 *   onError: async (ctx, error) => {
	 *     await logErrorToExternalService(error, ctx.request.url);
	 *     return new Response(
	 *       JSON.stringify({ error: "Internal server error" }),
	 *       { status: 500, headers: { "Content-Type": "application/json" } }
	 *     );
	 *   }
	 * });
	 * ```
	 */
	onError?: (
		ctx: RequestContext<TLocals>,
		error: unknown,
	) => Response | HandlerResponse | Promise<Response | HandlerResponse>;
}
