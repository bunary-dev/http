/**
 * Options for router.listen() when using the object form.
 *
 * `development`, `error`, `maxRequestBodySize`, `idleTimeout` and `tls` are
 * passed straight through to `Bun.serve`, and only when supplied.
 *
 * @example
 * ```ts
 * router.listen({ port: 3000, hostname: "localhost" });
 * router.listen({ port: 8080 });
 *
 * // Bun's development error page, plus a last-resort handler for failures
 * // that escape the router (for example a throwing `onError`).
 * router.listen({
 *   port: 3000,
 *   development: true,
 *   error: (error) => new Response(error.message, { status: 500 }),
 * });
 * ```
 */
export interface ListenOptions {
	/** Port number to listen on (default: 3000) */
	port?: number;
	/** Hostname to bind to (default: "localhost") */
	hostname?: string;
	/**
	 * Passed through to `Bun.serve`. When `true`, Bun renders its verbose
	 * error page and enables hot-reload friendly behaviour. When omitted,
	 * Bun's own default applies (`NODE_ENV !== "production"`).
	 */
	development?: boolean;
	/**
	 * Passed through to `Bun.serve`: the largest request body, in bytes, Bun
	 * accepts before rejecting the request. When omitted, Bun's default
	 * (128 MiB) applies. See also the router-level `maxBodySize` option.
	 */
	maxRequestBodySize?: number;
	/**
	 * Passed through to `Bun.serve`: seconds a connection may stay idle
	 * before Bun closes it. When omitted, Bun's default applies.
	 */
	idleTimeout?: number;
	/**
	 * Passed through to `Bun.serve` to serve HTTPS, e.g.
	 * `{ cert: Bun.file("cert.pem"), key: Bun.file("key.pem") }`.
	 */
	tls?: Bun.TLSOptions | Bun.TLSOptions[];
	/**
	 * Passed through to `Bun.serve` as a last-resort error handler.
	 *
	 * The router already converts handler and middleware failures into a 500
	 * (or whatever `onError` returns), so this only fires when the failure
	 * escapes the router itself — most often a `onError` handler that throws.
	 */
	error?: (error: Error) => Response | Promise<Response> | undefined | Promise<undefined>;
}
