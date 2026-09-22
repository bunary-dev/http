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

export type { CorsOptions } from "./cors.js";
// Export CORS middleware
export { cors } from "./cors.js";
// Export router factory
export { createRouter } from "./createRouter.js";
// Export error classes
export { BodyParseError } from "./errors.js";
// Export standalone response helpers
export { html, json, redirect, status, text } from "./helpers.js";
// The @bunary/core integration (`httpProvider`, `RouterToken`, `serve`) is
// published on the `@bunary/http/provider` subpath, NOT here. `@bunary/core` is
// an optional peer: a runtime re-export from this barrel would make every
// standalone `import "@bunary/http"` resolve it, which fails outright when the
// peer is not installed. Only the config type crosses over — types are erased.
export type { HttpConfig } from "./provider.js";
// Export types
export type {
	BodyReader,
	BunaryServer,
	GroupCallback,
	GroupOptions,
	GroupRouter,
	HandlerResponse,
	HttpMethod,
	ListenOptions,
	Middleware,
	PathParams,
	RequestContext,
	RouteBuilder,
	RouteHandler,
	RouteInfo,
	Router,
	RouterOptions,
} from "./types/index.js";
