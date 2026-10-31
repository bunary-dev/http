import { checkConstraints, extractParams } from "../router.js";
import type { Route } from "../types/index.js";

/**
 * Index key for a request path or route path: the first path segment, or
 * `null` when the path does not start with `/`.
 */
function firstSegment(path: string): string | null {
	if (path.charCodeAt(0) !== 47 /* "/" */) return null;
	const end = path.indexOf("/", 1);
	return end === -1 ? path.slice(1) : path.slice(1, end);
}

/**
 * Index key for a route, or `null` when the route belongs in the fallback
 * bucket (first segment is a parameter, optional parameter or wildcard, or
 * the path has no leading slash).
 */
function routeKey(route: Route): string | null {
	const segment = firstSegment(route.path);
	if (segment === null || segment.startsWith(":") || segment === "*" || segment === "**") {
		return null;
	}
	return segment;
}

/**
 * Route table indexed by each route's first static path segment (#12).
 *
 * A route whose first segment is static (`/api/...`) can only match request
 * paths with that same first segment, so a request only needs to test the
 * routes in its segment's bucket plus the fallback routes (first segment is
 * a parameter, optional parameter or wildcard). Each bucket holds the
 * fallback routes interleaved in registration order, so first-match-wins is
 * preserved across buckets.
 *
 * The index is updated incrementally by {@link RouteIndex.add} at
 * registration time; lookups never rebuild it.
 */
export class RouteIndex {
	/** All routes in registration order */
	readonly routes: Route[] = [];
	/** Routes whose first segment is not static, in registration order */
	private readonly fallback: Route[] = [];
	/** Static first segment → its routes plus fallback routes, in registration order */
	private readonly buckets = new Map<string, Route[]>();

	/** Register a route, appending it to every bucket it can match in. */
	add(route: Route): void {
		this.routes.push(route);
		const key = routeKey(route);
		if (key === null) {
			this.fallback.push(route);
			for (const bucket of this.buckets.values()) bucket.push(route);
			return;
		}
		let bucket = this.buckets.get(key);
		if (!bucket) {
			// Every fallback route so far was registered before this one
			bucket = [...this.fallback];
			this.buckets.set(key, bucket);
		}
		bucket.push(route);
	}

	/** Routes that could match `path`, in registration order. */
	candidates(path: string): Route[] {
		const key = firstSegment(path);
		return (key === null ? undefined : this.buckets.get(key)) ?? this.fallback;
	}
}

/**
 * Routes to search: a {@link RouteIndex} (what the router uses) or a plain
 * array, which is scanned in full, in order.
 */
export type RouteTable = RouteIndex | Route[];

function candidatesFor(routes: RouteTable, path: string): Route[] {
	return routes instanceof RouteIndex ? routes.candidates(path) : routes;
}

export interface RouteMatch {
	route: Route;
	params: Record<string, string | undefined>;
}

/**
 * Result of a single-pass route resolution.
 *
 * Combines route matching, HEAD→GET fallback, and allowed-method
 * collection into one scan of the route table.
 */
export interface RouteResolution {
	/** The matched route and extracted params, or null if no match */
	match: RouteMatch | null;
	/** Methods that match this path (populated when match is null and path exists for other methods) */
	allowedMethods: string[];
}

/**
 * Resolve a route in a single pass through the route table.
 *
 * For HEAD requests this also checks for a GET fallback.
 * When no exact match is found it collects all methods whose path
 * pattern matches (with constraints), enabling 405 responses and
 * OPTIONS Allow headers without a second scan.
 *
 * **Complexity**: one pass over the candidates for this path. With a
 * {@link RouteIndex} those are the routes sharing the path's first segment
 * plus the fallback routes, not every registered route.
 */
export function resolveRoute(routes: RouteTable, method: string, path: string): RouteResolution {
	let getFallback: RouteMatch | null = null;
	const allowedMethods = new Set<string>();

	for (const route of candidatesFor(routes, path)) {
		if (!route.pattern.test(path)) continue;

		const params = extractParams(path, route);
		if (!checkConstraints(params, route.constraints)) continue;

		// Path matches with valid constraints — record the method
		allowedMethods.add(route.method);

		if (route.method === method) {
			// Exact method match — return immediately
			return { match: { route, params }, allowedMethods: [] };
		}

		// For HEAD requests, remember the first GET fallback
		if (method === "HEAD" && route.method === "GET" && !getFallback) {
			getFallback = { route, params };
		}
	}

	// HEAD with GET fallback — finish the scan first to populate allowedMethods
	if (getFallback) {
		return { match: getFallback, allowedMethods: [] };
	}

	return {
		match: null,
		allowedMethods: Array.from(allowedMethods).sort(),
	};
}

/**
 * Find a matching route for the given method and path.
 *
 * **Complexity**: given a {@link RouteIndex}, only the routes whose first
 * static path segment equals the request's first segment, plus the fallback
 * routes (first segment is a parameter, optional parameter or wildcard), are
 * tested. A plain array is scanned in full.
 *
 * Route order matters: candidates are tested in registration order and the
 * first matching route wins, allowing intentional route shadowing — even
 * across buckets (an earlier `/:slug` still beats a later `/about`).
 */
export function findRoute(routes: RouteTable, method: string, path: string): RouteMatch | null {
	for (const route of candidatesFor(routes, path)) {
		if (route.pattern.test(path)) {
			if (route.method === method) {
				const params = extractParams(path, route);
				// Check constraints
				if (!checkConstraints(params, route.constraints)) {
					continue;
				}
				return { route, params };
			}
		}
	}
	return null;
}

/**
 * Check if any route matches the path (regardless of method).
 */
export function hasMatchingPath(routes: RouteTable, path: string): boolean {
	return candidatesFor(routes, path).some((route) => {
		if (!route.pattern.test(path)) return false;
		const params = extractParams(path, route);
		return checkConstraints(params, route.constraints);
	});
}

/**
 * Find the first route whose path matches, regardless of HTTP method.
 *
 * Used by the OPTIONS/CORS preflight handler to locate group middleware
 * attached to a route at this path.
 */
export function findRouteByPath(routes: RouteTable, path: string): RouteMatch | null {
	for (const route of candidatesFor(routes, path)) {
		if (!route.pattern.test(path)) continue;
		const params = extractParams(path, route);
		if (!checkConstraints(params, route.constraints)) continue;
		return { route, params };
	}
	return null;
}

/**
 * Get all allowed HTTP methods for a given path.
 * Respects route constraints when determining matches.
 *
 * @param routes - All registered routes (indexed or a plain array)
 * @param path - Path to check
 * @returns Array of allowed HTTP methods
 */
export function getAllowedMethods(routes: RouteTable, path: string): string[] {
	const methods = new Set<string>();
	for (const route of candidatesFor(routes, path)) {
		if (route.pattern.test(path)) {
			const params = extractParams(path, route);
			// Only include method if constraints pass
			if (checkConstraints(params, route.constraints)) {
				methods.add(route.method);
			}
		}
	}
	return Array.from(methods).sort();
}
