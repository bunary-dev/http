import { getAllowedMethods, hasMatchingPath } from "../routes/index.js";
import type { AppOptions, Route } from "../types/index.js";
import { handleNotFound } from "./notFound.js";

/**
 * Handle OPTIONS requests.
 * Returns 204 with Allow header if path exists, otherwise delegates to 404 handler.
 */
export function handleOptions(
	request: Request,
	path: string,
	routes: Route[],
	options?: AppOptions,
): Response {
	if (hasMatchingPath(routes, path)) {
		const allowedMethods = getAllowedMethods(routes, path);
		return new Response(null, {
			status: 204,
			headers: { Allow: allowedMethods.join(", ") },
		});
	}
	// No route at all → 404
	return handleNotFound(request, path, options);
}
