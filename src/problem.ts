/**
 * RFC 9457 problem details.
 *
 * Every error the router answers with — thrown {@link HttpError}s, validation
 * failures, body parse failures, and anything unexpected — becomes an
 * `application/problem+json` document with the same shape.
 */
import { BodyParseError } from "./errors.js";
import { json } from "./helpers.js";
import { isHttpError, reasonPhrase } from "./httpError.js";

/** Media type of an RFC 9457 problem document. */
const PROBLEM_CONTENT_TYPE = "application/problem+json; charset=utf-8";

/** Default `type` when no problem-specific URI is supplied, per RFC 9457 §4.2.1. */
const DEFAULT_TYPE = "about:blank";

/**
 * The body of an `application/problem+json` response, per RFC 9457.
 *
 * @example
 * ```ts
 * import { problem, type ProblemDetails } from "@bunary/http";
 *
 * const body = (await problem(404).json()) as ProblemDetails;
 * body.status; // 404
 * body.title;  // "Not Found"
 * ```
 */
export interface ProblemDetails {
	/** URI identifying the problem type; `"about:blank"` when unspecified. */
	type: string;
	/** Short, human-readable summary — the status' reason phrase by default. */
	title: string;
	/** The HTTP status code, repeated in the body as RFC 9457 requires. */
	status: number;
	/** Human-readable explanation specific to this occurrence. */
	detail?: string;
	/** URI reference identifying the occurrence, typically the request path. */
	instance?: string;
	/** Extension member carrying machine-readable per-field errors. */
	errors?: unknown;
}

/**
 * Options for {@link problem}.
 *
 * @example
 * ```ts
 * import { problem } from "@bunary/http";
 *
 * problem(405, "PUT is not allowed for /users", {
 *   headers: { Allow: "GET, POST" },
 *   instance: "/users",
 * });
 * ```
 */
export interface ProblemOptions {
	/** URI reference for this occurrence, usually the request path. */
	readonly instance?: string;
	/** Machine-readable per-field errors, added as the `errors` member. */
	readonly errors?: unknown;
	/** Extra response headers, e.g. `Allow` or `Retry-After`. */
	readonly headers?: ResponseInit["headers"];
	/** Override the problem `type` URI. */
	readonly type?: string;
	/** Override the problem `title`. */
	readonly title?: string;
}

/**
 * Build an `application/problem+json` response.
 *
 * `title` defaults to the status' standard reason phrase, and `detail` is
 * dropped when it is empty or merely repeats the title.
 *
 * @param status - HTTP status code
 * @param detail - Human-readable explanation for this occurrence
 * @param options - Optional `instance`, `errors`, `headers`, `type`, `title`
 * @returns A `Response` carrying the problem document
 *
 * @example
 * ```ts
 * import { problem } from "@bunary/http";
 *
 * problem(404, "No route matches GET /posts", { instance: "/posts" });
 * ```
 */
export function problem(status: number, detail?: string, options?: ProblemOptions): Response {
	const title = options?.title ?? reasonPhrase(status);
	const body: ProblemDetails = { type: options?.type ?? DEFAULT_TYPE, title, status };

	if (detail !== undefined && detail !== "" && detail !== title) {
		body.detail = detail;
	}
	if (options?.instance !== undefined) {
		body.instance = options.instance;
	}
	if (options?.errors !== undefined) {
		body.errors = options.errors;
	}

	const headers = new Headers(options?.headers as ConstructorParameters<typeof Headers>[0]);
	headers.set("content-type", PROBLEM_CONTENT_TYPE);

	return json(body, { status, headers: headers as ResponseInit["headers"] });
}

/**
 * Options for {@link problemResponse}.
 *
 * @example
 * ```ts
 * import { problemResponse } from "@bunary/http";
 *
 * problemResponse(error, { debug: Bun.env.NODE_ENV !== "production", instance: "/users/7" });
 * ```
 */
export interface ProblemResponseOptions {
	/** Reveal the detail of unexpected errors. Off in production. */
	readonly debug?: boolean;
	/** URI reference for this occurrence, usually the request path. */
	readonly instance?: string;
}

/** The shape of a `@bunary/core` validation issue, matched structurally. */
interface ValidationIssueLike {
	readonly path: string;
	readonly message: string;
}

/** The shape of a `@bunary/core` `ValidationError`, matched structurally. */
interface ValidationErrorLike extends Error {
	readonly issues: ReadonlyArray<ValidationIssueLike>;
}

/**
 * Detect a `@bunary/core` `ValidationError` without importing core.
 *
 * Core is an optional peer, so the check is structural: the name plus an
 * `issues` array. Standalone users who never install core still get 422s from
 * their own validation errors as long as they match that shape.
 *
 * @internal
 */
function isValidationError(error: unknown): error is ValidationErrorLike {
	return (
		error instanceof Error &&
		error.name === "ValidationError" &&
		Array.isArray((error as { issues?: unknown }).issues)
	);
}

/**
 * Describe an unknown thrown value for the `detail` member.
 *
 * @internal
 */
function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Map any thrown value to an RFC 9457 problem response.
 *
 * The mapping is:
 * - {@link HttpError} → its own `status`, `headers`, and `details` as `errors`
 * - `ValidationError` (from `@bunary/core`, matched structurally) → `422` with
 *   its `issues` as `errors`
 * - {@link BodyParseError} → `400`
 * - anything else → `500`, with `detail` only when `debug` is on
 *
 * This is the router's default error handler; an `onError` option still wins.
 *
 * @param error - The thrown value
 * @param options - Optional `debug` and `instance`
 * @returns A `Response` carrying the problem document
 *
 * @example
 * ```ts
 * import { createRouter, problemResponse } from "@bunary/http";
 *
 * const router = createRouter({
 *   onError: (ctx, error) => {
 *     report(error);
 *     return problemResponse(error, { instance: new URL(ctx.request.url).pathname });
 *   },
 * });
 * ```
 */
export function problemResponse(error: unknown, options?: ProblemResponseOptions): Response {
	const instance = options?.instance;

	if (isHttpError(error)) {
		return problem(error.status, error.message, {
			instance,
			headers: error.headers,
			errors: error.details,
		});
	}

	if (isValidationError(error)) {
		return problem(422, error.message, {
			instance,
			errors: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
		});
	}

	if (error instanceof BodyParseError) {
		return problem(400, error.message, { instance });
	}

	return problem(500, options?.debug === true ? describe(error) : undefined, { instance });
}
