/**
 * The part of Bun's `Server` that can report a request's socket address.
 *
 * Matched structurally so `router.fetch(request, server)` accepts Bun's own
 * server as well as a stand-in in tests.
 */
export interface RequestIPSource {
	requestIP(request: Request): { address: string } | null;
}

/**
 * Per-request carrier for the server that received the request.
 *
 * `rateLimit()` is an ordinary middleware and only sees the `Request`, but the
 * client's socket address lives on Bun's `Server`. The router records the
 * server it was handed here, and the address is looked up lazily only when a
 * middleware asks for it (#125).
 *
 * @internal
 */
const servers = new WeakMap<Request, RequestIPSource>();

/**
 * Record the server that received this request.
 *
 * @internal
 */
export function setRequestServer(request: Request, server: RequestIPSource): void {
	servers.set(request, server);
}

/**
 * The socket address of the client that sent this request, or `undefined`
 * when the request did not come through a server (e.g. `router.fetch(request)`
 * in tests) or the address is unknown (a closed socket, a unix socket).
 *
 * @internal
 */
export function getClientAddress(request: Request): string | undefined {
	return servers.get(request)?.requestIP(request)?.address || undefined;
}
