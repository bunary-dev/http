/**
 * Options for router.listen() when using the object form.
 *
 * `development` and `error` are passed straight through to `Bun.serve`.
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
	 * Passed through to `Bun.serve` as a last-resort error handler.
	 *
	 * The router already converts handler and middleware failures into a 500
	 * (or whatever `onError` returns), so this only fires when the failure
	 * escapes the router itself — most often a `onError` handler that throws.
	 */
	error?: (error: Error) => Response | Promise<Response> | undefined | Promise<undefined>;
}
