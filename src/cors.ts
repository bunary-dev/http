import { getPreflightAllowMethods } from "./handlers/preflight.js";
import { toResponse } from "./response.js";
import type { Middleware } from "./types/index.js";
import { appendVary } from "./vary.js";

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
	 * Opt in to combining `credentials: true` with a wildcard origin (`"*"`,
	 * `["*"]` or the default). That reflects *any* request `Origin` alongside
	 * `Access-Control-Allow-Credentials: true`, so any site can make credentialed
	 * requests and read the responses. Without this flag `cors()` throws.
	 *
	 * @default false
	 */
	allowWildcardCredentials?: boolean;

	/**
	 * How long (in seconds) the browser may cache preflight results.
	 * Omitted from the response when `undefined`.
	 */
	maxAge?: number;
}

const DEFAULT_METHODS = ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"];

/**
 * Copy a response, adding headers. `Response` headers are immutable once
 * constructed, so every mutation means a new object.
 */
function withHeaders(response: Response, headers: Headers): Response {
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

/**
 * Resolve whether the request origin is allowed.
 *
 * @returns The value to use for `Access-Control-Allow-Origin`, or `null` if
 *          the origin is not permitted.
 */
function isWildcard(origin: string | string[]): boolean {
	return origin === "*" || (Array.isArray(origin) && origin.includes("*"));
}

function resolveOrigin(
	allowed: string | string[],
	requestOrigin: string,
	credentials: boolean,
): string | null {
	if (isWildcard(allowed)) {
		// The CORS spec forbids Access-Control-Allow-Origin: * when
		// credentials are in use. Reflect the actual request origin instead.
		return credentials ? requestOrigin : "*";
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
 * Generic over the router's locals type so it composes with any
 * `createRouter<TLocals>()`, including an `interface` locals type (#96). It
 * never reads or writes `ctx.locals`.
 *
 * @typeParam TLocals - Locals type of the router this middleware is used on
 * @param options - CORS configuration (defaults allow all origins)
 * @returns Middleware function
 *
 * @example
 * ```ts
 * import { createRouter, cors } from "@bunary/http";
 *
 * // Allow any origin
 * const router = createRouter();
 * router.use(cors());
 *
 * // Restrict to a single origin with credentials
 * router.use(cors({
 *   origin: "https://myapp.com",
 *   credentials: true,
 *   maxAge: 86400,
 * }));
 *
 * // Multiple allowed origins
 * router.use(cors({
 *   origin: ["https://app1.com", "https://app2.com"],
 *   methods: ["GET", "POST"],
 * }));
 * ```
 */
export function cors<TLocals extends object = Record<string, unknown>>(
	options: CorsOptions = {},
): Middleware<TLocals> {
	const {
		origin = "*",
		methods = DEFAULT_METHODS,
		allowHeaders,
		exposeHeaders,
		credentials = false,
		allowWildcardCredentials = false,
		maxAge,
	} = options;

	const wildcard = isWildcard(origin);
	if (credentials && wildcard && !allowWildcardCredentials) {
		throw new Error(
			'cors(): "credentials: true" with a wildcard origin would reflect any Origin and let any site ' +
				"make credentialed requests. Set an explicit origin, or pass " +
				'"allowWildcardCredentials: true" to opt in.',
		);
	}

	// Preflight responses depend on what the client asked for, so caches must
	// key on those request headers too.
	const PREFLIGHT_VARY = ["Access-Control-Request-Method", "Access-Control-Request-Headers"];

	return async (ctx, next) => {
		const requestOrigin = ctx.request.headers.get("Origin");

		// When credentials are used with a wildcard origin the resolved value is
		// the reflected request origin, so Vary must include Origin either way.
		// A configured origin always varies — including when the origin is
		// rejected, or a shared cache can hand the no-CORS variant to an allowed
		// origin and the CORS variant to a rejected one (#66).
		const needsVary = !wildcard || credentials;

		// No Origin header — not a CORS request, pass through. The response
		// still varies by Origin, or a shared cache could store this no-CORS
		// variant and serve it to later cross-origin requests (#120).
		if (!requestOrigin) {
			if (!needsVary) return await next();
			const passed = toResponse(await next());
			const passedHeaders = new Headers(passed.headers);
			appendVary(passedHeaders, ["Origin"]);
			return withHeaders(passed, passedHeaders);
		}

		const isPreflight = ctx.request.method === "OPTIONS";
		const varyNames = [...(needsVary ? ["Origin"] : []), ...(isPreflight ? PREFLIGHT_VARY : [])];

		// Is this origin allowed?
		const allowedOrigin = resolveOrigin(origin, requestOrigin, credentials);
		if (!allowedOrigin) {
			// Origin not allowed — respond normally, without CORS headers but
			// still declaring that the response varies by Origin. A rejection
			// implies a configured origin, so `varyNames` always holds "Origin".
			const rejected = toResponse(await next());
			const rejectedHeaders = new Headers(rejected.headers);
			appendVary(rejectedHeaders, varyNames);
			return withHeaders(rejected, rejectedHeaders);
		}

		// ── Preflight (OPTIONS) ────────────────────────────────────
		if (isPreflight) {
			// The router records the Allow set for this path. An empty set means
			// no route matches, so the real 404 is more useful to the caller than
			// a 204 that pretends the endpoint exists (#66).
			const routerAllow = getPreflightAllowMethods(ctx.request);
			if (routerAllow !== undefined && routerAllow.length === 0) {
				const missing = toResponse(await next());
				const missingHeaders = new Headers(missing.headers);
				missingHeaders.set("Access-Control-Allow-Origin", allowedOrigin);
				if (credentials) {
					missingHeaders.set("Access-Control-Allow-Credentials", "true");
				}
				appendVary(missingHeaders, varyNames);
				return withHeaders(missing, missingHeaders);
			}

			const headers = new Headers();
			headers.set("Access-Control-Allow-Origin", allowedOrigin);
			appendVary(headers, varyNames);

			// An explicit `methods` option wins; otherwise advertise what the
			// route table actually serves, falling back to the generic list when
			// cors() is composed outside a router.
			headers.set(
				"Access-Control-Allow-Methods",
				(options.methods ?? routerAllow ?? methods).join(", "),
			);

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
		const response = toResponse(await next());

		// Build a new Response with CORS headers added.
		const newHeaders = new Headers(response.headers);
		newHeaders.set("Access-Control-Allow-Origin", allowedOrigin);
		appendVary(newHeaders, varyNames);

		if (exposeHeaders && exposeHeaders.length > 0) {
			newHeaders.set("Access-Control-Expose-Headers", exposeHeaders.join(", "));
		}

		if (credentials) {
			newHeaders.set("Access-Control-Allow-Credentials", "true");
		}

		return withHeaders(response, newHeaders);
	};
}
