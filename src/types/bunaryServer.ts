/**
 * Server instance returned by app.listen().
 */
export interface BunaryServer {
	/** The underlying Bun server */
	server: ReturnType<typeof Bun.serve>;
	/** Stop the server */
	stop: () => void;
	/** Port the server is listening on */
	port: number;
	/** Hostname the server is bound to */
	hostname: string;
}
