import type { HandlerResponse } from "./handlerResponse.js";
import type { RequestContext } from "./requestContext.js";

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
