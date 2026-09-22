import type { RequestContext, RouterOptions } from "../types/index.js";
import { expandAllowedMethods } from "./allow.js";
import { handleNotFound } from "./notFound.js";

/**
 * Handle OPTIONS requests.
 * Returns 204 with an Allow header if the path exists, otherwise delegates to
 * the 404 handler.
 *
 * The advertised `Allow` value also names `OPTIONS` and `HEAD`, which the
 * router serves without them being registered.
 *
 * @param ctx - The request context
 * @param allowedMethods - Methods registered at this path
 * @param options - Router options carrying an optional `onNotFound`
 */
export async function handleOptions(
	ctx: RequestContext,
	allowedMethods: string[],
	options?: RouterOptions,
): Promise<Response> {
	if (allowedMethods.length > 0) {
		return new Response(null, {
			status: 204,
			headers: { Allow: expandAllowedMethods(allowedMethods).join(", ") },
		});
	}
	// No route at all → 404
	return await handleNotFound(ctx, options);
}
