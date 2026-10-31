/**
 * Route-level validation (#78).
 *
 * `@bunary/core` is an optional peer, so `validateWith` is pulled in through a
 * **dynamic** `import("@bunary/core")` that only runs for a route that declares
 * schemas. Nothing in the bundled entry point imports core statically, and a
 * standalone router that never declares a schema never reaches for it.
 */
import type { RequestContext, RouteSchemas } from "./types/index.js";

/** The signature of core's `validateWith`, described locally. */
type ValidateWith = <TOutput>(schema: never, input: unknown, context?: string) => TOutput;

/** Cached across requests: the dynamic import happens at most once. */
let cachedValidateWith: ValidateWith | undefined;

/** How many times a route has reached for core. @internal */
let attempts = 0;

/**
 * Number of times {@link loadValidateWith} has been called.
 *
 * Exposed for the test that proves a schema-less router never touches
 * `@bunary/core`. Not part of the public API — it is not re-exported from the
 * package barrel.
 *
 * @internal
 */
export function coreImportAttempts(): number {
	return attempts;
}

/**
 * Resolve core's `validateWith`, importing `@bunary/core` on first use.
 *
 * @returns Core's `validateWith`
 * @throws If `@bunary/core` is not installed
 *
 * @internal
 */
async function loadValidateWith(): Promise<ValidateWith> {
	attempts += 1;
	if (!cachedValidateWith) {
		const core = (await import("@bunary/core")) as unknown as { validateWith: ValidateWith };
		cachedValidateWith = core.validateWith;
	}
	return cachedValidateWith;
}

/** Media types read as JSON: `application/json` and any `application/*+json`. */
const JSON_TYPE = /^application\/(?:[^\s/]+\+)?json$/;

/** Media types read as form data. */
const FORM_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data"];

/**
 * Read the request body for validation, choosing the parser by `content-type`.
 *
 * `application/json` and `application/*+json` bodies (e.g.
 * `application/vnd.api+json`) go through `ctx.body.json()`;
 * `application/x-www-form-urlencoded` and `multipart/form-data` go through
 * `ctx.body.formData()` and are flattened like the query string, so a repeated
 * field becomes an array. Anything else — including a request with no body and so no
 * `content-type` — yields `undefined`, which the schema then rejects or allows
 * as it sees fit.
 *
 * A malformed body still throws `BodyParseError` from the reader, which the
 * default mapper turns into a 400 rather than a 422.
 *
 * @internal
 */
async function readBodyForValidation(ctx: RequestContext): Promise<unknown> {
	const header = ctx.request.headers.get("content-type") ?? "";
	const mediaType = (header.split(";")[0] ?? "").trim().toLowerCase();

	if (JSON_TYPE.test(mediaType)) {
		return await ctx.body.json();
	}

	if (FORM_TYPES.includes(mediaType)) {
		return entriesToObject(await ctx.body.formData());
	}

	return undefined;
}

/** The context, seen as mutable so validated values can replace the raw ones. */
interface MutableContext {
	params: unknown;
	query: unknown;
	body: unknown;
}

/** A multi-valued key/value source: `URLSearchParams` or `FormData`. */
interface MultiMap<TValue> {
	keys(): IterableIterator<string>;
	getAll(key: string): TValue[];
}

/**
 * Flatten a query string or form body to a plain object: a key seen once stays
 * a single value, a repeated key becomes an array of its values in order.
 */
function entriesToObject<TValue>(entries: MultiMap<TValue>): Record<string, TValue | TValue[]> {
	const out: Record<string, TValue | TValue[]> = Object.create(null);
	for (const key of new Set(entries.keys())) {
		const values = entries.getAll(key);
		out[key] = values.length === 1 ? (values[0] as TValue) : values;
	}
	return out;
}

/**
 * Validate a matched route's params, query and body, replacing each validated
 * slot on the context with the schema's output.
 *
 * Runs inside the route pipeline *after* route middleware, so middleware still
 * sees the raw context. Schemas are applied in `params` → `query` → `body`
 * order and the first failure wins: core's `ValidationError` propagates, and
 * the router's default mapper turns it into a 422 problem document carrying
 * every issue as `errors`.
 *
 * @param ctx - The request context to validate and retype in place
 * @param schemas - The route's declared validators
 * @throws {Error} Core's `ValidationError` when a schema rejects its input
 *
 * @internal
 */
export async function applyRouteValidation(
	ctx: RequestContext,
	schemas: RouteSchemas,
): Promise<void> {
	const { params, query, body } = schemas;
	if (!params && !query && !body) return;

	const validateWith = await loadValidateWith();
	const target = ctx as unknown as MutableContext;

	if (params) {
		target.params = validateWith(params as never, ctx.params, "Params");
	}

	if (query) {
		target.query = validateWith(query as never, entriesToObject(ctx.query), "Query");
	}

	if (body) {
		target.body = validateWith(body as never, await readBodyForValidation(ctx), "Body");
	}
}

/**
 * Split a route registration's trailing arguments into schemas and handler.
 *
 * Supports both `(path, handler)` and `(path, schemas, handler)`.
 *
 * @param schemasOrHandler - The second argument: schemas, or the handler
 * @param maybeHandler - The third argument when schemas were given
 * @returns The handler and, when declared, the schemas
 * @throws {TypeError} If schemas were given without a handler after them
 *
 * @internal
 */
export function normalizeRouteArgs<THandler>(
	schemasOrHandler: RouteSchemas | THandler,
	maybeHandler?: THandler,
): { schemas?: RouteSchemas; handler: THandler } {
	if (typeof schemasOrHandler === "function") {
		return { handler: schemasOrHandler as THandler };
	}

	if (typeof maybeHandler !== "function") {
		throw new TypeError("A route handler function is required after the route options object");
	}

	return { schemas: schemasOrHandler as RouteSchemas, handler: maybeHandler };
}
