import { getUpgradeSource } from "./handlers/index.js";
import { problem } from "./problem.js";
import type {
	RequestContext,
	RouteHandler,
	RouterWebSocketHandler,
	WebSocketHandlers,
	WebSocketRouteOptions,
} from "./types/index.js";

/**
 * Handlers of the route each connection was upgraded on, keyed by the
 * connection's `ws.data` (Bun hands back the same object), so one
 * `websocket` handler on `Bun.serve` can serve every route (#128).
 */
const routeHandlers = new WeakMap<object, WebSocketHandlers<unknown>>();

/**
 * Build the GET route handler behind `router.ws()`.
 *
 * It runs as the route's terminal, after global and group middleware, so
 * middleware can still reject the request before anything is upgraded. A
 * request without `Upgrade: websocket` gets 426.
 *
 * @internal
 */
export function createWebSocketRoute(
	handlers: WebSocketHandlers<unknown>,
	options: WebSocketRouteOptions<object, unknown, object> = {},
): RouteHandler {
	return async (ctx: RequestContext) => {
		const { request } = ctx;
		if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
			return problem(426, "This route only accepts WebSocket connections", {
				headers: { Upgrade: "websocket", Connection: "Upgrade" },
			});
		}

		const server = getUpgradeSource(request);
		if (!server) {
			throw new Error(
				"WebSocket upgrade needs the Bun server: serve router.fetch with Bun.serve " +
					"(passing websocket: router.websocket), or use router.listen()",
			);
		}

		const extra = options.upgrade ? await options.upgrade(ctx) : undefined;
		const data = { ...extra, params: ctx.params, locals: ctx.locals };
		routeHandlers.set(data, handlers);

		// Cookies queued so far can only reach the client on the 101 itself.
		const headers = new Headers(options.headers as ConstructorParameters<typeof Headers>[0]);
		for (const cookie of ctx.cookies.headers()) {
			headers.append("set-cookie", cookie);
		}

		if (!server.upgrade(request, { data, headers })) {
			routeHandlers.delete(data);
			return problem(400, "Invalid WebSocket upgrade request");
		}
		// Bun ignores whatever fetch returns once the upgrade has succeeded;
		// this only tells middleware what happened.
		return new Response(null, { status: 101 });
	};
}

/** A route handler's result, handed back to Bun as-is. */
type Settled = void | Promise<void>;

function handlersFor(data: unknown): WebSocketHandlers<unknown> | undefined {
	return typeof data === "object" && data !== null ? routeHandlers.get(data) : undefined;
}

/**
 * The `websocket` handler for `Bun.serve`, dispatching every event to the
 * handlers of the route the connection was upgraded on. Connections that
 * were not upgraded by a `router.ws()` route are ignored.
 *
 * @internal
 */
export const websocketHandler: RouterWebSocketHandler = {
	open: (ws) => handlersFor(ws.data)?.open?.(ws) as Settled,
	message: (ws, message) => handlersFor(ws.data)?.message?.(ws, message) as Settled,
	close: (ws, code, reason) => handlersFor(ws.data)?.close?.(ws, code, reason) as Settled,
	drain: (ws) => handlersFor(ws.data)?.drain?.(ws) as Settled,
};
