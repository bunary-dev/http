/**
 * Per-request carrier for the router's `Allow` set.
 *
 * `cors()` is an ordinary middleware and has no reference to the route table,
 * but a correct preflight must answer `Access-Control-Allow-Methods` with the
 * methods the path actually serves rather than a fixed list. The router
 * records the advertised set for each OPTIONS request here, and `cors()` reads
 * it back (#66).
 *
 * A `WeakMap` keyed by the `Request` keeps this out of `ctx.locals`, so it is
 * invisible to user code and collected with the request.
 *
 * @internal
 */
const preflightAllowMethods = new WeakMap<Request, string[]>();

/**
 * Record the methods the router will advertise for this preflight.
 *
 * An empty array means the path matches no route at all — `cors()` then steps
 * aside so the 404 handler produces the real status.
 *
 * @internal
 */
export function setPreflightAllowMethods(request: Request, methods: string[]): void {
	preflightAllowMethods.set(request, methods);
}

/**
 * Read back the methods recorded for this preflight.
 *
 * Returns `undefined` when the request never went through the router — for
 * instance when `cors()` is composed by hand — so callers can fall back to
 * their configured defaults.
 *
 * @internal
 */
export function getPreflightAllowMethods(request: Request): string[] | undefined {
	return preflightAllowMethods.get(request);
}
