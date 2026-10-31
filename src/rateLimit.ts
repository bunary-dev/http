import { getClientAddress } from "./handlers/clientAddress.js";
import { problem } from "./problem.js";
import { toResponse } from "./response.js";
import type { Middleware, RequestContext } from "./types/index.js";

/**
 * The result of counting one request against a key.
 */
export interface RateLimitHit {
	/** Requests counted for the key in the current window, including this one. */
	count: number;
	/** Epoch milliseconds at which the current window ends. */
	resetAt: number;
}

/**
 * Where `rateLimit()` keeps its counters.
 *
 * Only the in-memory store ships; implement this interface to share counters
 * across processes (e.g. Redis `INCR` + `PEXPIRE`).
 *
 * @example
 * ```ts
 * const store: RateLimitStore = {
 *   async increment(key, windowMs) {
 *     const count = await redis.incr(key);
 *     if (count === 1) await redis.pexpire(key, windowMs);
 *     const ttl = await redis.pttl(key);
 *     return { count, resetAt: Date.now() + ttl };
 *   },
 * };
 * ```
 */
export interface RateLimitStore {
	/**
	 * Count one request for `key`, starting a new window of `windowMs` when the
	 * key has none or its window has ended.
	 */
	increment(key: string, windowMs: number): RateLimitHit | Promise<RateLimitHit>;
}

/**
 * Options for {@link rateLimit}.
 *
 * @example
 * ```ts
 * const options: RateLimitOptions = { limit: 100, windowMs: 60_000, trustProxy: true };
 * ```
 */
export interface RateLimitOptions<TLocals extends object = Record<string, unknown>> {
	/** Requests allowed per key in each window. */
	limit: number;
	/** Window length in milliseconds. */
	windowMs: number;
	/**
	 * Derive the key requests are counted against. Defaults to the client IP:
	 * the first `X-Forwarded-For` hop when `trustProxy` is on, else the socket
	 * address, else one key shared by every request.
	 */
	key?: (ctx: RequestContext<TLocals>) => string | Promise<string>;
	/**
	 * Trust the first `X-Forwarded-For` hop as the client IP. Only enable this
	 * behind a proxy that sets the header, or any client can pick its own key.
	 *
	 * @default false
	 */
	trustProxy?: boolean;
	/** Counter store. Defaults to a new in-memory store per middleware. */
	store?: RateLimitStore;
}

/** Key used when no client address can be determined. */
const SHARED_KEY = "shared";

/**
 * Create the in-memory fixed-window store.
 *
 * Expired entries are swept at most once per window, so the map holds only
 * keys seen within roughly the last two windows.
 *
 * @internal
 */
export function createMemoryStore(): RateLimitStore {
	const windows = new Map<string, RateLimitHit>();
	let nextSweep = 0;

	return {
		increment(key, windowMs) {
			const now = Date.now();
			if (now >= nextSweep) {
				for (const [k, hit] of windows) {
					if (hit.resetAt <= now) windows.delete(k);
				}
				nextSweep = now + windowMs;
			}

			const current = windows.get(key);
			if (current && current.resetAt > now) {
				current.count += 1;
				return { count: current.count, resetAt: current.resetAt };
			}
			const fresh = { count: 1, resetAt: now + windowMs };
			windows.set(key, fresh);
			return { ...fresh };
		},
	};
}

function defaultKey(request: Request, trustProxy: boolean): string {
	if (trustProxy) {
		const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
		if (first) return first;
	}
	return getClientAddress(request) ?? SHARED_KEY;
}

/**
 * Create a fixed-window rate limiting middleware.
 *
 * Each request is counted against a key (the client IP by default). Once a key
 * exceeds `limit` requests in a window, the middleware answers with a 429
 * problem response and a `Retry-After` header instead of calling the handler.
 * Every response, allowed or not, carries `RateLimit-Limit`,
 * `RateLimit-Remaining` and `RateLimit-Reset` (seconds until the window ends).
 *
 * The default store lives in process memory: counters are per process and
 * lost on restart.
 *
 * @typeParam TLocals - Locals type of the router this middleware is used on
 * @param options - Limit, window, and optional key, `trustProxy` and store
 * @returns Middleware function
 *
 * @example
 * ```ts
 * import { createRouter, rateLimit } from "@bunary/http";
 *
 * const router = createRouter();
 * router.use(rateLimit({ limit: 100, windowMs: 60_000 }));
 * ```
 */
export function rateLimit<TLocals extends object = Record<string, unknown>>(
	options: RateLimitOptions<TLocals>,
): Middleware<TLocals> {
	const { limit, windowMs, key, trustProxy = false, store = createMemoryStore() } = options;

	if (!Number.isInteger(limit) || limit < 1) {
		throw new Error('rateLimit(): "limit" must be a positive integer.');
	}
	if (!Number.isFinite(windowMs) || windowMs <= 0) {
		throw new Error('rateLimit(): "windowMs" must be a positive number of milliseconds.');
	}

	return async (ctx, next) => {
		const id = key ? await key(ctx) : defaultKey(ctx.request, trustProxy);
		const { count, resetAt } = await store.increment(id, windowMs);
		const resetSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));

		const headers = new Headers();
		headers.set("RateLimit-Limit", String(limit));
		headers.set("RateLimit-Remaining", String(Math.max(0, limit - count)));
		headers.set("RateLimit-Reset", String(resetSeconds));

		if (count > limit) {
			headers.set("Retry-After", String(resetSeconds));
			return problem(429, "Rate limit exceeded", {
				instance: new URL(ctx.request.url).pathname,
				headers,
			});
		}

		const response = toResponse(await next());
		const merged = new Headers(response.headers);
		for (const [name, value] of headers) merged.set(name, value);
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: merged,
		});
	};
}
