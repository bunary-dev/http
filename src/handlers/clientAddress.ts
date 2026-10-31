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

/**
 * The part of Bun's `Server` that can upgrade a request to a WebSocket.
 *
 * @internal
 */
export interface UpgradeSource {
	upgrade(request: Request, options?: { data?: unknown; headers?: Headers }): boolean;
}

/**
 * The server that received this request, when it can upgrade to a WebSocket
 * (#128).
 *
 * @internal
 */
export function getUpgradeSource(request: Request): UpgradeSource | undefined {
	const server = servers.get(request) as Partial<UpgradeSource> | undefined;
	return typeof server?.upgrade === "function" ? (server as UpgradeSource) : undefined;
}
