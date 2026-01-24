import type { HandlerResponse } from "./handlerResponse.js";
import type { RequestContext } from "./requestContext.js";

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
