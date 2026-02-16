import { toResponse } from "./response.js";
import type { Middleware } from "./types/index.js";

/**
 * CORS configuration options.
 *
 * @example
 * ```ts
 * const options: CorsOptions = {
 *   origin: "https://myapp.com",
 *   methods: ["GET", "POST"],
 *   credentials: true,
 *   maxAge: 86400,
 * };
 * ```
 */
export interface CorsOptions {
	/**
	 * Allowed origin(s). Use `"*"` (default) for any origin,
	 * a single string for one origin, or an array for multiple.
	 *
	 * @default "*"
	 */
	origin?: string | string[];

	/**
	 * HTTP methods to advertise in `Access-Control-Allow-Methods`.
	 *
	 * @default ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"]
	 */
	methods?: string[];

	/**
	 * Headers the client is allowed to send.
	 * When omitted, the value of `Access-Control-Request-Headers` is reflected.
	 */
	allowHeaders?: string[];

	/**
	 * Response headers the browser may expose to client-side JavaScript.
	 */
	exposeHeaders?: string[];

	/**
	 * Whether to include `Access-Control-Allow-Credentials: true`.
	 *
	 * @default false
	 */
	credentials?: boolean;

	/**
	 * How long (in seconds) the browser may cache preflight results.
	 * Omitted from the response when `undefined`.
	 */
	maxAge?: number;
}

const DEFAULT_METHODS = ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"];

/**
 * Resolve whether the request origin is allowed.
 *
 * @returns The value to use for `Access-Control-Allow-Origin`, or `null` if
 *          the origin is not permitted.
 */
function resolveOrigin(allowed: string | string[], requestOrigin: string): string | null {
	if (allowed === "*") {
		return "*";
	}
	if (typeof allowed === "string") {
		return allowed === requestOrigin ? allowed : null;
	}
	return allowed.includes(requestOrigin) ? requestOrigin : null;
}

/**
 * Create a CORS middleware.
 *
 * Handles preflight `OPTIONS` requests (returns 204) and
 * adds CORS headers to actual responses.
 *
 * @param options - CORS configuration (defaults allow all origins)
 * @returns Middleware function
 *
 * @example
 * ```ts
 * import { createApp, cors } from "@bunary/http";
 *
 * // Allow any origin
 * const app = createApp();
 * app.use(cors());
 *
 * // Restrict to a single origin with credentials
 * app.use(cors({
 *   origin: "https://myapp.com",
 *   credentials: true,
 *   maxAge: 86400,
 * }));
 *
 * // Multiple allowed origins
 * app.use(cors({
 *   origin: ["https://app1.com", "https://app2.com"],
 *   methods: ["GET", "POST"],
 * }));
 * ```
 */
export function cors(options: CorsOptions = {}): Middleware {
	const {
		origin = "*",
		methods = DEFAULT_METHODS,
		allowHeaders,
		exposeHeaders,
		credentials = false,
		maxAge,
	} = options;

	return async (ctx, next) => {
		const requestOrigin = ctx.request.headers.get("Origin");

		// No Origin header — not a CORS request, pass through.
		if (!requestOrigin) {
			return await next();
		}

		// Is this origin allowed?
		const allowedOrigin = resolveOrigin(origin, requestOrigin);
		if (!allowedOrigin) {
			// Origin not allowed — respond normally without CORS headers.
			return await next();
		}

		// ── Preflight (OPTIONS) ────────────────────────────────────
		if (ctx.request.method === "OPTIONS") {
			const headers = new Headers();
			headers.set("Access-Control-Allow-Origin", allowedOrigin);

			if (origin !== "*") {
				headers.append("Vary", "Origin");
			}

			headers.set("Access-Control-Allow-Methods", methods.join(", "));

			if (allowHeaders) {
				headers.set("Access-Control-Allow-Headers", allowHeaders.join(", "));
			} else {
				// Reflect the headers the client asked for.
				const requested = ctx.request.headers.get("Access-Control-Request-Headers");
				if (requested) {
					headers.set("Access-Control-Allow-Headers", requested);
				}
			}

			if (credentials) {
				headers.set("Access-Control-Allow-Credentials", "true");
			}

			if (maxAge !== undefined) {
				headers.set("Access-Control-Max-Age", String(maxAge));
			}

			return new Response(null, { status: 204, headers });
		}

		// ── Actual request ─────────────────────────────────────────
		const result = await next();
		const response = toResponse(result);

		// Build a new Response with CORS headers added.
		const newHeaders = new Headers(response.headers);
		newHeaders.set("Access-Control-Allow-Origin", allowedOrigin);

		if (origin !== "*") {
			newHeaders.append("Vary", "Origin");
		}

		if (exposeHeaders && exposeHeaders.length > 0) {
			newHeaders.set("Access-Control-Expose-Headers", exposeHeaders.join(", "));
		}

		if (credentials) {
			newHeaders.set("Access-Control-Allow-Credentials", "true");
		}

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: newHeaders,
		});
	};
}
