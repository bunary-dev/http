import { checkConstraints, extractParams } from "../router.js";
import type { Route } from "../types/index.js";

export interface RouteMatch {
	route: Route;
	params: Record<string, string | undefined>;
}

/**
 * Find a matching route for the given method and path.
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
