import { getAllowedMethods } from "../routes/index.js";
import type { AppOptions, Route } from "../types/index.js";
import { handleNotFound } from "./notFound.js";

/**
 * Handle OPTIONS requests.
 * Returns 204 with Allow header if path exists, otherwise delegates to 404 handler.
 *
 * Uses a single getAllowedMethods() scan — if the result is non-empty the path
 * exists, avoiding a separate hasMatchingPath() pass.
 */
export async function handleOptions(
	request: Request,
	path: string,
	routes: Route[],
	options?: AppOptions,
): Promise<Response> {
	const allowedMethods = getAllowedMethods(routes, path);
	if (allowedMethods.length > 0) {
		return new Response(null, {
			status: 204,
			headers: { Allow: allowedMethods.join(", ") },
		});
	}
	// No route at all → 404
	return await handleNotFound(request, path, options);
}
