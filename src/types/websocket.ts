import type { ServerWebSocket } from "bun";
import type { PathParams } from "./pathParams.js";
import type { RequestContext } from "./requestContext.js";

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
 * The `websocket` handler to pass to `Bun.serve` when you serve
 * `router.fetch` yourself instead of calling `router.listen()`.
 */
export interface RouterWebSocketHandler {
	open: (ws: ServerWebSocket<unknown>) => void | Promise<void>;
	message: (ws: ServerWebSocket<unknown>, message: string | Buffer) => void | Promise<void>;
	close: (ws: ServerWebSocket<unknown>, code: number, reason: string) => void | Promise<void>;
	drain: (ws: ServerWebSocket<unknown>) => void | Promise<void>;
}
