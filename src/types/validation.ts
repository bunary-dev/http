import type { StandardSchemaV1 } from "@bunary/core";
import type { BodyReader } from "./bodyReader.js";
import type { HandlerResponse } from "./handlerResponse.js";
import type { PathParams } from "./pathParams.js";
import type { QueryParams } from "./queryParams.js";
import type { RequestContext } from "./requestContext.js";

/**
 * Structural shape of a [Standard Schema](https://standardschema.dev) object.
 *
 * Matched by shape rather than by importing `@bunary/core`, so the constraint
 * stays as wide as `SchemaLike` while `@bunary/core` remains an optional peer —
 * only the *type* of `StandardSchemaV1` is borrowed, and types are erased.
 */
export interface StandardSchemaLike {
	readonly "~standard": {
		readonly validate: (value: unknown) => unknown;
	};
}

/**
 * Anything a route accepts as a validator for one slot: a Standard Schema
 * object (zod, valibot, arktype, ...) or a plain function that returns the
 * parsed value and throws on bad input.
 *
 * Mirrors core's `SchemaLike`, with the raw input type pinned so an inline
 * arrow gets a usefully typed argument.
 *
 * @typeParam TInput — The raw value handed to the validator
 */
export type RouteSchema<TInput> = StandardSchemaLike | ((input: TInput) => unknown);

/**
 * Output type of a {@link RouteSchema}.
 *
 * Standard Schema objects resolve through `StandardSchemaV1.InferOutput`; plain
 * functions resolve through their return type.
 *
 * @typeParam TSchema — The schema to read the output type from
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import type { InferSchemaOutput } from "@bunary/http";
 *
 * const user = z.object({ name: z.string() });
 *
 * type User = InferSchemaOutput<typeof user>;      // { name: string }
 * type Id = InferSchemaOutput<() => number>;       // number
 * ```
 */
export type InferSchemaOutput<TSchema> = TSchema extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<TSchema>
	: TSchema extends (input: never) => infer TOutput
		? TOutput
		: never;

/**
 * Validators a route may declare, given as the optional options object between
 * the path and the handler.
 *
 * Every slot is optional; the ones you leave out are not validated and keep
 * their default context type.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import { createRouter } from "@bunary/http";
 *
 * const router = createRouter();
 *
 * router.post(
 *   "/users/:id",
 *   {
 *     params: z.object({ id: z.coerce.number() }),
 *     query: z.object({ notify: z.enum(["yes", "no"]).default("no") }),
 *     body: z.object({ name: z.string() }),
 *   },
 *   (ctx) => ctx.json({ id: ctx.params.id, name: ctx.body.name }),
 * );
 * ```
 */
export interface RouteSchemas {
	/** Validates the matched path parameters. */
	readonly params?: RouteSchema<PathParams>;
	/** Validates the query string, flattened to a plain object. */
	readonly query?: RouteSchema<QueryParams>;
	/** Validates the request body, parsed by `content-type`. */
	readonly body?: RouteSchema<unknown>;
}

/** `ctx.params` for a set of route schemas. */
export type ParamsOf<TSchemas> = TSchemas extends { params: infer TSchema }
	? InferSchemaOutput<TSchema>
	: PathParams;

/** `ctx.query` for a set of route schemas. */
export type QueryOf<TSchemas> = TSchemas extends { query: infer TSchema }
	? InferSchemaOutput<TSchema>
	: URLSearchParams;

/** `ctx.body` for a set of route schemas. */
export type BodyOf<TSchemas> = TSchemas extends { body: infer TSchema }
	? InferSchemaOutput<TSchema>
	: BodyReader;

/**
 * The request context a validated route's handler receives: each validated slot
 * replaced by the schema's output type, each unvalidated slot left alone.
 *
 * @typeParam TLocals — Shape of `ctx.locals`
 * @typeParam TSchemas — The route's {@link RouteSchemas}
 */
export type ValidatedContext<TLocals extends object, TSchemas> = RequestContext<
	TLocals,
	ParamsOf<TSchemas>,
	QueryOf<TSchemas>,
	BodyOf<TSchemas>
>;

/**
 * Handler for a route that declares {@link RouteSchemas}.
 *
 * @typeParam TLocals — Shape of `ctx.locals`
 * @typeParam TSchemas — The route's schemas, which type the context
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import type { ValidatedRouteHandler } from "@bunary/http";
 *
 * const schemas = { body: z.object({ name: z.string() }) };
 *
 * const create: ValidatedRouteHandler<Record<string, unknown>, typeof schemas> =
 *   (ctx) => ({ name: ctx.body.name });
 * ```
 */
export type ValidatedRouteHandler<TLocals extends object, TSchemas> = (
	ctx: ValidatedContext<TLocals, TSchemas>,
) => HandlerResponse | Promise<HandlerResponse>;
