/**
 * @bunary/http - HTTP routing and middleware for Bunary
 *
 * A Bun-first HTTP layer providing routing, middleware, and server functionality.
 *
 * @example
 * ```ts
 * import { createApp } from "@bunary/http";
 *
 * const app = createApp();
 *
 * app.get("/", () => ({ message: "Hello, Bunary!" }));
 * app.get("/users/:id", (ctx) => ({ id: ctx.params.id }));
 *
 * app.listen(3000);
 * console.log("Server running on http://localhost:3000");
 * ```
 *
 * @packageDocumentation
 */

// Export types
export type {
	AppOptions,
	BunaryApp,
	BunaryServer,
	GroupCallback,
	GroupOptions,
	GroupRouter,
	HandlerResponse,
	HttpMethod,
	Middleware,
	PathParams,
	QueryParams,
	RequestContext,
	Route,
	RouteBuilder,
	RouteHandler,
	RouteInfo,
} from "./types/index.js";

// Export app factory (to be implemented)
export { createApp } from "./app.js";
