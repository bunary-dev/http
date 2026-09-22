import type { SerializeOptions } from "cookie";
import { parseCookie, stringifySetCookie } from "cookie";

/**
 * Options for `ctx.cookies.set()` / `ctx.cookies.delete()`.
 *
 * A re-export of the `cookie` package's `SerializeOptions` under a name that
 * matches `ctx.cookies` — `path`, `domain`, `maxAge`, `expires`, `httpOnly`,
 * `secure`, `sameSite`, `partitioned`, `priority` and `encode`.
 */
export type CookieSerializeOptions = SerializeOptions;

/**
 * Per-request cookie jar exposed as `ctx.cookies`.
 *
 * Reads are parsed lazily from the incoming `Cookie` header on first access
 * and cached; writes are queued and returned by `headers()` as one string per
 * `Set-Cookie` value, for the router to append onto the final `Response`
 * (#79).
 *
 * @example
 * ```ts
 * router.get("/login", (ctx) => {
 *   ctx.cookies.set("session", "abc123", { httpOnly: true, path: "/" });
 *   return ctx.json({ ok: true });
 * });
 *
 * router.get("/logout", (ctx) => {
 *   ctx.cookies.delete("session");
 *   return ctx.json({ ok: true });
 * });
 *
 * router.get("/whoami", (ctx) => ctx.json({ session: ctx.cookies.get("session") }));
 * ```
 */
export interface CookieJar {
	/** Read one cookie from the request, or `undefined` if it was not sent. */
	get(name: string): string | undefined;
	/** Read every cookie sent on the request. */
	getAll(): Record<string, string>;
	/** Queue a `Set-Cookie` header for the response. */
	set(name: string, value: string, options?: CookieSerializeOptions): void;
	/**
	 * Queue a `Set-Cookie` header that expires the named cookie: `Max-Age=0`
	 * and an epoch `Expires`, overriding any `maxAge`/`expires` in `options`.
	 * Pass the same `path`/`domain` the cookie was set with so the browser
	 * matches it.
	 */
	delete(name: string, options?: CookieSerializeOptions): void;
	/** The queued `Set-Cookie` header values, one per `set()`/`delete()` call. */
	headers(): string[];
}

/**
 * Create a {@link CookieJar} for an incoming request.
 *
 * @param request - The incoming Web `Request`
 * @returns A cookie jar backed by that request's `Cookie` header
 *
 * @example
 * ```ts
 * const jar = createCookieJar(request);
 * jar.set("theme", "dark");
 * jar.headers(); // ["theme=dark"]
 * ```
 */
export function createCookieJar(request: Request): CookieJar {
	let parsed: Record<string, string> | undefined;
	const queued: string[] = [];

	function parseIfNeeded(): Record<string, string> {
		if (parsed === undefined) {
			const header = request.headers.get("cookie");
			const raw = header ? parseCookie(header) : {};
			parsed = {};
			for (const [name, value] of Object.entries(raw)) {
				if (value !== undefined) {
					parsed[name] = value;
				}
			}
		}
		return parsed;
	}

	function toSetCookieHeader(
		name: string,
		value: string,
		options?: CookieSerializeOptions,
	): string {
		const { encode, ...attributes } = options ?? {};
		return stringifySetCookie({ name, value, ...attributes }, encode ? { encode } : undefined);
	}

	return {
		get(name) {
			return parseIfNeeded()[name];
		},
		getAll() {
			return { ...parseIfNeeded() };
		},
		set(name, value, options) {
			queued.push(toSetCookieHeader(name, value, options));
		},
		delete(name, options) {
			queued.push(
				toSetCookieHeader(name, "", {
					...options,
					maxAge: 0,
					expires: new Date(0),
				}),
			);
		},
		headers() {
			return [...queued];
		},
	};
}
