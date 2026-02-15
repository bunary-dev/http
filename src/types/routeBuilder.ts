import type { BunaryApp } from "./bunaryApp.js";

/**
 * Fluent builder for route configuration.
 * Allows chaining methods like name(), where(), etc.
 *
 * @typeParam TLocals — Shape of `ctx.locals` (inherited from `createApp<TLocals>()`)
 */
export interface RouteBuilder<TLocals extends object = Record<string, unknown>>
	extends BunaryApp<TLocals> {
	/** Assign a name to the route for URL generation */
	name: (name: string) => RouteBuilder<TLocals>;
	/** Add a regex constraint to a route parameter */
	where: ((param: string, pattern: RegExp | string) => RouteBuilder<TLocals>) &
		((constraints: Record<string, RegExp | string>) => RouteBuilder<TLocals>);
	/** Constrain parameter to digits only */
	whereNumber: (param: string) => RouteBuilder<TLocals>;
	/** Constrain parameter to letters only */
	whereAlpha: (param: string) => RouteBuilder<TLocals>;
	/** Constrain parameter to letters and digits only */
	whereAlphaNumeric: (param: string) => RouteBuilder<TLocals>;
	/** Constrain parameter to UUID format */
	whereUuid: (param: string) => RouteBuilder<TLocals>;
	/** Constrain parameter to ULID format */
	whereUlid: (param: string) => RouteBuilder<TLocals>;
	/** Constrain parameter to specific allowed values */
	whereIn: (param: string, values: string[]) => RouteBuilder<TLocals>;
}
