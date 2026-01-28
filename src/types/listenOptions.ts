/**
 * Options for app.listen() when using the object form.
 *
 * @example
 * ```ts
 * app.listen({ port: 3000, hostname: "localhost" });
 * app.listen({ port: 8080 });
 * ```
 */
export interface ListenOptions {
	/** Port number to listen on (default: 3000) */
	port?: number;
	/** Hostname to bind to (default: "localhost") */
	hostname?: string;
}
