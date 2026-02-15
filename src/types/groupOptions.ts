import type { Middleware } from "./middleware.js";

/**
 * Options for route groups.
 *
 * @typeParam TLocals — Shape of `ctx.locals` (inherited from `createApp<TLocals>()`)
 */
export interface GroupOptions<TLocals extends object = Record<string, unknown>> {
	/** URL prefix for all routes in the group */
	prefix: string;
	/** Middleware to apply to all routes in the group */
	middleware?: Middleware<TLocals>[];
	/** Name prefix for all routes in the group */
	name?: string;
}
