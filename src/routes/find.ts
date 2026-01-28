import { checkConstraints, extractParams } from "../router.js";
import type { Route } from "../types/index.js";

export interface RouteMatch {
	route: Route;
	params: Record<string, string | undefined>;
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
