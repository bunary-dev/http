/**
 * HTTP error hierarchy.
 *
 * Every error carries the status it should become on the wire, so a handler can
 * `throw` instead of hand-building a `Response`. The router's default error
 * handler turns them into RFC 9457 problem documents; see
 * {@link problemResponse}.
 */

/** Reason phrases for the status codes this package knows by name. */
const REASON_PHRASES: Readonly<Record<number, string>> = {
	400: "Bad Request",
	401: "Unauthorized",
	402: "Payment Required",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	406: "Not Acceptable",
	408: "Request Timeout",
	409: "Conflict",
	410: "Gone",
	411: "Length Required",
	412: "Precondition Failed",
	413: "Content Too Large",
	414: "URI Too Long",
	415: "Unsupported Media Type",
	416: "Range Not Satisfiable",
	417: "Expectation Failed",
	421: "Misdirected Request",
	422: "Unprocessable Content",
	423: "Locked",
	424: "Failed Dependency",
	425: "Too Early",
	426: "Upgrade Required",
	428: "Precondition Required",
	429: "Too Many Requests",
	431: "Request Header Fields Too Large",
	451: "Unavailable For Legal Reasons",
	500: "Internal Server Error",
	501: "Not Implemented",
	502: "Bad Gateway",
	503: "Service Unavailable",
	504: "Gateway Timeout",
	505: "HTTP Version Not Supported",
	507: "Insufficient Storage",
	508: "Loop Detected",
	511: "Network Authentication Required",
};

/**
 * The standard reason phrase for a status code.
 *
 * Unknown codes fall back to the status class: `"Client Error"` for 4xx,
 * `"Server Error"` for 5xx, `"Error"` otherwise.
 *
 * @internal
 */
export function reasonPhrase(status: number): string {
	const phrase = REASON_PHRASES[status];
	if (phrase !== undefined) {
		return phrase;
	}
	if (status >= 500) {
		return "Server Error";
	}
	return status >= 400 ? "Client Error" : "Error";
}

/**
 * Extra data attached to an {@link HttpError}.
 *
 * @example
 * ```ts
 * import { TooManyRequestsError } from "@bunary/http";
 *
 * throw new TooManyRequestsError("Slow down", {
 *   headers: { "Retry-After": "30" },
 *   details: { limit: 100, window: "1m" },
 * });
 * ```
 */
export interface HttpErrorOptions extends ErrorOptions {
	/** Headers copied onto the response built from this error. */
	readonly headers?: ResponseInit["headers"];
	/** Machine-readable extra data, surfaced as `errors` in the problem body. */
	readonly details?: unknown;
}

/**
 * An error that already knows its HTTP status.
 *
 * Throw it from a handler or middleware and the router answers with that
 * status instead of a 500. Use a subclass when one exists, or {@link abort}
 * for a status code by number.
 *
 * @example
 * ```ts
 * import { HttpError } from "@bunary/http";
 *
 * router.get("/teapot", () => {
 *   throw new HttpError(418, "I refuse to brew coffee");
 * });
 * ```
 */
export class HttpError extends Error {
	override readonly name: string = "HttpError";

	/** The HTTP status this error becomes. */
	readonly status: number;

	/** Headers to copy onto the response, e.g. `Retry-After` or `Allow`. */
	readonly headers?: ResponseInit["headers"];

	/** Machine-readable extra data, surfaced as `errors` in the problem body. */
	readonly details?: unknown;

	constructor(status: number, message?: string, options?: HttpErrorOptions) {
		super(message ?? reasonPhrase(status), options);
		this.status = status;
		if (options?.headers !== undefined) {
			this.headers = options.headers;
		}
		if (options?.details !== undefined) {
			this.details = options.details;
		}
	}
}

/**
 * `400 Bad Request` — the request itself is malformed.
 *
 * @example
 * ```ts
 * import { BadRequestError } from "@bunary/http";
 *
 * throw new BadRequestError("`page` must be a positive integer");
 * ```
 */
export class BadRequestError extends HttpError {
	override readonly name = "BadRequestError";

	constructor(message?: string, options?: HttpErrorOptions) {
		super(400, message, options);
	}
}

/**
 * `401 Unauthorized` — no or invalid credentials.
 *
 * @example
 * ```ts
 * import { UnauthorizedError } from "@bunary/http";
 *
 * throw new UnauthorizedError("Token expired", {
 *   headers: { "WWW-Authenticate": "Bearer" },
 * });
 * ```
 */
export class UnauthorizedError extends HttpError {
	override readonly name = "UnauthorizedError";

	constructor(message?: string, options?: HttpErrorOptions) {
		super(401, message, options);
	}
}

/**
 * `403 Forbidden` — authenticated, but not allowed.
 *
 * @example
 * ```ts
 * import { ForbiddenError } from "@bunary/http";
 *
 * throw new ForbiddenError("Admins only");
 * ```
 */
export class ForbiddenError extends HttpError {
	override readonly name = "ForbiddenError";

	constructor(message?: string, options?: HttpErrorOptions) {
		super(403, message, options);
	}
}

/**
 * `404 Not Found` — the resource does not exist.
 *
 * @example
 * ```ts
 * import { NotFoundError } from "@bunary/http";
 *
 * router.get("/users/:id", async (ctx) => {
 *   const user = await findUser(ctx.params.id);
 *   if (!user) throw new NotFoundError(`User ${ctx.params.id} does not exist`);
 *   return user;
 * });
 * ```
 */
export class NotFoundError extends HttpError {
	override readonly name = "NotFoundError";

	constructor(message?: string, options?: HttpErrorOptions) {
		super(404, message, options);
	}
}

/**
 * `405 Method Not Allowed` — the route exists for other methods.
 *
 * @example
 * ```ts
 * import { MethodNotAllowedError } from "@bunary/http";
 *
 * throw new MethodNotAllowedError("PUT is not allowed here", {
 *   headers: { Allow: "GET, POST" },
 * });
 * ```
 */
export class MethodNotAllowedError extends HttpError {
	override readonly name = "MethodNotAllowedError";

	constructor(message?: string, options?: HttpErrorOptions) {
		super(405, message, options);
	}
}

/**
 * `409 Conflict` — the request clashes with current state.
 *
 * @example
 * ```ts
 * import { ConflictError } from "@bunary/http";
 *
 * throw new ConflictError("That email is already registered");
 * ```
 */
export class ConflictError extends HttpError {
	override readonly name = "ConflictError";

	constructor(message?: string, options?: HttpErrorOptions) {
		super(409, message, options);
	}
}

/**
 * `422 Unprocessable Content` — well-formed but semantically invalid.
 *
 * @example
 * ```ts
 * import { UnprocessableError } from "@bunary/http";
 *
 * throw new UnprocessableError("Validation failed", {
 *   details: [{ path: "email", message: "Invalid email" }],
 * });
 * ```
 */
export class UnprocessableError extends HttpError {
	override readonly name = "UnprocessableError";

	constructor(message?: string, options?: HttpErrorOptions) {
		super(422, message, options);
	}
}

/**
 * `429 Too Many Requests` — the caller is rate limited.
 *
 * @example
 * ```ts
 * import { TooManyRequestsError } from "@bunary/http";
 *
 * throw new TooManyRequestsError("Slow down", { headers: { "Retry-After": "30" } });
 * ```
 */
export class TooManyRequestsError extends HttpError {
	override readonly name = "TooManyRequestsError";

	constructor(message?: string, options?: HttpErrorOptions) {
		super(429, message, options);
	}
}

/**
 * `500 Internal Server Error` — an explicit server-side failure.
 *
 * @example
 * ```ts
 * import { InternalServerError } from "@bunary/http";
 *
 * throw new InternalServerError("Payment provider is unreachable");
 * ```
 */
export class InternalServerError extends HttpError {
	override readonly name = "InternalServerError";

	constructor(message?: string, options?: HttpErrorOptions) {
		super(500, message, options);
	}
}

/** Constructor shape shared by every {@link HttpError} subclass. */
type HttpErrorSubclass = new (message?: string, options?: HttpErrorOptions) => HttpError;

/** Status codes that have a dedicated class. */
const STATUS_CLASSES: ReadonlyMap<number, HttpErrorSubclass> = new Map<number, HttpErrorSubclass>([
	[400, BadRequestError],
	[401, UnauthorizedError],
	[403, ForbiddenError],
	[404, NotFoundError],
	[405, MethodNotAllowedError],
	[409, ConflictError],
	[422, UnprocessableError],
	[429, TooManyRequestsError],
	[500, InternalServerError],
]);

/**
 * Throw the {@link HttpError} that matches a status code.
 *
 * Statuses with a dedicated class throw that class; every other status throws a
 * generic {@link HttpError}. The return type is `never`, so TypeScript narrows
 * the code after an `abort()` call as unreachable.
 *
 * @param status - HTTP status code to answer with
 * @param message - Optional detail; defaults to the standard reason phrase
 * @param options - Optional `headers`, `details` and `cause`
 * @returns Never returns — it always throws
 * @throws {HttpError} Always
 *
 * @example
 * ```ts
 * import { abort } from "@bunary/http";
 *
 * router.get("/admin", (ctx) => {
 *   if (!ctx.locals.user) abort(401, "Sign in first");
 *   if (!ctx.locals.user.isAdmin) abort(403);
 *   return { ok: true };
 * });
 * ```
 */
export function abort(status: number, message?: string, options?: HttpErrorOptions): never {
	const Subclass = STATUS_CLASSES.get(status);
	if (Subclass !== undefined) {
		throw new Subclass(message, options);
	}
	throw new HttpError(status, message, options);
}

/**
 * Type guard for {@link HttpError} and its subclasses.
 *
 * @param error - The value to test, typically from a `catch`
 * @returns `true` when `error` is an {@link HttpError}
 *
 * @example
 * ```ts
 * import { isHttpError } from "@bunary/http";
 *
 * try {
 *   await handle();
 * } catch (error) {
 *   if (isHttpError(error)) console.log(error.status);
 *   throw error;
 * }
 * ```
 */
export function isHttpError(error: unknown): error is HttpError {
	return error instanceof HttpError;
}
