import { checkConstraints, extractParams } from "../router.js";
import type { Route } from "../types/index.js";

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
 * **Complexity**: O(n) — one pass regardless of outcome.
 */
export function resolveRoute(routes: Route[], method: string, path: string): RouteResolution {
	let getFallback: RouteMatch | null = null;
	const allowedMethods = new Set<string>();

	for (const route of routes) {
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
 * **Complexity**: O(n) where n is the number of registered routes.
 * Routes are tested sequentially until a match is found.
 *
 * This linear search is suitable for most applications (up to ~100 routes).
 * For applications with hundreds of routes, consider:
 * - Grouping routes by common prefixes (reduces regex tests per request)
 * - Using method-based route maps (the 405 "Method Not Allowed" check already
 *   iterates separately, so grouping by method could help)
 * - Implementing a radix/prefix tree for static path segments
 *
 * The current design prioritizes simplicity and correctness. Route order matters:
 * the first matching route wins, allowing intentional route shadowing.
 */
export function findRoute(routes: Route[], method: string, path: string): RouteMatch | null {
	for (const route of routes) {
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
export function hasMatchingPath(routes: Route[], path: string): boolean {
	return routes.some((route) => {
		if (!route.pattern.test(path)) return false;
		const params = extractParams(path, route);
		return checkConstraints(params, route.constraints);
	});
}

/**
 * Get all allowed HTTP methods for a given path.
 * Respects route constraints when determining matches.
 *
 * @param routes - All registered routes
 * @param path - Path to check
 * @returns Array of allowed HTTP methods
 */
export function getAllowedMethods(routes: Route[], path: string): string[] {
	const methods = new Set<string>();
	for (const route of routes) {
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
