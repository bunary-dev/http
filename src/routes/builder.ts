import type { BunaryApp, Route, RouteBuilder } from "../types/index.js";

/**
 * Safely compile a string pattern to RegExp with error handling.
 * Provides better error messages for invalid regex patterns.
 */
export function compilePattern(pattern: string, param: string): RegExp {
	try {
		return new RegExp(pattern);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Invalid pattern";
		throw new Error(`Invalid regex pattern for parameter "${param}": ${message}`);
	}
}

/**
 * Create a RouteBuilder for a specific route.
 * Each builder captures its own route reference to avoid shared mutable state issues.
 */
export function createRouteBuilder(
	route: Route,
	namedRoutes: Map<string, Route>,
	app: BunaryApp,
): RouteBuilder {
	function addConstraint(param: string, pattern: RegExp): void {
		if (!route.constraints) {
			route.constraints = {};
		}
		route.constraints[param] = pattern;
	}

	const builder: RouteBuilder = {
		// Forward all BunaryApp methods
		get get() {
			return app.get;
		},
		get post() {
			return app.post;
		},
		get put() {
			return app.put;
		},
		get delete() {
			return app.delete;
		},
		get patch() {
			return app.patch;
		},
		get use() {
			return app.use;
		},
		get group() {
			return app.group;
		},
		get route() {
			return app.route;
		},
		get hasRoute() {
			return app.hasRoute;
		},
		get getRoutes() {
			return app.getRoutes;
		},
		get listen() {
			return app.listen;
		},
		get fetch() {
			return app.fetch;
		},

		// Route-specific methods that capture this specific route
		name: (name: string) => {
			if (namedRoutes.has(name)) {
				throw new Error(`Route name "${name}" is already defined`);
			}
			route.name = name;
			namedRoutes.set(name, route);
			return builder;
		},

		where: ((
			paramOrConstraints: string | Record<string, RegExp | string>,
			pattern?: RegExp | string,
		) => {
			if (typeof paramOrConstraints === "string") {
				// Single constraint: where("id", /^\d+$/)
				if (!pattern) {
					throw new Error(`Pattern is required for constraint on "${paramOrConstraints}"`);
				}
				const regex =
					typeof pattern === "string" ? compilePattern(pattern, paramOrConstraints) : pattern;
				addConstraint(paramOrConstraints, regex);
			} else {
				// Multiple constraints: where({ id: /^\d+$/, slug: /^[a-z-]+$/ })
				for (const [param, pat] of Object.entries(paramOrConstraints)) {
					const regex = typeof pat === "string" ? compilePattern(pat, param) : pat;
					addConstraint(param, regex);
				}
			}
			return builder;
		}) as RouteBuilder["where"],

		whereNumber: (param: string) => {
			addConstraint(param, /^\d+$/);
			return builder;
		},

		whereAlpha: (param: string) => {
			addConstraint(param, /^[a-zA-Z]+$/);
			return builder;
		},

		whereAlphaNumeric: (param: string) => {
			addConstraint(param, /^[a-zA-Z0-9]+$/);
			return builder;
		},

		whereUuid: (param: string) => {
			addConstraint(param, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
			return builder;
		},

		whereUlid: (param: string) => {
			addConstraint(param, /^[0-9A-HJKMNP-TV-Z]{26}$/);
			return builder;
		},

		whereIn: (param: string, values: string[]) => {
			if (values.length === 0) {
				throw new Error(`whereIn requires at least one value for parameter "${param}"`);
			}
			const escaped = values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
			addConstraint(param, new RegExp(`^(${escaped.join("|")})$`));
			return builder;
		},
	};

	return builder;
}

/**
 * Wrap a route builder to auto-apply name prefix.
 */
export function wrapBuilderWithNamePrefix(builder: RouteBuilder, namePrefix: string): RouteBuilder {
	if (!namePrefix) return builder;

	const originalName = builder.name;
	return {
		...builder,
		name: (name: string) => {
			return originalName(namePrefix + name);
		},
	};
}
