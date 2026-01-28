import type { HandlerResponse } from "./handlerResponse.js";
import type { RequestContext } from "./requestContext.js";

/**
 * Configuration options for creating a Bunary app.
 */
export interface AppOptions {
	/** Base path prefix for all routes (default: "") */
	basePath?: string;
	/**
	 * Custom handler for 404 Not Found responses.
	 * Called when no route matches the request path.
	 *
	 * @param ctx - Request context (params will be empty, query available)
	 * @returns Response, HandlerResponse, or Promise of either (will be converted to Response)
	 *
	 * @example
	 * ```ts
	 * const app = createApp({
	 *   onNotFound: async (ctx) => {
	 *     await logToExternalService(ctx.request.url);
	 *     return new Response("Custom 404", { status: 404 });
	 *   }
	 * });
	 * ```
	 */
	onNotFound?: (
		ctx: RequestContext,
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
	 * const app = createApp({
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
		ctx: RequestContext,
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
	 * const app = createApp({
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
		ctx: RequestContext,
		error: unknown,
	) => Response | HandlerResponse | Promise<Response | HandlerResponse>;
}
