import type { HandlerResponse } from "./handlerResponse.js";
import type { RequestContext } from "./requestContext.js";

/**
 * Middleware function for processing requests in a pipeline.
 *
 * Middleware receives the app-level `TLocals` type but not per-route
 * `TParams`, since middleware runs before route matching resolves params.
 *
 * @typeParam TLocals — Shape of `ctx.locals` (inherited from `createApp<TLocals>()`)
 *
 * @param ctx - The request context
 * @param next - Function to call the next middleware or route handler
 * @returns Response data or void (if next() handles it)
 *
 * @example
 * ```ts
 * const logger: Middleware<{ requestId: string }> = async (ctx, next) => {
 *   ctx.locals.requestId = crypto.randomUUID();
 *   const response = await next();
 *   console.log(`[${ctx.locals.requestId}] done`);
 *   return response;
 * };
 * ```
 */
export type Middleware<TLocals extends object = Record<string, unknown>> = (
	ctx: RequestContext<TLocals>,
	next: () => Promise<HandlerResponse>,
) => HandlerResponse | Promise<HandlerResponse>;
