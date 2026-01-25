import type { BunaryApp } from "./bunaryApp.js";

/**
 * Fluent builder for route configuration.
 * Allows chaining methods like name(), where(), etc.
 */
export interface RouteBuilder extends BunaryApp {
	/** Assign a name to the route for URL generation */
	name: (name: string) => RouteBuilder;
	/** Add a regex constraint to a route parameter */
	where: ((param: string, pattern: RegExp | string) => RouteBuilder) &
		((constraints: Record<string, RegExp | string>) => RouteBuilder);
	/** Constrain parameter to digits only */
	whereNumber: (param: string) => RouteBuilder;
	/** Constrain parameter to letters only */
	whereAlpha: (param: string) => RouteBuilder;
	/** Constrain parameter to letters and digits only */
	whereAlphaNumeric: (param: string) => RouteBuilder;
	/** Constrain parameter to UUID format */
	whereUuid: (param: string) => RouteBuilder;
	/** Constrain parameter to ULID format */
	whereUlid: (param: string) => RouteBuilder;
	/** Constrain parameter to specific allowed values */
	whereIn: (param: string, values: string[]) => RouteBuilder;
}
