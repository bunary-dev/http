/**
 * Route model binding (#158).
 *
 * A route declares `bind: { key: resolver }` alongside its schemas. Once group
 * middleware and validation have run, each resolver turns its path param into
 * the value the handler reads from `ctx.bound[key]`.
 */
import { problem } from "./problem.js";
import type { BindingContext, RequestContext, RouteBindings } from "./types/index.js";

/**
 * Order a route's binding keys by where their params appear in the path,
 * checking every key has a param.
 *
 * Runs at registration so a typo fails at startup rather than per request.
 *
 * @param path - The route's full path, group prefix and base path included
 * @param paramNames - The path's params, in order
 * @param bind - The route's `bind` option
 * @returns The binding keys in path order
 * @throws {Error} If a `bind` key has no matching `:key` in the path
 *
 * @internal
 */
export function bindingOrder(
	path: string,
	paramNames: readonly string[],
	bind: RouteBindings,
): string[] {
	for (const key of Object.keys(bind)) {
		if (!paramNames.includes(key)) {
			throw new Error(`bind key "${key}" has no ":${key}" in "${path}"`);
		}
	}
	return paramNames.filter((name) => Object.hasOwn(bind, name));
}

/**
 * Resolve a matched route's bindings onto `ctx.bound`, one at a time in path
 * order, so a later resolver can read the ones before it.
 *
 * Each resolver gets the param as it is on `ctx.params` at this point: the
 * validated value when the route has a `params` schema, the raw decoded string
 * otherwise. A resolver that throws propagates to the error boundary.
 *
 * @param ctx - The request context, after validation
 * @param bind - The route's `bind` option
 * @param order - The binding keys in path order, from {@link bindingOrder}
 * @returns A 404 problem naming the first key that resolved to `null` or
 *   `undefined`, or `undefined` when every binding was found
 *
 * @internal
 */
export async function applyRouteBindings(
	ctx: RequestContext,
	bind: RouteBindings,
	order: readonly string[],
): Promise<Response | undefined> {
	const bound: Record<string, unknown> = {};
	// The context gains `bound` here; only routes with `bind` ever have it.
	const target = Object.assign(ctx, { bound }) as unknown as BindingContext;
	const params = ctx.params as Record<string, unknown>;

	for (const key of order) {
		const resolve = bind[key] as (value: unknown, ctx: BindingContext) => unknown;
		const value = await resolve(params[key], target);
		// Never echo the requested value: the key alone says what was missing.
		if (value === null || value === undefined) return problem(404, `${key} not found`);
		bound[key] = value;
	}

	return undefined;
}
