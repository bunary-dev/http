import { getAllowedMethods } from "../routes/index.js";
import type { Route, RouterOptions } from "../types/index.js";
import { expandAllowedMethods } from "./allow.js";
import { handleNotFound } from "./notFound.js";

/**
 * Handle OPTIONS requests.
 * Returns 204 with Allow header if path exists, otherwise delegates to 404 handler.
 *
 * Uses a single getAllowedMethods() scan — if the result is non-empty the path
 * exists, avoiding a separate hasMatchingPath() pass. The advertised `Allow`
 * value also names `OPTIONS` and `HEAD`, which the router serves without them
 * being registered.
 *
 * @param precomputed - Pre-computed registered methods, to avoid re-scanning.
 */
export async function handleOptions(
	request: Request,
	path: string,
	routes: Route[],
	options?: RouterOptions,
	precomputed?: string[],
): Promise<Response> {
	const allowedMethods = precomputed ?? getAllowedMethods(routes, path);
	if (allowedMethods.length > 0) {
		return new Response(null, {
			status: 204,
			headers: { Allow: expandAllowedMethods(allowedMethods).join(", ") },
		});
	}
	// No route at all → 404
	return await handleNotFound(request, path, options);
}
