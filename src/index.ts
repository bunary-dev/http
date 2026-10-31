/**
 * @bunary/http - HTTP routing and middleware for Bunary
 *
 * A Bun-first HTTP layer providing routing, middleware, and server functionality.
 *
 * @example
 * ```ts
 * import { createRouter } from "@bunary/http";
 *
 * const router = createRouter();
 *
 * router.get("/", () => ({ message: "Hello, Bunary!" }));
 * router.get("/users/:id", (ctx) => ({ id: ctx.params.id }));
 *
 * router.listen(3000);
 * console.log("Server running on http://localhost:3000");
 * ```
 *
 * @packageDocumentation
 */

export type { CookieJar, CookieSerializeOptions } from "./cookies.js";
// Export cookie jar
export { createCookieJar } from "./cookies.js";
export type { CorsOptions } from "./cors.js";
// Export CORS middleware
export { cors } from "./cors.js";
// Export router factory
export { createRouter } from "./createRouter.js";
// Export error classes
export { BodyParseError } from "./errors.js";
// Export standalone response helpers
export { html, json, redirect, status, text } from "./helpers.js";
export type { HttpErrorOptions } from "./httpError.js";
// Export HTTP error hierarchy
export {
	abort,
	BadRequestError,
	ConflictError,
	ForbiddenError,
	HttpError,
	InternalServerError,
	isHttpError,
	MethodNotAllowedError,
	NotFoundError,
	TooManyRequestsError,
	UnauthorizedError,
	UnprocessableError,
} from "./httpError.js";
export type { ProblemDetails, ProblemOptions, ProblemResponseOptions } from "./problem.js";
// Export RFC 9457 problem details
export { problem, problemResponse } from "./problem.js";
// The @bunary/core integration (`httpProvider`, `RouterToken`, `serve`) is
// published on the `@bunary/http/provider` subpath, NOT here. `@bunary/core` is
// an optional peer: a runtime re-export from this barrel would make every
// standalone `import "@bunary/http"` resolve it, which fails outright when the
// peer is not installed. Only the config type crosses over — types are erased.
export type { HttpConfig } from "./provider.js";
export type { RateLimitHit, RateLimitOptions, RateLimitStore } from "./rateLimit.js";
// Export rate limiting middleware
export { rateLimit } from "./rateLimit.js";
/**
 * Convert a handler's return value (`Response`, plain object/array, string,
 * number, `null`/`undefined`) into a `Response`. Useful in group and route
 * middleware, whose `next()` resolves to the handler's raw return value:
 * `const res = toResponse(await next())`.
 */
export { toResponse } from "./response.js";
export type { ServeStaticOptions } from "./serveStatic.js";
// Export static file handler
export { serveStatic } from "./serveStatic.js";
export type { SseEvent, SseOptions, SseStream } from "./sse.js";
// Export Server-Sent Events helper
export { sse } from "./sse.js";
// Export types
export type {
	AnyContext,
	BodyOf,
	BodyReader,
	BunaryServer,
	GroupCallback,
	GroupOptions,
	GroupRouter,
	HandlerResponse,
	HttpMethod,
	InferSchemaOutput,
	ListenOptions,
	Middleware,
	ParamsOf,
	PathParams,
	QueryOf,
	QueryParams,
	RequestContext,
	RouteBuilder,
	RouteHandler,
	RouteInfo,
	Router,
	RouterOptions,
	RouterWebSocketHandler,
	RouteSchema,
	RouteSchemas,
	StandardSchemaLike,
	ValidatedContext,
	ValidatedRouteHandler,
	WebSocketData,
	WebSocketHandlers,
	WebSocketRouteOptions,
} from "./types/index.js";
