/**
 * Response conversion utilities for route handlers.
 */
import type { HandlerResponse } from "./types/index.js";

/**
 * Convert a handler response to a proper Response object.
 *
 * Handles the following response types:
 * - Response: passed through unchanged
 * - null/undefined: 204 No Content
 * - string: text/plain response
 * - number: text/plain response
 * - object/array: JSON response
 *
 * @param result - The handler return value
 * @returns A proper Response object
 *
 * @example
 * ```ts
 * toResponse({ message: "Hello" });  // JSON response
 * toResponse("Hello");               // text/plain response
 * toResponse(null);                  // 204 No Content
 * ```
 */
export function toResponse(result: HandlerResponse): Response {
	// Already a Response
	if (result instanceof Response) {
		return result;
	}

	// Null/undefined → 204 No Content
	if (result === null || result === undefined) {
		return new Response(null, { status: 204 });
	}

	// String → text/plain
	if (typeof result === "string") {
		return new Response(result, {
			status: 200,
			headers: { "Content-Type": "text/plain;charset=utf-8" },
		});
	}

	// Number → text/plain
	if (typeof result === "number") {
		return new Response(String(result), {
			status: 200,
			headers: { "Content-Type": "text/plain;charset=utf-8" },
		});
	}

	// Object/array → JSON
	return new Response(JSON.stringify(result), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}
