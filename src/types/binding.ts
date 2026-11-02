import type { BodyReader } from "./bodyReader.js";
import type { HandlerResponse } from "./handlerResponse.js";
import type { PathParams } from "./pathParams.js";
import type { RequestContext } from "./requestContext.js";
import type { AnyContext, InferSchemaOutput } from "./validation.js";

/**
 * The context a binding resolver receives: the request context (`locals`,
 * `params`, `query`, ...) plus `bound`, holding the bindings resolved so far.
 *
 * Bindings resolve in path order, so for `/users/:user/posts/:post` the `post`
 * resolver can read `ctx.bound.user`. Inside a resolver `bound` is untyped;
 * cast the entry you read.
 *
 * @example
 * ```ts
 * const findPost = (id: number, ctx: BindingContext) =>
 *   Post.where({ id, userId: (ctx.bound.user as User).id }).first();
 * ```
 */
export type BindingContext = AnyContext & {
	/** The bindings resolved before this one, by key. */
	readonly bound: Record<string, unknown>;
};

/**
 * A route binding resolver: turns a path param into the value the handler
 * sees on `ctx.bound`.
 *
 * Return `null` or `undefined` for "not found" (a 404 problem); any other
 * value, `0`, `""` and `false` included, is bound. Throw (e.g. `abort(410)`) to
 * answer with something else.
 *
 * @typeParam TValue — The param: the validated value when the route has a
 *   `params` schema, the raw decoded string otherwise
 * @typeParam TResult — What the resolver finds
 */
export type BindResolver<TValue = never, TResult = unknown> = (
	value: TValue,
	ctx: BindingContext,
) => TResult;

/**
 * A route's `bind` option, as stored: resolvers keyed by path param name.
 */
export interface RouteBindings {
	readonly [key: string]: BindResolver;
}

/**
 * The `ctx.bound` a set of bindings produces: each resolver's awaited result
 * with `null` and `undefined` removed, since a missing value never reaches the
 * handler.
 *
 * @typeParam TBindings — The route's `bind` object
 *
 * @example
 * ```ts
 * type Bound = BoundOf<{ user: (id: number) => Promise<User | null> }>; // { user: User }
 * ```
 */
export type BoundOf<TBindings> = {
	[K in keyof TBindings]: NonNullable<
		Awaited<TBindings[K] extends (...args: never) => infer TResult ? TResult : never>
	>;
};

/**
 * Output of an optional schema slot, or `TDefault` when the slot is absent.
 *
 * @internal
 */
type SlotOutput<TSchema, TDefault> = [TSchema] extends [undefined]
	? TDefault
	: InferSchemaOutput<TSchema>;

/**
 * Resolvers allowed for a route whose `params` schema is `TParamsSchema`: each
 * resolver's value is that param's validated type, or `string | undefined`
 * without a schema.
 *
 * @internal
 */
export type BindingsFor<TParamsSchema> = {
	readonly [K in keyof SlotOutput<TParamsSchema, PathParams>]?: BindResolver<
		SlotOutput<TParamsSchema, PathParams>[K]
	>;
};

/**
 * Route schemas that declare `bind`, with each slot captured by its own type
 * parameter so an inline resolver's value is typed from the sibling `params`
 * schema.
 *
 * @internal
 */
export interface BoundRouteSchemas<TParams, TQuery, TBody, TBindings> {
	readonly params?: TParams;
	readonly query?: TQuery;
	readonly body?: TBody;
	readonly bind: TBindings;
}

/**
 * The context a handler with `bind` receives: validated slots as usual, plus
 * `ctx.bound`.
 *
 * @typeParam TLocals — Shape of `ctx.locals`
 * @typeParam TParams — The route's `params` schema, or `undefined`
 * @typeParam TQuery — The route's `query` schema, or `undefined`
 * @typeParam TBody — The route's `body` schema, or `undefined`
 * @typeParam TBindings — The route's `bind` object
 */
export type BoundContext<
	TLocals extends object,
	TParams,
	TQuery,
	TBody,
	TBindings,
> = RequestContext<
	TLocals,
	SlotOutput<TParams, PathParams>,
	SlotOutput<TQuery, URLSearchParams>,
	SlotOutput<TBody, BodyReader>
> & {
	/** The route's resolved bindings, never `null` or `undefined` (#158). */
	bound: BoundOf<TBindings>;
};

/**
 * Handler for a route that declares `bind`.
 *
 * @internal
 */
export type BoundRouteHandler<TLocals extends object, TParams, TQuery, TBody, TBindings> = (
	ctx: BoundContext<TLocals, TParams, TQuery, TBody, TBindings>,
) => HandlerResponse | Promise<HandlerResponse>;
