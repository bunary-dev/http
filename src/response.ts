/**
 * Response conversion utilities for route handlers.
 */
import { problem } from "./problem.js";
import { availableMediaTypes, negotiateMediaType, Resource } from "./resource.js";
import type { HandlerResponse } from "./types/index.js";
import { appendVary } from "./vary.js";

/**
 * Convert a handler response to a proper Response object.
 *
 * Handles the following response types:
 * - Response: passed through unchanged
 * - null/undefined: 204 No Content
 * - string: text/plain response
 * - number: text/plain response
 * - Resource: negotiated against the request `Accept` header (#37)
 * - object/array: JSON response
 *
 * @param result - The handler return value
 * @param request - The request, whose `Accept` header picks a {@link Resource}'s
 *   format. Without it a Resource is served as `application/json`.
 * @returns A proper Response object
 *
 * @example
 * ```ts
 * toResponse({ message: "Hello" });  // JSON response
 * toResponse("Hello");               // text/plain response
 * toResponse(null);                  // 204 No Content
 * ```
 */
export function toResponse(result: HandlerResponse, request?: Request): Response {
	// Already a Response
	if (result instanceof Response) {
		return result;
	}

	// Resource → negotiated representation
	if (result instanceof Resource) {
		return negotiate(result, request);
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

/**
 * Serve a {@link Resource} in the format its formats and the request's
 * `Accept` header agree on, or a 406 problem when they agree on none.
 *
 * Every outcome carries `Vary: Accept`, since the body depends on it.
 */
function negotiate(resource: Resource, request?: Request): Response {
	const available = availableMediaTypes(resource);
	const types = [...available.keys()];
	const chosen = negotiateMediaType(request?.headers.get("accept"), types);

	if (chosen === undefined) {
		return problem(406, `Available media types: ${types.join(", ")}`, {
			headers: { Vary: "Accept" },
		});
	}

	const body = (available.get(chosen) as () => unknown)();
	const headers = new Headers(resource.headers as ConstructorParameters<typeof Headers>[0]);
	headers.set("Content-Type", chosen);
	appendVary(headers, ["Accept"]);
	return new Response(isRawBody(body) ? body : JSON.stringify(body), {
		status: resource.status ?? 200,
		headers: headers as ResponseInit["headers"],
	});
}

/** Bodies a converter may return that go out without JSON encoding. */
function isRawBody(body: unknown): body is NonNullable<ConstructorParameters<typeof Response>[0]> {
	return (
		typeof body === "string" ||
		body instanceof Blob ||
		body instanceof ArrayBuffer ||
		ArrayBuffer.isView(body) ||
		body instanceof ReadableStream
	);
}
