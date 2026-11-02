import type { ServerWebSocket } from "bun";
import type { BindResolver, BoundOf } from "./binding.js";
import type { PathParams } from "./pathParams.js";
import type { RequestContext } from "./requestContext.js";
import type { RouteBuilder } from "./routeBuilder.js";

/**
 * `ws.data` for a WebSocket route: the route's `params` and the request's
 * `locals` as middleware left them, plus whatever the route's `upgrade`
 * option returned (#128).
 *
 * @typeParam TLocals — Shape of `locals` (from `createRouter<TLocals>()`)
 * @typeParam TParams — Shape of `params` (from `router.ws<TParams>()`)
 * @typeParam TExtra — Extra data returned by the `upgrade` option
 */
export type WebSocketData<
	TLocals extends object = Record<string, unknown>,
	TParams = PathParams,
	TExtra extends object = Record<never, never>,
> = TExtra & { params: TParams; locals: TLocals };

/**
 * Handlers for a WebSocket route, each receiving Bun's `ServerWebSocket`.
 *
 * @example
 * ```ts
 * router.ws("/echo", {
 *   message(ws, message) {
 *     ws.send(message);
 *   },
 * });
 * ```
 */
export interface WebSocketHandlers<TData = WebSocketData> {
	/** Called once the connection is open */
	open?: (ws: ServerWebSocket<TData>) => unknown;
	/** Called for each message the client sends */
	message?: (ws: ServerWebSocket<TData>, message: string | Buffer) => unknown;
	/** Called once the connection is closed */
	close?: (ws: ServerWebSocket<TData>, code: number, reason: string) => unknown;
	/** Called when the socket is ready to receive more data after backpressure */
	drain?: (ws: ServerWebSocket<TData>) => unknown;
}

/**
 * Options for `router.ws()`.
 */
export interface WebSocketRouteOptions<
	TLocals extends object = Record<string, unknown>,
	TParams = PathParams,
	TExtra extends object = Record<never, never>,
> {
	/**
	 * Runs after middleware, just before the upgrade. Its return value is
	 * merged into `ws.data` (`params` and `locals` always win).
	 */
	upgrade?: (ctx: RequestContext<TLocals, TParams>) => TExtra | Promise<TExtra>;
	/** Extra headers for the `101 Switching Protocols` response */
	headers?: ResponseInit["headers"];
}

/**
 * Resolvers allowed in a WebSocket route's `bind` option: one per path param,
 * each receiving that param's value (#159).
 *
 * @typeParam TParams — Shape of `params` (from `router.ws<TParams>()`)
 */
export type WebSocketBindings<TParams> = {
	readonly [K in keyof TParams]?: BindResolver<TParams[K]>;
};

/**
 * `ws.data` for a WebSocket route that declares `bind`: {@link WebSocketData}
 * plus `bound`, the resolved bindings, typed as on `ctx.bound` (#159).
 *
 * @typeParam TLocals — Shape of `locals`
 * @typeParam TParams — Shape of `params`
 * @typeParam TExtra — Extra data returned by the `upgrade` option
 * @typeParam TBindings — The route's `bind` object
 */
export type BoundWebSocketData<
	TLocals extends object = Record<string, unknown>,
	TParams = PathParams,
	TExtra extends object = Record<never, never>,
	TBindings = Record<never, never>,
> = WebSocketData<TLocals, TParams, TExtra> & { bound: BoundOf<TBindings> };

/**
 * Options for a `router.ws()` route that declares `bind` (#159).
 *
 * Bindings resolve after middleware and before `upgrade` and the upgrade
 * itself, so `upgrade(ctx)` can read `ctx.bound`.
 */
export interface BoundWebSocketRouteOptions<
	TLocals extends object,
	TParams,
	TExtra extends object,
	TBindings,
> extends Omit<WebSocketRouteOptions<TLocals, TParams, TExtra>, "upgrade"> {
	/**
	 * Route model binding: resolvers keyed by path param name, with the same
	 * signature and rules as an HTTP route's `bind`. Their results are on
	 * `ws.data.bound`; a missing one rejects the upgrade with a 404 problem.
	 */
	readonly bind: TBindings;
	/** As {@link WebSocketRouteOptions.upgrade}, with `ctx.bound` */
	upgrade?: (
		ctx: RequestContext<TLocals, TParams> & { bound: BoundOf<TBindings> },
	) => TExtra | Promise<TExtra>;
}

/**
 * A `ws()` method on a `Router` or `GroupRouter`.
 *
 * - `(path, handlers, options?)` — `ws.data` is `{ params, locals }` plus
 *   whatever `options.upgrade` returned (#128)
 * - `(path, { bind, ...options }, handlers)` — `ws.data.bound` also holds the
 *   resolved bindings (#159). The options come first so each resolver's
 *   result is inferred before the handlers are typed.
 *
 * @typeParam TLocals — Shape of `ws.data.locals`
 */
export interface WebSocketRegistration<TLocals extends object> {
	<
		P extends PathParams = PathParams,
		TExtra extends object = Record<never, never>,
		TBindings extends WebSocketBindings<P> = WebSocketBindings<P>,
	>(
		path: string,
		options: BoundWebSocketRouteOptions<TLocals, P, TExtra, TBindings>,
		handlers: WebSocketHandlers<BoundWebSocketData<TLocals, P, TExtra, TBindings>>,
	): RouteBuilder<TLocals>;
	<P extends PathParams = PathParams, TExtra extends object = Record<never, never>>(
		path: string,
		handlers: WebSocketHandlers<WebSocketData<TLocals, P, TExtra>>,
		options?: WebSocketRouteOptions<TLocals, P, TExtra>,
	): RouteBuilder<TLocals>;
}

/**
 * The `websocket` handler to pass to `Bun.serve` when you serve
 * `router.fetch` yourself instead of calling `router.listen()`.
 */
export interface RouterWebSocketHandler {
	open: (ws: ServerWebSocket<unknown>) => void | Promise<void>;
	message: (ws: ServerWebSocket<unknown>, message: string | Buffer) => void | Promise<void>;
	close: (ws: ServerWebSocket<unknown>, code: number, reason: string) => void | Promise<void>;
	drain: (ws: ServerWebSocket<unknown>) => void | Promise<void>;
}
