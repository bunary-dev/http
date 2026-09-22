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
// Export types
export type {
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
	RouteSchema,
	RouteSchemas,
	StandardSchemaLike,
	ValidatedContext,
	ValidatedRouteHandler,
} from "./types/index.js";
