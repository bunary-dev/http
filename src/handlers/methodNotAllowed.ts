import { createRequestContext } from "../context.js";
import { toResponse } from "../response.js";
import { getAllowedMethods } from "../routes/index.js";
import type { AppOptions, RequestContext, Route } from "../types/index.js";

/**
 * Handle 405 Method Not Allowed responses.
 * Uses custom onMethodNotAllowed handler if provided, otherwise returns default JSON response.
 * Ensures Allow header is always present.
 *
 * @param precomputed - Pre-computed allowed methods from resolveRoute() to avoid re-scanning.
 *                      Falls back to scanning routes if not provided.
 */
export async function handleMethodNotAllowed(
	request: Request,
	path: string,
	routes: Route[],
	options?: AppOptions,
	precomputed?: string[],
): Promise<Response> {
	const url = new URL(request.url);
	const allowedMethods = precomputed ?? getAllowedMethods(routes, path);
	const methodNotAllowedCtx: RequestContext = createRequestContext(request, {}, url.searchParams);
	if (options?.onMethodNotAllowed) {
		const result = await options.onMethodNotAllowed(methodNotAllowedCtx, allowedMethods);
		const response = toResponse(result);
		// Ensure Allow header is present even with custom handler
		const allowHeader = response.headers.get("Allow");
		if (!allowHeader) {
			const headers = new Headers(response.headers);
			headers.set("Allow", allowedMethods.join(", "));
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
			Allow: allowedMethods.join(", "),
		},
	});
}
