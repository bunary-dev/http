import { toResponse } from "../response.js";
import type { RequestContext, RouterOptions } from "../types/index.js";
import { expandAllowedMethods } from "./allow.js";

/**
 * Handle 405 Method Not Allowed responses.
 * Uses custom onMethodNotAllowed handler if provided, otherwise returns default JSON response.
 * Ensures the Allow header is always present.
 *
 * The header also names `OPTIONS` and `HEAD`, which the router serves without
 * them being registered, while the `onMethodNotAllowed` callback still
 * receives the registered methods only.
 *
 * @param ctx - The request context
 * @param allowedMethods - Methods registered at this path, from `resolveRoute()`
 * @param options - Router options carrying an optional `onMethodNotAllowed`
 */
export async function handleMethodNotAllowed(
	ctx: RequestContext,
	allowedMethods: string[],
	options?: RouterOptions,
): Promise<Response> {
	const advertisedMethods = expandAllowedMethods(allowedMethods);
	if (options?.onMethodNotAllowed) {
		const result = await options.onMethodNotAllowed(ctx, allowedMethods);
		const response = toResponse(result);
		// Ensure Allow header is present even with custom handler
		if (!response.headers.get("Allow")) {
			const headers = new Headers(response.headers);
			headers.set("Allow", advertisedMethods.join(", "));
			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		}
		return response;
	}
	return new Response(JSON.stringify({ error: "Method not allowed" }), {
		status: 405,
		headers: {
			"Content-Type": "application/json",
			Allow: advertisedMethods.join(", "),
		},
	});
}
