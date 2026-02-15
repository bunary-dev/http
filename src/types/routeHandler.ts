import type { HandlerResponse } from "./handlerResponse.js";
import type { PathParams } from "./pathParams.js";
import type { RequestContext } from "./requestContext.js";

/**
 * Route handler function that processes incoming requests.
 *
 * @typeParam TLocals — Shape of `ctx.locals` (inherited from `createApp<TLocals>()`)
 * @typeParam TParams — Shape of `ctx.params` (specified per-route via `app.get<TParams>()`)
 *
 * @param ctx - The request context containing request, params, and query
 * @returns Response data (object for JSON, Response for custom, or primitive)
 *
 * @example
 * ```ts
 * const handler: RouteHandler<{ user: User }, { id: string }> = (ctx) => {
 *   return { id: ctx.params.id, name: ctx.locals.user.name };
 * };
 * ```
 */
export type RouteHandler<
	TLocals extends object = Record<string, unknown>,
	TParams extends PathParams = PathParams,
> = (ctx: RequestContext<TLocals, TParams>) => HandlerResponse | Promise<HandlerResponse>;
