import { findRoute } from "../routes/index.js";
import type { HttpMethod, Route } from "../types/index.js";

/**
 * Normalize HEAD requests to use GET route if no explicit HEAD route exists.
 * Returns the method to use for route matching.
 */
export function normalizeHeadMethod(method: HttpMethod, path: string, routes: Route[]): HttpMethod {
	if (method !== "HEAD") {
		return method;
	}
	// First check if there's an explicit HEAD route
	const headMatch = findRoute(routes, "HEAD", path);
	if (headMatch) {
		return "HEAD";
	}
	// Fall back to GET route
	const getMatch = findRoute(routes, "GET", path);
	if (getMatch) {
		return "GET";
	}
	return "HEAD";
}

/**
 * Convert a response to HEAD format (empty body, preserve headers and status).
 */
export function toHeadResponse(response: Response): Response {
	return new Response(null, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}
